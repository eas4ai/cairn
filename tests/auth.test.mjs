// tests/auth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
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
import { sha256, canonicalize } from '../lib/canon.mjs';
import { specDigest, agreementDigest, protectedDigests } from '../lib/auth.mjs';

const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: [],
  interfaces: [], data: [], network_exclude: [], signing_key: null, attribution: 'forbidden',
  harness: {}, typesafeai: { enabled: false, mode: 'shadow', model: null,
    route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3,
    reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05,
    min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } });

test('specDigest is the digest of sorted [path, digest] pairs', async () => {
  const { cwd } = await repoWith({ 'docs/spec/b.md': 'B\n', 'docs/spec/a/x.md': 'X\n' });
  const expected = sha256(canonicalize([
    ['docs/spec/a/x.md', sha256('X\n')], ['docs/spec/b.md', sha256('B\n')]]));
  assert.equal(specDigest(cwd), expected);
  writeFileSync(join(cwd, 'docs/spec/b.md'), 'changed\n');
  assert.notEqual(specDigest(cwd), expected);
});

test('specDigest ignores docs/spec/roadmap.md, which the kernel edits at start and promote', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove); const cwd = repo.dir;
  await repo.write('docs/spec/overview.md', '# keystone\n');
  const before = specDigest(cwd);
  await repo.write('docs/spec/roadmap.md', 'Current: hooks\n');
  assert.equal(specDigest(cwd), before);
});
test('specDigest of a missing docs/spec is the empty array digest', async () => {
  const { cwd } = await repoWith({});
  assert.equal(specDigest(cwd), sha256(canonicalize([])));
});

test('protectedDigests carries agreement null when AGENTS.md is absent', async () => {
  const { cwd } = await repoWith({ '.cairn/settings.json': SETTINGS });
  const d = await protectedDigests(cwd);
  assert.equal(d.agreement, null);
  assert.match(d.settings, /^sha256:[0-9a-f]{64}$/);
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'AGENTS.md'), '# agreement\n');
  assert.equal(agreementDigest(cwd), sha256('# agreement\n'));
});

import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { authenticateDeveloper, verifyEvidence, signingPayload, describeEvidence, AuthError } from '../lib/auth.mjs';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }),
    sign: async (bytes) => new Uint8Array(cryptoSign(null, bytes, privateKey)) };
}

test('signed mode: a detached signature over the canonical payload verifies', async () => {
  const { cwd } = await repoWith({});
  const { pem, sign } = keyPair();
  const settings = { signing_key: pem };
  const ev = await authenticateDeveloper(cwd, settings, { purpose: 'authorize', subject: 's', sign, nonce: 'n1' });
  assert.equal(ev.mode, 'signed');
  assert.deepEqual(Object.keys(ev).sort(), ['mode', 'nonce', 'purpose', 'signature', 'subject']);
  assert.equal(verifyEvidence(settings, ev), true);
  assert.equal(verifyEvidence(settings, { ...ev, subject: 'other' }), false);
  assert.equal(verifyEvidence({ signing_key: keyPair().pem }, ev), false);
  assert.equal(describeEvidence(ev), 'signed by the developer key');
});

test('signed mode: a bad signature is refused, not recorded', async () => {
  const { cwd } = await repoWith({});
  const { pem } = keyPair();
  const bad = async (bytes) => new Uint8Array(64);
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: pem }, { purpose: 'authorize', subject: 's', sign: bad, nonce: 'n' }),
    /^AuthError: cairn: the signature does not verify against signing_key/);
});

test('signingPayload is the canonical JSON of purpose, subject and nonce', () => {
  const bytes = signingPayload({ purpose: 'read', subject: 'D1', nonce: 'x' });
  assert.equal(Buffer.from(bytes).toString(), '{"nonce":"x","purpose":"read","subject":"D1"}');
});

test('unsigned-local: terminal confirmation records the Git author as evidence', async () => {
  const { cwd } = await repoWith({});
  const prompts = [];
  const confirm = async (prompt) => { prompts.push(prompt); return true; };
  const ev = await authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', confirm, nonce: 'n' });
  assert.deepEqual(ev, { mode: 'unsigned-local', purpose: 'read', subject: 'D1', nonce: 'n',
    author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true });
  assert.match(prompts[0], /read D1/);
  assert.equal(verifyEvidence({ signing_key: null }, ev), true);
  assert.match(describeEvidence(ev), /evidence, not authentication/);
});

test('unsigned-local: a declined confirmation is refused', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', confirm: async () => false }),
    /^AuthError: cairn: the developer did not confirm read D1/);
});

test('unsigned-local: no controlling terminal is refused', async () => {
  const { cwd } = await repoWith({});
  const noTty = async () => { throw new AuthError('cairn: no controlling terminal; unsigned-local confirmation needs a TTY'); };
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', confirm: noTty }),
    /no controlling terminal/);
});

test('verifyEvidence refuses unsigned-local evidence when a signing key is set', () => {
  const ev = { mode: 'unsigned-local', purpose: 'read', subject: 'D1', nonce: 'n',
    author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true };
  assert.equal(verifyEvidence({ signing_key: keyPair().pem }, ev), false);
});

import { appendRecord, readLog, decodeRecord } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { authorize, authorizations, latestProtected } from '../lib/auth.mjs';
import { init } from '../lib/init.mjs';

const yes = async () => true;
const BASE = { '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# agreement\n', 'docs/spec/overview.md': '# keystone\n' };
async function initialized(files = BASE) {
  const { cwd } = await repoWith(files);
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  return cwd;
}

test('authorize writes one record binding the three digests with verified evidence', async () => {
  const cwd = await initialized();
  const sha = await authorize(cwd, { confirm: yes });
  const log = await readLog(cwd);
  const rec = log.at(-1);
  assert.equal(rec.sha, sha);
  assert.equal(rec.kind, 'authorization');
  const d = await protectedDigests(cwd);
  assert.equal(rec.payload.spec_digest, d.spec);
  assert.equal(rec.payload.agreement_digest, d.agreement);
  assert.equal(rec.payload.settings_digest, d.settings);
  assert.equal(rec.payload.decision, null);
  assert.equal(rec.payload.intent, null);
  assert.equal(rec.payload.evidence.mode, 'unsigned-local');
  assert.equal(rec.payload.evidence.subject, canonicalize({ spec: d.spec, agreement: d.agreement, settings: d.settings }));
  assert.equal((await catCommit(cwd, sha)).subject, 'cairn: authorization protected');
  assert.deepEqual(decodeRecord(await catCommit(cwd, sha)).payload, rec.payload);
  assert.deepEqual(latestProtected(log), d);
  assert.equal(authorizations(log).length, 2);
});

test('authorize refuses before init', async () => {
  const { cwd } = await repoWith(BASE);
  await assert.rejects(authorize(cwd, { confirm: yes }), /^AuthError: cairn: run cairn init first/);
});

test('authorize refuses without AGENTS.md', async () => {
  const cwd = await initialized({ '.cairn/settings.json': SETTINGS, 'docs/spec/overview.md': '# k\n' });
  await assert.rejects(authorize(cwd, { confirm: yes }), /cairn: AGENTS.md is missing; authorize binds the working agreement/);
});

test('authorize refuses a declined confirmation and writes nothing', async () => {
  const cwd = await initialized();
  const before = (await readLog(cwd)).length;
  await assert.rejects(authorize(cwd, { confirm: async () => false }), /did not confirm/);
  assert.equal((await readLog(cwd)).length, before);
});

import { isAuthorized, refuseUnauthorizedProtected, protectedClass } from '../lib/auth.mjs';

test('protectedClass names the three developer-owned classes', () => {
  assert.equal(protectedClass('.cairn/settings.json'), 'settings');
  assert.equal(protectedClass('AGENTS.md'), 'agreement');
  assert.equal(protectedClass('docs/spec/a/b.md'), 'spec');
  assert.equal(protectedClass('docs/decisions.jsonl'), null);
  assert.equal(protectedClass('src/x.mjs'), null);
});

test('a protected change is authorized only by a record naming its before and after digests', async () => {
  const cwd = await initialized();
  const log0 = await readLog(cwd);
  const initDigest = log0[0].payload.settings_digest;
  assert.equal(await isAuthorized(cwd, '.cairn/settings.json', null, initDigest), true);
  const d1 = await protectedDigests(cwd);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d1.agreement), false);
  await authorize(cwd, { confirm: yes });
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d1.agreement), true);
  assert.equal(await isAuthorized(cwd, 'docs/spec/overview.md', null, d1.spec), true);
  writeFileSync(join(cwd, 'AGENTS.md'), '# changed\n');
  const d2 = await protectedDigests(cwd);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', d1.agreement, d2.agreement), false);
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)),
    /^AuthError: cairn: AGENTS.md changed to sha256:[0-9a-f]{64} without a developer authorization; run cairn authorize/);
  await authorize(cwd, { confirm: yes });
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', d1.agreement, d2.agreement), true);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d2.agreement), false, 'before digest must match the chain');
  await refuseUnauthorizedProtected(cwd, await readLog(cwd));
});

test('a settings change needs a new authorization naming the new digest', async () => {
  const cwd = await initialized();
  await authorize(cwd, { confirm: yes });
  const s = JSON.parse(SETTINGS); s.outside = ['README.md'];
  writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(s));
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)), /\.cairn\/settings\.json changed to/);
  await authorize(cwd, { confirm: yes });
  await refuseUnauthorizedProtected(cwd, await readLog(cwd));
});

import { readDecision, runDecisionsRead } from '../lib/auth.mjs';

test('decisions --read writes a read record with developer evidence', async () => {
  const cwd = await initialized();
  const sha = await readDecision(cwd, '01J0000000000000000000ABCD', { confirm: yes });
  const rec = (await readLog(cwd)).at(-1);
  assert.equal(rec.sha, sha);
  assert.equal(rec.kind, 'read');
  assert.equal(rec.target, '01J0000000000000000000ABCD');
  assert.equal(rec.payload.decision, '01J0000000000000000000ABCD');
  assert.equal(rec.payload.evidence.purpose, 'read');
  assert.equal(rec.payload.evidence.subject, '01J0000000000000000000ABCD');
  assert.equal(verifyEvidence({ signing_key: null }, rec.payload.evidence), true);
});

test('decisions --read refuses a malformed decision id and an unconfirmed read', async () => {
  const cwd = await initialized();
  await assert.rejects(readDecision(cwd, 'not-a-ulid', { confirm: yes }), /^AuthError: cairn: decision id must be a 26-character ULID/);
  await assert.rejects(readDecision(cwd, '01J0000000000000000000ABCD', { confirm: async () => false }), /did not confirm read/);
});

test('runDecisionsRead exits 1 with one cairn: line when the signature is missing in signed mode', async () => {
  const { cwd } = await repoWith(BASE);
  const { generateKeyPairSync } = await import('node:crypto');
  const pem = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  const s = JSON.parse(SETTINGS); s.signing_key = pem;
  writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(s));
  const err = []; const out = [];
  const io = { cwd, env: {}, stdout: (l) => out.push(l), stderr: (l) => err.push(l) };
  const code = await runDecisionsRead(['--read', '01J0000000000000000000ABCD'], io);
  assert.equal(code, 1);
  assert.equal(err.length, 1);
  assert.match(err[0], /^cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE/);
  assert.match(out[0], /^cairn: sign this payload: \{"nonce":/);
});

import { encodeRecord } from '../lib/records.mjs';

test('init, authorization and read records round-trip and refuse unknown or missing keys', async () => {
  const cwd = await initialized();
  await authorize(cwd, { confirm: yes });
  await readDecision(cwd, '01J0000000000000000000ABCD', { confirm: yes });
  for (const rec of await readLog(cwd)) {
    const commit = await catCommit(cwd, rec.sha);
    assert.deepEqual(decodeRecord(commit), { kind: rec.kind, target: rec.target, payload: rec.payload });
    // Deviation from the plan text: catCommit (lib/gitx.mjs, already committed) returns both `body`
    // (string) and `bodyBytes` (Buffer); verifyEnvelope hashes and parses bodyBytes when present, so
    // mutating only `body` (as the plan's literal spread does) leaves decodeRecord looking at the
    // original, untouched bytes and never throwing. bodyBytes is mutated to match here so the digest
    // trailer stops matching, as the assertion intends.
    const tamperedBody = commit.body.replace(/}$/, ',"extra":1}');
    assert.throws(() => decodeRecord({ ...commit, body: tamperedBody, bodyBytes: Buffer.from(tamperedBody, 'utf8') }));
  }
  assert.throws(() => encodeRecord('init', 'project', { settings_digest: 'sha256:' + '0'.repeat(64) }), /authority_remote/);
  assert.throws(() => encodeRecord('read', 'X', { decision: 'X', evidence: {}, more: 1 }), /more/);
});
