import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopRepo } from './helpers/loop.mjs';

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
  assert.deepEqual(await workspaceDelta(r.cwd, tree), [
    { path: 'README.md', change: 'deleted' },
    { path: 'src/demo.mjs', change: 'modified' },
    { path: 'src/new.mjs', change: 'added' },
  ]);
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
import { appendDecision } from '../lib/adr.mjs';
import { protectedDigests, kernelManagedValid } from '../lib/scope.mjs';

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

// Deviation from the plan text: the plan's own authorization payload uses spec/agreement/settings
// keys and omits intent/results; the real 'authorization' schema (lib/records.mjs) requires
// spec_digest/agreement_digest/settings_digest plus intent and results (nullable(ref) and
// list(storeIdentity), both closed keys appendRecord's schema check refuses to see missing), and
// its evidence field is the same closed 'unsigned-local' variant tests/init.test.mjs already
// builds: {mode, purpose, subject, nonce, author: {name, email}, confirmed}, not a bare author
// string.
test('a protected change named by an authorization record is not a breach', async () => {
  const r = await loopRepo();
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  const d = await protectedDigests(r.cwd);
  await r.add('authorization', 'developer', {
    spec_digest: d.spec, agreement_digest: d.agreement, settings_digest: d.settings,
    evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 'test', nonce: 'n', author: { name: 'Dev', email: 'dev@example.test' }, confirmed: true },
    decision: null, intent: null, results: [],
  });
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
test('any other write to a kernel-managed path is a breach that outside cannot exempt', async () => {
  const r = await loopRepo({ settings: { outside: ['README.md'] } });
  await r.write('.cairn/mechanisms/demo-001.json', (await readFile(join(r.cwd, '.cairn/mechanisms/demo-001.json'), 'utf8')) + '\n');
  await r.write('docs/decisions.jsonl', '{"kind":"decision","id":"01HZZZZZZZZZZZZZZZZZZZZZZZ","ts":"2026-09-19T00:00:00Z"}\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path).sort(), ['.cairn/mechanisms/demo-001.json', 'docs/decisions.jsonl']);
  assert.equal(shas.length, 2);
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
  await r.add('review', r.slug, { slug: r.slug, snapshot: await r.snap(), examined: ['src'], answers: [], findings: [] });
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
const escalate = (r, b) => r.add('escalation', r.slug, { slug: r.slug, question: 'Keep src/stray.mjs?', recommendation: 'keep', because: 'it is the helper the fix needs', if_wrong: 'delete it', instead: 'restore', concerns: `scope-breach:${b}`, evaluation: null });
const answer = (r, esc, kind) => r.add('answer', r.slug, { escalation: esc, kind, text: '', owner: null, evidence: { mode: 'unsigned-local', purpose: 'answer', subject: r.slug, nonce: 'n', author: { name: 'Dev', email: 'dev@example.test' }, confirmed: true } });

test('keep is refused without an escalation answered ok, and closes the breach with one', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await assert.rejects(dispose(r.cwd, b, 'keep'), (e) => e instanceof ScopeError && e.message === `cairn: keep needs an escalation answered ok that concerns scope-breach:${b}`);
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
import { git } from '../lib/gitx.mjs';

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

test('the state-changing set names every writing command and no reader', () => {
  for (const c of ['begin', 'end', 'check', 'declare', 'review-mechanism', 'review', 'brief', 'report', 'resolve', 'accept', 'escalate', 'answer', 'reply', 'item', 'outside', 'fix', 'decide', 'realize', 'promote', 'authorize', 'start', 'done', 'supersede', 'scope', 'calibrate']) assert.ok(STATE_CHANGING.has(c), c);
  for (const c of ['wake', 'show', 'lint', 'decisions', 'recover', 'init']) assert.ok(!STATE_CHANGING.has(c), c);
});
