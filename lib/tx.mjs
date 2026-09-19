// lib/tx.mjs
import { openSync, writeSync, closeSync, renameSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gitPath } from './gitx.mjs';
import { canonicalize, sha256, ulid } from './canon.mjs';

export class TxError extends Error { constructor(m) { super(m); this.name = 'TxError'; } }
export const MULTI_STORE = new Set(['start', 'promote', 'supersede', 'authorize']);

export function writeAtomic(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${ulid()}.tmp`;
  const fd = openSync(tmp, 'w'); writeSync(fd, bytes); closeSync(fd);
  renameSync(tmp, path);
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

export async function acquireLock(cwd, tx) {
  const lock = await gitPath(cwd, 'cairn-tx.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, 'wx'); writeSync(fd, `${process.pid} ${tx}`); closeSync(fd);
      return () => { try { unlinkSync(lock); } catch {} };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const [pid, holder] = readFileSync(lock, 'utf8').split(' ');
      if (alive(Number(pid))) throw new TxError(`cairn: transaction ${holder} holds cairn-tx.lock (pid ${pid} alive); wait or run cairn recover ${holder}`);
      unlinkSync(lock);
    }
  }
  throw new TxError('cairn: could not take cairn-tx.lock');
}

export async function stagingDir(cwd, tx) { return gitPath(cwd, `cairn-tx/${tx}`); }

export async function stage(cwd, tx, plan, pre) {
  const dir = await stagingDir(cwd, tx);
  mkdirSync(join(dir, 'bytes'), { recursive: true });
  const writes = plan.writes.map((w, n) => {
    if (w.store !== 'file') return w;
    writeAtomic(join(dir, 'bytes', String(n)), w.bytes);
    return { store: 'file', path: w.path, digest: sha256(w.bytes) };
  });
  writeAtomic(join(dir, 'plan.json'), canonicalize({ identity: plan.identity, writes, terminal: plan.terminal }));
  writeAtomic(join(dir, 'pre.json'), canonicalize(pre));
  return dir;
}

export async function readStaging(cwd, tx) {
  const dir = await stagingDir(cwd, tx);
  if (!existsSync(join(dir, 'plan.json'))) return null;
  const done = {};
  if (existsSync(join(dir, 'done'))) for (const n of readdirSync(join(dir, 'done'))) done[n] = readFileSync(join(dir, 'done', n), 'utf8');
  return { dir, plan: JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')), pre: JSON.parse(readFileSync(join(dir, 'pre.json'), 'utf8')),
    bytes: (n) => readFileSync(join(dir, 'bytes', String(n))),
    intentSha: existsSync(join(dir, 'intent')) ? readFileSync(join(dir, 'intent'), 'utf8') : null, done };
}
