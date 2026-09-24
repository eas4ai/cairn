import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/repo.mjs';
import { join } from 'node:path';
import { git, emptyTree, listTree, updateRefCAS, CasError } from '../lib/gitx.mjs';
import { sha256 } from '../lib/canon.mjs';
import { writeWorkspaceSnapshot, writeWorkspaceSnapshotFromTree, readSnapshot, globToRegExp, SnapshotError, KindError, SNAPSHOTS_REF } from '../lib/snapshots.mjs';
import { writeTreeFromPaths } from '../lib/gitx.mjs';

const paths = async (repo, sha, kind) => (await listTree(repo.dir, (await readSnapshot(repo.dir, sha, kind)).tree)).map((e) => e.path);

// Builds a snapshot commit with a chosen body and trailers directly, bypassing writeWorkspaceSnapshot,
// so envelope violations (bad digest, noncanonical JSON) can be tested the same way tests/records.test.mjs does.
async function rawSnapshotCommit(repo, subject, body, trailers) {
  const tree = await emptyTree(repo.dir);
  const head = Buffer.from(`tree ${tree}\nauthor A <a@b.c> 0 +0000\ncommitter A <a@b.c> 0 +0000\n\n`);
  const message = Buffer.concat([Buffer.from(`${subject}\n\n`), Buffer.from(body), Buffer.from('\n\n' + trailers.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n')]);
  const r = await git(['hash-object', '-t', 'commit', '-w', '--literally', '--stdin'], { cwd: repo.dir, input: Buffer.concat([head, message]) });
  return r.stdout.trim();
}

test('globToRegExp: ** spans segments, * and ? stay inside one', () => {
  const m = (p, s) => globToRegExp(p).test(s);
  assert.ok(m('**/.env', '.env') && m('**/.env', 'a/b/.env') && !m('**/.env', '.envrc'));
  assert.ok(m('.github/**', '.github/w/ci.yml') && !m('.github/**', '.githubx'));
  assert.ok(m('config/*.secret.*', 'config/db.secret.json') && !m('config/*.secret.*', 'config/x/db.secret.json'));
  assert.ok(m('a/**/b', 'a/b') && m('a/**/b', 'a/x/y/b') && m('*.pem', 'k.pem') && !m('*.pem', 'd/k.pem'));
});
test('a workspace snapshot holds tracked dirty bytes and untracked files, not .git or .sudus/output, and leaves the index alone', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'clean\n'); await repo.write('.gitignore', 'ignored.log\n.sudus/output/\n'); await repo.commit('base');
  await repo.write('a.txt', 'dirty\n'); await repo.write('new.txt', 'new\n'); await repo.write('ignored.log', 'x'); await repo.write('.sudus/output/o', 'x');
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
test('readSnapshot checks the same integrity envelope as decodeRecord: digest mismatch and noncanonical JSON are both refused', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const goodBody = '{"kind":"workspace"}';
  const badDigest = await rawSnapshotCommit(repo, 'sudus: snapshot workspace', goodBody, [['Sudus-Schema', '1'], ['Sudus-Digest', sha256('other')]]);
  await assert.rejects(readSnapshot(repo.dir, badDigest, 'workspace'), (e) => e instanceof SnapshotError && /digest/.test(e.message));
  const nonCanonBody = '{"kind": "workspace"}';
  const nonCanon = await rawSnapshotCommit(repo, 'sudus: snapshot workspace', nonCanonBody, [['Sudus-Schema', '1'], ['Sudus-Digest', sha256(nonCanonBody)]]);
  await assert.rejects(readSnapshot(repo.dir, nonCanon, 'workspace'), (e) => e instanceof SnapshotError && /noncanonical/.test(e.message));
});
test('a snapshot refuses untracked credential paths and network_exclude matches, by entry path only', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('.env', 'TRACKED=1\n'); await repo.commit('tracked env is the developer\'s choice');
  await writeWorkspaceSnapshot(repo.dir);
  for (const p of ['.env.local', 'deploy/id_rsa', 'certs/x.pem', 'k.p12', 'k.pfx', 'k.key', 'deploy/id_ed25519_sk']) {
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

import { appendRecord, readLog } from '../lib/records.mjs';
import { writeInputSnapshot, allowedBase } from '../lib/snapshots.mjs';
const D = 'sha256:' + 'b'.repeat(64);

test('an input snapshot holds exactly the declared inputs, tracked or untracked', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('src/a.js', '1'); await repo.write('src/b.js', '2'); await repo.write('README.md', 'r'); await repo.commit('base');
  await repo.write('src/c.js', '3'); await repo.write('tests/t.js', 't');
  const sha = await writeInputSnapshot(repo.dir, { mechanism: 'unit', inputs: ['src', 'tests/t.js'] });
  assert.deepEqual(await paths(repo, sha, 'input'), ['src/a.js', 'src/b.js', 'src/c.js', 'tests/t.js']);
  assert.deepEqual((await readSnapshot(repo.dir, sha, 'input')).payload, { kind: 'input', mechanism: 'unit', inputs: ['src', 'tests/t.js'] });
  await assert.rejects(readSnapshot(repo.dir, sha, 'workspace'), KindError);
  await repo.write('src/.env', 'x');
  await assert.rejects(writeInputSnapshot(repo.dir, { mechanism: 'unit', inputs: ['src'] }), SnapshotError);
  await assert.rejects(writeInputSnapshot(repo.dir, { mechanism: 'unit', inputs: [] }), SnapshotError);
});
test('allowedBase is the newest start or scope snapshot, never merely the newest snapshot', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), null);
  const A = await writeWorkspaceSnapshot(repo.dir);
  // Deviation from the plan text (plan 06 carried obligation): 'start' now closes with
  // intent/results, the same as 'promotion' and 'superseded'; this fixture payload needs both.
  await appendRecord(repo.dir, 'start', 's', { slug: 's', snapshot: A, requirements: [], from_superseded: null, intent: null, results: [] });
  await repo.write('a.txt', 'b'); const B = await writeWorkspaceSnapshot(repo.dir);
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), A);
  await appendRecord(repo.dir, 'scope-breach', 'a.txt', { path: 'a.txt', snapshot: B, base: A, declarations_digest: D });
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), A);
  const log = await readLog(repo.dir);
  await appendRecord(repo.dir, 'scope', 'a.txt', { breach: log.at(-1).sha, disposition: 'keep', snapshot: B, escalation: null, answer: null });
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), B);
  const I = await writeInputSnapshot(repo.dir, { mechanism: 'm', inputs: ['a.txt'] });
  await appendRecord(repo.dir, 'start', 'bad', { slug: 'bad', snapshot: I, requirements: [], from_superseded: null, intent: null, results: [] });
  await assert.rejects(allowedBase(repo.dir, await readLog(repo.dir)), KindError);
});

// Fix round 1 item 7 (Minor): a record with a 40-hex snapshot field used to overwrite the base
// outright, so a record naming an older snapshot than the one already established could move the
// allowed base backward. A resolution record is used here since it carries a bare snapshot field
// with no further meaning the loop needs.
test('a record naming an older snapshot never moves the allowed base backward', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  const A = await writeWorkspaceSnapshot(repo.dir);
  await appendRecord(repo.dir, 'start', 's', { slug: 's', snapshot: A, requirements: [], from_superseded: null, intent: null, results: [] });
  await repo.write('a.txt', 'b'); const B = await writeWorkspaceSnapshot(repo.dir);
  await appendRecord(repo.dir, 'scope-breach', 'a.txt', { path: 'a.txt', snapshot: B, base: A, declarations_digest: D });
  const breachSha = (await readLog(repo.dir)).at(-1).sha;
  await appendRecord(repo.dir, 'scope', 'a.txt', { breach: breachSha, disposition: 'keep', snapshot: B, escalation: null, answer: null });
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), B);
  await appendRecord(repo.dir, 'resolution', 'x', { source: breachSha, finding: 1, snapshot: A, explanation: 'names an older snapshot on purpose' });
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), B);
});

import { SettingsError } from '../lib/settings.mjs';
import { writeInputSnapshot as writeInput } from '../lib/snapshots.mjs';
import { PathError } from '../lib/paths.mjs';

test('snapshots refuse untracked paths matched by settings network_exclude', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const settings = { schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: ['fixtures/private/**'], signing_key: null, attribution: 'forbidden', developer: 'present', harness: {}, typesafeai: { enabled: false, model: null, weights: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, agent_ceiling: 0.35, confidence_floors: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };
  await repo.write('.sudus/settings.json', JSON.stringify(settings)); await repo.write('a.txt', 'a'); await repo.commit('base');
  await repo.write('fixtures/private/k.json', '{}');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir), /fixtures\/private\/k.json \(matches fixtures\/private\/\*\*\)/);
  await assert.rejects(writeInput(repo.dir, { mechanism: 'm', inputs: ['fixtures'] }), /fixtures\/private\/k.json/);
  assert.match(await writeWorkspaceSnapshot(repo.dir, { exclude: [] }), /^[0-9a-f]{40}$/);
  await repo.write('.sudus/settings.json', '{"schema":2}');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir), SettingsError);
});
// Carried from plan 01's review: writeInputSnapshot passes inputs straight into `git ls-files` as
// a pathspec, so pathspec magic such as `:(exclude)` or `:!` would change what a snapshot contains.
// validatePath refuses a leading colon, so this must be refused before it reaches git.
test('writeInputSnapshot refuses an input that begins with a colon before it reaches the pathspec', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  await assert.rejects(writeInput(repo.dir, { mechanism: 'm', inputs: [':(exclude)a.txt'] }), PathError);
  await assert.rejects(writeInput(repo.dir, { mechanism: 'm', inputs: ['a.txt', ':!b.txt'] }), PathError);
});
// Q9: an input is passed to git as a literal path (:(literal)<path>), never a wildcard pathspec,
// so a file literally named 'a*b' cannot be widened by git into matching every file that happens
// to start with 'a' and end with 'b'.
test('writeInputSnapshot treats an input as a literal path, not a glob pattern', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a*b', 'literal'); await repo.write('axyzb', 'glob-lookalike'); await repo.commit('base');
  const sha = await writeInput(repo.dir, { mechanism: 'm', inputs: ['a*b'] });
  assert.deepEqual(await paths(repo, sha, 'input'), ['a*b']);
});

// Fix round 2 finding 3: writeWorkspaceSnapshotFromTree commits exactly the tree it is given,
// rather than re-reading the working tree itself the way writeWorkspaceSnapshot does -- so a
// caller that already built a tree for some other comparison (lib/commitment.mjs's
// realizationDelta) can commit precisely that tree, guaranteeing the durable snapshot is the same
// tree any check already ran against, not a second, independent re-read of a live working tree.
test('writeWorkspaceSnapshotFromTree commits exactly the given tree as a workspace snapshot', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'one\n'); await repo.commit('base');
  const tree = await writeTreeFromPaths(repo.dir, { paths: ['a.txt'], exclude: [] });
  const sha = await writeWorkspaceSnapshotFromTree(repo.dir, tree);
  const snap = await readSnapshot(repo.dir, sha, 'workspace');
  assert.equal(snap.kind, 'workspace');
  assert.equal(snap.tree, tree);
  // Dirtying the working tree after building `tree` must not change what got committed: the
  // function never re-reads the working tree itself.
  await repo.write('a.txt', 'two\n');
  const tree2 = await writeTreeFromPaths(repo.dir, { paths: ['a.txt'], exclude: [] });
  assert.notEqual(tree2, tree);
  const sha2 = await writeWorkspaceSnapshotFromTree(repo.dir, tree);
  assert.equal((await readSnapshot(repo.dir, sha2, 'workspace')).tree, tree, 'still the original tree, not a re-read of the now-dirty working tree');
});

// Review of 3.5.0: git hash-object --stdin-paths reads one path per line, so a file whose name
// has a newline in it broke every workspace snapshot of that project.
test('a workspace snapshot holds a file whose name has a newline', async () => {
  const repo = await makeRepo();
  await repo.write('a.txt', 'a\n');
  await repo.write('odd\nname.txt', 'b\n');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  const s = await readSnapshot(repo.dir, sha, 'workspace');
  assert.deepEqual((await listTree(repo.dir, s.tree)).map((e) => e.path).sort(), ['a.txt', 'odd\nname.txt']);
});

// Issue #19: git lists an untracked nested repository or worktree (an agent's worktree under
// .claude/worktrees/) as one directory entry, and hashing it failed every command. A tracked
// submodule failed the same way. The first is not project content; the second is a gitlink.
import { workspaceDelta } from '../lib/scope.mjs';
test('an untracked nested worktree is left out of the snapshot and the delta', async () => {
  const repo = await makeRepo();
  await repo.write('a.txt', 'a\n');
  await repo.commit('base');
  await repo.git('worktree', 'add', '-q', '.claude/worktrees/x', 'HEAD');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  const tree = (await readSnapshot(repo.dir, sha, 'workspace')).tree;
  assert.deepEqual((await listTree(repo.dir, tree)).map((e) => e.path), ['a.txt']);
  assert.deepEqual(await workspaceDelta(repo.dir, tree), []);
});
test('a tracked submodule is a gitlink at its checked-out HEAD in the snapshot and the delta', async () => {
  const inner = await makeRepo();
  await inner.write('i.txt', 'i\n');
  const first = await inner.commit('inner');
  const repo = await makeRepo();
  await repo.write('a.txt', 'a\n');
  await repo.commit('base');
  await repo.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner.dir, 'sub');
  await repo.commit('add the submodule');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  const tree = (await readSnapshot(repo.dir, sha, 'workspace')).tree;
  assert.deepEqual((await listTree(repo.dir, tree)).find((e) => e.path === 'sub'), { path: 'sub', mode: '160000', sha: first });
  assert.deepEqual(await workspaceDelta(repo.dir, tree), []);
  await git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'moved'], { cwd: join(repo.dir, 'sub') });
  const moved = (await git(['rev-parse', 'HEAD'], { cwd: join(repo.dir, 'sub') })).stdout.trim();
  assert.deepEqual(await workspaceDelta(repo.dir, tree), [{ path: 'sub', change: 'modified', mode: '160000', sha: moved }]);
});
