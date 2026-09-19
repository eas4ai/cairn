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
