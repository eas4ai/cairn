import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute, join } from 'node:path';
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
  const p = await gitPath(repo.dir, 'sudus-check.lock');
  assert.ok(isAbsolute(p) && p.endsWith('/.git/sudus-check.lock'));
});
test('updateRefCAS creates, advances and refuses a stale old OID', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const a = await repo.commit('a'); const b = await repo.commit('b');
  assert.equal(await readRef(repo.dir, 'refs/sudus/log'), null);
  await updateRefCAS(repo.dir, 'refs/sudus/log', a, null);
  assert.equal(await readRef(repo.dir, 'refs/sudus/log'), a);
  await assert.rejects(updateRefCAS(repo.dir, 'refs/sudus/log', b, null), CasError);
  await updateRefCAS(repo.dir, 'refs/sudus/log', b, a);
  await assert.rejects(updateRefCAS(repo.dir, 'refs/sudus/log', a, a), CasError);
  assert.equal(await readRef(repo.dir, 'refs/sudus/log'), b);
  await assert.rejects(deleteRefCAS(repo.dir, 'refs/sudus/log', a), CasError);
  await deleteRefCAS(repo.dir, 'refs/sudus/log', b);
  assert.equal(await readRef(repo.dir, 'refs/sudus/log'), null);
});

import { emptyTree, commitTree, catCommit } from '../lib/gitx.mjs';

test('commitTree and catCommit round-trip subject, body and trailers without interpret-trailers', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const tree = await emptyTree(repo.dir);
  assert.equal(tree, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  const body = '{"a":"line\\nbreak","b":[1]}';
  const sha = await commitTree(repo.dir, { tree, parents: [], subject: 'sudus: done slug', body, trailers: [['Sudus-Schema', '1'], ['Sudus-Digest', 'sha256:00']] });
  const c = await catCommit(repo.dir, sha);
  assert.deepEqual([c.tree, c.parents, c.subject, c.body], [tree, [], 'sudus: done slug', body]);
  assert.deepEqual(c.trailers, [['Sudus-Schema', '1'], ['Sudus-Digest', 'sha256:00']]);
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
  await repo.write('.sudus/output/x', 'ignored\n');
  const before = await repo.git('ls-files', '--stage');
  const tree = await writeTreeFromPaths(repo.dir, { paths: ['a.txt', 'b/c.txt', 'run.sh', 'lnk', '.sudus/output/x', 'gone.txt'], exclude: ['.git', '.sudus/output'] });
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
import { readdir, chmod, symlink } from 'node:fs/promises';

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

test('batched hashing matches a real git tree for an executable, a symlink and a path that begins with a double quote', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('bin/run.sh', '#!/bin/sh\n'); await chmod(join(repo.dir, 'bin/run.sh'), 0o755);
  await repo.write('"quoted".txt', 'q\n');
  await repo.write('plain.txt', 'p\n');
  await symlink('plain.txt', join(repo.dir, 'link'));
  await repo.commit('all four');
  const real = (await git(['rev-parse', 'HEAD^{tree}'], { cwd: repo.dir })).stdout.trim();
  const paths = ['bin/run.sh', '"quoted".txt', 'plain.txt', 'link'];
  const tree = (await git(['ls-tree', '-r', 'HEAD'], { cwd: repo.dir })).stdout;
  assert.equal(await treeIdentityReadOnly(repo.dir, { paths, exclude: [] }), real, tree);
  assert.equal(await writeTreeFromPaths(repo.dir, { paths, exclude: [] }), real);
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

// Fix round 2, finding 1 (Important): treeShaFromEntries used to index directories and files by
// path component into plain `{}` objects, so a component literally named '__proto__' or
// 'constructor' -- an ordinary, unremarkable repository path to Git -- either vanished from the
// computed tree ('__proto__' as a file name assigns the object's own prototype instead of
// creating an own property) or was written onto the inherited Object.prototype/Function value
// instead of a fresh object ('constructor', or '__proto__' as a directory). Both produced a wrong
// tree sha; '__proto__' additionally polluted Object.prototype for the rest of the process.
test('a path component named __proto__ or constructor is an ordinary tree entry, not prototype pollution', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('src/a.txt', 'a\n');
  await repo.write('src/__proto__/x.mjs', 'p\n');
  await repo.write('src/constructor/x.mjs', 'c\n');
  await repo.commit('base');
  const protoBefore = { dirs: Object.prototype.dirs, files: Object.prototype.files, keys: Object.keys(Object.prototype).length };
  const paths = ['src/a.txt', 'src/__proto__/x.mjs', 'src/constructor/x.mjs'];
  const written = await writeTreeFromPaths(repo.dir, { paths, exclude: [] });
  const readOnly = await treeIdentityReadOnly(repo.dir, { paths, exclude: [] });
  assert.equal(readOnly, written);
  assert.deepEqual({ dirs: Object.prototype.dirs, files: Object.prototype.files, keys: Object.keys(Object.prototype).length }, protoBefore);
  const entries = await listTree(repo.dir, written);
  assert.deepEqual(entries.map((e) => e.path).sort(), ['src/__proto__/x.mjs', 'src/a.txt', 'src/constructor/x.mjs']);
});
