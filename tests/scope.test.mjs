import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopRepo } from './helpers/loop.mjs';
import { chmod } from 'node:fs/promises';

test('loopRepo opens a commitment with one declared requirement', async () => {
  const r = await loopRepo();
  const log = await r.log();
  const start = log.at(-1);
  assert.equal(start.kind, 'start');
  assert.deepEqual(start.payload.requirements.map((x) => x.requirement), ['DEMO-001']);
  assert.equal(start.payload.snapshot, r.startSnapshot);
});

import { readSnapshot } from '../lib/snapshots.mjs';
import { workspaceDelta } from '../lib/scope.mjs';

test('workspaceDelta lists added, modified and deleted paths against a snapshot tree', async () => {
  const r = await loopRepo();
  const { tree } = await readSnapshot(r.cwd, r.startSnapshot, 'workspace');
  assert.deepEqual(await workspaceDelta(r.cwd, tree), []);
  await r.write('src/new.mjs', 'export const n = 1;\n');
  await r.write('src/demo.mjs', 'console.log("hi");\n');
  await r.remove('README.md');
  const delta = await workspaceDelta(r.cwd, tree);
  assert.deepEqual(delta.map((d) => [d.path, d.change]), [['README.md', 'deleted'], ['src/demo.mjs', 'modified'], ['src/new.mjs', 'added']]);
  assert.deepEqual(delta.map((d) => d.mode), [null, '100644', '100644']);
  assert.match(delta[1].sha, /^[0-9a-f]{40}$/); assert.equal(delta[0].sha, null);
});

import { declaredPaths, isDeclared, leaseCovers, declarationSetDigest } from '../lib/scope.mjs';

const mechs = {
  demo: { definition: { inputs: ['src/demo.mjs', 'flags'], documents: [], requirements: ['DEMO-001'] }, definitionDigest: 'sha256:' + 'a'.repeat(64), review: {} },
  other: { definition: { inputs: ['lib'], documents: [], requirements: ['DEMO-002'] }, definitionDigest: 'sha256:' + 'b'.repeat(64), review: {} },
};

test('declared paths are mechanism inputs, documents and lease touches', () => {
  const d = declaredPaths(mechs, { action: 'implement', target: 'DEMO-001', touch: ['src/new.mjs'] });
  assert.ok(isDeclared('src/demo.mjs', d));
  assert.ok(isDeclared('flags/DEMO-001', d));
  assert.ok(isDeclared('src/new.mjs', d));
  assert.ok(!isDeclared('src/other.mjs', d));
  assert.ok(!isDeclared('flagsx', d));
});

test('a lease covers a path through its target requirement or its touch list', () => {
  const lease = { action: 'implement', target: 'DEMO-001', touch: ['src/new.mjs'] };
  assert.ok(leaseCovers(lease, mechs, 'src/demo.mjs'));
  assert.ok(leaseCovers(lease, mechs, 'src/new.mjs'));
  assert.ok(!leaseCovers(lease, mechs, 'lib/x.mjs'));
  assert.ok(!leaseCovers(null, mechs, 'src/demo.mjs'));
  assert.ok(leaseCovers({ action: 'build-decision', target: '01J', touch: ['lib/x.mjs'] }, mechs, 'lib/x.mjs'));
  assert.ok(!leaseCovers({ action: 'build-decision', target: '01J', touch: [] }, mechs, 'lib/x.mjs'));
});

test('the declaration-set digest changes when a definition digest changes', () => {
  const a = declarationSetDigest(mechs);
  const b = declarationSetDigest({ ...mechs, demo: { ...mechs.demo, definitionDigest: 'sha256:' + 'c'.repeat(64) } });
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from '../lib/gitx.mjs';
import { appendDecision } from '../lib/adr.mjs';
import { protectedDigests, kernelManagedValid } from '../lib/scope.mjs';

test('a file with a group or other execute bit but no owner bit is 100644, as git reads it', async () => {
  const r = await loopRepo();
  await chmod(join(r.cwd, 'src/demo.mjs'), 0o605);
  const tree = (await git(['rev-parse', 'HEAD^{tree}'], { cwd: r.cwd })).stdout.trim();
  assert.deepEqual(await workspaceDelta(r.cwd, tree), []);
  await chmod(join(r.cwd, 'src/demo.mjs'), 0o755);
  assert.deepEqual((await workspaceDelta(r.cwd, tree)).map((d) => [d.path, d.change, d.mode]), [['src/demo.mjs', 'modified', '100755']]);
});


// Deviation from the plan text: KEYS.decision on this branch (lib/adr.mjs) also requires an
// `interfaces` field (a string list), and appendDecision(cwd, line, {command}) now takes a required
// `command` argument naming the caller (lib/adr.mjs's ASSIGNED table checks it against the line's
// kind) -- neither is in the plan's literal decisionLine/appendDecision calls, which would throw
// AdrError (missing field / no command). Both are added at every call site in this file.
const decisionLine = (r) => ({ kind: 'decision', level: 'Consequential', by: 'agent', title: 'Use a map', rests_on: [], wrong_if: 'lookups are rare', body: 'A map keeps lookups constant.', base_snap: r.startSnapshot, evaluation: null, interfaces: [] });

test('protectedDigests changes with the bytes of each protected file', async () => {
  const r = await loopRepo();
  const a = await protectedDigests(r.cwd);
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  const b = await protectedDigests(r.cwd);
  assert.notEqual(a.agreement, b.agreement);
  assert.equal(a.spec, b.spec);
  assert.equal(a.settings, b.settings);
});

test('an ADR line appended by cairn decide is a valid kernel-managed mutation; a hand edit is not', async () => {
  const r = await loopRepo();
  const { tree } = await readSnapshot(r.cwd, r.startSnapshot, 'workspace');
  await appendDecision(r.cwd, decisionLine(r), { command: 'decide' });
  assert.equal(await kernelManagedValid(r.cwd, 'docs/decisions.jsonl', tree), true);
  const file = join(r.cwd, 'docs/decisions.jsonl');
  const text = await readFile(file, 'utf8');
  await r.write('docs/decisions.jsonl', text + '{"kind": "decision", "id": "X"}\n');   // noncanonical, unknown shape
  assert.equal(await kernelManagedValid(r.cwd, 'docs/decisions.jsonl', tree), false);
  await r.write('docs/decisions.jsonl', '');                                          // deletion of the appended line
  assert.equal(await kernelManagedValid(r.cwd, 'docs/decisions.jsonl', tree), false);
});

// Deviation from the plan text: on this branch, .cairn/mechanisms (lib/mechanisms.mjs's
// MECHANISMS_DIR) is a directory of one canonical-JSON file per mechanism name
// (.cairn/mechanisms/<name>.json), not a single file; loopRepo declares 'demo-001' for DEMO-001,
// so the concrete kernel-managed path under test is .cairn/mechanisms/demo-001.json.
test('an extra byte in a mechanism entry is not a valid mutation', async () => {
  const r = await loopRepo();
  const { tree } = await readSnapshot(r.cwd, r.startSnapshot, 'workspace');
  assert.equal(await kernelManagedValid(r.cwd, '.cairn/mechanisms/demo-001.json', tree), true);
  const text = await readFile(join(r.cwd, '.cairn/mechanisms/demo-001.json'), 'utf8');
  await r.write('.cairn/mechanisms/demo-001.json', text + ' ');
  assert.equal(await kernelManagedValid(r.cwd, '.cairn/mechanisms/demo-001.json', tree), false);
});

import { preflight, openBreaches } from '../lib/scope.mjs';

// Deviation from the plan text: the plan's own test assertions read a scope-breach record's
// fields as `b.allowed_base`, `b.first_observed` and `b.declarations`, but lib/records.mjs's
// already-settled 'scope-breach' schema (also exercised by tests/snapshots.test.mjs's own
// allowedBase test) names them `base`, `snapshot` and `declarations_digest`. Every field access
// below uses the schema's real names.
test('an undeclared, non-outside change becomes one breach naming snapshot, base and declaration set', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'export const s = 1;\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.equal(shas.length, 1);
  const [b] = openBreaches(await r.log());
  assert.equal(b.sha, shas[0]);
  assert.equal(b.path, 'src/stray.mjs');
  assert.equal(b.base, r.startSnapshot);
  assert.notEqual(b.snapshot, r.startSnapshot);
  assert.equal((await readSnapshot(r.cwd, b.snapshot, 'workspace')).kind, 'workspace');
  assert.match(b.declarations_digest, /^sha256:[0-9a-f]{64}$/);
});

test('declared inputs and outside paths are never breaches', async () => {
  const r = await loopRepo();
  await r.write('src/demo.mjs', 'console.log("hi");\n');
  await r.write('README.md', '# changed\n');
  await r.write('notes/todo.md', 'later\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});

test('a second preflight does not record the same observation twice', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  await preflight(r.cwd, await r.log(), { command: 'check' });
  await r.write('src/stray.mjs', 'y\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  assert.equal(openBreaches(await r.log()).length, 1);
});

test('a change removed before Cairn observes it leaves no breach', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  await r.remove('src/stray.mjs');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  assert.equal(openBreaches(await r.log()).length, 0);
});

import { begin, end } from '../lib/lease.mjs';
import { declare } from '../lib/mechanisms.mjs';
import { mechanismFor } from './helpers/loop.mjs';

test('a path touched under a lease is declared from begin and is not a breach', async () => {
  const r = await loopRepo();
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: ['src/new.mjs'] });
  await r.write('src/new.mjs', 'export const n = 1;\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  await end(r.cwd);
});

test('a protected path changed during a commitment without an authorization is a breach', async () => {
  const r = await loopRepo();
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.equal(shas.length, 1);
  assert.equal(openBreaches(await r.log())[0].path, 'AGENTS.md');
});

// Fix round 1 item 1 (Critical): the plan's own authorization test built a hand-crafted record
// from protectedDigests()'s own output, so it could never catch protectedDigests disagreeing with
// what a real `cairn authorize` writes -- exactly the bug the reviewer reproduced (scope.mjs had
// its own reimplementation, hashing docs/spec/** with Array.sort and settings.json's raw bytes,
// while lib/auth.mjs's real specDigest excludes PROTECTED_EXCEPT and sorts with Buffer.compare, so
// authorize()'s own digests never matched what preflight computed and an authorized protected
// change was still flagged a breach). scope.mjs's protectedDigests is now literally lib/auth.mjs's
// export, re-exported; this test runs the real authorize() and checks the preflight it feeds.
import { authorize } from '../lib/auth.mjs';
test('an authorize()-produced authorization record exempts the same protected change from a breach', async () => {
  const r = await loopRepo();
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  await authorize(r.cwd, { quote: 'ok', env: {} });
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});

test('cairn authorize itself and the gap between commitments exempt protected paths', async () => {
  const r = await loopRepo();
  await r.write('docs/spec/demo.md', (await readFile(join(r.cwd, 'docs/spec/demo.md'), 'utf8')) + '\n[DEMO-002] The demo exits zero.\nFalsifier: the exit code is not zero.\nMechanism: demo-002\nStatus: Draft\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'authorize' }), []);
  await r.add('done', r.slug, { slug: r.slug, snapshot: await r.snap() });
  await r.write('docs/spec/glossary.md', '# Glossary\n\n- demo: the sample program.\n- flag: a file that says pass or fail.\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});

test('the assigned command\'s exact mutation of a kernel-managed path is exempt', async () => {
  const r = await loopRepo();
  await appendDecision(r.cwd, decisionLine(r), { command: 'decide' });
  await declare(r.cwd, 'demo-002', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] });
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});

// Deviation from the plan text: targets .cairn/mechanisms/demo-001.json, the actual file
// loopRepo's default DEMO-001 mechanism writes (see Task 4's directory-layout note), not the bare
// directory path '.cairn/mechanisms'.
// Fix round 2 item 2 note: this test used to also corrupt .cairn/mechanisms/demo-001.json and
// expect a second breach for it; a corrupted mechanism file now refuses the whole preflight
// instead (see the dedicated refusal test below), so only the decisions.jsonl half remains here.
test('an invalid hand-written line in a kernel-managed path is a breach that outside cannot exempt', async () => {
  const r = await loopRepo({ settings: { outside: ['README.md'] } });
  await r.write('docs/decisions.jsonl', '{"kind":"decision","id":"01HZZZZZZZZZZZZZZZZZZZZZZZ","ts":"2026-09-19T00:00:00Z"}\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['docs/decisions.jsonl']);
  assert.equal(shas.length, 1);
});

test('an unnamed path under .cairn is a breach', async () => {
  const r = await loopRepo();
  await r.write('.cairn/notes.txt', 'scratch\n');
  await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['.cairn/notes.txt']);
});

import { allowedBase } from '../lib/snapshots.mjs';
import { dispose, ScopeError } from '../lib/scope.mjs';

test('the first-observed snapshot and snapshots written under an open breach are not allowed bases', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'review' });
  assert.equal(await allowedBase(r.cwd, await r.log()), r.startSnapshot);
  await r.add('review', r.slug, { slug: r.slug, session: null, snapshot: await r.snap(), examined: ['src'], answers: [], findings: [] });
  assert.equal(await allowedBase(r.cwd, await r.log()), r.startSnapshot);
  await r.remove('src/stray.mjs');
  const scopeSha = await dispose(r.cwd, b, 'restore');
  const log = await r.log();
  assert.equal(await allowedBase(r.cwd, log), log.find((x) => x.sha === scopeSha).payload.snapshot);
});

// Deviation from the plan text: the plan's answer() helper builds evidence as
// { mode: 'unsigned-local', author: 'Dev <dev@example.test>' }, but the shared `evidence` schema
// (also used by 'authorization', reused unchanged from Task 6's fix) needs the full closed
// 'unsigned-local' variant -- purpose, subject, nonce and author as {name, email}, not a string --
// the same shape tests/init.test.mjs's own fixtures already build.
const escalate = (r, b) => r.add('escalation', r.slug, { slug: r.slug, question: 'Keep src/stray.mjs?', recommendation: 'keep', because: 'it is the helper the fix needs', if_wrong: 'delete it', instead: 'restore', concerns: `breach:${b}`, evaluation: null });
const answer = (r, esc, kind) => r.add('answer', r.slug, { escalation: esc, kind, text: '', owner: null, evidence: { mode: 'unsigned-local', purpose: 'answer', subject: r.slug, nonce: 'n', author: { name: 'Dev', email: 'dev@example.test' }, confirmed: true } });

test('keep is refused without an escalation answered ok, and closes the breach with one', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await assert.rejects(dispose(r.cwd, b, 'keep'), (e) => e instanceof ScopeError && e.message === `cairn: keep needs an escalation answered ok that concerns breach:${b}`);
  const esc = await escalate(r, b);
  await answer(r, esc, 'ask');
  await assert.rejects(dispose(r.cwd, b, 'keep'), ScopeError);
  const ans = await answer(r, esc, 'ok');
  const s = await dispose(r.cwd, b, 'keep');
  const rec = (await r.log()).find((x) => x.sha === s);
  assert.deepEqual([rec.kind, rec.payload.breach, rec.payload.disposition, rec.payload.escalation, rec.payload.answer], ['scope', b, 'keep', esc, ans]);
  assert.equal(openBreaches(await r.log()).length, 0);
  assert.equal(await allowedBase(r.cwd, await r.log()), rec.payload.snapshot);
});

test('a kept path is not observed again while another breach is still open, and is again once its content changes', async () => {
  const r = await loopRepo();
  await r.write('src/stray1.mjs', 'x\n'); await r.write('src/stray2.mjs', 'y\n');
  const [b1] = await preflight(r.cwd, await r.log(), { command: 'check' });
  const esc = await escalate(r, b1); await answer(r, esc, 'ok');
  await dispose(r.cwd, b1, 'keep');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['src/stray2.mjs']);
  await r.write('src/stray1.mjs', 'x changed\n');
  const again = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.equal(again.length, 1);
  assert.equal((await r.log()).find((x) => x.sha === again[0]).payload.path, 'src/stray1.mjs');
});

test('keep accepts the escalation cairn escalate itself writes, with the breach:<sha> token the parser accepts', async () => {
  const { escalate: escalateDraft, answer: answerDraft } = await import('../lib/escalate.mjs');
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  const draft = { commitment: r.slug, concerns: [`breach:${b}`], question: 'Keep src/stray.mjs?', recommendation: 'keep', because: 'it is the helper the fix needs', if_wrong: 'delete it', instead: 'restore', options: [], named_paths: [], cited_decisions: [] };
  const esc = await escalateDraft(r.cwd, draft);
  await assert.rejects(dispose(r.cwd, b, 'keep'), (e) => e instanceof ScopeError && e.message === `cairn: keep needs an escalation answered ok that concerns breach:${b}`);
  const ans = await answerDraft(r.cwd, r.slug, 'ok', { quote: 'keep it', env: {} });
  const s = await dispose(r.cwd, b, 'keep');
  const rec = (await r.log()).find((x) => x.sha === s);
  assert.deepEqual([rec.kind, rec.payload.breach, rec.payload.disposition, rec.payload.escalation, rec.payload.answer], ['scope', b, 'keep', esc, ans]);
});

test('restore is refused while the path differs from its allowed base', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await assert.rejects(dispose(r.cwd, b, 'restore'), (e) => e.message === `cairn: src/stray.mjs still differs from its allowed base ${r.startSnapshot}`);
  await r.remove('src/stray.mjs');
  const s = await dispose(r.cwd, b, 'restore');
  const rec = (await r.log()).find((x) => x.sha === s);
  assert.deepEqual([rec.payload.disposition, rec.payload.escalation, rec.payload.answer], ['restore', null, null]);
  await assert.rejects(dispose(r.cwd, b, 'restore'), (e) => e.message === `cairn: scope-breach ${b} already has a disposition`);
});

import { runWithPreflight, STATE_CHANGING } from '../lib/scope.mjs';
import { readMechanisms } from '../lib/mechanisms.mjs';

test('declare runs the preflight first, so a declaration legalizes only future changes', async () => {
  const r = await loopRepo();
  await r.write('src/util.mjs', 'export const u = 1;\n');
  await runWithPreflight(r.cwd, 'declare', () => declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] }));
  assert.ok((await readMechanisms(r.cwd))['demo-001'].definition.inputs.includes('src/util.mjs'));
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['src/util.mjs']);
  await r.write('src/util.mjs', 'export const u = 2;\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);   // later edits are declared
  assert.equal(openBreaches(await r.log()).length, 1);                                // the first observation stands
});

test('a breach is a log fact: squashing the branch does not clear it', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  await r.commit('stray work');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await r.write('src/demo.mjs', 'console.log("hello!");\n');
  await r.commit('touch demo');
  const root = (await git(['rev-list', '--max-parents=0', 'HEAD'], { cwd: r.cwd })).stdout.trim();
  await git(['reset', '--soft', root], { cwd: r.cwd });
  await git(['commit', '-q', '-m', 'squashed'], { cwd: r.cwd });
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  assert.deepEqual(openBreaches(await r.log()).map((x) => x.sha), [b]);
  await r.remove('src/stray.mjs');
  await r.commit('remove stray');
  assert.equal(openBreaches(await r.log()).length, 1);       // bytes gone, record not: only a disposition closes it
  await dispose(r.cwd, b, 'restore');
  assert.equal(openBreaches(await r.log()).length, 0);
});

// Fix round 1 item 10: the plan's own test compared the STATE_CHANGING literal with itself --
// it would still pass if runWithPreflight stopped calling preflight altogether. This drives
// runWithPreflight itself: for every state-changing command it asserts a genuine breach was
// actually recorded, and for a reader command it asserts one was not.
// Fix round 2 item 3 (Minor): the positive membership assertions the plan's original test made
// are restored alongside the behavioral one -- naming every state-changing command explicitly
// still catches a command silently dropped from the set even if the loop below happens not to
// exercise it for some other reason.
// Fix round 1 finding 3 (plan 09 review): 'dispute' added alongside 'escalate', 'answer' and
// 'reply' -- dispute() (lib/escalate.mjs) calls the same escalate() they do and writes the same
// 'escalation' record kind, so section 5's "before any state-changing command" scope preflight
// applies to it identically. Before this fix, `cairn dispute` wrote an escalation record with no
// preflight scope check and no cycle-counter settle.
test('runWithPreflight invokes the preflight for every state-changing command and skips it for a reader', async () => {
  for (const c of ['begin', 'end', 'check', 'declare', 'review-mechanism', 'review', 'brief', 'report', 'resolve', 'accept', 'escalate', 'answer', 'reply', 'dispute', 'item', 'outside', 'fix', 'decide', 'realize', 'promote', 'authorize', 'start', 'done', 'supersede', 'scope', 'calibrate']) assert.ok(STATE_CHANGING.has(c), c);
  for (const c of ['wake', 'show', 'lint', 'decisions', 'recover', 'init']) assert.ok(!STATE_CHANGING.has(c), c);
  const r = await loopRepo();
  for (const command of STATE_CHANGING) {
    const p = `src/stray-${command}.mjs`;
    await r.write(p, 'x\n');
    await runWithPreflight(r.cwd, command, () => {});
    assert.ok(openBreaches(await r.log()).some((b) => b.path === p), command);
  }
  await r.write('src/stray-reader.mjs', 'x\n');
  await runWithPreflight(r.cwd, 'show', () => {});
  assert.ok(!openBreaches(await r.log()).some((b) => b.path === 'src/stray-reader.mjs'));
});

import { spawnSync } from 'node:child_process';
const cairn = (cwd, ...args) => spawnSync(process.execPath, [new URL('../bin/cairn.mjs', import.meta.url).pathname, ...args], { cwd, encoding: 'utf8' });

test('cairn scope <breach> restore writes the disposition and refuses a wrong one on stderr', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  const bad = cairn(r.cwd, 'scope', b, 'keep');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^cairn: keep needs an escalation answered ok/);
  await r.remove('src/stray.mjs');
  const ok = cairn(r.cwd, 'scope', b, 'restore');
  assert.equal(ok.status, 0);
  assert.equal(openBreaches(await r.log()).length, 0);
});

test('a state-changing command records the breach before its own work', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const out = cairn(r.cwd, 'begin', 'implement', 'DEMO-001');
  assert.equal(out.status, 0);
  assert.deepEqual(openBreaches(await r.log()).map((x) => x.path), ['src/stray.mjs']);
});

// ==== Fix round 1 ====

import { canonicalize } from '../lib/canon.mjs';

// Item 2 (Critical): a hand edit that stays canonical and schema-valid used to pass just by
// parsing cleanly. It must not, since it never went through declare()'s managed-write ledger.
test('a canonical, schema-valid hand edit of a mechanism entry is still a breach', async () => {
  const r = await loopRepo();
  const path = '.cairn/mechanisms/demo-001.json';
  const entry = JSON.parse(await readFile(join(r.cwd, path), 'utf8'));
  entry.definition.inputs = [...entry.definition.inputs, 'src/util.mjs'].sort();
  await r.write(path, canonicalize(entry));
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), [path]);
  assert.equal(shas.length, 1);
});

// Item 2: declare()'s own write (ledger-recorded) is still exempt -- already covered by "the
// assigned command's exact mutation of a kernel-managed path is exempt" and "declare runs the
// preflight first...", both re-run above against the new ledger-based check.

// Item 2: an otherwise-valid ADR decision line appended by hand (not through appendDecision, so
// never ledger-recorded) is still a breach, even though it is well-formed and would parse cleanly.
test('a hand-appended, otherwise-valid ADR decision line is still a breach', async () => {
  const r = await loopRepo();
  const line = {
    kind: 'decision', id: '01J00000000000000000000001', ts: '2026-09-19T00:00:00Z',
    level: 'Consequential', by: 'agent', title: 'Hand-added', rests_on: [], wrong_if: 'x',
    body: 'y', base_snap: r.startSnapshot, evaluation: null, interfaces: [],
  };
  const existing = await readFile(join(r.cwd, 'docs/decisions.jsonl'), 'utf8').catch(() => '');
  await r.write('docs/decisions.jsonl', existing + canonicalize(line) + '\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['docs/decisions.jsonl']);
  assert.equal(shas.length, 1);
});

// Item 3 (Important): a missing protected file used to crash the preflight with a raw ENOENT
// instead of recording a breach.
test('deleting a protected file is a breach, not a crash', async () => {
  const r = await loopRepo();
  await r.remove('AGENTS.md');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.equal(shas.length, 1);
  assert.equal(openBreaches(await r.log())[0].path, 'AGENTS.md');
});

// Item 3: a missing or unreadable .cairn/settings.json leaves classify() with nothing to compare
// against; this is a clean cairn: refusal, never a raw error out of preflight.
test('a missing settings.json refuses cleanly instead of crashing the preflight', async () => {
  const r = await loopRepo();
  await r.remove('.cairn/settings.json');
  await assert.rejects(preflight(r.cwd, await r.log(), { command: 'check' }), (e) => e instanceof ScopeError && e.message.startsWith('cairn: '));
});

// Item 4 (fix round 1) superseded by fix round 2 item 2: an unreadable mechanism file no longer
// gets recorded as a single breach while everything else silently waits -- it now refuses the
// whole preflight outright, every time, whether or not the corrupted path is itself a currently
// changed one.
test('an unreadable mechanism file refuses the preflight while it is itself the changed path', async () => {
  const r = await loopRepo();
  const path = '.cairn/mechanisms/demo-001.json';
  await r.write(path, (await readFile(join(r.cwd, path), 'utf8')) + ' ');   // extra byte: breaks parseStrict
  await r.write('src/demo.mjs', 'console.log("hi");\n');                   // declared by the corrupted mechanism
  await r.write('src/stray.mjs', 'x\n');                                   // plainly undeclared
  await assert.rejects(preflight(r.cwd, await r.log(), { command: 'check' }),
    (e) => e instanceof ScopeError && e.message.startsWith('cairn: ') && e.message.includes(path) && /repair/.test(e.message));
  assert.equal(openBreaches(await r.log()).length, 0);
});

// Fix round 2 item 2 (Important): reproduces the coordinator's exact report -- once the corrupted
// mechanism file is itself no longer a delta (it was already accepted into the allowed base by an
// earlier disposition, so it is byte-identical to the base and never appears in workspaceDelta),
// the fix round 1 approach recorded nothing and refused nothing for anything else either: a stray
// file and an unauthorized AGENTS.md edit both produced zero breaches, a silent failure. The
// preflight now refuses unconditionally as soon as readMechanisms cannot read the directory,
// before it ever looks at workspaceDelta.
test('an unreadable mechanism file refuses the preflight even once it is part of the allowed base', async () => {
  const r = await loopRepo();
  const path = '.cairn/mechanisms/demo-001.json';
  await r.write(path, (await readFile(join(r.cwd, path), 'utf8')) + ' ');
  // Accept the corrupted bytes into the allowed base directly (appendRecord), since preflight()
  // and dispose() would themselves now refuse on this corrupted directory.
  const snap = await r.snap();
  await r.add('review', r.slug, { slug: r.slug, session: null, snapshot: snap, examined: ['src'], answers: [], findings: [] });
  assert.equal(await allowedBase(r.cwd, await r.log()), snap);
  await r.write('src/stray.mjs', 'x\n');
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  await assert.rejects(preflight(r.cwd, await r.log(), { command: 'check' }),
    (e) => e instanceof ScopeError && e.message.startsWith('cairn: ') && e.message.includes(path) && /repair/.test(e.message));
  assert.equal(openBreaches(await r.log()).length, 0);
});

// Item 5 (Important, ruling): the roadmap is exempt from scope only while no commitment range is
// open; while one is open it is a breach like any other reserved path.
test('the roadmap is exempt from scope while no commitment range is open', async () => {
  const r = await loopRepo();
  await r.add('done', r.slug, { slug: r.slug, snapshot: await r.snap() });
  await r.write('docs/spec/roadmap.md', (await readFile(join(r.cwd, 'docs/spec/roadmap.md'), 'utf8')) + '\n## next\n\nRequirements: DEMO-001\n\nDelivers more.\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});
test('a roadmap edit while a range is open is a breach like any other reserved path', async () => {
  const r = await loopRepo();
  await r.write('docs/spec/roadmap.md', (await readFile(join(r.cwd, 'docs/spec/roadmap.md'), 'utf8')) + '\nmore text\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['docs/spec/roadmap.md']);
  assert.equal(shas.length, 1);
});

// Item 6 (Important): an untracked credential-shaped file anywhere in the workspace used to
// crash the preflight with a raw SnapshotError instead of a clean refusal with no breach.
test('an untracked credential-shaped file refuses cleanly instead of crashing the preflight', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  await r.write('leaked.pem', '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n');
  await assert.rejects(preflight(r.cwd, await r.log(), { command: 'check' }),
    (e) => e instanceof ScopeError && e.message.startsWith('cairn: ') && /looks like a credential/.test(e.message) && /leaked\.pem/.test(e.message));
  assert.equal(openBreaches(await r.log()).length, 0);
});

// Item 7 (Minor): a scope disposition used to advance the allowed base even while another breach
// stayed open. Two concurrently open breaches: the base holds until both are disposed.
test('the allowed base advances only once every concurrently open breach is disposed', async () => {
  const r = await loopRepo();
  await r.write('src/a-stray.mjs', 'a\n');
  await r.write('src/b-stray.mjs', 'b\n');
  const [b1, b2] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await r.remove('src/a-stray.mjs');
  await dispose(r.cwd, b1, 'restore');
  assert.equal(await allowedBase(r.cwd, await r.log()), r.startSnapshot);
  await r.remove('src/b-stray.mjs');
  const s2 = await dispose(r.cwd, b2, 'restore');
  const rec2 = (await r.log()).find((x) => x.sha === s2);
  assert.equal(await allowedBase(r.cwd, await r.log()), rec2.payload.snapshot);
});

// Item 10: a renamed file (no rename tracking) is reported as a plain deletion of the old path
// plus an addition of the new one.
test('a renamed file is reported as the old path deleted and the new path added', async () => {
  const r = await loopRepo();
  const { tree } = await readSnapshot(r.cwd, r.startSnapshot, 'workspace');
  const text = await readFile(join(r.cwd, 'src/demo.mjs'), 'utf8');
  await r.remove('src/demo.mjs');
  await r.write('src/renamed.mjs', text);
  const delta = await workspaceDelta(r.cwd, tree);
  assert.deepEqual(delta.map((d) => ({ path: d.path, change: d.change })), [
    { path: 'src/demo.mjs', change: 'deleted' },
    { path: 'src/renamed.mjs', change: 'added' },
  ]);
});

// ==== Fix round 2 ====

import { symlink } from 'node:fs/promises';
import { recordManagedWrite, managedWriteDigest } from '../lib/scope.mjs';
import { gitPath } from '../lib/gitx.mjs';
import { sha256 } from '../lib/canon.mjs';

// Item 1 (Critical): `git hash-object --stdin-paths` dereferences a symlink (hashing whatever it
// points at, not the link text the snapshot tree stores), so an unchanged tracked symlink came
// back "modified" forever.
test('an unchanged tracked symlink is not in the delta', async () => {
  const r = await loopRepo();
  await symlink('demo.mjs', join(r.cwd, 'src/link.mjs'));
  await r.commit('track a symlink');
  const { tree } = await readSnapshot(r.cwd, await r.snap(), 'workspace');
  assert.deepEqual(await workspaceDelta(r.cwd, tree), []);
});

// Item 1: a dangling symlink made `git hash-object --stdin-paths` try to open its target and
// exit 128, a raw GitError out of every state-changing command.
test('a dangling symlink is not in the delta and does not crash', async () => {
  const r = await loopRepo();
  await symlink('nonexistent-target', join(r.cwd, 'src/dangling.mjs'));
  await r.commit('track a dangling symlink');
  const { tree } = await readSnapshot(r.cwd, await r.snap(), 'workspace');
  assert.deepEqual(await workspaceDelta(r.cwd, tree), []);
});

// Item 1: a symlink whose target text actually changes is still reported modified.
test('a changed symlink target text is modified', async () => {
  const r = await loopRepo();
  await symlink('demo.mjs', join(r.cwd, 'src/link.mjs'));
  await r.commit('track a symlink');
  const { tree } = await readSnapshot(r.cwd, await r.snap(), 'workspace');
  await r.remove('src/link.mjs');
  await symlink('other.mjs', join(r.cwd, 'src/link.mjs'));
  assert.deepEqual((await workspaceDelta(r.cwd, tree)).map((d) => [d.path, d.change, d.mode]), [['src/link.mjs', 'modified', '120000']]);
});

// Item 1: `--stdin-paths` also runs a clean filter and EOL conversion named by .gitattributes,
// unlike the raw byte hashing it replaced; `--no-filters` must keep the raw bytes so the computed
// hash still matches what the snapshot tree (built from raw bytes) actually stored.
test('a file a clean/EOL filter would alter still hashes as its raw bytes', async () => {
  const r = await loopRepo();
  await r.write('.gitattributes', '* text=auto\n');
  await r.write('src/crlf.mjs', 'line1\r\nline2\r\n');
  await r.commit('track a CRLF file under text=auto');
  const { tree } = await readSnapshot(r.cwd, await r.snap(), 'workspace');
  assert.deepEqual(await workspaceDelta(r.cwd, tree), []);
});

// Item 3 (Minor): the ledger used to key its lines with a space, which misreads a path that
// itself contains a space (the first space inside the path would be read as the separator).
test('the managed-write ledger keys entries with a tab so a path containing a space round-trips correctly', async () => {
  const r = await loopRepo();
  const path = 'a path with spaces.json';
  const bytes = Buffer.from('content');
  await recordManagedWrite(r.cwd, path, bytes);
  assert.equal(await managedWriteDigest(r.cwd, path), sha256(bytes));
  assert.equal(await managedWriteDigest(r.cwd, 'a'), null);   // a space-keyed reader would have matched this
  const raw = await readFile(await gitPath(r.cwd, 'cairn-managed'), 'utf8');
  assert.match(raw, /(^|\n)a path with spaces\.json\tsha256:[0-9a-f]{64}\n/);
});
