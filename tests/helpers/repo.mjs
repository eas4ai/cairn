import { mkdtemp, mkdir, writeFile, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', HOME: tmpdir() };

export async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'cairn-test-'));
  const git = async (...args) => (await run('git', args, { cwd: dir, env: ENV })).stdout.trim();
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.name', 'Cairn Test');
  await git('config', 'user.email', 'test@example.invalid');
  await git('config', 'commit.gpgsign', 'false');
  const write = async (path, content, { mode } = {}) => {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
    if (mode) await chmod(full, mode);
    return full;
  };
  const link = async (path, target) => {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await symlink(target, full);
  };
  const commit = async (message = 'work') => {
    await git('add', '-A');
    await git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const readRef = async (ref) => { try { return await git('rev-parse', '--verify', '--quiet', ref); } catch { return null; } };
  const remove = () => rm(dir, { recursive: true, force: true });
  return { dir, git, write, link, commit, readRef, remove };
}

// tests/helpers/repo.mjs (append)
import { init, DEFAULT_SETTINGS } from '../../lib/init.mjs';
import { authorize } from '../../lib/auth.mjs';

const yes = async () => true;
// Deviation from the plan text: authorize() (Task 4) refuses without AGENTS.md and docs/spec, but
// the plan's own makeProject code writes neither by default, so its own Task 9 test's p.authorize()
// call would throw. Every later plan is told to build fixtures on makeProject and expects an
// authorize-able project, so a minimal default AGENTS.md and docs/spec/overview.md are written
// unless the caller's own `files` supply them (files wins the merge below).
const DEFAULT_PROJECT_FILES = { 'AGENTS.md': '# Working agreement\n', 'docs/spec/overview.md': '# Keystone\n' };

export async function makeProject({ settings = {}, files = {} } = {}) {
  const repo = await makeRepo();
  const remote = await mkdtemp(join(tmpdir(), 'cairn-remote-'));
  await run('git', ['init', '-q', '--bare', remote]);
  await repo.git('remote', 'add', 'origin', remote);
  const merged = { ...DEFAULT_SETTINGS('origin', null), ...settings };
  await repo.write('.cairn/settings.json', JSON.stringify(merged, null, 2) + '\n');
  for (const [path, content] of Object.entries({ ...DEFAULT_PROJECT_FILES, ...files })) await repo.write(path, content);
  await repo.commit('fixture');
  await init(repo.dir, { confirmRemote: async () => 'origin', chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  const remove = async () => { await repo.remove(); await rm(remote, { recursive: true, force: true }); };
  return {
    cwd: repo.dir, dir: repo.dir, git: repo.git, write: repo.write, commit: repo.commit, readRef: repo.readRef,
    authorize: () => authorize(repo.dir, { confirm: yes }),
    cleanup: remove, remove,
  };
}
