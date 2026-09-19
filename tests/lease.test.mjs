// tests/lease.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
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
import { readRef, catCommit, git, gitPath } from '../lib/gitx.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { init } from '../lib/init.mjs';
import { begin, readLease, LEASE_REF } from '../lib/lease.mjs';

const yes = async () => true;
// Deviation from the plan text: see tests/tx.test.mjs's SETTINGS note; lib/settings.mjs's
// validateSettings (plan 02, already committed) requires every typesafeai.* threshold key.
const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: ['src/**'], interfaces: [], data: [],
  network_exclude: [], signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { enabled: false, mode: 'shadow', model: null,
    route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3,
    reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05,
    min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } });
async function initialized() {
  const { cwd } = await repoWith({ '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# a\n', 'docs/spec/overview.md': '# k\n', 'src/a.mjs': 'export const a = 1;\n' });
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  return cwd;
}

test('begin creates the lease with the action, target, start snapshot, timestamp, session and touch list', async () => {
  const cwd = await initialized();
  const sha = await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs'], env: { CAIRN_SESSION: 'sess-1' } });
  assert.equal(await readRef(cwd, LEASE_REF), sha);
  const lease = await readLease(cwd);
  assert.equal(lease.action, 'implement');
  assert.equal(lease.target, 'CORE-001');
  assert.equal(lease.session, 'sess-1');
  assert.deepEqual(lease.touch, ['src/new.mjs']);
  assert.match(lease.started, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  const snap = await readSnapshot(cwd, lease.snapshot, 'workspace');
  assert.equal(snap.kind, 'workspace');
  const c = await catCommit(cwd, sha);
  assert.equal(c.subject, 'cairn: lease implement CORE-001');
  assert.deepEqual(c.parents, []);
  assert.equal(c.tree, snap.tree);
  assert.equal(existsSync(join(cwd, '.cairn/in-progress')), false, 'no shared slot file');
});

test('begin refuses when a lease exists and names reconcile', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  await assert.rejects(begin(cwd, { action: 'run', target: 'CORE-002', env: {} }),
    /^LeaseError: cairn: action lease held: implement CORE-001; run cairn end or cairn reconcile/);
});

test('begin refuses an unknown action and a touch path that is reserved, protected, invalid or output', async () => {
  const cwd = await initialized();
  await assert.rejects(begin(cwd, { action: 'dance', target: 'X', env: {} }), /^LeaseError: cairn: unknown action dance/);
  for (const p of ['docs/spec/x.md', 'AGENTS.md', '.cairn/mechanisms', '.cairn/output/o', '../x', 'a\\b']) {
    await assert.rejects(begin(cwd, { action: 'implement', target: 'X', touch: [p], env: {} }), /cairn: --touch/);
  }
  assert.equal(await readRef(cwd, LEASE_REF), null);
});

test('readLease ignores a stray .cairn/in-progress file: the shared slot is gone', async () => {
  const cwd = await initialized();
  writeFileSync(join(cwd, '.cairn/in-progress'), 'action: implement\ntarget: X\n');
  assert.equal(await readLease(cwd), null);
});

import { end, onEnd, touchOutcome, covers } from '../lib/lease.mjs';

test('end removes the lease with compare-and-swap and reports the touch outcome to the hook', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs', 'src/untouched.mjs'], env: {} });
  writeFileSync(join(cwd, 'src/new.mjs'), 'export const n = 1;\n');
  const seen = [];
  const off = onEnd(async (c, lease, outcome) => { seen.push({ c, target: lease.target, outcome }); });
  await end(cwd);
  off();
  assert.equal(await readRef(cwd, LEASE_REF), null);
  assert.deepEqual(seen, [{ c: cwd, target: 'CORE-001', outcome: { changed: ['src/new.mjs'], unchanged: ['src/untouched.mjs'] } }]);
});

test('a touched path whose bytes equal the start snapshot is unchanged; a modified existing file is changed', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/a.mjs'], env: {} });
  assert.deepEqual(await touchOutcome(cwd, await readLease(cwd)), { changed: [], unchanged: ['src/a.mjs'] });
  writeFileSync(join(cwd, 'src/a.mjs'), 'export const a = 2;\n');
  assert.deepEqual(await touchOutcome(cwd, await readLease(cwd)), { changed: ['src/a.mjs'], unchanged: [] });
  await end(cwd);
});

test('end without a lease is refused; a failing hook keeps the lease', async () => {
  const cwd = await initialized();
  await assert.rejects(end(cwd), /^LeaseError: cairn: no action lease to end/);
  await begin(cwd, { action: 'run', target: 'CORE-001', env: {} });
  const off = onEnd(async () => { throw new Error('declare failed'); });
  await assert.rejects(end(cwd), /declare failed/);
  off();
  assert.ok(await readRef(cwd, LEASE_REF), 'lease survives a failed end');
  await end(cwd);
});

test('covers: a lease covers its target inputs and its touch list', async () => {
  const lease = { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs'] };
  assert.equal(covers(lease, 'src/new.mjs', ['src/a.mjs']), true);
  assert.equal(covers(lease, 'src/a.mjs', ['src/a.mjs']), true);
  assert.equal(covers(lease, 'src/other.mjs', ['src/a.mjs']), false);
});
