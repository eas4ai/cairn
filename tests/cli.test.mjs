import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makeRepo } from './helpers/repo.mjs';
import { appendRecord } from '../lib/records.mjs';
import { writeWorkspaceSnapshot, writeInputSnapshot } from '../lib/snapshots.mjs';
import { main, FETCH_LINE } from '../lib/cli.mjs';
import { init } from '../lib/init.mjs';
import { b64url, canonicalize } from '../lib/canon.mjs';

// Fix round 1, item 5: extra takes the test-only confirm/confirmRemote/chooseKey/confirmDigest
// overrides main() now passes through to init/authorize/decisions --read, so their success and
// refusal paths can be driven through main() itself without a controlling terminal.
const run = async (argv, cwd, extra = {}) => { let out = '', err = ''; const code = await main(argv, { cwd, stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } }, ...extra }); return { code, out, err }; };
const yes = async () => true;

function extractPayload(out) {
  const m = /^cairn: sign this payload: (.+)$/m.exec(out);
  if (!m) throw new Error(`no payload line in: ${JSON.stringify(out)}`);
  return m[1];
}

async function signedProject(t) {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('AGENTS.md', '# agreement\n');
  await repo.write('docs/spec/overview.md', '# keystone\n');
  await repo.commit('fixture');
  const { generateKeyPairSync, sign: cryptoSign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const sign = async (bytes) => new Uint8Array(cryptoSign(null, bytes, privateKey));
  await init(repo.dir, { confirmRemote: async () => null, chooseKey: async () => pem, confirm: yes, confirmDigest: yes, sign });
  return { cwd: repo.dir, repo, privateKey, pem };
}

test('--help exits 0 and lists commands; an unknown command exits 1 with one cairn: line', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const help = await run(['--help'], repo.dir);
  assert.equal(help.code, 0); assert.match(help.out, /cairn show <sha>/);
  const bad = await run(['bogus'], repo.dir);
  assert.equal(bad.code, 1); assert.match(bad.err, /^cairn: unknown command bogus/); assert.equal(bad.err.split('\n').length, 2);
});
test('show exits 3 and names the fetch when the durable refs are missing', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const r = await run(['show', 'a'.repeat(40)], repo.dir);
  assert.equal(r.code, 3); assert.equal(r.out, `cairn: durable refs missing; run: ${FETCH_LINE}\n`);
});
test('show renders a record with its references resolved and kind-checked', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  const ws = await writeWorkspaceSnapshot(repo.dir);
  const start = await appendRecord(repo.dir, 'start', 'hooks', { slug: 'hooks', snapshot: ws, requirements: [], from_superseded: null });
  const done = await appendRecord(repo.dir, 'done', 'hooks', { slug: 'hooks', snapshot: ws });
  const r = await run(['show', done], repo.dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /^cairn: done hooks\n/); assert.match(r.out, /"slug": "hooks"/); assert.match(r.out, new RegExp(`done.snapshot: workspace snapshot ${ws}, tree [0-9a-f]{40}`));
  const inp = await writeInputSnapshot(repo.dir, { mechanism: 'm', inputs: ['a.txt'] });
  const wrong = await appendRecord(repo.dir, 'fix', 'x', { item: start, snapshot: inp });
  const w = await run(['show', wrong], repo.dir);
  assert.equal(w.code, 1); assert.match(w.err, /^cairn: expected a workspace snapshot/);
  const plain = await run(['show', await repo.readRef('HEAD')], repo.dir);
  assert.equal(plain.code, 1); assert.match(plain.err, /^cairn: not a record subject/);
});
test('bin/cairn.mjs runs', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['bin/cairn.mjs', '--help']);
  assert.match(stdout, /usage: cairn/);
});
test('cairn lint docs/spec prints findings and exits 1, exits 0 when clean, refuses other paths', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('docs/spec/overview.md', '| File | Prefix |\n|---|---|\n| a.md | A |\n');
  await repo.write('docs/spec/roadmap.md', 'Current: x\n\n## x\n\nRequirements: A-001\n');
  await repo.write('docs/spec/a.md', 'Prefix: A\n\n[A-001] x\nFalsifier: f\nMechanism: m\nStatus: Agreed 2026-09-19\n');
  const clean = await run(['lint', 'docs/spec'], repo.dir);
  assert.deepEqual([clean.code, clean.out, clean.err], [0, '', '']);
  await repo.write('docs/spec/a.md', 'Prefix: A\n\n[A-001] x\nStatus: Draft\n');
  const dirty = await run(['lint', 'docs/spec'], repo.dir);
  assert.equal(dirty.code, 1);
  assert.match(dirty.out, /^docs\/spec\/a.md:3: A-001: missing Falsifier:/m);
  assert.match(dirty.err, /^cairn: lint found \d+ problems\n$/);
  const other = await run(['lint', 'docs'], repo.dir);
  assert.equal(other.code, 1); assert.match(other.err, /^cairn: lint takes docs\/spec/);
});

// Fix round 1, item 5: the typed CLI surface (runInit, runAuthorize, runDecisionsRead, cliSigner's
// supplied-signature branch, and main()'s dispatch) was untested. These drive cairn init, cairn
// authorize and cairn decisions --read through main() with injected io and injected confirm,
// covering the success and refusal path for each in unsigned-local mode.
test('cairn init: success prints the evidence description; refusal is one cairn: line', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const ok = await run(['init'], repo.dir, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes });
  assert.equal(ok.code, 0);
  assert.match(ok.out, /^cairn: initialized; init record [0-9a-f]{40} \(unsigned-local: terminal confirmation by Cairn Test <test@example\.invalid>; evidence, not authentication\)\n$/);

  const repo2 = await makeRepo(); t.after(repo2.remove);
  const refused = await run(['init'], repo2.dir, { confirmRemote: async () => 'upstream', chooseKey: async () => null, confirm: yes });
  assert.equal(refused.code, 1);
  assert.equal(refused.err, 'cairn: authority_remote upstream is not a configured remote\n');
});

test('cairn authorize: success prints the evidence description; refusal is one cairn: line', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('AGENTS.md', '# agreement\n');
  await repo.write('docs/spec/overview.md', '# keystone\n');
  await repo.commit('fixture');
  await init(repo.dir, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  const ok = await run(['authorize'], repo.dir, { confirm: yes });
  assert.equal(ok.code, 0);
  assert.match(ok.out, /^cairn: authorization [0-9a-f]{40} \(unsigned-local: terminal confirmation by Cairn Test <test@example\.invalid>; evidence, not authentication\)\n$/);

  const repo2 = await makeRepo(); t.after(repo2.remove);
  await repo2.write('docs/spec/overview.md', '# keystone\n');
  await repo2.commit('fixture');
  await init(repo2.dir, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  const refused = await run(['authorize'], repo2.dir, { confirm: yes });
  assert.equal(refused.code, 1);
  assert.equal(refused.err, 'cairn: AGENTS.md is missing; authorize binds the working agreement\n');
});

test('cairn decisions --read: success prints the evidence description; refusal is one cairn: line', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await init(repo.dir, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  const ok = await run(['decisions', '--read', '01J0000000000000000000ABCD'], repo.dir, { confirm: yes });
  assert.equal(ok.code, 0);
  assert.match(ok.out, /^cairn: read 01J0000000000000000000ABCD recorded as [0-9a-f]{40} \(unsigned-local: terminal confirmation by Cairn Test <test@example\.invalid>; evidence, not authentication\)\n$/);

  const refused = await run(['decisions', '--read', 'not-a-ulid'], repo.dir, { confirm: yes });
  assert.equal(refused.code, 1);
  assert.equal(refused.err, 'cairn: decision id must be a 26-character ULID\n');
});

// Fix round 1, item 10: decisionsCommand's own Refusal used to start with the word "cairn" itself,
// and main()'s catch block always prepends its own "cairn: ", printing a doubled-up line.
test('cairn decisions without --read is one cairn: line, no doubled prefix', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const r = await run(['decisions'], repo.dir);
  assert.equal(r.code, 1);
  assert.equal(r.err, 'cairn: decisions needs --read <id>\n');
});

// Fix round 1, item 1 (Critical): reproduced as described: a fresh nonce was minted on every
// invocation (runDecisionsRead) or not threaded at all (runAuthorize, runInit), so a run 2 with
// --signature always verified against a payload carrying a different nonce than the one actually
// signed, and could never succeed. These drive the full two-invocation signed flow for each of the
// three commands with a real Ed25519 key pair and assert it now succeeds, and that a signature
// produced over one nonce's payload is refused when presented against a different --nonce.
test('cairn init: the full two-step signed flow succeeds; a signature over a different nonce is refused', async (t) => {
  const { generateKeyPairSync, sign: cryptoSign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const io = { confirmRemote: async () => null, chooseKey: async () => pem, confirmDigest: yes };

  const repo = await makeRepo(); t.after(repo.remove);
  const run1 = await run(['init'], repo.dir, io);
  assert.equal(run1.code, 1);
  const payload = extractPayload(run1.out);
  const nonce = JSON.parse(payload).nonce;
  const signature = b64url(cryptoSign(null, Buffer.from(payload), privateKey));
  const run2 = await run(['init', '--nonce', nonce, '--signature', signature], repo.dir, io);
  assert.equal(run2.code, 0);
  assert.match(run2.out, /^cairn: initialized; init record [0-9a-f]{40} \(signed by the developer key\)\n$/);

  const repo2 = await makeRepo(); t.after(repo2.remove);
  const bad1 = await run(['init'], repo2.dir, io);
  const badPayload = extractPayload(bad1.out);
  const badSignature = b64url(cryptoSign(null, Buffer.from(badPayload), privateKey));
  const bad2 = await run(['init', '--nonce', 'a-different-nonce', '--signature', badSignature], repo2.dir, io);
  assert.equal(bad2.code, 1);
  assert.match(bad2.err, /does not verify against signing_key/);
  assert.equal(await repo2.readRef('refs/cairn/log'), null);
});

test('cairn authorize: the full two-step signed flow succeeds; a signature over a different nonce is refused', async (t) => {
  const { cwd, repo, privateKey } = await signedProject(t);
  const { sign: cryptoSign } = await import('node:crypto');
  const run1 = await run(['authorize'], cwd);
  assert.equal(run1.code, 1);
  const payload = extractPayload(run1.out);
  const nonce = JSON.parse(payload).nonce;
  const signature = b64url(cryptoSign(null, Buffer.from(payload), privateKey));
  const run2 = await run(['authorize', '--nonce', nonce, '--signature', signature], cwd);
  assert.equal(run2.code, 0);
  assert.match(run2.out, /^cairn: authorization [0-9a-f]{40} \(signed by the developer key\)\n$/);

  await repo.write('AGENTS.md', '# changed\n'); await repo.commit('change');
  const bad1 = await run(['authorize'], cwd);
  const badPayload = extractPayload(bad1.out);
  const badSignature = b64url(cryptoSign(null, Buffer.from(badPayload), privateKey));
  const bad2 = await run(['authorize', '--nonce', 'a-different-nonce', '--signature', badSignature], cwd);
  assert.equal(bad2.code, 1);
  assert.match(bad2.err, /does not verify against signing_key/);
});

test('cairn decisions --read: the full two-step signed flow succeeds; a signature over a different nonce is refused', async (t) => {
  const { cwd, privateKey } = await signedProject(t);
  const { sign: cryptoSign } = await import('node:crypto');
  const run1 = await run(['decisions', '--read', '01J0000000000000000000ABCD'], cwd);
  assert.equal(run1.code, 1);
  const payload = extractPayload(run1.out);
  const nonce = JSON.parse(payload).nonce;
  const signature = b64url(cryptoSign(null, Buffer.from(payload), privateKey));
  const run2 = await run(['decisions', '--read', '01J0000000000000000000ABCD', '--nonce', nonce, '--signature', signature], cwd);
  assert.equal(run2.code, 0);
  assert.match(run2.out, /^cairn: read 01J0000000000000000000ABCD recorded as [0-9a-f]{40} \(signed by the developer key\)\n$/);

  const bad1 = await run(['decisions', '--read', '01J0000000000000000000WXYZ'], cwd);
  const badPayload = extractPayload(bad1.out);
  const badSignature = b64url(cryptoSign(null, Buffer.from(badPayload), privateKey));
  const bad2 = await run(['decisions', '--read', '01J0000000000000000000WXYZ', '--nonce', 'a-different-nonce', '--signature', badSignature], cwd);
  assert.equal(bad2.code, 1);
  assert.match(bad2.err, /does not verify against signing_key/);
});

// Fix round 1 finding 2 (Critical): applyTouch's write-back used to be a module-level onEnd side
// effect lib/cli.mjs never triggered, because it never imported lib/mechanisms.mjs -- so `cairn
// end` never actually wrote a changed --touch path into the mechanism definition in the shipped
// binary. This drives `cairn begin --touch`, a real file change, and `cairn end` entirely through
// main(), the same path bin/cairn.mjs uses, and checks the definition on disk afterward.
import { declared as mechanismDeclared } from './helpers/mechanism-fixture.mjs';
import { readMechanisms } from '../lib/mechanisms.mjs';

test('cairn end writes a changed --touch path into the mechanism definition (finding 2)', async (t) => {
  const repo = await mechanismDeclared();
  t.after(repo.cleanup);
  const beginResult = await run(['begin', 'implement', 'DEMO-001', '--touch', 'helper.mjs'], repo.cwd);
  assert.equal(beginResult.code, 0);
  await repo.write('helper.mjs', 'export const x = 1;\n');
  const before = (await readMechanisms(repo.cwd)).greeter.definition.inputs;
  assert.equal(before.includes('helper.mjs'), false);
  const endResult = await run(['end'], repo.cwd);
  assert.equal(endResult.code, 0);
  assert.match(endResult.out, /^cairn: lease ended\n$/);
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.inputs, ['check.mjs', 'hello.txt', 'helper.mjs', 'notes.md']);
});

test('cairn end reports an unclaimable --touch path instead of throwing, and still ends the lease', async (t) => {
  const repo = await mechanismDeclared();
  t.after(repo.cleanup);
  await run(['begin', 'implement', 'DEMO-999', '--touch', 'helper.mjs'], repo.cwd);
  await repo.write('helper.mjs', 'export const x = 1;\n');
  const endResult = await run(['end'], repo.cwd);
  assert.equal(endResult.code, 0);
  assert.match(endResult.out, /cairn: lease ended/);
  assert.match(endResult.out, /cairn: touch helper\.mjs not written: no mechanism declares DEMO-999/);
});

// Fix round 2 finding 1a (Important): checkTouch used to apply a narrower rule set than
// normalizeDefinition's, so a --touch path that could never be declared (here, an outside path
// per the fixture's own settings.outside: ['README.md'], and a glob-shaped path) was accepted at
// begin, creating a lease with nothing that could ever be written into a definition. Reproduced
// exactly as the reviewer found it: `begin implement DEMO-001 --touch README.md` used to succeed.
test('cairn begin --touch refuses an outside path or a glob metacharacter before creating a lease (finding 1a)', async (t) => {
  const repo = await mechanismDeclared();
  t.after(repo.cleanup);
  const outsideResult = await run(['begin', 'implement', 'DEMO-001', '--touch', 'README.md'], repo.cwd);
  assert.equal(outsideResult.code, 1);
  assert.equal(outsideResult.err, 'cairn: --touch README.md is an outside path and cannot be a mechanism input\n');
  const globResult = await run(['begin', 'implement', 'DEMO-001', '--touch', 'src/*.mjs'], repo.cwd);
  assert.equal(globResult.code, 1);
  assert.equal(globResult.err, 'cairn: --touch src/*.mjs has a glob metacharacter and cannot be a mechanism input\n');
  // Neither refusal left a lease behind for `cairn end` to find.
  const endResult = await run(['end'], repo.cwd);
  assert.equal(endResult.code, 1);
  assert.equal(endResult.err, 'cairn: no action lease to end\n');
});

// Fix round 2 findings 1b and 2 (Important, Minor): applyTouch's own declare() call, or the
// readMechanisms it depends on, can still fail after the lease ref is gone -- here because the
// mechanism file is corrupted (readMechanisms' own shape refusal, finding 9) between begin and
// end. Before this fix that reached main()'s catch, split the already-written "lease ended" line
// from an exit-1 refusal. It is now reported as an unclaimed touch and the command exits 0. The
// exact printed line also demonstrates finding 2: a single "cairn:" prefix, not doubled by main().
test('cairn end reports an unclaimed touch, with no doubled cairn: prefix, for a mechanism file corrupted after begin (findings 1b, 2)', async (t) => {
  const repo = await mechanismDeclared();
  t.after(repo.cleanup);
  const beginResult = await run(['begin', 'implement', 'DEMO-001', '--touch', 'helper.mjs'], repo.cwd);
  assert.equal(beginResult.code, 0);
  await repo.write('helper.mjs', 'export const x = 1;\n');
  await repo.write('.cairn/mechanisms/greeter.json', canonicalize({ schema: 1, definition: {}, review: {} }));
  const endResult = await run(['end'], repo.cwd);
  assert.equal(endResult.code, 0, 'the lease removal and its report are never split by the write-back failure');
  assert.equal(endResult.out,
    'cairn: lease ended\ncairn: touch helper.mjs not written: .cairn/mechanisms/greeter.json is not a valid mechanism entry (kernel-managed path breach)\n');
});
