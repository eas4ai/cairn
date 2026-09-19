import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeRepo, makeProject } from './helpers/repo.mjs';
import { init, DEFAULT_SETTINGS } from '../lib/init.mjs';
import { authorize } from '../lib/auth.mjs';
import { start } from '../lib/commitment.mjs';
import { wake } from '../lib/wake.mjs';
import { installRefspecs, refspecsFor, DURABLE_REFS, TravelError, fetchCommand, missingRefsLine } from '../lib/travel.mjs';

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
