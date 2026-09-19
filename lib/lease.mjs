// lib/lease.mjs
import { openSync, writeSync, closeSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { git, gitPath, readRef, updateRefCAS, deleteRefCAS, commitTree, catCommit, CasError } from './gitx.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
// Fix round 1 finding 14: sha256 was imported for Task 8's touchOutcome but never called -- it
// compares git blob hashes (via hash-object) instead, not sha256 digests.
import { canonicalize, parseStrict } from './canon.mjs';
import { validatePath, classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';
import { isDeclared } from './scope.mjs';

export class LeaseError extends Error { constructor(m) { super(m); this.name = 'LeaseError'; } }
export const LEASE_REF = 'refs/cairn/in-progress';
export const ACTIONS = new Set(['implement', 'build', 'run', 'review', 'declare', 'repair', 'promote', 'resolve', 'fix', 'scope']);

// Fix round 2 finding 1a (Important): checkTouch used to refuse only reserved/protected/
// kernel-managed/output paths and never checked for a glob metacharacter or an `outside` path --
// so `cairn begin --touch` accepted a path `declare()` (inside applyTouch, at end) would later
// refuse, and by then the lease already existed with nothing that could ever write it into a
// definition (reproduced: `begin implement REQ --touch README.md` with README.md in
// settings.outside created the lease; `end` then threw past the lease removal). checkTouch now
// applies the same closed set of rules `normalizeDefinition` applies to a mechanism input
// (lib/mechanisms.mjs): a reserved/protected/kernel-managed/output/outside path, or a glob
// metacharacter, is refused before the lease is ever created.
const TOUCH_GLOB_CHARS = /[*?[]/;
// Deviation from the plan text: lib/settings.mjs's loadSettings(cwd) is async on this branch (plan
// 02, already committed; the same deviation lib/auth.mjs and tests/tx.test.mjs already record), so
// checkTouch must await it rather than call it synchronously.
async function checkTouch(cwd, touch) {
  const { settings } = await loadSettings(cwd);
  for (const p of touch) {
    try { validatePath(p); } catch (e) { throw new LeaseError(`cairn: --touch ${p}: ${e.message}`); }
    if (TOUCH_GLOB_CHARS.test(p)) throw new LeaseError(`cairn: --touch ${p} has a glob metacharacter and cannot be a mechanism input`);
    const cls = classify(p, settings);
    if (cls === 'outside') throw new LeaseError(`cairn: --touch ${p} is an outside path and cannot be a mechanism input`);
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

// Fix round 2 finding 3 (Minor, from the re-reviewer's missing-test note): `before`/`now` used to
// compare only the git blob hash (content), never the tree entry's mode -- `git hash-object` and
// `git rev-parse <tree>:<path>` both return the same blob SHA regardless of the executable bit, so
// a `chmod +x` on a touched file with unchanged content was reported 'unchanged'. `entryAt` below
// reads the mode alongside the SHA (`git ls-tree` for the recorded side, `lstat`'s permission bits
// for the worktree side, the same 100644/100755/120000 convention lib/gitx.mjs's writeTreeFromPaths
// already uses), and both are compared.
async function entryAt(cwd, tree, p) {
  const line = (await git(['ls-tree', tree, '--', p], { cwd })).stdout.split('\n').find(Boolean);
  if (!line) return null;
  const [meta] = line.split('\t');
  const [mode, , sha] = meta.split(' ');
  return `${mode} ${sha}`;
}
async function entryNow(cwd, p) {
  const abs = join(cwd, p);
  if (!existsSync(abs)) return null;
  const st = await lstat(abs);
  const mode = st.isSymbolicLink() ? '120000' : (st.mode & 0o111 ? '100755' : '100644');
  const sha = (await git(['hash-object', '--', p], { cwd })).stdout.trim();
  return `${mode} ${sha}`;
}
export async function touchOutcome(cwd, lease) {
  const { tree } = await readSnapshot(cwd, lease.snapshot, 'workspace');
  const changed = []; const unchanged = [];
  for (const p of lease.touch) {
    const before = await entryAt(cwd, tree, p);
    const now = await entryNow(cwd, p);
    (before === now ? unchanged : changed).push(p);
  }
  return { changed, unchanged };
}

// Fix round 1 item 9: delegates to lib/scope.mjs's isDeclared (a path below a declared directory
// entry counts too), instead of an exact-match-only includes() that disagreed with scope.mjs's
// own prefix rule for the same question.
export function covers(lease, path, declaredInputs) {
  return lease.touch.includes(path) || isDeclared(path, declaredInputs);
}

// Fix round 1 finding 11: hooks ran before the ref was removed, so a hook that threw left the
// lease in place -- and a retry of `cairn end` would re-run every hook that had already run
// (and possibly already written its definition change) on the same lease, repeating its side
// effects. The ref removal is the one non-idempotent, authoritative event; hooks run only after
// it has actually happened, and their own writes (the mechanism definition update) are already
// idempotent, so a hook failure is reported but the lease stays removed rather than resurrected.
// Fix round 1 finding 5: `git update-ref -d <ref> <old>` was called through the shared git()
// wrapper, whose default `expect: [0]` rejects (throws a raw GitError) on git's own CAS-mismatch
// exit code before the `if (r.code !== 0)` line below it could ever run; the friendly LeaseError
// was dead code. lib/gitx.mjs's deleteRefCAS already exists for exactly this: it uses the CAS
// exit-code/stderr classification updateRef shares with updateRefCAS and raises CasError on a
// mismatch, which this catches and turns into the reconcile message.
// Fix round 2 finding 3 (Minor): end() used to compute a touchOutcome of its own to hand to
// endHooks, but the only production hook (the mechanism definition write-back) was moved out of
// the hook mechanism in Fix round 1 finding 2 -- lib/cli.mjs's endCommand calls touchOutcome and
// applyTouch itself, explicitly, after end() returns. Computing it here too meant every `cairn
// end` ran the same git calls twice for no consumer. Hooks (still used only by tests) are now
// called with just (cwd, lease); end() returns the lease so a caller does not need a second
// readLease to get what it already read here.
export async function end(cwd) {
  const sha = await readRef(cwd, LEASE_REF);
  if (!sha) throw new LeaseError('cairn: no action lease to end');
  const lease = await readLease(cwd);
  try { await deleteRefCAS(cwd, LEASE_REF, sha); }
  catch (e) { if (e instanceof CasError) throw new LeaseError('cairn: action lease changed under cairn end; run cairn reconcile'); throw e; }
  for (const fn of endHooks) await fn(cwd, lease);
  return lease;
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

// Fix round 1 finding 10: same guard as lib/tx.mjs's acquireLock -- an ENOENT race (the holder
// released between our EEXIST and this read) must not throw raw; a lock this parser cannot make
// sense of (pid 0, a negative pid, or unparseable text) must never be treated as dead and removed.
function readLockPid(lock) {
  let content;
  try { content = readFileSync(lock, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return { gone: true }; throw e; }
  const pid = Number(content);
  if (!Number.isInteger(pid) || pid <= 0) return { unreadable: true };
  return { pid };
}

export async function withCheckLock(cwd, fn) {
  const lock = await gitPath(cwd, 'cairn-check.lock');
  for (let attempt = 0; ; attempt++) {
    try { const fd = openSync(lock, 'wx'); writeSync(fd, String(process.pid)); closeSync(fd); break; }
    catch (e) {
      if (e.code !== 'EEXIST' || attempt) throw e;
      const read = readLockPid(lock);
      if (read.gone) { attempt--; continue; }
      if (read.unreadable) throw new LeaseError('cairn: cairn-check.lock is unreadable; confirm no cairn check holds it, remove it by hand, then retry');
      if (alive(read.pid)) throw new LeaseError(`cairn: cairn-check.lock held by pid ${read.pid}; wait for that check`);
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
