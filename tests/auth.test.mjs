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
  interfaces: [], data: [], network_exclude: [], signing_key: null, attribution: 'forbidden', developer: 'present',
  harness: {}, typesafeai: { enabled: false, model: null,
    weights: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, agent_ceiling: 0.35,
    confidence_floors: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 },
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
import { authenticateDeveloper, verifyEvidence, signingPayload, describeEvidence } from '../lib/auth.mjs';

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

// Spec revision 6, "Developer evidence": the null-key path is attested, not a terminal
// confirmation -- the agent asks the developer in conversation and passes the quoted words as
// --quote; authenticateDeveloper records that quote, the harness it detected and the Git author.
test('attested: authenticateDeveloper records the quote, harness and Git author as evidence', async () => {
  const { cwd } = await repoWith({});
  const ev = await authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', quote: 'yes, 30 days', nonce: 'n', env: {} });
  assert.deepEqual(ev, { mode: 'attested', purpose: 'read', subject: 'D1', nonce: 'n', quote: 'yes, 30 days',
    harness: 'none', author: { name: 'Cairn Test', email: 'test@example.invalid' } });
  assert.equal(verifyEvidence({ signing_key: null }, ev), true);
  assert.match(describeEvidence(ev), /evidence, not authentication/);
});

// harnessName (attested via authenticateDeveloper): env.CAIRN_HARNESS wins outright; otherwise the
// first HARNESS_ENV hit; otherwise 'none'.
test('attested: harness comes from CAIRN_HARNESS, else the first HARNESS_ENV hit, else none', async () => {
  const { cwd } = await repoWith({});
  const auth = (env) => authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', quote: 'ok', nonce: 'n', env });
  assert.equal((await auth({ CLAUDECODE: '1' })).harness, 'claude_code');
  assert.equal((await auth({})).harness, 'none');
  assert.equal((await auth({ CAIRN_HARNESS: 'muse' })).harness, 'muse');
  // CAIRN_HARNESS wins even when a HARNESS_ENV variable is also present.
  assert.equal((await auth({ CLAUDECODE: '1', CAIRN_HARNESS: 'muse' })).harness, 'muse');
});

// A missing or blank quote refuses with the exact message every developer-only command shares.
test('attested: a missing or blank quote refuses with the exact --quote message', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', nonce: 'n', env: {} }),
    /^AuthError: cairn: read needs --quote <the developer's words>$/);
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', quote: '   ', nonce: 'n', env: {} }),
    /^AuthError: cairn: read needs --quote <the developer's words>$/);
});

test('verifyEvidence refuses attested evidence when a signing key is set', () => {
  const ev = { mode: 'attested', purpose: 'read', subject: 'D1', nonce: 'n', quote: 'ok',
    harness: 'none', author: { name: 'Cairn Test', email: 'test@example.invalid' } };
  assert.equal(verifyEvidence({ signing_key: keyPair().pem }, ev), false);
});

// Fix round 1, item 11: verifyEvidence previously took no expected purpose/subject, so evidence
// lifted from a different record (right shape, wrong subject) verified anyway; and a settings
// object that omits the signing_key key entirely fell open to the attested branch, the same as an
// explicit signing_key: null.
test('verifyEvidence checks the expected purpose and subject, and refuses a settings object without signing_key', () => {
  const ev = { mode: 'attested', purpose: 'read', subject: 'D1', nonce: 'n', quote: 'ok',
    harness: 'none', author: { name: 'Cairn Test', email: 'test@example.invalid' } };
  assert.equal(verifyEvidence({ signing_key: null }, ev, { purpose: 'read', subject: 'D1' }), true);
  assert.equal(verifyEvidence({ signing_key: null }, ev, { purpose: 'authorize', subject: 'D1' }), false);
  assert.equal(verifyEvidence({ signing_key: null }, ev, { purpose: 'read', subject: 'other' }), false);
  assert.equal(verifyEvidence({}, ev), false);
});

// A legacy 'unsigned-local' evidence record (written before this change) still decodes: the
// schema keeps reading it, even though nothing writes it any more.
test('a legacy unsigned-local record still decodes', async () => {
  const { cwd } = await repoWith({});
  const id = '01J0000000000000000000ABCD';
  const evidence = { mode: 'unsigned-local', purpose: 'read', subject: id, nonce: 'n',
    author: { name: 'Dev', email: 'dev@example.test' }, confirmed: true };
  await appendRecord(cwd, 'read', id, { decision: id, evidence });
  const rec = (await readLog(cwd)).at(-1);
  assert.equal(rec.kind, 'read');
  assert.deepEqual(rec.payload.evidence, evidence);
  assert.match(describeEvidence(rec.payload.evidence), /unsigned-local: terminal confirmation/);
});

import { appendRecord, readLog, decodeRecord } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { authorize, authorizations, latestProtected } from '../lib/auth.mjs';
import { init } from '../lib/init.mjs';

const yes = async () => true;
const BASE = { '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# agreement\n', 'docs/spec/overview.md': '# keystone\n' };
async function initialized(files = BASE) {
  const { cwd } = await repoWith(files);
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, quote: 'ok', confirmDigest: yes, env: {} });
  return cwd;
}

test('authorize writes one record binding the three digests with verified evidence', async () => {
  const cwd = await initialized();
  const sha = await authorize(cwd, { quote: 'ok', env: {} });
  const log = await readLog(cwd);
  const rec = log.at(-1);
  assert.equal(rec.sha, sha);
  assert.equal(rec.kind, 'authorization');
  const d = await protectedDigests(cwd);
  assert.equal(rec.payload.spec_digest, d.spec);
  assert.equal(rec.payload.agreement_digest, d.agreement);
  assert.equal(rec.payload.settings_digest, d.settings);
  assert.equal(rec.payload.decision, null);
  // Deviation from the plan text: this is plan 03's own test, asserting intent was null before
  // plan 04 (this plan, Task 6) made authorize() a transaction. No protected path is dirty here (the
  // fixture files match what init() already saw), so authorize's transaction has no branch write and
  // its only earlier record is the command-intent that withTransaction appends; intent now names it.
  assert.equal(rec.payload.intent, log.at(-2).sha);
  assert.equal(rec.payload.evidence.mode, 'attested');
  assert.equal(rec.payload.evidence.quote, 'ok');
  assert.equal(rec.payload.evidence.subject, canonicalize({ spec: d.spec, agreement: d.agreement, settings: d.settings }));
  assert.equal((await catCommit(cwd, sha)).subject, 'cairn: authorization protected');
  assert.deepEqual(decodeRecord(await catCommit(cwd, sha)).payload, rec.payload);
  assert.deepEqual(latestProtected(log), d);
  assert.equal(authorizations(log).length, 2);
});

test('authorize refuses before init', async () => {
  const { cwd } = await repoWith(BASE);
  await assert.rejects(authorize(cwd, { quote: 'ok', env: {} }), /^AuthError: cairn: run cairn init first/);
});

test('authorize refuses without AGENTS.md', async () => {
  const cwd = await initialized({ '.cairn/settings.json': SETTINGS, 'docs/spec/overview.md': '# k\n' });
  await assert.rejects(authorize(cwd, { quote: 'ok', env: {} }), /cairn: AGENTS.md is missing; authorize binds the working agreement/);
});

test('authorize refuses a missing quote and writes nothing', async () => {
  const cwd = await initialized();
  const before = (await readLog(cwd)).length;
  await assert.rejects(authorize(cwd, { env: {} }), /needs --quote/);
  assert.equal((await readLog(cwd)).length, before);
});

import { isAuthorized, refuseUnauthorizedProtected, protectedClass } from '../lib/auth.mjs';

test('protectedClass names the three developer-owned classes', () => {
  assert.equal(protectedClass('.cairn/settings.json'), 'settings');
  assert.equal(protectedClass('AGENTS.md'), 'agreement');
  assert.equal(protectedClass('docs/spec/a/b.md'), 'spec');
  assert.equal(protectedClass('docs/decisions.jsonl'), null);
  assert.equal(protectedClass('src/x.mjs'), null);
  // Pre-review fix: docs/spec/roadmap.md is kernel-edited at start and promote (section 2) and
  // is bound structurally, not by digest; specDigest already excludes it, so protectedClass must
  // agree rather than classing it as an ordinary spec path.
  assert.equal(protectedClass('docs/spec/roadmap.md'), null);
});

test('a roadmap change needs no authorization while a docs/spec change does', async () => {
  const cwd = await initialized();
  await authorize(cwd, { quote: 'ok', env: {} });
  writeFileSync(join(cwd, 'docs/spec/roadmap.md'), 'Current: hooks\n');
  await refuseUnauthorizedProtected(cwd, await readLog(cwd)); // does not throw: roadmap is excepted
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'changed\n');
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)), /docs\/spec changed to/);
});

test('a protected change is authorized only by a record naming its before and after digests', async () => {
  const cwd = await initialized();
  const log0 = await readLog(cwd);
  const initDigest = log0[0].payload.settings_digest;
  assert.equal(await isAuthorized(cwd, '.cairn/settings.json', null, initDigest), true);
  const d1 = await protectedDigests(cwd);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d1.agreement), false);
  await authorize(cwd, { quote: 'ok', env: {} });
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d1.agreement), true);
  assert.equal(await isAuthorized(cwd, 'docs/spec/overview.md', null, d1.spec), true);
  writeFileSync(join(cwd, 'AGENTS.md'), '# changed\n');
  const d2 = await protectedDigests(cwd);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', d1.agreement, d2.agreement), false);
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)),
    /^AuthError: cairn: AGENTS.md changed to sha256:[0-9a-f]{64} without a developer authorization; ask the developer and record the answer with cairn authorize --quote <words>/);
  await authorize(cwd, { quote: 'ok', env: {} });
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', d1.agreement, d2.agreement), true);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d2.agreement), false, 'before digest must match the chain');
  await refuseUnauthorizedProtected(cwd, await readLog(cwd));
});

test('a settings change needs a new authorization naming the new digest', async () => {
  const cwd = await initialized();
  await authorize(cwd, { quote: 'ok', env: {} });
  const s = JSON.parse(SETTINGS); s.outside = ['README.md'];
  writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(s));
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)), /\.cairn\/settings\.json changed to/);
  await authorize(cwd, { quote: 'ok', env: {} });
  await refuseUnauthorizedProtected(cwd, await readLog(cwd));
});

// Fix round 1, item 2: appendRecord is not developer-gated, so a record with schema-valid but
// never-actually-verified evidence could previously be appended directly and would still be trusted
// by isAuthorized and refuseUnauthorizedProtected, which read the log without ever calling
// verifyEvidence. This drives a signed-key project, forges an 'authorization' record binding a real
// digest transition with a signature that was never checked against the key, and asserts the
// protected check still refuses it.
test('the protected check re-verifies chain record evidence and refuses a forged authorization', async () => {
  const { generateKeyPairSync, sign: cryptoSign2 } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const s = JSON.parse(SETTINGS); s.signing_key = pem;
  const files = { '.cairn/settings.json': JSON.stringify(s), 'AGENTS.md': '# agreement\n', 'docs/spec/overview.md': '# keystone\n' };
  const { cwd } = await repoWith(files);
  const sign = async (bytes) => new Uint8Array(cryptoSign2(null, bytes, privateKey));
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirmDigest: yes, sign });
  await authorize(cwd, { sign });
  const d1 = await protectedDigests(cwd);
  writeFileSync(join(cwd, 'AGENTS.md'), '# changed\n');
  const d2 = await protectedDigests(cwd);
  // A forged authorization: schema-valid evidence, syntactically shaped as 'signed', but the
  // signature was never produced by (or checked against) the real key.
  await appendRecord(cwd, 'authorization', 'protected', {
    spec_digest: d2.spec, agreement_digest: d2.agreement, settings_digest: d2.settings,
    evidence: { mode: 'signed', purpose: 'authorize',
      subject: canonicalize({ spec: d2.spec, agreement: d2.agreement, settings: d2.settings }),
      nonce: 'forged', signature: 'AAAA' },
    decision: null, intent: null, results: [],
  });
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', d1.agreement, d2.agreement), false);
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)), /AuthError: cairn: the latest authorization record/);
});

// Fix round 2: the fix round 1 version of chainRecordVerifies trusted ANY record of kind 'init',
// not just the log's actual first record, so a second, forged 'init' record (appended directly,
// bypassing init() and its authentication entirely; the init schema carries no evidence field at
// all) stood in for a real authorization. Reproduced by the re-reviewer: with a signed-key project,
// appending a forged 'init' record binding an attacker-chosen settings digest made
// isAuthorized('.cairn/settings.json', before, after) return true. The one legitimate init record
// is refs/cairn/log's first record and nothing else; a later one is a breach.
test("the protected check trusts only the log's first record as the init record; a later one is a breach", async () => {
  const { generateKeyPairSync, sign: cryptoSign3 } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const s = JSON.parse(SETTINGS); s.signing_key = pem;
  const files = { '.cairn/settings.json': JSON.stringify(s), 'AGENTS.md': '# agreement\n', 'docs/spec/overview.md': '# keystone\n' };
  const { cwd } = await repoWith(files);
  const sign = async (bytes) => new Uint8Array(cryptoSign3(null, bytes, privateKey));
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirmDigest: yes, sign });
  const before = await protectedDigests(cwd);
  const forgedDigest = 'sha256:' + '1'.repeat(64);
  await appendRecord(cwd, 'init', 'project', { settings_digest: forgedDigest, authority_remote: null, auth_mode: 'unsigned-local' });
  assert.equal(await isAuthorized(cwd, '.cairn/settings.json', before.settings, forgedDigest), false);
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)),
    /^AuthError: cairn: [0-9a-f]{40} is a second record of kind init on refs\/cairn\/log/);
});

import { readDecision, runDecisionsRead } from '../lib/auth.mjs';

test('decisions --read writes a read record with developer evidence', async () => {
  const cwd = await initialized();
  const sha = await readDecision(cwd, '01J0000000000000000000ABCD', { quote: 'ok', env: {} });
  const rec = (await readLog(cwd)).at(-1);
  assert.equal(rec.sha, sha);
  assert.equal(rec.kind, 'read');
  assert.equal(rec.target, '01J0000000000000000000ABCD');
  assert.equal(rec.payload.decision, '01J0000000000000000000ABCD');
  assert.equal(rec.payload.evidence.purpose, 'read');
  assert.equal(rec.payload.evidence.subject, '01J0000000000000000000ABCD');
  assert.equal(verifyEvidence({ signing_key: null }, rec.payload.evidence), true);
});

test('decisions --read refuses a malformed decision id and a missing quote', async () => {
  const cwd = await initialized();
  await assert.rejects(readDecision(cwd, 'not-a-ulid', { quote: 'ok', env: {} }), /^AuthError: cairn: decision id must be a 26-character ULID/);
  await assert.rejects(readDecision(cwd, '01J0000000000000000000ABCD', { env: {} }), /needs --quote/);
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
  await authorize(cwd, { quote: 'ok', env: {} });
  await readDecision(cwd, '01J0000000000000000000ABCD', { quote: 'ok', env: {} });
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

import { git } from '../lib/gitx.mjs';

test('authorize commits the dirty protected paths and its record names the intent', async () => {
  const cwd = await initialized();
  writeFileSync(join(cwd, 'AGENTS.md'), '# changed\n');
  const sha = await authorize(cwd, { quote: 'ok', env: {} });
  const log = await readLog(cwd);
  assert.deepEqual(log.slice(-2).map((r) => r.kind), ['command-intent', 'authorization']);
  assert.equal(log.at(-1).payload.intent, log.at(-2).sha);
  assert.equal(log.at(-1).sha, sha);
  assert.equal((await git(['status', '--porcelain', '--', 'AGENTS.md'], { cwd })).stdout, '', 'AGENTS.md is committed');
  assert.equal((await git(['log', '-1', '--format=%s'], { cwd })).stdout.trim(), 'Authorize the specification, working agreement and settings');
  assert.equal(log.at(-1).payload.agreement_digest, sha256('# changed\n'));
});

test('Fix round 1 finding 6: authorize commits only the protected paths, leaving an unrelated staged file untouched', async () => {
  const cwd = await initialized();
  writeFileSync(join(cwd, 'AGENTS.md'), '# changed\n');
  writeFileSync(join(cwd, 'unrelated.txt'), 'developer work in progress\n');
  await git(['add', 'unrelated.txt'], { cwd });
  await authorize(cwd, { quote: 'ok', env: {} });
  const committed = (await git(['show', '--name-only', '--format=', 'HEAD'], { cwd })).stdout.trim().split('\n').filter(Boolean);
  assert.deepEqual(committed, ['AGENTS.md'], 'only the dirty protected path is in the commit');
  assert.equal((await git(['status', '--porcelain', '--', 'unrelated.txt'], { cwd })).stdout.trim(), 'A  unrelated.txt',
    "the developer's own staged file is untouched: still staged, not committed");
});

test('Fix round 1 finding 6: a rename inside a protected path is fully committed by both its new and old name', async () => {
  const cwd = await initialized();
  await git(['mv', 'docs/spec/overview.md', 'docs/spec/keystone.md'], { cwd });
  await authorize(cwd, { quote: 'ok', env: {} });
  // git show --name-only reports only the resulting path for a rename; --name-status shows the
  // R<score> <old> <new> triple, which is what proves the fix reads and commits the old name too
  // (the previous l.slice(3) parser, and --only with just the new path, orphan the old blob).
  const status = (await git(['show', '--name-status', '--format=', 'HEAD'], { cwd })).stdout.trim();
  assert.match(status, /^R\d+\tdocs\/spec\/overview\.md\tdocs\/spec\/keystone\.md$/);
  assert.equal((await git(['status', '--porcelain'], { cwd })).stdout, '', 'the rename is fully committed, nothing left dirty');
});

// Regression caught by tests/cli.test.mjs's existing 'cairn authorize: success ...' test after the
// first draft of the finding 6 fix: `git commit --only -- <path>` refuses a path git has never
// tracked at all, and .cairn/settings.json is exactly that on a project's very first authorize --
// init() writes it to disk but never commits it (repoWith's own fixture commit ran before init).
test('Fix round 1 finding 6: the first authorize commits a never-before-tracked protected path', async () => {
  const { cwd } = await repoWith({ 'AGENTS.md': '# agreement\n', 'docs/spec/overview.md': '# keystone\n' });
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, quote: 'ok', confirmDigest: yes, env: {} });
  assert.equal((await git(['status', '--porcelain', '--', '.cairn/settings.json'], { cwd })).stdout.trim().slice(0, 2), '??',
    '.cairn/settings.json is on disk but never git-added, the case that broke --only');
  const sha = await authorize(cwd, { quote: 'ok', env: {} });
  assert.ok(sha);
  assert.equal((await git(['status', '--porcelain'], { cwd })).stdout, '');
  const committed = (await git(['show', '--name-only', '--format=', 'HEAD'], { cwd })).stdout.trim().split('\n').filter(Boolean);
  assert.deepEqual(committed, ['.cairn/settings.json']);
});

// authorize() with a real quote binds the three digests, and the stored evidence's own
// describeEvidence text starts with 'attested:' (spec revision 6).
test('authorize with a quote binds; describeEvidence of the record starts with attested:', async () => {
  const cwd = await initialized();
  const sha = await authorize(cwd, { quote: 'looks right to me', env: {} });
  const rec = (await readLog(cwd)).find((r) => r.sha === sha);
  assert.equal(rec.payload.evidence.mode, 'attested');
  assert.match(describeEvidence(rec.payload.evidence), /^attested:/);
});

import { direction } from '../lib/auth.mjs';

// Spec revision 6, "Direction": `cairn authorize instead|ask` writes a direction record instead of
// binding the protected digests -- the developer's own words, with no nonce or subject to verify
// later (nothing protected changes).
test('direction writes a record with kind, target protected and the developer evidence fields', async () => {
  const cwd = await initialized();
  const sha = await direction(cwd, { kind: 'instead', quote: 'Ship the smaller version first.', env: {} });
  const rec = (await readLog(cwd)).find((r) => r.sha === sha);
  assert.equal(rec.kind, 'direction');
  assert.equal(rec.target, 'protected');
  assert.deepEqual(rec.payload, {
    purpose: 'authorize', kind: 'instead', text: 'Ship the smaller version first.', harness: 'none',
    author: { name: 'Cairn Test', email: 'test@example.invalid' },
  });
});

test('direction refuses a kind other than instead or ask', async () => {
  const cwd = await initialized();
  await assert.rejects(direction(cwd, { kind: 'ok', quote: 'x', env: {} }),
    /^AuthError: cairn: authorize takes ok, instead or ask$/);
});

test('direction refuses a missing or blank quote', async () => {
  const cwd = await initialized();
  await assert.rejects(direction(cwd, { kind: 'ask', env: {} }), /needs --quote/);
  await assert.rejects(direction(cwd, { kind: 'ask', quote: '  ', env: {} }), /needs --quote/);
});
