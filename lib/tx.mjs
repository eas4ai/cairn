// lib/tx.mjs
import { openSync, writeSync, closeSync, renameSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gitPath, git, readRef, catCommit } from './gitx.mjs';
import { canonicalize, sha256, ulid } from './canon.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { validatePath, assertInside } from './paths.mjs';

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

// Fix round 1 finding 10: a lock-file read between another process's `wx` failure and its own
// unlink (the holder released it right after we saw EEXIST) threw an unguarded ENOENT; a lock
// file this parser cannot make sense of -- truncated by a crash mid-write, pid 0 (POSIX's own
// process-group meaning, never a real holder), a negative pid, or NaN from unparseable text --
// was silently treated as a dead holder's and removed. Read defensively: ENOENT means the holder
// is already gone, so loop and retake it; anything else unreadable is treated as still held,
// never blown away, since a lock this code cannot identify might still be live.
function readLockPid(lock) {
  let content;
  try { content = readFileSync(lock, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return { gone: true }; throw e; }
  const [pidText, holder] = content.split(' ');
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0 || !holder) return { unreadable: true };
  return { pid, holder };
}

export async function acquireLock(cwd, tx) {
  const lock = await gitPath(cwd, 'cairn-tx.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, 'wx'); writeSync(fd, `${process.pid} ${tx}`); closeSync(fd);
      return () => { try { unlinkSync(lock); } catch {} };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const read = readLockPid(lock);
      if (read.gone) { attempt--; continue; }
      if (read.unreadable) throw new TxError('cairn: cairn-tx.lock is unreadable; confirm no cairn process holds it, remove it by hand, then retry');
      if (alive(read.pid)) throw new TxError(`cairn: transaction ${read.holder} holds cairn-tx.lock (pid ${read.pid} alive); wait or run cairn recover ${read.holder}`);
      unlinkSync(lock);
    }
  }
  throw new TxError('cairn: could not take cairn-tx.lock');
}

export async function stagingDir(cwd, tx) { return gitPath(cwd, `cairn-tx/${tx}`); }

export async function stage(cwd, tx, plan, pre) {
  const dir = await stagingDir(cwd, tx);
  mkdirSync(join(dir, 'bytes'), { recursive: true });
  const writes = [];
  for (let n = 0; n < plan.writes.length; n++) {
    const w = plan.writes[n];
    if (w.store !== 'file') { writes.push(w); continue; }
    // Fix round 1 finding 13: a planned file write joined cwd with w.path without validating it,
    // so a plan carrying a path with a ".." component or a symlink escape would write outside the
    // worktree the moment applyWrites ran. Validated here, at stage time, before any bytes land on
    // disk, so a bad path never reaches the working tree at all.
    validatePath(w.path);
    await assertInside(cwd, w.path);
    writeAtomic(join(dir, 'bytes', String(n)), w.bytes);
    writes.push({ store: 'file', path: w.path, digest: sha256(w.bytes) });
  }
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

// `git commit --only -- <paths>` refuses a path git has never tracked at all ("pathspec ... did
// not match any file(s) known to git"), which a brand-new planned path (e.g. init()'s freshly
// written .cairn/settings.json, the very first time a project is authorized) always is. This
// finds exactly those never-tracked paths among the plan's own (already validated, at Task 13) so
// only they get `git add -N` (intent-to-add: an index entry with no staged content, so --only
// still reads the real working-tree bytes) before the commit; an untouched already-tracked path,
// or a rename's old path that no longer exists on disk, is left alone.
async function neverTracked(cwd, paths) {
  const out = (await git(['status', '--porcelain=v1', '-z', '--', ...paths], { cwd })).stdout;
  const fields = out.split('\0'); fields.pop();
  const untracked = [];
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i];
    if (rec.slice(0, 2) === '??') untracked.push(rec.slice(3));
    else if ('RC'.includes(rec[0]) || 'RC'.includes(rec[1])) i++;
  }
  return untracked;
}

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
        // Fix round 1 finding 6: `git add -- paths` followed by a bare `git commit` records
        // whatever the index held for every OTHER path too, not only the planned ones -- a
        // developer's own unrelated `git add` before running this command would be swept into
        // the branch write. `--only` commits exactly the given paths' current working-tree
        // content, bypassing the index entirely, so anything else staged is left untouched.
        const untracked = await neverTracked(cwd, w.paths);
        if (untracked.length) await git(['add', '-N', '--', ...untracked], { cwd });
        await git(['commit', '-q', '--allow-empty', '--only', '-m', w.message, '--', ...w.paths], { cwd });
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

function resolveRefs(payload, results) {
  if (Array.isArray(payload)) return payload.map((v) => resolveRefs(v, results));
  if (payload && typeof payload === 'object') {
    if (Object.keys(payload).length === 1 && 'stepRef' in payload) return results[payload.stepRef];
    return Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, resolveRefs(v, results)]));
  }
  return payload;
}

async function finish(cwd, s, tx, intentSha, fn) {
  const results = await applyWrites(cwd, s);
  const own = fn ? await fn({ tx, intentSha, results }) : null;
  const payload = { ...(own ?? resolveRefs(s.plan.terminal.payload, results)), intent: intentSha };
  const terminalSha = await appendRecord(cwd, s.plan.terminal.kind, s.plan.terminal.target, payload);
  rmSync(s.dir, { recursive: true, force: true });
  return { tx, intentSha, terminalSha, results };
}

export async function withTransaction(cwd, { command, plan }, fn) {
  if (!MULTI_STORE.has(command)) throw new TxError(`cairn: ${command} writes one store and needs no transaction`);
  const tx = ulid();
  const release = await acquireLock(cwd, tx);
  try {
    const pre = await preIdentities(cwd, plan);
    const dir = await stage(cwd, tx, plan, pre);
    const s = await readStaging(cwd, tx);
    const intentSha = await appendRecord(cwd, 'command-intent', tx, { tx, command, identity: plan.identity, pre, writes: s.plan.writes });
    writeAtomic(join(dir, 'intent'), intentSha);
    s.intentSha = intentSha;
    return await finish(cwd, s, tx, intentSha, fn);
  } finally { release(); }
}

export function pendingTransaction(cwd, log) {
  const closed = new Set();
  for (const r of log) {
    if (r.kind === 'command-abort') closed.add(r.payload.intent);
    else if (r.kind !== 'command-intent' && typeof r.payload.intent === 'string') closed.add(r.payload.intent);
  }
  return log.findLast((r) => r.kind === 'command-intent' && !closed.has(r.sha)) ?? null;
}

export async function effectsHappened(cwd, s, log, intent) {
  if (Object.keys(s.done).length) return true;
  if (log.findIndex((r) => r.sha === intent.sha) < log.length - 1) return true;
  if ((await readRef(cwd, 'refs/cairn/snapshots')) !== s.pre.refs['refs/cairn/snapshots']) return true;
  if ((await headSha(cwd)) !== s.pre.head) return true;
  for (const [p, d] of Object.entries(s.pre.files)) if (fileDigest(cwd, p) !== d) return true;
  return false;
}

export async function recover(cwd, tx) {
  const release = await acquireLock(cwd, tx);
  try {
    const log = await readLog(cwd);
    const intent = log.find((r) => r.kind === 'command-intent' && r.target === tx) ?? null;
    const s = await readStaging(cwd, tx);
    if (intent && pendingTransaction(cwd, log)?.sha !== intent.sha) { if (s) rmSync(s.dir, { recursive: true, force: true }); return { completed: 'forward' }; }
    if (!intent) { if (s) rmSync(s.dir, { recursive: true, force: true }); return { completed: 'abort' }; }
    if (!s) {
      const repair = `cairn: staging for transaction ${tx} is missing; its intent ${intent.sha} names ${intent.payload.writes.length} writes with digests ${intent.payload.writes.map((w) => w.digest ?? w.store).join(', ')}; check each store against them, restore ${intent.payload.pre.head} as HEAD if no write landed, then run the command again`;
      return { completed: 'blocked', repair };
    }
    s.intentSha = intent.sha;
    if (await effectsHappened(cwd, s, log, intent)) {
      try { await finish(cwd, s, tx, intent.sha, null); return { completed: 'forward' }; }
      catch (e) {
        if (!(e instanceof TxConflict)) throw e;
        writeAtomic(join(s.dir, 'repair'), e.message);
        return { completed: 'blocked', repair: e.message };
      }
    }
    const restored = { refs: s.pre.refs, head: s.pre.head, files: Object.fromEntries(Object.entries(s.pre.files).map(([p]) => [p, fileDigest(cwd, p)])) };
    await appendRecord(cwd, 'command-abort', tx, { intent: intent.sha, failure_class: 'interrupted', restored });
    rmSync(s.dir, { recursive: true, force: true });
    return { completed: 'abort' };
  } finally { release(); }
}

export function recoverPredicate(cwd, log) {
  const p = pendingTransaction(cwd, log);
  return p ? { action: 'recover', target: p.target, reason: `command-intent ${p.sha} for ${p.payload.command} has no terminal record` } : null;
}

export async function runRecover(argv, io) {
  const tx = argv[0];
  if (!tx) { io.stderr('cairn: recover needs a transaction id'); return 1; }
  try {
    const r = await recover(io.cwd, tx);
    if (r.completed === 'blocked') { io.stdout(r.repair); return 3; }
    io.stdout(`cairn: transaction ${tx} ${r.completed === 'forward' ? 'completed' : 'aborted'}`);
    return 0;
  } catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
}
