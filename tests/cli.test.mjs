import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makeRepo } from './helpers/repo.mjs';
import { appendRecord } from '../lib/records.mjs';
import { writeWorkspaceSnapshot, writeInputSnapshot } from '../lib/snapshots.mjs';
import { main } from '../lib/cli.mjs';
import { missingRefsLine } from '../lib/travel.mjs';
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
// Fix round 1 item 3 (Minor, review-1.md finding 3): this used to compare against cli.mjs's own
// placeholder "<authority>" line, which disagreed with what `cairn wake` prints for the identical
// missing-refs, no-configured-remote condition and was not itself a runnable command.
// requireRefs now calls the same lib/travel.mjs missingRefsLine wake itself uses, so this
// computes its expectation the same way rather than hard-coding a second copy of the text.
test('show exits 3 and names the fetch when the durable refs are missing', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const expected = await missingRefsLine(repo.dir);
  const r = await run(['show', 'a'.repeat(40)], repo.dir);
  assert.equal(r.code, 3); assert.equal(r.out, `cairn: durable refs missing; run: ${expected}\n`);
});
test('show renders a record with its references resolved and kind-checked', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  const ws = await writeWorkspaceSnapshot(repo.dir);
  // Deviation from the plan text (plan 06 carried obligation): 'start' now closes with
  // intent/results, the same as 'promotion' and 'superseded' (lib/records.mjs).
  const start = await appendRecord(repo.dir, 'start', 'hooks', { slug: 'hooks', snapshot: ws, requirements: [], from_superseded: null, intent: null, results: [] });
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
// Fix round 2 finding 2: bare `cairn decisions` used to always refuse ("decisions needs --read
// <id>"); it now renders the file (section 4: "cairn decisions renders the file"), one canonical
// JSON line per ADR line, empty when there is no ADR file yet.
test('cairn decisions without --read renders the file, empty when there is none yet', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const r = await run(['decisions'], repo.dir);
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
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
import { declared as mechanismDeclared, project as mechanismProject, DEFINITION as MECHANISM_DEFINITION } from './helpers/mechanism-fixture.mjs';
import { readMechanisms } from '../lib/mechanisms.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Fix round 1 item 6 addendum: `cairn declare` and `cairn check` were never wired into main()'s
// argv dispatch by any plan (confirmed: neither appeared in `cairn --help`), though both were
// fully built and tested at the library level (lib/mechanisms.mjs's declare, lib/check.mjs's
// check). Covers a successful declare, a refused declare (a glob metacharacter in inputs, which
// normalizeDefinition already refuses), a check that records a receipt, and a check refusal.
//
// "a check that refuses a dirty declared input" does not correspond to any real refusal: check()
// itself has no dirty-input logic, and lib/scope.mjs's preflight (which every STATE_CHANGING
// command runs, including check) explicitly lets a declared, non-protected/reserved dirty path
// through with no breach (`cls !== 'protected' && cls !== 'reserved' && isDeclared(path,
// declared)` is a `continue`, not a stop) -- confirmed by reading both files; grepping lib/check.mjs
// and lib/scope.mjs for "dirty" finds nothing. The lease-coverage concept that phrase may be
// pointing at (lib/lease.mjs's covers/lib/scope.mjs's leaseCovers) is consulted only by wake's own
// 'record'/'commit' predicates, never by check() or this command. Substituted with check's actual,
// tested refusal path (a requirement that is not Agreed) rather than fabricating behavior that
// does not exist.
test('cairn declare writes a mechanism definition from a --file; a glob in inputs is refused', async (t) => {
  const repo = await mechanismProject();
  t.after(repo.cleanup);
  const file = join(repo.cwd, 'greeter.json');
  await writeFile(file, JSON.stringify(MECHANISM_DEFINITION));
  const r = await run(['declare', 'greeter', '--file', file], repo.cwd);
  assert.equal(r.code, 0);
  assert.match(r.out, /^declare greeter sha256:[0-9a-f]{64}\n$/);
  const mechs = await readMechanisms(repo.cwd);
  assert.deepEqual(mechs.greeter.definition.requirements, ['DEMO-001', 'DEMO-002']);

  const badFile = join(repo.cwd, 'bad.json');
  await writeFile(badFile, JSON.stringify({ ...MECHANISM_DEFINITION, inputs: ['src/*.mjs'] }));
  const bad = await run(['declare', 'other', '--file', badFile], repo.cwd);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^cairn: glob metacharacter in path "src\/\*\.mjs"/);
});
test('cairn check writes a receipt; a non-Agreed requirement is refused', async (t) => {
  const repo = await mechanismDeclared();
  t.after(repo.cleanup);
  const r = await run(['check', 'DEMO-001'], repo.cwd);
  assert.equal(r.code, 0);
  assert.match(r.out, /^check [0-9a-f]{40} DEMO-001\n$/);
  const sha = r.out.split(' ')[1];
  const rec = (await readLog(repo.cwd)).find((x) => x.sha === sha);
  assert.equal(rec.kind, 'receipt');
  assert.deepEqual(rec.payload.results.map((x) => x.requirement), ['DEMO-001']);

  const bad = await run(['check', 'DEMO-002'], repo.cwd);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^cairn: DEMO-002 is not Agreed; only Agreed requirements are checked\n$/);
});

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

// Review-1 fix, item 4: `cairn end --abandon` must release the lease (so wake's reconcile
// predicate is satisfied, lib/lease.test.mjs covers that) but must not also claim the touched path
// as a real mechanism-definition change the way a plain `cairn end` does above -- that claim is
// exactly the "effect" abandoning is supposed to withhold.
test('cairn end --abandon releases the lease and claims no mechanism-definition effect (review-1 item 4)', async (t) => {
  const repo = await mechanismDeclared();
  t.after(repo.cleanup);
  const beginResult = await run(['begin', 'implement', 'DEMO-001', '--touch', 'helper.mjs'], repo.cwd);
  assert.equal(beginResult.code, 0);
  await repo.write('helper.mjs', 'export const x = 1;\n');
  const before = (await readMechanisms(repo.cwd)).greeter.definition.inputs;
  const endResult = await run(['end', '--abandon'], repo.cwd);
  assert.equal(endResult.code, 0);
  assert.equal(endResult.out, 'cairn: lease abandoned\ncairn: touch helper.mjs not written: action abandoned\n');
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.inputs, before, 'abandon claims no effect on the mechanism definition');
});

// Review-2 fix (Minor, new finding on the round-1 re-review): reproduced end to end through
// main(), the same path bin/cairn.mjs uses. Actor A's lease is released, actor B begins a
// different one, and A's stale `cairn end --lease <its own sha>` is refused and names B's lease --
// B's lease is left exactly as it was (still ending normally afterward with a bare `cairn end`).
test('cairn end --lease <sha> refuses a stale caller and leaves the newer actors lease untouched (review-2 new finding)', async (t) => {
  const repo = await mechanismDeclared();
  t.after(repo.cleanup);
  const beginA = await run(['begin', 'implement', 'DEMO-001'], repo.cwd);
  assert.equal(beginA.code, 0);
  const shaA = beginA.out.trim().split(' ').at(-1);
  assert.match(shaA, /^[0-9a-f]{40}$/);
  assert.equal((await run(['end'], repo.cwd)).code, 0); // A's own lease is released

  assert.equal((await run(['begin', 'run', 'DEMO-002'], repo.cwd)).code, 0); // B begins
  const staleEnd = await run(['end', '--lease', shaA], repo.cwd);
  assert.equal(staleEnd.code, 1);
  assert.match(staleEnd.err, /^cairn: action lease [0-9a-f]{40} is now run DEMO-002 \(session none\), not the lease [0-9a-f]{40} this end expected; run cairn reconcile\n$/);

  // B's lease is untouched: a bare `cairn end` (no --lease) still finds and ends it normally.
  const normalEnd = await run(['end'], repo.cwd);
  assert.equal(normalEnd.code, 0);
  assert.equal(normalEnd.out, 'cairn: lease ended\n');
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

// Fix round 2 finding 2 (Important): lib/cli.mjs never imported lib/commitment.mjs, so start,
// done, supersede, promote, item, outside, fix and lib/adr.mjs's decide/realize were unreachable
// from the binary -- every one of them existed only as a library function no command ever called.
// Wired here: `cairn start <slug>`, `cairn done <slug>`, `cairn supersede <successor> --quote
// <text>`, `cairn promote <item-sha>`, `cairn item --backlog|--next-feature|--defect --slug <s>
// --from <REQ or contract> --body <text>`, `cairn outside <item-sha> --reason <text>`, `cairn fix
// <item-sha>`, `cairn decide --consequential --title ... --rests-on ... --wrong-if ... --body
// ...`, `cairn realize <decision-id> --subject <text>`, and bare `cairn decisions` (tested above).
import { project } from './helpers/commitment-fixture.mjs';
import { readLog } from '../lib/records.mjs';
import { readAdr } from '../lib/adr.mjs';

test('cairn start prints one line and writes a start record reachable only through main()', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  const r = await run(['start', 'first'], repo.cwd);
  assert.equal(r.code, 0);
  const rec = (await readLog(repo.cwd)).filter((x) => x.kind === 'start').at(-1);
  assert.equal(r.out, `start ${rec.sha} first\n`);
  const bad = await run(['start', 'nowhere'], repo.cwd);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^cairn: commitment first is open/);
});

test('cairn done prints one line and closes the open commitment', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  await run(['start', 'first'], repo.cwd);
  const r = await run(['done', 'first'], repo.cwd);
  assert.equal(r.code, 0);
  const rec = (await readLog(repo.cwd)).filter((x) => x.kind === 'done').at(-1);
  assert.equal(r.out, `done ${rec.sha} first\n`);
  const missingSlug = await run(['done'], repo.cwd);
  assert.equal(missingSlug.code, 1);
  assert.equal(missingSlug.err, 'cairn: done needs a slug\n');
});

test('cairn item prints one line and records a backlog item; refuses with no kind flag', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  const r = await run(['item', '--backlog', '--slug', 'greet-twice', '--from', 'DEMO-001', '--body', 'Greet twice.'], repo.cwd);
  assert.equal(r.code, 0);
  const rec = (await readLog(repo.cwd)).filter((x) => x.kind === 'item').at(-1);
  assert.equal(r.out, `item ${rec.sha} greet-twice\n`);
  assert.deepEqual(rec.payload, { kind: 'backlog', slug: 'greet-twice', source: 'DEMO-001', body: 'Greet twice.' });
  const noKind = await run(['item', '--slug', 'x', '--from', 'DEMO-001', '--body', 'x'], repo.cwd);
  assert.equal(noKind.code, 1);
  assert.equal(noKind.err, 'cairn: item needs one of --backlog, --next-feature or --defect\n');
});

test('cairn promote prints one line and opens the successor commitment, after done', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  await run(['start', 'first'], repo.cwd);
  await run(['item', '--backlog', '--slug', 'second', '--from', 'DEMO-002', '--body', 'Greet by name.'], repo.cwd);
  await run(['done', 'first'], repo.cwd);
  const b = (await readLog(repo.cwd)).filter((x) => x.kind === 'item').at(-1).sha;
  const r = await run(['promote', b], repo.cwd);
  assert.equal(r.code, 0);
  const rec = (await readLog(repo.cwd)).filter((x) => x.kind === 'start').at(-1);
  assert.equal(r.out, `promote ${rec.sha} ${b}\n`);
  assert.equal(rec.payload.slug, 'second');
});

test('cairn outside and cairn fix each print one line', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  const backlog = await run(['item', '--backlog', '--slug', 'greet-twice', '--from', 'DEMO-001', '--body', 'x'], repo.cwd);
  const b = /^item (\S+)/.exec(backlog.out)[1];
  const outsideResult = await run(['outside', b, '--reason', 'Not part of this commitment.'], repo.cwd);
  assert.equal(outsideResult.code, 0);
  const outsideRec = (await readLog(repo.cwd)).filter((x) => x.kind === 'outside').at(-1);
  assert.equal(outsideResult.out, `outside ${outsideRec.sha} ${b}\n`);

  await run(['start', 'first'], repo.cwd);
  const defect = await run(['item', '--defect', '--slug', 'typo', '--from', 'DEMO-001', '--body', 'x'], repo.cwd);
  const d = /^item (\S+)/.exec(defect.out)[1];
  const fixResult = await run(['fix', d], repo.cwd);
  assert.equal(fixResult.code, 0);
  const fixRec = (await readLog(repo.cwd)).filter((x) => x.kind === 'fix').at(-1);
  assert.equal(fixResult.out, `fix ${fixRec.sha} ${d}\n`);
});

test('cairn decide and cairn realize each print one line', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  await run(['start', 'first'], repo.cwd);
  const decideResult = await run(['decide', '--consequential', '--title', 'Use a map', '--rests-on', 'DEMO-001', '--wrong-if', 'it is slower', '--body', 'A map replaces the list.'], repo.cwd);
  assert.equal(decideResult.code, 0);
  const id = decideResult.out.trim().split(' ')[1];
  const line = (await readAdr(repo.cwd)).find((l) => l.id === id);
  assert.deepEqual([line.kind, line.title, line.rests_on], ['decision', 'Use a map', ['DEMO-001']]);
  const realizeResult = await run(['realize', id, '--subject', 'no code change'], repo.cwd);
  assert.equal(realizeResult.code, 0);
  const rid = realizeResult.out.trim().split(' ')[1];
  assert.equal(realizeResult.out, `realize ${rid} ${id}\n`);
  const missing = await run(['decide', '--consequential', '--title', 't'], repo.cwd);
  assert.equal(missing.code, 1);
  // Plan 16, Task 4: decideCommand's refusal now also names the work-loop draft shape's flags,
  // since --commitment is the other route a missing --title can mean.
  assert.equal(missing.err, 'cairn: decide needs --title, --rests-on, --wrong-if and --body (or the work-loop draft shape: --commitment, --concern, --question, --recommendation, --because, --if-wrong, --instead)\n');
});

test('cairn supersede prints one line and closes the open commitment without moving Current:', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  await run(['start', 'first'], repo.cwd);
  const r = await run(['supersede', 'second', '--quote', 'Switch to the name argument.'], repo.cwd, { confirm: yes });
  assert.equal(r.code, 0);
  const rec = (await readLog(repo.cwd)).filter((x) => x.kind === 'superseded').at(-1);
  assert.equal(r.out, `supersede ${rec.sha} second\n`);
});

test('--help lists the newly wired commands', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const help = await run(['--help'], repo.dir);
  for (const line of ['cairn start <slug>', 'cairn done <slug>', 'cairn promote <item-sha>', 'cairn item --backlog']) {
    assert.match(help.out, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

// Fix round 1 finding 1 (Critical, plan 09 review): answerCommand passed only
// { confirm: ctx.confirm ?? ttyConfirm } to cliAnswer, never building cliSigner(argv, io) or
// reading cliNonce(argv), so in a signed-key project `cairn answer` always refused with
// "signing_key is set; pass --signature or CAIRN_SIGNATURE" and no escalation could ever be
// answered. signedCommitmentRepo builds on signedProject's real-key init, adding the domain
// spec/roadmap/authorize/start steps a signed cairn answer test needs (signedProject alone has
// no open commitment to escalate against).
import { OVERVIEW, DEMO, CORE, ROADMAP } from './helpers/commitment-fixture.mjs';
import { authorize } from '../lib/auth.mjs';
import { start } from '../lib/commitment.mjs';
import { escalate } from '../lib/escalate.mjs';

async function signedCommitmentRepo(t) {
  const { generateKeyPairSync, sign: cryptoSign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const sign = async (bytes) => new Uint8Array(cryptoSign(null, bytes, privateKey));
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('AGENTS.md', '# Working agreement\n\nRun cairn wake.\n');
  await repo.write('docs/spec/overview.md', OVERVIEW);
  await repo.write('docs/spec/glossary.md', '# Glossary\n\ngreeter: the program.\n');
  await repo.write('docs/spec/demo.md', DEMO);
  await repo.write('docs/spec/core.md', CORE);
  await repo.write('docs/spec/roadmap.md', ROADMAP);
  await repo.write('src/main.mjs', 'console.log("hello");\n');
  await repo.commit('Add the demo specification');
  await init(repo.dir, { confirmRemote: async () => null, chooseKey: async () => pem, confirm: yes, confirmDigest: yes, sign });
  await authorize(repo.dir, { sign, confirm: yes });
  await start(repo.dir, 'first');
  return { cwd: repo.dir, repo, privateKey };
}

const escalationDraft = (over = {}) => ({
  commitment: 'first', concerns: ['DEMO-001'], question: 'Keep the current mechanism?',
  recommendation: 'Yes.', because: 'It passes.', if_wrong: 'A rewrite is needed.', instead: 'Switch mechanisms.',
  options: [], named_paths: [], cited_decisions: [], ...over,
});

test('cairn answer: the full two-step signed flow succeeds; a signature over a different nonce is refused', async (t) => {
  const { cwd, privateKey } = await signedCommitmentRepo(t);
  const { sign: cryptoSign } = await import('node:crypto');
  await escalate(cwd, escalationDraft());
  const run1 = await run(['answer', 'first', 'ok'], cwd);
  assert.equal(run1.code, 1);
  const payload = extractPayload(run1.out);
  const nonce = JSON.parse(payload).nonce;
  const signature = b64url(cryptoSign(null, Buffer.from(payload), privateKey));
  const run2 = await run(['answer', 'first', 'ok', '--nonce', nonce, '--signature', signature], cwd);
  assert.equal(run2.code, 0);
  assert.match(run2.out, /^cairn: answer first [0-9a-f]{40}\n$/);
  const rec = (await readLog(cwd)).filter((x) => x.kind === 'answer').at(-1);
  assert.equal(rec.payload.evidence.mode, 'signed');

  await escalate(cwd, escalationDraft({ question: 'Second question?' }));
  const bad1 = await run(['answer', 'first', 'ok'], cwd);
  const badPayload = extractPayload(bad1.out);
  const badSignature = b64url(cryptoSign(null, Buffer.from(badPayload), privateKey));
  const bad2 = await run(['answer', 'first', 'ok', '--nonce', 'a-different-nonce', '--signature', badSignature], cwd);
  assert.equal(bad2.code, 1);
  assert.match(bad2.err, /does not verify against signing_key/);
});

// Fix round 1 item 5 (Minor, review-1.md finding 5): `cairn push` (lib/cli.mjs, plan 12 commit
// 594168bc) had no CLI-dispatch test, only library-level coverage of push() itself in
// tests/travel.test.mjs. Manually confirmed correct end to end in the implementer's own report;
// this exercises the same success and refusal paths through main()'s real argv dispatch.
import { makeProject } from './helpers/repo.mjs';

test('cairn push exits 0 with one line; a refusal exits 1 with a cairn: line', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  const r = await run(['push'], repo.cwd);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'cairn: pushed refs/cairn/snapshots, refs/cairn/log, refs/heads/main to origin (atomic)\n');

  const local = await makeProject({ settings: { authority_remote: null } });
  const bad = await run(['push'], local.cwd);
  assert.equal(bad.code, 1);
  assert.equal(bad.err, 'cairn: no authority remote; the durable refs stay local\n');
});

// Kernel fix round (plan 14 fixture, defect 1, ruling A): section 4's after-fetch
// cross-reference validation is no longer run on wake's ordinary path (see lib/wake.mjs's wake()
// and its own comment); this is the other of its two real call sites -- cairn show
// (requireRefs), which is exactly the command an operator reaches for to inspect a record's own
// cross-references. A dangling reference is now named with a clean repair line instead of a raw
// failure from resolving the missing object.
test('cairn show refuses naming the repair when a cross-reference is dangling', async (t) => {
  const repo = await project();
  t.after(repo.cleanup);
  await appendRecord(repo.dir, 'escalation', 'first', {
    slug: 'first', question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i', concerns: 'c', evaluation: '0'.repeat(40),
  });
  const r = await run(['show', 'a'.repeat(40)], repo.cwd);
  assert.equal(r.code, 3);
  assert.match(r.out, /^cairn: a cross-reference is unresolved; run: cairn push/);
});

// --- Plan 16, Task 4: cairn escalate --consequential and cairn decide --consequential ---------
// (CLI dispatch). Both flows need a current measurement (escalate: any outcome; decide: composite
// only), so these fixtures mirror tests/escalate.test.mjs's own repoWithCommitment/mdraft (here
// named draft(), since this file has no earlier top-level `draft` to collide with)/transport/
// scoreBody helpers (each test file keeps its own local copy, the established convention here --
// tests/evaluate.test.mjs's repoWithCommitment is local and unexported too).
import { measure } from '../lib/evaluate.mjs';

const AUTH_DOMAIN = `Prefix: AUTH

[AUTH-003] Tokens rotate on a fixed schedule.
Falsifier: tokens are not rotated on schedule.
Mechanism: rotate
Status: Agreed 2026-09-19
`;
const OVERVIEW_WITH_AUTH = `# Keystone

## Spec map

| File | Prefix |
|---|---|
| auth.md | AUTH |
`;
const dims = () => ({ evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 });

async function repoWithCommitment() {
  const p = await makeProject({
    settings: { data: ['migrations/**'], typesafeai: { enabled: true, model: 'jev-1.13.0', weights: dims(),
      agent_ceiling: 0.35, confidence_floors: dims(), min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } },
    files: {
      'docs/spec/overview.md': OVERVIEW_WITH_AUTH,
      'docs/spec/auth.md': AUTH_DOMAIN,
      'docs/spec/roadmap.md': 'Current: auth-tokens\n\n## auth-tokens\n\nRequirements: AUTH-003\n',
    },
  });
  await p.authorize();
  await start(p.cwd, 'auth-tokens');
  return p.cwd;
}

const draft = (over = {}) => ({ commitment: 'auth-tokens', concerns: ['AUTH-003'], question: 'Rotate tokens hourly?',
  recommendation: 'hourly', because: 'observed: node scripts/rotate.mjs prints ok', if_wrong: 'sessions drop',
  instead: 'daily', options: ['hourly', 'daily'], named_paths: ['src/auth/rotate.mjs'], cited_decisions: [], ...over });

const transport = (bodies) => async () => { const b = bodies.shift(); if (b instanceof Error) throw b; return { status: 200, body: b, model: 'jev-1.13.0' }; };

const scoreBody = (over = {}) => JSON.stringify({
  model: 'jev-1.13.0',
  answers: {
    evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.5, 4: 0.4 } },
    reach: { score: 0.6, confidence: 0.5, legend: {}, probabilities: { 0: 0.7, 1: 0, 2: 0.1, 3: 0.2, 4: 0 } },
    contract: { score: 0.1, confidence: 0.9, legend: {}, probabilities: { 0: 0.9, 1: 0.1, 2: 0, 3: 0, 4: 0 } },
    surface: { score: 0, confidence: 0.8, legend: {}, probabilities: { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0 } },
    ambiguity: { score: 1.0, confidence: 0.5, legend: {}, probabilities: { 0: 0.3, 1: 0.4, 2: 0.2, 3: 0.1, 4: 0 } },
    ...over,
  },
  usage: { input_tokens: 10, output_tokens: 2 },
});

// The file's own run(argv, cwd, extra) helper (above) takes argv, not a draft object; parseEscalateArgs
// (lib/escalate.mjs) goes the other way (argv -> draft). No existing helper turns a draft back into
// argv, so this is added here.
function draftArgs(d) {
  const argv = ['--commitment', d.commitment];
  for (const c of d.concerns) argv.push('--concern', c);
  argv.push('--question', d.question, '--recommendation', d.recommendation, '--because', d.because, '--if-wrong', d.if_wrong, '--instead', d.instead);
  for (const o of d.options) argv.push('--option', o);
  for (const p of d.named_paths) argv.push('--path', p);
  for (const c of d.cited_decisions) argv.push('--decision', c);
  return argv;
}

describe('escalate --consequential and decide --consequential (CLI dispatch)', () => {
  // Fix round 1, Minor #2: reads the written record back through the real readers (readLog for
  // the escalation, readAdr for the decision line) rather than stopping at exit code + a loose
  // stdout regex -- confirms the CLI wiring itself (not only the library functions, already
  // proven in tests/escalate.test.mjs) names the measurement's own sha on the record.
  test('escalate --consequential routes through escalateConsequential, naming the measurement on the record', async () => {
    const cwd = await repoWithCommitment();
    const m = await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    const r = await run(['escalate', '--consequential', ...draftArgs(draft())], cwd);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /cairn: escalate/);
    const sha = r.out.trim().split(' ').at(-1);
    const esc = (await readLog(cwd)).find((x) => x.sha === sha);
    assert.equal(esc.kind, 'escalation');
    assert.equal(esc.payload.evaluation, m.measurementSha);
  });
  test('plain escalate (no --consequential) needs no measurement', async () => {
    const cwd = await repoWithCommitment();
    const r = await run(['escalate', ...draftArgs(draft())], cwd);
    assert.equal(r.code, 0, r.err);
  });
  test('decide --consequential --commitment ... routes through decideConsequential, naming the measurement on the ADR line', async () => {
    const cwd = await repoWithCommitment();
    const m = await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    const r = await run(['decide', '--consequential', ...draftArgs(draft())], cwd);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /cairn: decide/);
    const id = r.out.trim().split(' ').at(-1);
    const line = (await readAdr(cwd)).find((l) => l.id === id);
    assert.equal(line.kind, 'decision');
    assert.equal(line.evaluation, m.measurementSha);
  });
  test('decide --consequential --title ... (the spec-phase deference shape) is unaffected', async () => {
    const cwd = await repoWithCommitment();
    const r = await run(['decide', '--consequential', '--title', 't', '--rests-on', 'AUTH-003', '--wrong-if', 'w', '--body', 'b'], cwd);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /^decide /);
  });
  test('decide --consequential with neither --title nor --commitment refuses', async () => {
    const cwd = await repoWithCommitment();
    const r = await run(['decide', '--consequential'], cwd);
    assert.equal(r.code, 1);
  });
  // Self-review completeness (not in the brief's own Step 1 snippet): `escalateConsequential` and
  // `decideConsequential` were previously reachable only by calling them directly (as
  // tests/escalate.test.mjs does), never through main()'s real argv/exit-code path. Both are wired
  // into the CLI for the first time by this task, so their MeasurementError refusal -- "Refusals
  // print the MeasurementError text and exit non-zero through the CLI's existing error path" (task
  // brief, Global Constraints) -- is exercised here through main() itself, not only at the library
  // level.
  test('escalate --consequential and decide --consequential --commitment refuse with the MeasurementError text and exit 1 when there is no current measurement', async () => {
    const cwd = await repoWithCommitment();
    const escRefused = await run(['escalate', '--consequential', ...draftArgs(draft())], cwd);
    assert.equal(escRefused.code, 1);
    assert.equal(escRefused.err, 'cairn: no measurement for this exact draft; run cairn measure first\n');
    const decRefused = await run(['decide', '--consequential', ...draftArgs(draft())], cwd);
    assert.equal(decRefused.code, 1);
    assert.equal(decRefused.err, 'cairn: no measurement for this exact draft; run cairn measure first\n');
  });
  // Fix round 1, Minor #3: a main()-level check that `decide --consequential --commitment` on a
  // floor (or veto) measurement is refused with decideConsequential's own "routes to the
  // developer" message and exits non-zero -- previously exercised only at the library level
  // (tests/escalate.test.mjs's 'decideConsequential requires a measurement' describe block,
  // unmodified by this fix). `named_paths: ['migrations/1.sql']` triggers the floor (repoWithCommitment's
  // fixture declares `data: ['migrations/**']`), the same fixture escalateConsequential's own
  // "regardless of outcome" test uses; a veto is covered at the library level already and is not
  // re-derived here since the floor is enough to prove the CLI path reaches the same refusal.
  test('decide --consequential --commitment on a floor measurement refuses with the developer message through main()', async () => {
    const cwd = await repoWithCommitment();
    const floorDraft = draft({ named_paths: ['migrations/1.sql'] });
    const m = await measure(cwd, floorDraft);
    assert.equal(m.outcome, 'floor');
    const r = await run(['decide', '--consequential', ...draftArgs(floorDraft)], cwd);
    assert.equal(r.code, 1);
    assert.equal(r.err, `cairn: measurement ${m.measurementSha} routes to the developer (floor); cairn escalate --consequential instead of deciding\n`);
  });
});
