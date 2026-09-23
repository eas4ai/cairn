// lib/tx.mjs
import { openSync, writeSync, closeSync, renameSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gitPath, git, readRef, catCommit } from './gitx.mjs';
import { canonicalize, sha256, ulid } from './canon.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
import { validatePath, assertInside } from './paths.mjs';
import { layoutOf } from './layout.mjs';
// Fix round 2 finding 1 (Important): the 'append' store's own write (in applyWrites, below) must
// tell lib/scope.mjs's ledger which bytes an assigned command actually wrote, so its
// kernelManagedValid exempts them from the scope preflight's breach check. lib/scope.mjs also
// imports from lib/adr.mjs (readAdr) and lib/auth.mjs (protectedDigests), and lib/auth.mjs imports
// withTransaction from this file, so this import completes a cycle; Node's ESM loader resolves it
// safely here because recordManagedWrite is only ever called from inside a function body
// (applyWrites), never at this module's own top level, by which point every module in the cycle
// has finished loading. lib/adr.mjs's own appendDecision -> lib/scope.mjs import (its own
// recordManagedWrite hook) already establishes the same pattern.
import { recordManagedWrite } from './scope.mjs';

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
  const lock = await gitPath(cwd, 'sudus-tx.lock');
  // Fix round 2 finding 5: `attempt--; continue;` on a "gone" read kept `attempt` unchanged
  // forever if the lock path kept disappearing and reappearing (e.g. a dangling symlink, where
  // `wx` always sees EEXIST but a read through it always sees ENOENT) -- an unbounded loop. Counted
  // separately from the ordinary attempt budget and capped.
  let goneRetries = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, 'wx'); writeSync(fd, `${process.pid} ${tx}`); closeSync(fd);
      return () => { try { unlinkSync(lock); } catch {} };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const read = readLockPid(lock);
      if (read.gone) {
        if (++goneRetries > 5) throw new TxError('sudus: sudus-tx.lock keeps disappearing and reappearing; remove it by hand and retry');
        attempt--; continue;
      }
      if (read.unreadable) throw new TxError('sudus: sudus-tx.lock is unreadable; confirm no sudus process holds it, remove it by hand, then retry');
      if (alive(read.pid)) throw new TxError(`sudus: transaction ${read.holder} holds sudus-tx.lock (pid ${read.pid} alive); wait or run sudus recover ${read.holder}`);
      unlinkSync(lock);
    }
  }
  throw new TxError('sudus: could not take sudus-tx.lock');
}

export async function stagingDir(cwd, tx) { return gitPath(cwd, `sudus-tx/${tx}`); }

// Fix round 1 finding 4: every planned write now carries a digest, not only file writes -- branch
// digests its planned paths and message, snapshot a fixed marker (its real content is only known
// at apply time), log its planned kind, target and payload. recover()'s "staging is missing"
// repair line (below) can then name a digest for every write, not fall back to the store name for
// three out of four kinds.
function writeDigest(w) {
  if (w.store === 'branch') return sha256(canonicalize({ paths: w.paths, message: w.message }));
  if (w.store === 'snapshot') return sha256(canonicalize({ store: 'snapshot' }));
  if (w.store === 'log') return sha256(canonicalize({ kind: w.kind, target: w.target, payload: w.payload }));
  throw new TxError(`sudus: unknown store ${w.store}`);
}

export async function stage(cwd, tx, plan, pre) {
  const dir = await stagingDir(cwd, tx);
  mkdirSync(join(dir, 'bytes'), { recursive: true });
  const writes = [];
  for (let n = 0; n < plan.writes.length; n++) {
    const w = plan.writes[n];
    if (w.store === 'file') {
      // Fix round 1 finding 13: a planned file write joined cwd with w.path without validating it,
      // so a plan carrying a path with a ".." component or a symlink escape would write outside the
      // worktree the moment applyWrites ran. Validated here, at stage time, before any bytes land on
      // disk, so a bad path never reaches the working tree at all.
      validatePath(w.path);
      await assertInside(cwd, w.path);
      writeAtomic(join(dir, 'bytes', String(n)), w.bytes);
      writes.push({ store: 'file', path: w.path, digest: sha256(w.bytes) });
    } else if (w.store === 'append') {
      // Fix round 2 finding 1 (Important): same path validation as 'file'. w.bytes here is only
      // the bytes to be appended (the digest names just that portion), not the whole resulting
      // file -- applyWrites (below) never needs to know the file's prior content to stage this.
      validatePath(w.path);
      await assertInside(cwd, w.path);
      writeAtomic(join(dir, 'bytes', String(n)), w.bytes);
      writes.push({ store: 'append', path: w.path, digest: sha256(w.bytes) });
    } else if (w.store === 'branch') {
      // Fix round 2 finding 2: an empty `paths` array reaches applyWrites' 'branch' case, which
      // hands it straight to `neverTracked` as `git status --porcelain=v1 -z --` with nothing after
      // `--` -- an empty pathspec restricts nothing, so every untracked file in the whole worktree
      // is reported and `git add -N`'d. Refused here, at stage time, before that can happen.
      if (!Array.isArray(w.paths) || w.paths.length === 0) throw new TxError('sudus: a branch write needs at least one path');
      writes.push({ store: 'branch', paths: w.paths, message: w.message, digest: writeDigest(w) });
    } else if (w.store === 'snapshot') {
      writes.push({ store: 'snapshot', digest: writeDigest(w) });
    } else if (w.store === 'log') {
      writes.push({ store: 'log', kind: w.kind, target: w.target, payload: w.payload, digest: writeDigest(w) });
    } else throw new TxError(`sudus: unknown store ${w.store}`);
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
  // Fix round 2 finding 1: 'append' is captured here too -- "whose pre-identity is the file digest
  // taken under the lock" (this function runs inside withTransaction's acquireLock, before
  // stage()). Unlike 'file', applyWrites (below) never compares this pre-identity to decide
  // whether to write: an append write's whole point is to add its bytes to whatever the file
  // actually holds when it runs, not to conflict with a concurrent writer that grew it since this
  // was captured. It is recorded anyway, in the command-intent's own `pre` field and in a later
  // recover()'s `restored` list, for the same audit trail every other store's pre-identity gets.
  for (const w of plan.writes) if (w.store === 'file' || w.store === 'append') files[w.path] = fileDigest(cwd, w.path);
  const L = layoutOf(cwd);
  return { refs: { [L.log]: await readRef(cwd, L.log), [L.snapshots]: await readRef(cwd, L.snapshots) },
    head: await headSha(cwd), files };
}

function conflict(tx, what, actual, pre, planned) {
  return new TxConflict(`sudus: transaction ${tx} cannot complete: ${what} is ${actual}, expected ${pre} or ${planned}; restore it to ${pre} then run sudus recover ${tx}`);
}

function markDone(dir, n, value) { writeAtomic(join(dir, 'done', String(n)), value); }

// `git commit --only -- <paths>` refuses a path git has never tracked at all ("pathspec ... did
// not match any file(s) known to git"), which a brand-new planned path (e.g. init()'s freshly
// written .sudus/settings.json, the very first time a project is authorized) always is. This
// finds exactly those never-tracked paths among the plan's own (already validated, at Task 13) so
// only they get `git add -N` (intent-to-add: an index entry with no staged content, so --only
// still reads the real working-tree bytes) before the commit; an untouched already-tracked path,
// or a rename's old path that no longer exists on disk, is left alone.
async function neverTracked(cwd, paths) {
  // Fix round 2 finding 2, defense in depth: stage() now refuses an empty-paths branch write
  // before it can reach here, but an empty pathspec after `--` restricts nothing (reports the
  // whole worktree), so this never runs `git status` unscoped regardless of how it is called.
  if (paths.length === 0) return [];
  // A planned path may sit under a directory the developer gitignores (docs/ is a common one):
  // plain `git status` omits it, no intent-to-add ran, and `git commit --only -- path` then
  // failed with "pathspec did not match". `--ignored -uall` lists such paths (`!!`) one file at a
  // time, and the add below forces them, since the kernel plans these writes on purpose.
  const out = (await git(['status', '--porcelain=v1', '-z', '-uall', '--ignored', '--', ...paths], { cwd })).stdout;
  const fields = out.split('\0'); fields.pop();
  const untracked = [];
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i];
    const xy = rec.slice(0, 2);
    if (xy === '??' || xy === '!!') untracked.push(rec.slice(3));
    else if ('RC'.includes(rec[0]) || 'RC'.includes(rec[1])) i++;
  }
  return untracked;
}

// Fix round 1 finding 7: `failAfterWrite` is a test-only injection point (-1, the default, never
// fires in real use). Interrupting exactly here, after write n's own markDone but before write
// n+1 starts, is what a real crash at that instant looks like from the next process's point of
// view: `s.done` on disk already has entries 0..n, and applyWrites, called again by recover, must
// pick up at n+1 -- the same partial-done-set path a real crash exercises, which no test drove
// before (every existing crash test builds the intent by hand and never leaves partial done
// markers, so this path, and the 'branch'/'snapshot' adopt-own-write branches at index 1 and 2 for
// example, were never actually reached by a test).
export async function applyWrites(cwd, s, failAfterWrite = -1) {
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
    } else if (w.store === 'append') {
      // Fix round 2 finding 1 (Important): decisionAppendBytes/decisionFileBytes used to read the
      // whole ADR outside this transaction's lock, and preIdentities ran later, inside it -- a line
      // another command appended in that window became the recorded pre digest, and the staged
      // whole-file bytes then overwrote it with no conflict detected at all. An append write never
      // depends on knowing the file's prior content: it appends to whatever is actually on disk
      // right now, under this transaction's lock -- preserving a concurrent command's own append
      // rather than silently discarding it.
      //
      // Fix round 3 finding 1 (Important): "ends with its own staged bytes" was the wrong
      // idempotency test. A crash between these bytes reaching disk and markDone recording write n
      // as done, followed by any OTHER command's own append before recovery resumes here, leaves
      // our bytes present but no longer at the end of the file -- "ends with" then read as false,
      // and this branch appended a second, duplicate copy of the exact same line (reproduced:
      // promote crashed at the ADR write, one decide() landed in between, recover, and
      // docs/decisions.jsonl held the promote decision twice, an unreadable ADR since every reader
      // refuses a duplicate id). The ADR line carries a unique ULID id, so its bytes occurring
      // anywhere in the file is an exact, unambiguous signal that this specific write already
      // landed, regardless of what landed after it: "contains the staged bytes as a whole line",
      // not "ends with them".
      const curBytes = existsSync(join(cwd, w.path)) ? readFileSync(join(cwd, w.path)) : Buffer.alloc(0);
      const appendBytes = s.bytes(n);
      const alreadyPresent = curBytes.includes(appendBytes);
      const finalBytes = alreadyPresent ? curBytes : Buffer.concat([curBytes, appendBytes]);
      if (!alreadyPresent) writeAtomic(join(cwd, w.path), finalBytes);
      // The scope preflight's kernelManagedValid (lib/scope.mjs) exempts a kernel-managed path
      // (docs/decisions.jsonl) only when its current bytes match this local ledger's last recorded
      // digest for an assigned command's own write. Called unconditionally here, on a fresh append
      // and an idempotent replay alike (fix round 3: only after the alreadyPresent decision above,
      // with the file's real, current bytes -- never bytes this branch is about to duplicate), so a
      // crash between the bytes landing and this line, followed by recovery re-entering this same
      // write, still leaves the ledger naming what is actually on disk -- otherwise every start,
      // supersede or promote that ever recovered from a crash would leave docs/decisions.jsonl
      // reading as an unrecorded (and therefore breaching) hand edit at the next preflight.
      await recordManagedWrite(cwd, w.path, finalBytes);
      out = sha256(finalBytes);
    } else if (w.store === 'branch') {
      const head = await headSha(cwd);
      // Fix round 1 finding 14: Node 24 (the plan's own runtime floor) has Array.prototype.findLast
      // natively; the `?.` guard was defensive against an older runtime this codebase never targets.
      const prevBranch = results.findLast((r, i) => s.plan.writes[i].store === 'branch') ?? null;
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
        if (untracked.length) await git(['add', '-N', '-f', '--', ...untracked], { cwd });
        await git(['commit', '-q', '--allow-empty', '--only', '-m', w.message, '--', ...w.paths], { cwd });
        out = await headSha(cwd);
      }
    } else if (w.store === 'snapshot') {
      // Fix round 1 finding 1: writeWorkspaceSnapshot ran unconditionally whenever done/<n> was
      // absent, with no check against the staged pre-identity -- a crash between the ref CAS
      // advancing and markDone writing made recovery call it again, stacking a second snapshot
      // commit onto the never-rewritten ref. Idempotent like every other store now: if the ref
      // already shows exactly one commit beyond the pre-identity (this write already landed, the
      // crash was only before markDone), adopt it instead of writing again; anything else is a
      // conflict, the same rule the 'branch' store above already applies to HEAD.
      const cur = await readRef(cwd, layoutOf(cwd).snapshots);
      const expected = s.pre.refs[layoutOf(cwd).snapshots];
      if (cur !== expected) {
        // Fix round 2 finding 6: a matching parent alone was accepted as "our own write landed,
        // adopt it" -- but any commit with that parent qualified, including one a concurrent
        // `sudus begin` (or anything else) wrote to the same ref at the same moment. readSnapshot
        // verifies the candidate is actually a well-formed workspace snapshot record (kind and
        // subject match what this write plans), not merely a commit that happens to share a parent.
        let candidate = null;
        if (cur) { try { candidate = await readSnapshot(cwd, cur, 'workspace'); } catch {} }
        if (!(candidate && candidate.parent === expected)) throw conflict(tx, layoutOf(cwd).snapshots, cur, expected, 'a new snapshot commit');
        out = cur;
      } else {
        out = await writeWorkspaceSnapshot(cwd);
      }
    } else if (w.store === 'log') {
      const log = await readLog(cwd);
      const after = s.intentSha ? log.slice(log.findIndex((r) => r.sha === s.intentSha) + 1) : log;
      const same = after.find((r) => r.kind === w.kind && r.target === w.target && canonicalize(r.payload) === canonicalize(w.payload));
      out = same ? same.sha : await appendRecord(cwd, w.kind, w.target, w.payload);
    } else throw new TxError(`sudus: unknown store ${w.store}`);
    markDone(s.dir, n, out);
    results.push(out);
    if (n === failAfterWrite) throw new TxError(`sudus: simulated crash after write ${n} (test only)`);
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

// A stable, human-readable name for the concrete store a planned write touches, shared by the
// terminal payload's `results` (below) and by recover()'s `restored` (fix round 1 finding 2).
function storeLabel(w, L) {
  // Fix round 2 finding 1: 'append' is labelled the same as 'file' -- its result is a specific
  // file's content, and driftedEntry/identityNow (below) already know how to check a `file:` entry
  // against the commit that recorded it, regardless of which store type wrote that content.
  if (w.store === 'file' || w.store === 'append') return `file:${w.path}`;
  if (w.store === 'branch') return 'HEAD';
  if (w.store === 'snapshot') return L.snapshots;
  if (w.store === 'log') return L.log;
  return w.store;
}

async function finish(cwd, s, tx, intentSha, fn, failAfterWrite = -1) {
  const results = await applyWrites(cwd, s, failAfterWrite);
  const own = fn ? await fn({ tx, intentSha, results }) : null;
  // Fix round 1 finding 3: `results` names each planned write's actual resulting identity, the
  // same way `intent` is injected, on every terminal payload -- so a later drift (a store no
  // longer showing what this transaction left it as) is detectable without the done/<n> markers,
  // which staging cleanup below removes for good.
  const storeResults = s.plan.writes.map((w, i) => ({ store: storeLabel(w, layoutOf(cwd)), identity: results[i] }));
  const payload = { ...(own ?? resolveRefs(s.plan.terminal.payload, results)), intent: intentSha, results: storeResults };
  const terminalSha = await appendRecord(cwd, s.plan.terminal.kind, s.plan.terminal.target, payload);
  rmSync(s.dir, { recursive: true, force: true });
  return { tx, intentSha, terminalSha, results };
}

// Fix round 1 finding 7: `failAfterWrite` is accepted here purely to thread the test-only
// injection point (see applyWrites's own comment) through to the real transaction path, the same
// one a real command runs -- so a crash test interrupts withTransaction itself, not a hand-built
// intent that skips the staging and locking this function actually does.
export async function withTransaction(cwd, { command, plan, failAfterWrite = -1 }, fn) {
  if (!MULTI_STORE.has(command)) throw new TxError(`sudus: ${command} writes one store and needs no transaction`);
  const tx = ulid();
  const release = await acquireLock(cwd, tx);
  try {
    const pre = await preIdentities(cwd, plan);
    const dir = await stage(cwd, tx, plan, pre);
    const s = await readStaging(cwd, tx);
    const intentSha = await appendRecord(cwd, 'command-intent', tx, { tx, command, identity: plan.identity, pre, writes: s.plan.writes });
    writeAtomic(join(dir, 'intent'), intentSha);
    s.intentSha = intentSha;
    return await finish(cwd, s, tx, intentSha, fn, failAfterWrite);
  } finally { release(); }
}

function closingRecord(log, intentSha) {
  return log.find((r) => r.kind !== 'command-intent' && r.payload && r.payload.intent === intentSha) ?? null;
}

// Fix round 2 finding 3: "every store matches its resulting identity" (the spec's recover
// predicate) means the write landed, not that the store never changes again. Comparing a file's
// CURRENT working-tree digest against the recorded one read as permanent drift the moment anyone
// made a later, legitimate edit (promote editing the roadmap start wrote; a developer editing
// AGENTS.md between commitments). A file write's resulting identity is instead verified against
// the content its own transaction's branch commit (or, lacking one, its snapshot commit) actually
// holds at that path -- an immutable fact once that commit exists, unaffected by later edits.
async function contentDigestAt(cwd, commitSha, path) {
  const r = await git(['rev-parse', '--verify', '-q', `${commitSha}:${path}`], { cwd, expect: [0, 1, 128] });
  if (r.code !== 0) return null;
  return sha256((await git(['cat-file', 'blob', r.stdout.trim()], { cwd })).raw);
}

// The store's actual identity right now, by the same rule driftedEntry checks it against: a file
// against the commit that was supposed to record it, everything else against its live ref/HEAD.
// Shared with driftRepair (below) so the repair line and the drift check never disagree.
async function identityNow(cwd, entry, results) {
  if (entry.store.startsWith('file:')) {
    const path = entry.store.slice(5);
    const branch = results.find((e) => e.store === 'HEAD');
    const snap = results.find((e) => e.store === layoutOf(cwd).snapshots);
    const commitSha = branch?.identity ?? snap?.identity ?? null;
    return commitSha ? await contentDigestAt(cwd, commitSha, path) : null;
  }
  return entry.store === 'HEAD' ? await headSha(cwd) : await readRef(cwd, entry.store);
}

// Fix round 1 finding 3 (append-only refs and HEAD): an append-only ref or HEAD naturally advances
// past the identity this transaction recorded as later, unrelated commands run -- that is
// progress, not drift. Ancestry, not equality, is the right check: the recorded identity must
// still be reachable from the store's current tip, or something rewrote history out from under it.
async function driftedEntry(cwd, entry, results) {
  const cur = await identityNow(cwd, entry, results);
  if (entry.store.startsWith('file:')) return cur !== entry.identity;
  if (cur === entry.identity) return false;
  if (!cur || !entry.identity) return true;
  // Fix round 2 finding 4: a fabricated or garbage-collected sha makes --is-ancestor exit 128, not
  // 1 (git's own "not a valid object name" case); both mean "not an ancestor" here (drift), not a
  // git plumbing failure that should propagate as a raw GitError out of pendingTransaction.
  const r = await git(['merge-base', '--is-ancestor', entry.identity, cur], { cwd, expect: [0, 1, 128] });
  return r.code !== 0;
}

// Fix round 2 finding 1: a completed transaction that pendingTransaction names again because a
// store drifted has no staging left -- finish() already removed it on success. recover()'s old
// "staging is missing" text, printed regardless, misdescribed this (nothing is missing; the
// transaction completed) and told the developer to re-run a command that already committed. This
// names exactly what drifted: each entry's store, its recorded identity and its actual one now.
async function driftRepair(cwd, tx, closing) {
  const lines = [];
  for (const entry of closing.payload.results ?? []) {
    if (!(await driftedEntry(cwd, entry, closing.payload.results))) continue;
    const actual = await identityNow(cwd, entry, closing.payload.results);
    lines.push(`${entry.store} is ${actual}, expected ${entry.identity}`);
  }
  return `sudus: transaction ${tx} completed, but drifted: ${lines.join('; ')}; restore each store to its recorded identity, or accept the change and continue`;
}

// Fix round 1 findings 3 and 12, both on this function. (12) The newest command-intent for a given
// id is selected with findLast, not the first found by iteration order; the log is append-only, so
// an earlier record sharing that id (a reused test fixture name, or any other reuse) is stale.
// (3) A transaction with a terminal or abort record is not necessarily done needing recovery's
// attention: its own recorded `results` (or an abort's `restored`, read the same way) name what
// each store should still hold, and if one no longer matches, this names that intent as pending
// again. This is the only place that check can live for wake's benefit: plan 08's own draft reads
// only this function's return (`pendingTransaction`), never a separate predicate, to decide
// whether to name `sudus recover`. Only the newest transaction is checked, not the whole log's
// history, keeping the cost bounded and matching the reviewer's own worked example ("after a
// completed transaction, tamper one store").
export async function pendingTransaction(cwd, log) {
  const closed = new Set();
  for (const r of log) {
    if (r.kind === 'command-abort') closed.add(r.payload.intent);
    else if (r.kind !== 'command-intent' && typeof r.payload.intent === 'string') closed.add(r.payload.intent);
  }
  const open = log.findLast((r) => r.kind === 'command-intent' && !closed.has(r.sha));
  if (open) return open;
  const last = log.findLast((r) => r.kind === 'command-intent');
  if (!last) return null;
  const closing = closingRecord(log, last.sha);
  for (const entry of closing?.payload.results ?? []) {
    if (await driftedEntry(cwd, entry, closing.payload.results)) return last;
  }
  return null;
}

// Fix round 1 finding 12: "any record after the intent" over-counted -- an unrelated command that
// appended records for its own, different reasons made this always true well past this
// transaction's own effects. Scoped to records this transaction actually caused: one whose payload
// names this intent (our own terminal or abort record), or one that matches one of our planned
// 'log' writes by kind, target and payload (the same match applyWrites uses for its own
// idempotency check above).
export async function effectsHappened(cwd, s, log, intent) {
  if (Object.keys(s.done).length) return true;
  const after = log.slice(log.findIndex((r) => r.sha === intent.sha) + 1);
  if (after.some((r) => r.payload && r.payload.intent === intent.sha)) return true;
  for (const w of s.plan.writes) {
    if (w.store === 'log' && after.some((r) => r.kind === w.kind && r.target === w.target && canonicalize(r.payload) === canonicalize(w.payload))) return true;
  }
  if ((await readRef(cwd, layoutOf(cwd).snapshots)) !== s.pre.refs[layoutOf(cwd).snapshots]) return true;
  if ((await headSha(cwd)) !== s.pre.head) return true;
  // Fix round 3 finding 3 (Minor): s.pre.files carries a pre-identity for every 'file' AND
  // 'append' write (preIdentities, above), but a plain digest-changed check is the wrong test for
  // 'append': a concurrent command's own append to that same path also changes its digest, with
  // none of THIS transaction's own bytes ever having landed. That falsely read as "this
  // transaction's effect happened", steering recovery toward finish() (replaying writes that never
  // ran) instead of correctly aborting. An 'append' path is checked separately, below, by whether
  // its own staged bytes are actually present in the file -- the same exact-containment test
  // applyWrites' own 'append' branch uses for its idempotency (fix round 3 finding 1) -- not by a
  // digest comparison that anyone's write can flip.
  const appendPaths = new Set(s.plan.writes.filter((w) => w.store === 'append').map((w) => w.path));
  for (const [p, d] of Object.entries(s.pre.files)) {
    if (appendPaths.has(p)) continue;
    if (fileDigest(cwd, p) !== d) return true;
  }
  for (let n = 0; n < s.plan.writes.length; n++) {
    const w = s.plan.writes[n];
    if (w.store !== 'append') continue;
    const cur = existsSync(join(cwd, w.path)) ? readFileSync(join(cwd, w.path)) : Buffer.alloc(0);
    if (cur.includes(s.bytes(n))) return true;
  }
  return false;
}

export async function recover(cwd, tx) {
  const release = await acquireLock(cwd, tx);
  try {
    const log = await readLog(cwd);
    // Fix round 1 finding 12: findLast, not find (first) -- the newest command-intent record for
    // this id is the one recovery acts on.
    const intent = log.findLast((r) => r.kind === 'command-intent' && r.target === tx) ?? null;
    const s = await readStaging(cwd, tx);
    const pending = intent ? await pendingTransaction(cwd, log) : null;
    if (intent && pending?.sha !== intent.sha) { if (s) rmSync(s.dir, { recursive: true, force: true }); return { completed: 'forward' }; }
    if (!intent) { if (s) rmSync(s.dir, { recursive: true, force: true }); return { completed: 'abort' }; }
    if (!s) {
      // Fix round 2 finding 1: pendingTransaction now also names a CLOSED transaction whose store
      // drifted (fix round 1 finding 3) -- its staging is genuinely gone (finish() removed it on
      // success), so the generic "staging is missing" text below, which assumes an interrupted,
      // never-finished transaction, misdescribes it and wrongly advises re-running a command that
      // already committed. A closing record here means this is the drifted-but-completed case.
      const closing = closingRecord(log, intent.sha);
      if (closing) return { completed: 'blocked', repair: await driftRepair(cwd, tx, closing) };
      // Fix round 1 finding 4: every write now carries a digest (file, branch, snapshot and log
      // alike), so the repair line names one for each rather than falling back to the store name.
      const repair = `sudus: staging for transaction ${tx} is missing; its intent ${intent.sha} names ${intent.payload.writes.length} writes with digests ${intent.payload.writes.map((w) => w.digest).join(', ')}; check each store against them, restore ${intent.payload.pre.head} as HEAD if no write landed, then run the command again`;
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
    // Fix round 1 finding 2: `restored` used to copy the pre-identities captured before the
    // intent, including refs/sudus/log's -- which can never be true again, since the log is
    // append-only and the intent's own record already advanced it past that captured value. Every
    // store is re-read here, under the lock, so `restored` names what each one actually holds
    // right now, its real identity, not a stale claim from before the crash.
    const restored = [
      { store: layoutOf(cwd).log, identity: await readRef(cwd, layoutOf(cwd).log) },
      { store: layoutOf(cwd).snapshots, identity: await readRef(cwd, layoutOf(cwd).snapshots) },
      { store: 'HEAD', identity: await headSha(cwd) },
      ...Object.keys(s.pre.files).map((p) => ({ store: `file:${p}`, identity: fileDigest(cwd, p) })),
    ];
    // Fix round 1 finding 3: `results` on an abort is always the empty list -- none of the plan's
    // writes landed (effectsHappened above was false), so there is no resulting identity of this
    // transaction's own to report; `restored` already names what every store was put back to.
    await appendRecord(cwd, 'command-abort', tx, { intent: intent.sha, failure_class: 'interrupted', restored, results: [] });
    rmSync(s.dir, { recursive: true, force: true });
    return { completed: 'abort' };
  } finally { release(); }
}

// Fix round 1 finding 3: pendingTransaction now also names a closed transaction whose recorded
// results no longer match reality (see its own comment above); the reason line distinguishes that
// case from the plain "not yet terminal" one, since they call for different attention.
export async function recoverPredicate(cwd, log) {
  const p = await pendingTransaction(cwd, log);
  if (!p) return null;
  const closing = closingRecord(log, p.sha);
  const reason = closing
    ? `command-intent ${p.sha} for ${p.payload.command} closed, but a store no longer matches the identity it recorded; recover it before continuing`
    : `command-intent ${p.sha} for ${p.payload.command} has no terminal record`;
  return { action: 'recover', target: p.target, reason };
}

export async function runRecover(argv, io) {
  const tx = argv[0];
  if (!tx) { io.stderr('sudus: recover needs a transaction id'); return 1; }
  try {
    const r = await recover(io.cwd, tx);
    if (r.completed === 'blocked') { io.stdout(r.repair); return 3; }
    io.stdout(`sudus: transaction ${tx} ${r.completed === 'forward' ? 'completed' : 'aborted'}`);
    return 0;
  } catch (e) { io.stderr(e.message.startsWith('sudus: ') ? e.message : `sudus: ${e.message}`); return 1; }
}
