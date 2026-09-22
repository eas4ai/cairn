// tests/init.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
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
import { appendRecord, readLog } from '../lib/records.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { init, DEFAULT_SETTINGS } from '../lib/init.mjs';

// Spec revision 6, "Project initialization": init takes the developer's answers as flags and asks
// nothing itself. `fresh()` is the default set of flags for creating settings from scratch
// (local-only, attested, a quote); individual tests override just the flag(s) their rule exercises.
const fresh = (over = {}) => ({ localOnly: true, attested: true, quote: 'ok', env: {}, ...over });

test('init on a plain directory initializes Git, writes settings, init record and ref roots', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cairn-init-'));
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 'Cairn Test', GIT_AUTHOR_EMAIL: 'test@example.invalid' });
  t.after(() => { delete process.env.GIT_AUTHOR_NAME; delete process.env.GIT_AUTHOR_EMAIL; Object.assign(process.env, saved); rmSync(cwd, { recursive: true, force: true }); });
  const r = await init(cwd, fresh());
  assert.equal(r.created, true);
  assert.ok(existsSync(join(cwd, '.git')));
  const { settings, digest } = await loadSettings(cwd);
  assert.equal(settings.authority_remote, null);
  assert.equal(settings.signing_key, null);
  const log = await readLog(cwd);
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, 'init');
  assert.deepEqual(log[0].payload, { settings_digest: digest, authority_remote: null, auth_mode: 'attested' });
  assert.ok(await readRef(cwd, 'refs/cairn/log'));
  assert.ok(await readRef(cwd, 'refs/cairn/snapshots'));
});

test('existing settings and refs at the same digest is idempotent; no flags are needed', async () => {
  const { cwd } = await repoWith({});
  const a = await init(cwd, fresh());
  // A second call with no flags at all (not even a quote) proves the idempotent early return never
  // re-authenticates or re-reads the creation flags.
  const b = await init(cwd, {});
  assert.equal(b.created, false);
  assert.equal(a.sha, b.sha);
  assert.equal((await readLog(cwd)).length, 1);
});

test('creating settings needs exactly one of --remote or --local-only', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(init(cwd, fresh({ localOnly: false })),
    /^InitError: cairn: init needs --remote <name> or --local-only$/);
  await assert.rejects(init(cwd, fresh({ remote: 'origin' })),
    /^InitError: cairn: init needs --remote <name> or --local-only$/);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
});

test('creating settings needs exactly one of --signing-key or --attested', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(init(cwd, fresh({ attested: false })),
    /^InitError: cairn: init needs --signing-key <path> or --attested$/);
  await assert.rejects(init(cwd, fresh({ signingKeyPem: 'not a real key' })),
    /^InitError: cairn: init needs --signing-key <path> or --attested$/);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
});

test('a --remote that is not a configured remote refuses as today', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(init(cwd, fresh({ localOnly: false, remote: 'upstream' })),
    /^InitError: cairn: authority_remote upstream is not a configured remote/);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
});

test('init writes the named remote as authority_remote', async () => {
  const { cwd } = await repoWith({});
  await git(['remote', 'add', 'origin', 'https://example.invalid/r.git'], { cwd });
  await init(cwd, fresh({ localOnly: false, remote: 'origin' }));
  assert.equal((await loadSettings(cwd)).settings.authority_remote, 'origin');
  assert.equal((await readLog(cwd))[0].payload.authority_remote, 'origin');
});

test('init with --signing-key records auth_mode signed', async () => {
  const { cwd } = await repoWith({});
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  await init(cwd, fresh({ attested: false, signingKeyPem: pem, quote: undefined,
    sign: async (b) => new Uint8Array(sign(null, b, privateKey)) }));
  assert.equal((await readLog(cwd))[0].payload.auth_mode, 'signed');
});

test('attested mode without a quote refuses', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(init(cwd, fresh({ quote: undefined })),
    /^AuthError: cairn: init needs --quote <the developer's words>$/);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
});

test('existing settings without refs need --adopt matching the loaded settings digest', async () => {
  const s = JSON.stringify(DEFAULT_SETTINGS(null, null));
  const { cwd } = await repoWith({ '.cairn/settings.json': s });
  const digest = (await loadSettings(cwd)).digest;
  await assert.rejects(init(cwd, { quote: 'ok', env: {} }),
    new RegExp(`^InitError: cairn: init needs --adopt <digest> to adopt existing settings at ${digest}$`));
  await assert.rejects(init(cwd, { adopt: 'sha256:' + '0'.repeat(64), quote: 'ok', env: {} }),
    /^InitError: cairn: init needs --adopt <digest> to adopt existing settings at sha256:/);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
  const r = await init(cwd, { adopt: digest, quote: 'ok', env: {} });
  assert.equal(r.created, true);
  assert.equal((await readLog(cwd))[0].payload.auth_mode, 'attested');
});

test('existing settings refuse --remote, --local-only, --signing-key or --attested', async () => {
  const s = JSON.stringify(DEFAULT_SETTINGS(null, null));
  const { cwd } = await repoWith({ '.cairn/settings.json': s });
  await assert.rejects(init(cwd, fresh({ localOnly: false })),
    /^InitError: cairn: settings exist; --remote, --local-only, --signing-key and --attested apply only when creating them$/);
  await assert.rejects(init(cwd, { attested: true, quote: 'ok', env: {} }),
    /^InitError: cairn: settings exist; --remote, --local-only, --signing-key and --attested apply only when creating them$/);
  // A correct --adopt alongside those same flags is not refused: they simply go unused once the
  // digest on disk is the one being adopted (the same flags a real two-invocation signed flow
  // re-sends on its second call, after the first call's own write already put settings.json on
  // disk -- see tests/cli.test.mjs's two-step signed flow test).
  const digest = (await loadSettings(cwd)).digest;
  const r = await init(cwd, fresh({ localOnly: false, adopt: digest }));
  assert.equal(r.created, true);
});

test('refs without settings refuse and name repair', async () => {
  const { cwd } = await repoWith({});
  await init(cwd, fresh());
  const digest = (await loadSettings(cwd)).digest;
  rmSync(join(cwd, '.cairn/settings.json'));
  await assert.rejects(init(cwd, fresh()),
    new RegExp(`cairn: refs/cairn/log exists but .cairn/settings.json is missing; restore the file whose digest is ${digest} \\(git checkout -- .cairn/settings.json\\) or write a new one and ask the developer and record the answer with cairn authorize --quote <words>`));
});

test('init refuses invalid settings and lists every refusal', async () => {
  const bad = JSON.stringify({ schema: 1, unknown_field: 1 });
  const { cwd } = await repoWith({ '.cairn/settings.json': bad });
  await assert.rejects(init(cwd, { quote: 'ok', env: {} }), /unknown_field/);
});

// Fix round 1, item 3: the idempotent early return (created: false) used to skip the snapshot-root
// creation entirely, so a re-run of init could not repair a lost refs/cairn/snapshots.
test('a re-run of init repairs a missing snapshot root even on the idempotent path', async () => {
  const { cwd } = await repoWith({});
  const a = await init(cwd, fresh());
  assert.ok(await readRef(cwd, 'refs/cairn/snapshots'));
  await git(['update-ref', '-d', 'refs/cairn/snapshots'], { cwd });
  assert.equal(await readRef(cwd, 'refs/cairn/snapshots'), null);
  const b = await init(cwd, {});
  assert.equal(b.created, false);
  assert.equal(a.sha, b.sha);
  assert.ok(await readRef(cwd, 'refs/cairn/snapshots'));
});

// Fix round 1, item 4: previously the candidate settings object was written to disk first and
// validated only afterward by loadSettings, so a developer whose --signing-key pointed at a
// private key got that key written into .cairn/settings.json before the refusal. Validate in
// memory first.
test('init validates a signing key before writing settings; a private key is refused and nothing is written', async () => {
  const { cwd } = await repoWith({});
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  await assert.rejects(init(cwd, fresh({ attested: false, signingKeyPem: pem })), /signing_key must be a public key/);
  assert.equal(existsSync(join(cwd, '.cairn/settings.json')), false);
});

// Fix round 1, item 9: refs/cairn/log can exist with no record of kind 'init' in it (a corrupted or
// non-Cairn log); reading rec.payload without checking rec exists threw a raw TypeError instead of
// a cairn: refusal naming the repair.
test('a log ref with no init record refuses cleanly instead of crashing', async () => {
  const { cwd } = await repoWith({});
  await appendRecord(cwd, 'read', '01J0000000000000000000ABCD', { decision: '01J0000000000000000000ABCD',
    evidence: { mode: 'unsigned-local', purpose: 'read', subject: '01J0000000000000000000ABCD', nonce: 'n',
      author: { name: 'x', email: 'y' }, confirmed: true } });
  await assert.rejects(init(cwd, fresh()), /^InitError: cairn: refs\/cairn\/log exists but has no init record/);
});

// Fix round 2: the fix round 1 findInitRecord searched the whole log with .find(), which happened
// to pick the earliest 'init' record when one legitimately existed first, but would wrongly accept
// a LATER record of kind 'init' as the init record when the log's real first record was something
// else. Here the log's first record is a plain 'read' record and a forged 'init' record (an
// attacker-chosen settings digest, appended directly, bypassing init() and its authentication
// entirely) comes second; init on this log whose first record is not an init record must refuse and
// name the repair, exactly as it would with no init record anywhere, not adopt the later one.
test("a forged init record later in the log does not stand in for the missing first init record", async () => {
  const { cwd } = await repoWith({});
  await appendRecord(cwd, 'read', '01J0000000000000000000ABCD', { decision: '01J0000000000000000000ABCD',
    evidence: { mode: 'unsigned-local', purpose: 'read', subject: '01J0000000000000000000ABCD', nonce: 'n',
      author: { name: 'x', email: 'y' }, confirmed: true } });
  await appendRecord(cwd, 'init', 'project', { settings_digest: 'sha256:' + '2'.repeat(64), authority_remote: null, auth_mode: 'unsigned-local' });
  await assert.rejects(init(cwd, fresh()), /^InitError: cairn: refs\/cairn\/log exists but has no init record/);
});
