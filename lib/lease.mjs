// lib/lease.mjs
import { openSync, writeSync, closeSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { git, gitPath, readRef, updateRefCAS, commitTree, catCommit, CasError } from './gitx.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { validatePath, classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';

export class LeaseError extends Error { constructor(m) { super(m); this.name = 'LeaseError'; } }
export const LEASE_REF = 'refs/cairn/in-progress';
export const ACTIONS = new Set(['implement', 'build', 'run', 'review', 'declare', 'repair', 'promote', 'resolve', 'fix', 'scope']);

// Deviation from the plan text: lib/settings.mjs's loadSettings(cwd) is async on this branch (plan
// 02, already committed; the same deviation lib/auth.mjs and tests/tx.test.mjs already record), so
// checkTouch must await it rather than call it synchronously.
async function checkTouch(cwd, touch) {
  const { settings } = await loadSettings(cwd);
  for (const p of touch) {
    try { validatePath(p); } catch (e) { throw new LeaseError(`cairn: --touch ${p}: ${e.message}`); }
    const cls = classify(p, settings);
    if (['reserved', 'protected', 'kernel-managed', 'output'].includes(cls)) throw new LeaseError(`cairn: --touch ${p} is a ${cls} path and cannot be a mechanism input`);
  }
}

export async function readLease(cwd) {
  const sha = await readRef(cwd, LEASE_REF);
  if (!sha) return null;
  return parseStrict((await catCommit(cwd, sha)).body);
}

export async function begin(cwd, { action, target, touch = [], env = process.env }) {
  if (!ACTIONS.has(action)) throw new LeaseError(`cairn: unknown action ${action}`);
  await checkTouch(cwd, touch);
  const existing = await readLease(cwd);
  if (existing) throw new LeaseError(`cairn: action lease held: ${existing.action} ${existing.target}; run cairn end or cairn reconcile`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const { tree } = await readSnapshot(cwd, snapshot, 'workspace');
  const body = canonicalize({ action, target, snapshot, started: new Date().toISOString(), session: env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID ?? null, touch });
  const sha = await commitTree(cwd, { tree, parents: [], subject: `cairn: lease ${action} ${target}`, body, trailers: [] });
  try { await updateRefCAS(cwd, LEASE_REF, sha, null); }
  catch (e) { if (e instanceof CasError) throw new LeaseError('cairn: action lease held by a concurrent begin; run cairn end or cairn reconcile'); throw e; }
  return sha;
}

const endHooks = new Set();
export function onEnd(fn) { endHooks.add(fn); return () => endHooks.delete(fn); }

export async function touchOutcome(cwd, lease) {
  const { tree } = await readSnapshot(cwd, lease.snapshot, 'workspace');
  const changed = []; const unchanged = [];
  for (const p of lease.touch) {
    // Deviation from the plan text: the plan's git() call for a path absent from the start
    // snapshot's tree (a newly created touched file, the common case) omits `expect`, so
    // lib/gitx.mjs's git() default `expect: [0]` throws a GitError on git's exit 1 instead of
    // returning it as `r.code`. Added `expect: [0, 1]`, the same pattern lib/gitx.mjs's own
    // readRef already uses for an unresolved rev-parse --verify -q.
    const r = await git(['rev-parse', '--verify', '-q', `${tree}:${p}`], { cwd, expect: [0, 1] });
    const before = r.code === 0 ? r.stdout.trim() : null;
    const abs = join(cwd, p);
    const now = existsSync(abs) ? (await git(['hash-object', '--', p], { cwd })).stdout.trim() : null;
    (before === now ? unchanged : changed).push(p);
  }
  return { changed, unchanged };
}

export function covers(lease, path, declaredInputs) {
  return lease.touch.includes(path) || declaredInputs.includes(path);
}

export async function end(cwd) {
  const sha = await readRef(cwd, LEASE_REF);
  if (!sha) throw new LeaseError('cairn: no action lease to end');
  const lease = await readLease(cwd);
  const outcome = await touchOutcome(cwd, lease);
  for (const fn of endHooks) await fn(cwd, lease, outcome);
  const r = await git(['update-ref', '-d', LEASE_REF, sha], { cwd });
  if (r.code !== 0) throw new LeaseError(`cairn: action lease changed under cairn end; run cairn reconcile`);
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

export async function withCheckLock(cwd, fn) {
  const lock = await gitPath(cwd, 'cairn-check.lock');
  for (let attempt = 0; ; attempt++) {
    try { const fd = openSync(lock, 'wx'); writeSync(fd, String(process.pid)); closeSync(fd); break; }
    catch (e) {
      if (e.code !== 'EEXIST' || attempt) throw e;
      const pid = Number(readFileSync(lock, 'utf8'));
      if (alive(pid)) throw new LeaseError(`cairn: cairn-check.lock held by pid ${pid}; wait for that check`);
      unlinkSync(lock);
    }
  }
  try { return await fn(); } finally { try { unlinkSync(lock); } catch {} }
}

export function isStale(lease, env = process.env) {
  const here = env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID ?? null;
  if (here === null) return false;
  return lease.session !== here;
}

export async function reconcilePredicate(cwd, env = process.env) {
  const lease = await readLease(cwd);
  if (!lease || !isStale(lease, env)) return null;
  const here = env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID;
  return { action: 'reconcile', target: `${lease.action} ${lease.target}`,
    reason: `action lease from session ${lease.session ?? 'none'} is stale in session ${here}` };
}

function refusing(io, fn) {
  return fn().then(() => 0, (e) => { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; });
}

export function runBegin(argv, io) {
  return refusing(io, async () => {
    const [action, target, ...rest] = argv;
    const touch = [];
    for (let i = 0; i < rest.length; i++) { if (rest[i] === '--touch' && rest[i + 1]) touch.push(rest[++i]); else throw new LeaseError('cairn: usage: cairn begin <action> <target> [--touch <path>]...'); }
    if (!action || !target) throw new LeaseError('cairn: usage: cairn begin <action> <target> [--touch <path>]...');
    const sha = await begin(io.cwd, { action, target, touch, env: io.env });
    io.stdout(`cairn: lease ${action} ${target} ${sha}`);
  });
}

export function runEnd(argv, io) {
  return refusing(io, async () => { await end(io.cwd); io.stdout('cairn: lease ended'); });
}
