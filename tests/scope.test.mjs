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
