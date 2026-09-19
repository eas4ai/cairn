import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { loopRepo } from './helpers/loop.mjs';
import { git, gitPath } from '../lib/gitx.mjs';
import { BOUNDS, ADMIN, bump, readCounter, resetOnProgress } from '../lib/cycle.mjs';

test('the counter lives below the Git directory, counts by class and target, and never travels', async () => {
  const r = await loopRepo();
  assert.deepEqual(BOUNDS, { sameTarget: 4, total: 28, acceptanceRounds: 3 });
  assert.equal(ADMIN.size, 9);
  const refsBefore = (await git(['for-each-ref'], { cwd: r.cwd })).stdout;
  let last;
  for (let i = 0; i < 3; i++) last = await bump(r.cwd, 'record', 'src/a.mjs');
  assert.deepEqual(last, { sameTarget: 3, total: 3, bound: null });
  assert.deepEqual(await bump(r.cwd, 'commit', 'src/a.mjs'), { sameTarget: 1, total: 4, bound: null });
  assert.deepEqual(await bump(r.cwd, 'record', 'src/a.mjs'), { sameTarget: 4, total: 5, bound: 'sameTarget' });
  const file = await gitPath(r.cwd, 'cairn-cycle.json');
  assert.ok((await stat(file)).isFile());
  assert.ok(!file.startsWith(r.cwd + '/src'));
  assert.equal((await git(['for-each-ref'], { cwd: r.cwd })).stdout, refsBefore);
  assert.equal((await git(['status', '--porcelain'], { cwd: r.cwd })).stdout, '');
  await resetOnProgress(r.cwd);
  assert.deepEqual((await readCounter(r.cwd)).counts, {});
  assert.equal((await readCounter(r.cwd)).total, 0);
});

test('the twenty-eighth transition of any class is the second bound', async () => {
  const r = await loopRepo();
  const classes = [...ADMIN];
  let res;
  for (let i = 0; i < 28; i++) res = await bump(r.cwd, classes[i % 9], 't' + Math.floor(i / 9));
  assert.equal(res.total, 28);
  assert.equal(res.bound, 'total');
  assert.ok(res.sameTarget < BOUNDS.sameTarget);
});
