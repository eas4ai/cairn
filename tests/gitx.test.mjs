import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';
import { git, gitPath, readRef, updateRefCAS, deleteRefCAS, GitError, CasError } from '../lib/gitx.mjs';

test('git returns stdout and throws GitError with stderr on failure', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const r = await git(['rev-parse', '--is-inside-work-tree'], { cwd: repo.dir });
  assert.equal(r.stdout.trim(), 'true');
  await assert.rejects(git(['cat-file', '-p', 'nothing'], { cwd: repo.dir }), (e) => e instanceof GitError && /nothing/.test(e.stderr));
  const tolerated = await git(['rev-parse', '--verify', '--quiet', 'refs/none'], { cwd: repo.dir, expect: [0, 1] });
  assert.equal(tolerated.code, 1);
});
test('gitPath resolves below the Git directory', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const p = await gitPath(repo.dir, 'cairn-check.lock');
  assert.ok(isAbsolute(p) && p.endsWith('/.git/cairn-check.lock'));
});
test('updateRefCAS creates, advances and refuses a stale old OID', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const a = await repo.commit('a'); const b = await repo.commit('b');
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), null);
  await updateRefCAS(repo.dir, 'refs/cairn/log', a, null);
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), a);
  await assert.rejects(updateRefCAS(repo.dir, 'refs/cairn/log', b, null), CasError);
  await updateRefCAS(repo.dir, 'refs/cairn/log', b, a);
  await assert.rejects(updateRefCAS(repo.dir, 'refs/cairn/log', a, a), CasError);
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), b);
  await assert.rejects(deleteRefCAS(repo.dir, 'refs/cairn/log', a), CasError);
  await deleteRefCAS(repo.dir, 'refs/cairn/log', b);
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), null);
});
