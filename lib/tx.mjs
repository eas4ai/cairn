// lib/tx.mjs
import { openSync, writeSync, closeSync, renameSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gitPath, git, readRef, catCommit } from './gitx.mjs';
import { canonicalize, sha256, ulid } from './canon.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';

export class TxError extends Error { constructor(m) { super(m); this.name = 'TxError'; } }
export class TxConflict extends TxError { constructor(m) { super(m); this.name = 'TxConflict'; } }
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

async function headSha(cwd) { const r = await git(['rev-parse', '--verify', '-q', 'HEAD'], { cwd }); return r.code === 0 ? r.stdout.trim() : null; }
function fileDigest(cwd, p) { const a = join(cwd, p); return existsSync(a) ? sha256(readFileSync(a)) : null; }

export async function preIdentities(cwd, plan) {
  const files = {};
  for (const w of plan.writes) if (w.store === 'file') files[w.path] = fileDigest(cwd, w.path);
  return { refs: { 'refs/cairn/log': await readRef(cwd, 'refs/cairn/log'), 'refs/cairn/snapshots': await readRef(cwd, 'refs/cairn/snapshots') },
    head: await headSha(cwd), files };
}

function conflict(tx, what, actual, pre, planned) {
  return new TxConflict(`cairn: transaction ${tx} cannot complete: ${what} is ${actual}, expected ${pre} or ${planned}; restore it to ${pre} then run cairn recover ${tx}`);
}

function markDone(dir, n, value) { writeAtomic(join(dir, 'done', String(n)), value); }

export async function applyWrites(cwd, s) {
  const tx = s.dir.split('/').at(-1);
  const results = [];
  for (let n = 0; n < s.plan.writes.length; n++) {
    const w = s.plan.writes[n];
    if (s.done[n] !== undefined) { results.push(s.done[n]); continue; }
    let out;
    if (w.store === 'file') {
      const cur = fileDigest(cwd, w.path);
      if (cur !== w.digest) {
        if (cur !== s.pre.files[w.path]) throw conflict(tx, w.path, cur, s.pre.files[w.path], w.digest);
        writeAtomic(join(cwd, w.path), s.bytes(n));
      }
      out = w.digest;
    } else if (w.store === 'branch') {
      const head = await headSha(cwd);
      const prevBranch = results.findLast?.((r, i) => s.plan.writes[i].store === 'branch') ?? null;
      const expected = prevBranch ?? s.pre.head;
      if (head !== expected) {
        const c = head ? await catCommit(cwd, head) : null;
        if (!(c && c.subject === w.message && c.parents[0] === expected)) throw conflict(tx, 'HEAD', head, expected, `a commit "${w.message}" on ${expected}`);
        out = head;
      } else {
        await git(['add', '--', ...w.paths], { cwd });
        await git(['commit', '-q', '--allow-empty', '-m', w.message], { cwd });
        out = await headSha(cwd);
      }
    } else if (w.store === 'snapshot') {
      out = await writeWorkspaceSnapshot(cwd);
    } else if (w.store === 'log') {
      const log = await readLog(cwd);
      const after = s.intentSha ? log.slice(log.findIndex((r) => r.sha === s.intentSha) + 1) : log;
      const same = after.find((r) => r.kind === w.kind && r.target === w.target && canonicalize(r.payload) === canonicalize(w.payload));
      out = same ? same.sha : await appendRecord(cwd, w.kind, w.target, w.payload);
    } else throw new TxError(`cairn: unknown store ${w.store}`);
    markDone(s.dir, n, out);
    results.push(out);
  }
  return results;
}
