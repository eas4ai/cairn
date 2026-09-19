// tests/init.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';

// Plan 01's makeRepo() returns {dir, git, write, commit, readRef, remove}; this wrapper
// writes the fixture files, commits them and exposes the directory as cwd.
async function repoWith(files) {
  const repo = await makeRepo();
  for (const [p, c] of Object.entries(files)) await repo.write(p, c);
  await repo.commit('fixture');
  return { cwd: repo.dir, repo };
}
import { readRef, git } from '../lib/gitx.mjs';
import { readLog } from '../lib/records.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { init, DEFAULT_SETTINGS } from '../lib/init.mjs';

const yes = async () => true;
const answers = (over = {}) => ({ confirmRemote: async () => null, chooseKey: async () => null,
  confirm: yes, confirmDigest: yes, ...over });

test('init on a plain directory initializes Git, writes settings, init record and ref roots', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cairn-init-'));
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 'Cairn Test', GIT_AUTHOR_EMAIL: 'test@example.invalid' });
  t.after(() => { delete process.env.GIT_AUTHOR_NAME; delete process.env.GIT_AUTHOR_EMAIL; Object.assign(process.env, saved); rmSync(cwd, { recursive: true, force: true }); });
  const r = await init(cwd, answers());
  assert.equal(r.created, true);
  assert.ok(existsSync(join(cwd, '.git')));
  const { settings, digest } = await loadSettings(cwd);
  assert.equal(settings.authority_remote, null);
  assert.equal(settings.signing_key, null);
  const log = await readLog(cwd);
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, 'init');
  assert.deepEqual(log[0].payload, { settings_digest: digest, authority_remote: null, auth_mode: 'unsigned-local' });
  assert.equal(log[0].payload.evidence, undefined);
  assert.ok(await readRef(cwd, 'refs/cairn/log'));
  assert.ok(await readRef(cwd, 'refs/cairn/snapshots'));
});

test('init is idempotent on the same identity', async () => {
  const { cwd } = await repoWith({});
  const a = await init(cwd, answers());
  const b = await init(cwd, answers({ confirm: async () => { throw new Error('must not ask again'); } }));
  assert.equal(b.created, false);
  assert.equal(a.sha, b.sha);
  assert.equal((await readLog(cwd)).length, 1);
});

test('init never assumes origin: the developer must name the remote', async () => {
  const { cwd } = await repoWith({});
  await git(['remote', 'add', 'origin', 'https://example.invalid/r.git'], { cwd });
  const seen = [];
  await init(cwd, answers({ confirmRemote: async (c) => { seen.push(c); return 'origin'; } }));
  assert.deepEqual(seen, [['origin']]);
  assert.equal((await loadSettings(cwd)).settings.authority_remote, 'origin');
  assert.equal((await readLog(cwd))[0].payload.authority_remote, 'origin');
});

test('init refuses an authority remote that is not configured', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(init(cwd, answers({ confirmRemote: async () => 'upstream' })),
    /^InitError: cairn: authority_remote upstream is not a configured remote/);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
});

test('init with a chosen signing key records auth_mode signed', async () => {
  const { cwd } = await repoWith({});
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  await init(cwd, answers({ chooseKey: async () => pem,
    sign: async (b) => new Uint8Array(sign(null, b, privateKey)) }));
  assert.equal((await readLog(cwd))[0].payload.auth_mode, 'signed');
});

test('settings without refs are adopted only after the developer confirms the digest', async () => {
  const s = JSON.stringify(DEFAULT_SETTINGS(null, null));
  const { cwd } = await repoWith({ '.cairn/settings.json': s });
  const asked = [];
  await assert.rejects(init(cwd, answers({ confirmDigest: async (d) => { asked.push(d); return false; } })),
    /cairn: existing settings not confirmed/);
  assert.equal(asked[0], (await loadSettings(cwd)).digest);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
  const r = await init(cwd, answers());
  assert.equal(r.created, true);
});

test('refs without settings refuse and name repair', async () => {
  const { cwd } = await repoWith({});
  await init(cwd, answers());
  const digest = (await loadSettings(cwd)).digest;
  rmSync(join(cwd, '.cairn/settings.json'));
  await assert.rejects(init(cwd, answers()),
    new RegExp(`cairn: refs/cairn/log exists but .cairn/settings.json is missing; restore the file whose digest is ${digest} \\(git checkout -- .cairn/settings.json\\) or run cairn authorize after writing a new one`));
});

test('init refuses invalid settings and lists every refusal', async () => {
  const bad = JSON.stringify({ schema: 1, unknown_field: 1 });
  const { cwd } = await repoWith({ '.cairn/settings.json': bad });
  await assert.rejects(init(cwd, answers()), /unknown_field/);
});
