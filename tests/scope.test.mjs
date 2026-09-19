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
