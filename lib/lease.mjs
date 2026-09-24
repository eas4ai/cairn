// lib/lease.mjs
import { openSync, writeSync, closeSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { git, gitPath, readRef, updateRefCAS, deleteRefCAS, commitTree, catCommit, CasError } from './gitx.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
// Fix round 1 finding 14: sha256 was imported for Task 8's touchOutcome but never called -- it
// compares git blob hashes (via hash-object) instead, not sha256 digests.
import { canonicalize, parseStrict } from './canon.mjs';
import { validatePath, classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';
import { isDeclared } from './scope.mjs';
import { layoutOf } from './layout.mjs';

export class LeaseError extends Error { constructor(m) { super(m); this.name = 'LeaseError'; } }
export const LEASE_REF = 'refs/sudus/in-progress';
export const ACTIONS = new Set(['implement', 'build', 'run', 'review', 'declare', 'repair', 'promote', 'resolve', 'fix', 'scope']);

// Fix round 2 finding 1a (Important): checkTouch used to refuse only reserved/protected/
// kernel-managed/output paths and never checked for a glob metacharacter or an `outside` path --
// so `sudus begin --touch` accepted a path `declare()` (inside applyTouch, at end) would later
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
    try { validatePath(p); } catch (e) { throw new LeaseError(`sudus: --touch ${p}: ${e.message}`); }
    if (TOUCH_GLOB_CHARS.test(p)) throw new LeaseError(`sudus: --touch ${p} has a glob metacharacter and cannot be a mechanism input`);
    const cls = classify(p, settings);
    if (cls === 'outside') throw new LeaseError(`sudus: --touch ${p} is an outside path and cannot be a mechanism input`);
    if (['reserved', 'protected', 'kernel-managed', 'output'].includes(cls)) throw new LeaseError(`sudus: --touch ${p} is a ${cls} path and cannot be a mechanism input`);
    // A gitignored path is dropped from every snapshot and input resolution, so it can never be
    // an input; touching one used to compare "absent in the snapshot" with "present on disk" and
    // count an untouched file as changed, adding it to the definition and unbinding its review.
    const ignored = await git(['check-ignore', '-q', '--', p], { cwd, expect: [0, 1, 128] });
    if (ignored.code === 0) throw new LeaseError(`sudus: --touch ${p} is gitignored and cannot be a mechanism input; unignore it or drop --touch`);
  }
}

export async function readLease(cwd) {
  const sha = await readRef(cwd, layoutOf(cwd).lease);
  if (!sha) return null;
  return parseStrict((await catCommit(cwd, sha)).body);
}

export async function begin(cwd, { action, target, touch = [], env = process.env }) {
  if (!ACTIONS.has(action)) throw new LeaseError(`sudus: unknown action ${action}`);
  await checkTouch(cwd, touch);
  const existing = await readLease(cwd);
  if (existing) throw new LeaseError(`sudus: action lease held: ${existing.action} ${existing.target}; run sudus end when it is finished, or sudus end --abandon`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const { tree } = await readSnapshot(cwd, snapshot, 'workspace');
  const body = canonicalize({ action, target, snapshot, started: new Date().toISOString(), session: env.SUDUS_SESSION ?? env.CLAUDE_SESSION_ID ?? null, touch });
  const sha = await commitTree(cwd, { tree, parents: [], subject: `sudus: lease ${action} ${target}`, body, trailers: [] });
  try { await updateRefCAS(cwd, layoutOf(cwd).lease, sha, null); }
  catch (e) { if (e instanceof CasError) throw new LeaseError('sudus: action lease held by a concurrent begin; run sudus end when it is finished, or sudus end --abandon'); throw e; }
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
// A touched path may be a directory (a mechanism input may be one): both sides then compare the
// sorted listing of the files below it, each as `mode sha path`, instead of one blob. `git
// hash-object` cannot hash a directory, and `sudus end` used to report the touch not written.
async function entryAt(cwd, tree, p) {
  const lines = (await git(['ls-tree', '-r', tree, '--', p], { cwd })).stdout.split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  const rows = lines.map((line) => { const [meta, path] = line.split('\t'); const [mode, , sha] = meta.split(' '); return `${mode} ${sha} ${path}`; }).sort();
  return rows.join('\n');
}
async function entryNow(cwd, p) {
  const abs = join(cwd, p);
  if (!existsSync(abs)) return null;
  const rows = [];
  const visit = async (rel) => {
    const st = await lstat(join(cwd, rel));
    if (st.isDirectory() && !st.isSymbolicLink()) {
      for (const name of (await readdir(join(cwd, rel))).sort()) await visit(`${rel}/${name}`);
      return;
    }
    const mode = st.isSymbolicLink() ? '120000' : (st.mode & 0o100 ? '100755' : '100644');
    rows.push({ mode, rel });
  };
  await visit(p);
  if (!rows.length) return null;
  // One hash-object for the whole listing (a directory touch can hold hundreds of files); a
  // path beginning with a double quote is hashed on its own, since --stdin-paths unquotes it.
  const plain = rows.filter((r) => !r.rel.startsWith('"') && !r.rel.includes('\n'));
  if (plain.length) {
    const out = (await git(['hash-object', '--stdin-paths'], { cwd, input: plain.map((r) => r.rel + '\n').join('') })).stdout.trim().split('\n');
    plain.forEach((r, i) => { r.sha = out[i]; });
  }
  for (const r of rows) if (!r.sha) r.sha = (await git(['hash-object', '--', r.rel], { cwd })).stdout.trim();
  return rows.map((r) => `${r.mode} ${r.sha} ${r.rel}`).sort().join('\n');
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
// lease in place -- and a retry of `sudus end` would re-run every hook that had already run
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
// applyTouch itself, explicitly, after end() returns. Computing it here too meant every `sudus
// end` ran the same git calls twice for no consumer. Hooks (still used only by tests) are now
// called with just (cwd, lease); end() returns the lease so a caller does not need a second
// readLease to get what it already read here.
//
// Review-1 fix, item 4: section 5's reconcile row reads "the action it named finished or was
// explicitly abandoned", but nothing before this fix ever recorded which one happened -- `sudus
// end` and `sudus end --abandon` were identical. The lease's own body (the fields begin() writes
// above: action, target, snapshot, started, session, touch) gains one more field here, `abandoned`
// (boolean; false for a plain end, true for --abandon): a terminal commit is written -- the lease's
// own tree, parented on the lease commit, with the same fields plus `abandoned` -- before the ref
// is removed, so the distinction is a real Git object end() can hand back (as `terminalSha`), not
// only an in-memory flag. The lease stays local and ephemeral exactly as before (refs/sudus/in-
// progress is never pushed and this terminal commit is never itself given a durable ref), so
// nothing about its durability changes; only what its last recorded state says does.
// Review-2 fix (Minor, new finding on the round-1 re-review): end() and end({abandon}) used to
// re-read refs/sudus/in-progress and act on whatever lease was live, with no check that it was the
// lease the caller itself began -- a stale caller (its own lease already gone) could end or abandon
// a different, newer actor's lease, printing that other actor's own action and target as if it
// were the stale caller's own. Ruling: no ownership check (a fresh session with no begin of its own
// must still be able to reconcile a dead actor's lease -- that path is `expect` left null, unchanged
// below), but an identity check: when a caller supplies the sha of the lease it itself began
// (`expect`, e.g. `sudus end --lease <sha>`, the sha `sudus begin` already prints), end() refuses
// unless the live lease is still that exact one. A caller with no `expect` (bare `sudus end` /
// `sudus end --abandon`, reconcile's own wording in the working agreement) asserts no identity and
// is unaffected -- this is what keeps a fresh session able to reconcile a dead actor's stale lease.
export async function end(cwd, { abandon = false, expect = null } = {}) {
  const sha = await readRef(cwd, layoutOf(cwd).lease);
  if (!sha) throw new LeaseError('sudus: no action lease to end');
  if (expect && expect !== sha) {
    const live = await readLease(cwd);
    throw new LeaseError(`sudus: action lease ${sha} is now ${live.action} ${live.target} (session ${live.session ?? 'none'}), not the lease ${expect} this end expected; run sudus end --lease ${sha}, or sudus end --abandon`);
  }
  const lease = await readLease(cwd);
  const { tree } = await catCommit(cwd, sha);
  const body = canonicalize({ ...lease, abandoned: abandon });
  const subject = `sudus: lease ${abandon ? 'abandoned' : 'ended'} ${lease.action} ${lease.target}`;
  const terminalSha = await commitTree(cwd, { tree, parents: [sha], subject, body, trailers: [] });
  try { await deleteRefCAS(cwd, layoutOf(cwd).lease, sha); }
  catch (e) { if (e instanceof CasError) throw new LeaseError('sudus: action lease changed under sudus end; run sudus wake and follow it'); throw e; }
  for (const fn of endHooks) await fn(cwd, lease);
  return { ...lease, abandoned: abandon, terminalSha };
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
  const lock = await gitPath(cwd, 'sudus-check.lock');
  for (let attempt = 0; ; attempt++) {
    try { const fd = openSync(lock, 'wx'); writeSync(fd, String(process.pid)); closeSync(fd); break; }
    catch (e) {
      if (e.code !== 'EEXIST' || attempt) throw e;
      const read = readLockPid(lock);
      if (read.gone) { attempt--; continue; }
      if (read.unreadable) throw new LeaseError('sudus: sudus-check.lock is unreadable; confirm no sudus check holds it, remove it by hand, then retry');
      if (alive(read.pid)) throw new LeaseError(`sudus: sudus-check.lock held by pid ${read.pid}; wait for that check`);
      unlinkSync(lock);
    }
  }
  try { return await fn(); } finally { try { unlinkSync(lock); } catch {} }
}

export function isStale(lease, env = process.env) {
  const here = env.SUDUS_SESSION ?? env.CLAUDE_SESSION_ID ?? null;
  if (here === null) return false;
  return lease.session !== here;
}

export async function reconcilePredicate(cwd, env = process.env) {
  const lease = await readLease(cwd);
  if (!lease || !isStale(lease, env)) return null;
  const here = env.SUDUS_SESSION ?? env.CLAUDE_SESSION_ID;
  return { action: 'reconcile', target: `${lease.action} ${lease.target}`,
    reason: `action lease from session ${lease.session ?? 'none'} is stale in session ${here}` };
}

function refusing(io, fn) {
  return fn().then(() => 0, (e) => { io.stderr(e.message.startsWith('sudus: ') ? e.message : `sudus: ${e.message}`); return 1; });
}

export function runBegin(argv, io) {
  return refusing(io, async () => {
    const [action, target, ...rest] = argv;
    const touch = [];
    for (let i = 0; i < rest.length; i++) { if (rest[i] === '--touch' && rest[i + 1]) touch.push(rest[++i]); else throw new LeaseError('sudus: usage: sudus begin <action> <target> [--touch <path>]...'); }
    if (!action || !target) throw new LeaseError('sudus: usage: sudus begin <action> <target> [--touch <path>]...');
    const sha = await begin(io.cwd, { action, target, touch, env: io.env });
    io.stdout(`sudus: lease ${action} ${target} ${sha}`);
  });
}

export function runEnd(argv, io) {
  return refusing(io, async () => {
    const abandon = argv.includes('--abandon');
    const i = argv.indexOf('--lease');
    const expect = i >= 0 ? argv[i + 1] : null;
    if (i >= 0 && !expect) throw new LeaseError('sudus: --lease needs a value');
    await end(io.cwd, { abandon, expect });
    io.stdout(abandon ? 'sudus: lease abandoned' : 'sudus: lease ended');
  });
}
