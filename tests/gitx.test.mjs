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

import { emptyTree, commitTree, catCommit } from '../lib/gitx.mjs';

test('commitTree and catCommit round-trip subject, body and trailers without interpret-trailers', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const tree = await emptyTree(repo.dir);
  assert.equal(tree, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  const body = '{"a":"line\\nbreak","b":[1]}';
  const sha = await commitTree(repo.dir, { tree, parents: [], subject: 'cairn: done slug', body, trailers: [['Cairn-Schema', '1'], ['Cairn-Digest', 'sha256:00']] });
  const c = await catCommit(repo.dir, sha);
  assert.deepEqual([c.tree, c.parents, c.subject, c.body], [tree, [], 'cairn: done slug', body]);
  assert.deepEqual(c.trailers, [['Cairn-Schema', '1'], ['Cairn-Digest', 'sha256:00']]);
  assert.ok(Buffer.isBuffer(c.bodyBytes) && c.bodyBytes.toString() === body);
  const child = await commitTree(repo.dir, { tree, parents: [sha], subject: 'plain', body: 'no trailers here' });
  const d = await catCommit(repo.dir, child);
  assert.deepEqual([d.parents, d.body, d.trailers], [[sha], 'no trailers here', []]);
});

import { writeTreeFromPaths, listTree } from '../lib/gitx.mjs';

test('writeTreeFromPaths stores dirty bytes, modes and link text without touching the index', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'committed\n'); await repo.commit('base');
  await repo.write('a.txt', 'dirty\n');
  await repo.write('b/c.txt', 'new\n');
  await repo.write('run.sh', '#!/bin/sh\n', { mode: 0o755 });
  await repo.link('lnk', '../outside.pem');
  await repo.write('.cairn/output/x', 'ignored\n');
  const before = await repo.git('ls-files', '--stage');
  const tree = await writeTreeFromPaths(repo.dir, { paths: ['a.txt', 'b/c.txt', 'run.sh', 'lnk', '.cairn/output/x', 'gone.txt'], exclude: ['.git', '.cairn/output'] });
  const entries = await listTree(repo.dir, tree);
  assert.deepEqual(entries.map((e) => [e.path, e.mode]), [['a.txt', '100644'], ['b/c.txt', '100644'], ['lnk', '120000'], ['run.sh', '100755']]);
  const blob = entries.find((e) => e.path === 'a.txt').sha;
  assert.equal((await git(['cat-file', 'blob', blob], { cwd: repo.dir })).stdout, 'dirty\n');
  const link = entries.find((e) => e.path === 'lnk').sha;
  assert.equal((await git(['cat-file', 'blob', link], { cwd: repo.dir })).stdout, '../outside.pem');
  assert.equal(await repo.git('ls-files', '--stage'), before);
  assert.equal(await repo.git('diff', '--cached', '--name-only'), '');
});

test('a large stdin write to a git process that exits without draining it rejects with GitError instead of crashing the process', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const big = Buffer.alloc(8 * 1024 * 1024, 65); // bigger than the OS pipe buffer, so the write outlives a git process that never reads stdin
  await assert.rejects(git(['cat-file', '-p', 'nothing'], { cwd: repo.dir, input: big }), (e) => e instanceof GitError && /nothing/.test(e.stderr));
});

// Fix round 1, item 1: treeIdentityReadOnly must produce the exact tree sha a write-tree of the
// same entries would, without writing anything -- the multi-level path set (a nested directory
// plus a sibling blob whose name is a prefix of the directory's own name) exercises
// treeShaFromEntries' recursive grouping and its git-matching sort rule ('foo.txt' before 'foo/').
import { treeIdentityReadOnly, treeShaFromEntries } from '../lib/gitx.mjs';
import { readdir } from 'node:fs/promises';

async function looseObjectCount(cwd) {
  const gitDir = (await git(['rev-parse', '--absolute-git-dir'], { cwd })).stdout.trim();
  let count = 0;
  for (const d of await readdir(`${gitDir}/objects`, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === 'pack' || d.name === 'info') continue;
    count += (await readdir(`${gitDir}/objects/${d.name}`)).length;
  }
  return count;
}

test('treeIdentityReadOnly matches writeTreeFromPaths exactly and writes no object', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('foo/inner.txt', 'x\n');
  await repo.write('foo.txt', 'y\n');
  await repo.write('a/b/deep.txt', 'z\n');
  await repo.commit('base');
  const written = await writeTreeFromPaths(repo.dir, { paths: ['foo/inner.txt', 'foo.txt', 'a/b/deep.txt'], exclude: [] });
  const before = await looseObjectCount(repo.dir);
  const readOnly = await treeIdentityReadOnly(repo.dir, { paths: ['foo/inner.txt', 'foo.txt', 'a/b/deep.txt'], exclude: [] });
  assert.equal(readOnly, written);
  assert.equal(await looseObjectCount(repo.dir), before);
});

test('treeShaFromEntries recomputes a real write-tree sha from that tree\'s own flat entries', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('foo/inner.txt', 'x\n');
  await repo.write('foo.txt', 'y\n');
  await repo.commit('base');
  const real = await writeTreeFromPaths(repo.dir, { paths: ['foo/inner.txt', 'foo.txt'], exclude: [] });
  const entries = await listTree(repo.dir, real);   // listTree (-r) already lists blobs only, with paths like 'foo/inner.txt'
  assert.equal(treeShaFromEntries(entries), real);
});
