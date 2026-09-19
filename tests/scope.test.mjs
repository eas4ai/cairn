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
