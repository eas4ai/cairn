import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/repo.mjs';
import { git, listTree, updateRefCAS, CasError } from '../lib/gitx.mjs';
import { writeWorkspaceSnapshot, readSnapshot, globToRegExp, SnapshotError, KindError, SNAPSHOTS_REF } from '../lib/snapshots.mjs';

const paths = async (repo, sha, kind) => (await listTree(repo.dir, (await readSnapshot(repo.dir, sha, kind)).tree)).map((e) => e.path);

test('globToRegExp: ** spans segments, * and ? stay inside one', () => {
  const m = (p, s) => globToRegExp(p).test(s);
  assert.ok(m('**/.env', '.env') && m('**/.env', 'a/b/.env') && !m('**/.env', '.envrc'));
  assert.ok(m('.github/**', '.github/w/ci.yml') && !m('.github/**', '.githubx'));
  assert.ok(m('config/*.secret.*', 'config/db.secret.json') && !m('config/*.secret.*', 'config/x/db.secret.json'));
  assert.ok(m('a/**/b', 'a/b') && m('a/**/b', 'a/x/y/b') && m('*.pem', 'k.pem') && !m('*.pem', 'd/k.pem'));
});
test('a workspace snapshot holds tracked dirty bytes and untracked files, not .git or .cairn/output, and leaves the index alone', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'clean\n'); await repo.write('.gitignore', 'ignored.log\n.cairn/output/\n'); await repo.commit('base');
  await repo.write('a.txt', 'dirty\n'); await repo.write('new.txt', 'new\n'); await repo.write('ignored.log', 'x'); await repo.write('.cairn/output/o', 'x');
  const before = await repo.git('ls-files', '--stage');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  assert.deepEqual(await paths(repo, sha, 'workspace'), ['.gitignore', 'a.txt', 'new.txt']);
  const s = await readSnapshot(repo.dir, sha, 'workspace');
  assert.deepEqual([s.kind, s.parent, s.payload], ['workspace', null, { kind: 'workspace' }]);
  const blob = (await listTree(repo.dir, s.tree)).find((e) => e.path === 'a.txt').sha;
  assert.equal((await git(['cat-file', 'blob', blob], { cwd: repo.dir })).stdout, 'dirty\n');
  assert.equal(await repo.git('ls-files', '--stage'), before);
  assert.equal(await repo.git('rev-parse', SNAPSHOTS_REF), sha);
  const second = await writeWorkspaceSnapshot(repo.dir);
  assert.equal((await readSnapshot(repo.dir, second, 'workspace')).parent, sha);
});
test('the kind is checked at every reference', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a\n'); await repo.commit('base');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  await assert.rejects(readSnapshot(repo.dir, sha, 'input'), KindError);
  await assert.rejects(readSnapshot(repo.dir, await repo.readRef('HEAD'), 'workspace'), KindError);
});
test('a snapshot refuses untracked credential paths and network_exclude matches, by entry path only', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('.env', 'TRACKED=1\n'); await repo.commit('tracked env is the developer\'s choice');
  await writeWorkspaceSnapshot(repo.dir);
  for (const p of ['.env.local', 'deploy/id_rsa', 'certs/x.pem', 'k.p12', 'k.pfx', 'k.key']) {
    await repo.write(p, 'secret');
    await assert.rejects(writeWorkspaceSnapshot(repo.dir), (e) => e instanceof SnapshotError && e.message.includes(p));
    await repo.git('clean', '-fdq');
  }
  await repo.write('fixtures/private/a.json', '{}');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir, { exclude: ['fixtures/private/**'] }), /fixtures\/private\/a.json/);
  await repo.git('clean', '-fdq');
  await repo.link('notes.txt', '../elsewhere/secret.pem');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  assert.ok((await paths(repo, sha, 'workspace')).includes('notes.txt'));
  await repo.link('leak.pem', 'README');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir), /leak.pem/);
});
test('the snapshots ref refuses a stale old OID', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a\n'); await repo.commit('base');
  const s1 = await writeWorkspaceSnapshot(repo.dir);
  await repo.write('a.txt', 'b\n');
  const s2 = await writeWorkspaceSnapshot(repo.dir);
  await assert.rejects(updateRefCAS(repo.dir, SNAPSHOTS_REF, s1, s1), CasError);
  assert.equal(await repo.git('rev-parse', SNAPSHOTS_REF), s2);
});
