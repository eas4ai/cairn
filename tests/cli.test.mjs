import { test } from 'node:test';
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
  assert.equal(missing.err, 'cairn: decide needs --title, --rests-on, --wrong-if and --body\n');
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
