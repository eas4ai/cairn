import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeRepo, makeProject } from './helpers/repo.mjs';
import { git, readRef } from '../lib/gitx.mjs';
import { init, DEFAULT_SETTINGS } from '../lib/init.mjs';
import { authorize } from '../lib/auth.mjs';
import { start } from '../lib/commitment.mjs';
import { appendRecord } from '../lib/records.mjs';
import { wake } from '../lib/wake.mjs';
import {
  installRefspecs, refspecsFor, DURABLE_REFS, TravelError,
  fetchCommand, missingRefsLine,
  push, remoteOids, PUSH_COMMAND,
  validateAfterFetch,
  AGREEMENT_PUSH_TEXT,
} from '../lib/travel.mjs';
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// A bare repository that stands in for the authority remote.
function makeRemote() {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-remote-'));
  sh(dir, 'init', '--bare', '-q', '--initial-branch=main');
  return dir;
}

// Deviation from the plan text: the plan's own `project()` built directly on plan 03's
// makeProject({settings: {authority_remote: authority}}), which writes .cairn/settings.json (and
// runs `cairn init`, which loads and validates it) *before* the caller has any chance to `git
// remote add <authority>`. lib/settings.mjs's validateSettings (already committed, plan 02)
// refuses an authority_remote that is not a currently configured remote
// ("authority remote <x> is not a configured remote"), so that ordering throws inside makeProject
// itself as soon as `authority` is anything other than the 'origin' remote makeProject always
// configures first. This project() instead builds the repository by hand, in the order settings
// validation actually needs: add the authority and public remotes first, then write settings
// naming the now-real authority remote, then run cairn init and cairn authorize (both imported
// directly from lib/init.mjs and lib/auth.mjs, the same functions makeProject itself calls) so
// `start()` (which every later task's fixture needs) has a current authorization to check against.
async function project({ remote = makeRemote(), authority = 'authority' } = {}) {
  const repo = await makeRepo();
  sh(repo.dir, 'remote', 'add', authority, remote);
  sh(repo.dir, 'remote', 'add', 'public', makeRemote());
  const settings = DEFAULT_SETTINGS(authority, null);
  await repo.write('.cairn/settings.json', JSON.stringify(settings, null, 2) + '\n');
  await repo.write('AGENTS.md', '# Working agreement\n\nRun cairn wake.\n');
  await repo.write('docs/spec/overview.md', '# Keystone\n');
  await repo.write('docs/spec/roadmap.md', 'Current: first-slug\n\n## first-slug\n\nRequirements: \n\n## second-slug\n\nRequirements: \n');
  await repo.write('README.md', 'hello\n');
  await repo.commit('fixture');
  const yes = async () => true;
  await init(repo.dir, { confirmRemote: async () => authority, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  await authorize(repo.dir, { confirm: yes });
  return { cwd: repo.dir, remote, authority };
}
async function started() {
  const p = await project();
  await start(p.cwd, 'first-slug');
  return p;
}
// A pre-receive hook that refuses any push carrying more than one ref, or any ref matching `reject`.
function hook(remote, { multi = true, reject = null } = {}) {
  mkdirSync(join(remote, 'hooks'), { recursive: true });
  const body = `#!/bin/sh\nn=0\nwhile read old new ref; do n=$((n+1)); case "$ref" in ${reject ?? '__none__'}) echo "refused $ref" >&2; exit 1;; esac; done\n${multi ? 'if [ $n -gt 1 ]; then echo "one ref at a time" >&2; exit 1; fi\n' : ''}exit 0\n`;
  writeFileSync(join(remote, 'hooks/pre-receive'), body); chmodSync(join(remote, 'hooks/pre-receive'), 0o755);
}
const remoteRef = (remote, ref) => { try { return sh(remote, 'rev-parse', '--verify', '-q', ref); } catch { return null; } };

describe('refspecs', () => {
  test('the exact fetch and push refspecs, one per durable ref', () => {
    assert.deepEqual(DURABLE_REFS, ['refs/cairn/log', 'refs/cairn/snapshots']);
    assert.deepEqual(refspecsFor(), {
      fetch: ['refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'],
      push: ['refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'],
    });
  });
  test('installRefspecs writes them on the authority remote only and is idempotent', async () => {
    const { cwd } = await project();
    await installRefspecs(cwd, 'authority'); await installRefspecs(cwd, 'authority');
    const fetch = sh(cwd, 'config', '--get-all', 'remote.authority.fetch').split('\n');
    const push = sh(cwd, 'config', '--get-all', 'remote.authority.push').split('\n');
    assert.deepEqual(fetch, ['+refs/heads/*:refs/remotes/authority/*', ...refspecsFor().fetch]);
    assert.deepEqual(push, refspecsFor().push);
    assert.throws(() => sh(cwd, 'config', '--get-all', 'remote.public.push'), 'the public remote gets nothing');
    assert.ok(!sh(cwd, 'config', '--get-all', 'remote.public.fetch').includes('cairn'));
  });
  test('null remote is a no-op; an unknown remote is refused', async () => {
    const { cwd } = await project();
    await installRefspecs(cwd, null);
    assert.throws(() => sh(cwd, 'config', '--get-all', 'remote.authority.push'));
    await assert.rejects(installRefspecs(cwd, 'nowhere'), (e) => e instanceof TravelError && /cairn: remote nowhere/.test(e.message));
  });
  test('cairn start installs the refspecs on the configured authority remote', async () => {
    const { cwd } = await project();
    await start(cwd, 'first-slug');
    assert.deepEqual(sh(cwd, 'config', '--get-all', 'remote.authority.push').split('\n'), refspecsFor().push);
  });
  test('the action lease never gets a refspec', async () => {
    const { cwd } = await project();
    await installRefspecs(cwd, 'authority');
    assert.ok(!sh(cwd, 'config', '--get-all', 'remote.authority.push').includes('in-progress'));
  });
});

describe('clone without the durable refs', () => {
  test('fetchCommand is the exact two-line text from section 4', () => {
    assert.equal(fetchCommand('origin'), "git fetch origin 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'");
  });
  test('a fresh clone gets the line and exit 3; after the fetch it does not', async () => {
    const { cwd, remote } = await project();
    await start(cwd, 'first-slug');
    sh(cwd, 'push', '-q', 'authority', 'main', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    assert.equal(await missingRefsLine(clone), fetchCommand('authority'));
    const v = await wake(clone);
    assert.equal(v.exit, 3); assert.equal(v.line, fetchCommand('authority'));
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    assert.equal(await missingRefsLine(clone), null);
    assert.equal((await wake(clone)).exit, undefined);
  });
  test('local-only project without refs names cairn init', async () => {
    const { cwd } = await makeProject({ settings: { authority_remote: null } });
    sh(cwd, 'update-ref', '-d', 'refs/cairn/log');
    assert.match(await missingRefsLine(cwd), /^cairn init/);
  });
});

describe('push', () => {
  test('atomic push advances the branch and both durable refs, never the lease', async () => {
    const { cwd, remote } = await started();
    const r = await push(cwd);
    assert.equal(r.mode, 'atomic');
    assert.deepEqual(r.pushed, ['refs/cairn/snapshots', 'refs/cairn/log', 'refs/heads/main']);
    for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots', 'refs/heads/main']) assert.equal(remoteRef(remote, ref), await readRef(cwd, ref));
    assert.equal(remoteRef(remote, 'refs/cairn/in-progress'), null);
  });
  test('ordered fallback when the remote refuses a multi-ref push: snapshots, log, branch', async () => {
    const { cwd, remote } = await started();
    hook(remote, { multi: true });
    const r = await push(cwd);
    assert.equal(r.mode, 'ordered');
    assert.deepEqual(r.pushed, ['refs/cairn/snapshots', 'refs/cairn/log', 'refs/heads/main']);
    for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots', 'refs/heads/main']) assert.equal(remoteRef(remote, ref), await readRef(cwd, ref));
  });
  test('a failure stops the ordered sequence and the branch is not advanced without its records', async () => {
    const { cwd, remote } = await started();
    hook(remote, { multi: true, reject: 'refs/cairn/log' });
    await assert.rejects(push(cwd), (e) => /cairn: push of refs\/cairn\/log failed after refs\/cairn\/snapshots/.test(e.message));
    assert.equal(remoteRef(remote, 'refs/cairn/snapshots'), await readRef(cwd, 'refs/cairn/snapshots'));
    assert.equal(remoteRef(remote, 'refs/cairn/log'), null);
    assert.equal(remoteRef(remote, 'refs/heads/main'), null);
  });
  test('the expected remote OID is the lease: a remote advanced by another clone refuses the push untouched', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const other = mkdtempSync(join(tmpdir(), 'cairn-other-'));
    sh(other, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(other, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    await appendRecord(other, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'from the other clone' });
    sh(other, 'push', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    const remoteLog = remoteRef(remote, 'refs/cairn/log');
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'from this clone' });
    await assert.rejects(push(cwd), /refs\/cairn\/log on authority is ahead of this clone; run: git fetch authority refs\/cairn\/log:refs\/cairn\/log/);
    assert.equal(remoteRef(remote, 'refs/cairn/log'), remoteLog, 'the remote log did not move');
  });
  test('a race at the same base loses at the remote, not silently', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const other = mkdtempSync(join(tmpdir(), 'cairn-other-'));
    sh(other, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(other, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    await appendRecord(other, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'a' });
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'b' });
    const oids = await remoteOids(cwd, 'authority', ['refs/cairn/log']);
    sh(other, 'push', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');   // wins the race after our ls-remote
    const r = await git(['push', '--atomic', `--force-with-lease=refs/cairn/log:${oids['refs/cairn/log']}`, 'authority', 'refs/cairn/log:refs/cairn/log'], { cwd, expect: [0, 1, 128] });
    assert.match(String(r.stderr), /stale info|rejected/);
  });
  test('no authority remote: refused', async () => {
    const { cwd } = await makeProject({ settings: { authority_remote: null } });
    await assert.rejects(push(cwd), /cairn: no authority remote/);
  });
  test('PUSH_COMMAND is cairn push', () => assert.equal(PUSH_COMMAND, 'cairn push'));
});

describe('validateAfterFetch', () => {
  test('a consistent clone has no repairs', async () => {
    const { cwd } = await started();
    assert.deepEqual(await validateAfterFetch(cwd), []);
  });
  test('log fetched without snapshots: names the snapshot fetch', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    sh(clone, 'update-ref', 'refs/cairn/snapshots', sh(cwd, 'rev-parse', 'refs/cairn/snapshots^'));  // an older snapshot root, fetched by hand
    const repairs = await validateAfterFetch(clone);
    assert.equal(repairs.length, 1);
    assert.deepEqual([repairs[0].kind, repairs[0].ref, repairs[0].command], ['fetch', 'refs/cairn/snapshots', 'git fetch authority refs/cairn/snapshots:refs/cairn/snapshots']);
  });
  test('branch ahead of the log: Current names a slug with no start on the remote log; the repair is a push from the writer', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    writeFileSync(join(cwd, 'docs/spec/roadmap.md'), 'Current: second-slug\n\n## second-slug\nRequirements: \n');
    sh(cwd, 'add', '-A'); sh(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'move current by hand');
    sh(cwd, 'push', '-q', 'authority', 'main');   // a bypassing ordinary Git push
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    const repairs = await validateAfterFetch(clone);
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].kind, 'push'); assert.equal(repairs[0].ref, 'refs/cairn/log');
    assert.match(repairs[0].command, /^cairn push  \(in the clone that wrote the start record for second-slug\)$/);
  });
  test('branch behind the log is safe', async () => {
    const { cwd } = await started();
    await push(cwd);
    await writeWorkspaceSnapshot(cwd);
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'later' });
    assert.deepEqual(await validateAfterFetch(cwd), []);
  });
  test('wake prints the first repair and exits 3', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    sh(clone, 'update-ref', 'refs/cairn/snapshots', sh(cwd, 'rev-parse', 'refs/cairn/snapshots^'));
    const v = await wake(clone);
    assert.equal(v.exit, 3); assert.equal(v.line, 'git fetch authority refs/cairn/snapshots:refs/cairn/snapshots');
  });
});

describe('working agreement text', () => {
  test('the push paragraph names the command, the three refs, atomicity, the order and the lease', () => {
    assert.equal(AGREEMENT_PUSH_TEXT, [
      'Push with `cairn push`. It pushes the branch, `refs/cairn/log` and',
      '`refs/cairn/snapshots` to the authority remote in one atomic push where the',
      'remote supports it; otherwise snapshots first, log second and branch last,',
      'and a failure stops the sequence. Each ref carries the expected remote OID',
      'as a lease, so a clone that is behind is refused and told what to fetch.',
      'Never push `refs/cairn/*` with plain `git push`; after any fetch, `cairn',
      'wake` checks the records against the code and names the exact repair.',
    ].join('\n'));
    assert.ok(/^[\x20-\x7e\n]+$/.test(AGREEMENT_PUSH_TEXT), 'ASCII only');
  });
});
