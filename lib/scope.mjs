// lib/scope.mjs
import { lstat, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { git, listTree } from './gitx.mjs';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { readAdr } from './adr.mjs';
import { loadSettings } from './settings.mjs';
import { appendRecord, range, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot, allowedBase } from './snapshots.mjs';
import { classify } from './paths.mjs';
import { readLease } from './lease.mjs';

export class ScopeError extends Error { constructor(m) { super(m); this.name = 'ScopeError'; } }

async function workspacePaths(cwd) {
  const tracked = (await git(['ls-files', '-z'], { cwd })).stdout.split('\0').filter(Boolean);
  const untracked = (await git(['ls-files', '-z', '--others', '--exclude-standard'], { cwd })).stdout.split('\0').filter(Boolean);
  return new Set([...tracked, ...untracked].filter((p) => !p.startsWith('.cairn/output/')));
}

async function entryOf(cwd, p) {
  const st = await lstat(join(cwd, p));
  const bytes = st.isSymbolicLink() ? Buffer.from(await readlink(join(cwd, p))) : await readFile(join(cwd, p));
  const mode = st.isSymbolicLink() ? '120000' : (st.mode & 0o111) ? '100755' : '100644';
  const sha = (await git(['hash-object', '--stdin'], { cwd, input: bytes })).stdout.trim();
  return { mode, sha };
}

// Deviation from the plan text: `git ls-files` (tracked) lists a path regardless of whether it
// still exists on disk -- a tracked file removed from the worktree without `git rm` is still
// listed. The plan's original loop called entryOf() (an unguarded lstat) on every workspacePaths()
// entry, which threw a raw ENOENT for exactly that case (reproduced: removing a tracked file and
// diffing against a snapshot crashed instead of reporting a deletion). lib/gitx.mjs's own
// writeTreeFromPaths already treats a missing tracked path as absent from the tree (`try { st =
// await lstat(...) } catch { continue; }`); workspaceDelta now applies the same rule; a path whose
// bytes cannot be read is simply not "present," so it falls through to the deleted-paths loop
// below along with any path git never listed at all.
export async function workspaceDelta(cwd, treeSha) {
  const entries = new Map((await listTree(cwd, treeSha)).map((e) => [e.path, e]));
  const candidates = await workspacePaths(cwd);
  const present = new Set();
  const out = [];
  for (const p of candidates) {
    let cur;
    try { cur = await entryOf(cwd, p); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    present.add(p);
    const e = entries.get(p);
    if (!e) out.push({ path: p, change: 'added' });
    else if (e.sha !== cur.sha || e.mode !== cur.mode) out.push({ path: p, change: 'modified' });
  }
  for (const p of entries.keys()) if (!present.has(p)) out.push({ path: p, change: 'deleted' });
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export function declaredPaths(mechanisms, lease) {
  const out = new Set();
  for (const m of Object.values(mechanisms)) for (const p of [...m.definition.inputs, ...(m.definition.documents || [])]) out.add(p);
  for (const p of lease?.touch || []) out.add(p);
  return out;
}

export function isDeclared(path, declared) {
  for (const d of declared) if (path === d || path.startsWith(d + '/')) return true;
  return false;
}

export function leaseCovers(lease, mechanisms, path) {
  if (!lease) return false;
  if ((lease.touch || []).includes(path)) return true;
  const owning = Object.fromEntries(Object.entries(mechanisms).filter(([, m]) => m.definition.requirements.includes(lease.target)));
  return isDeclared(path, declaredPaths(owning, null));
}

export function declarationSetDigest(mechanisms) {
  const set = Object.fromEntries(Object.keys(mechanisms).sort().map((n) => [n, mechanisms[n].definitionDigest]));
  return sha256(canonicalize(set));
}

// Deviation from the plan text: the plan's protectedDigests hashes the raw bytes of
// .cairn/settings.json, but lib/auth.mjs's own protectedDigests (plan 03, already committed) and
// every settings_digest already written into 'init'/'authorization' records use
// sha256(canonicalize(parsed settings)) via lib/settings.mjs's loadSettings -- the digest of the
// *value*, not the file's literal bytes. tests/helpers/repo.mjs's makeProject writes settings.json
// pretty-printed (JSON.stringify(..., null, 2) + '\n'), so a raw-byte digest would never equal a
// real authorization record's settings_digest and Task 6's "authorized" comparison could never
// pass. loadSettings's own .digest is used here so this module's settings digest always agrees
// with the one the rest of the kernel writes and compares.
export async function protectedDigests(cwd) {
  const bytes = (p) => readFile(join(cwd, p));
  const specPaths = [...await workspacePaths(cwd)].filter((p) => p.startsWith('docs/spec/')).sort();
  const spec = [];
  for (const p of specPaths) spec.push([p, sha256(await bytes(p))]);
  return { spec: sha256(canonicalize(spec)), agreement: sha256(await bytes('AGENTS.md')), settings: (await loadSettings(cwd)).digest };
}

async function baseBytes(cwd, treeSha, path) {
  const e = (await listTree(cwd, treeSha)).find((x) => x.path === path);
  if (!e) return Buffer.alloc(0);
  return Buffer.from((await git(['cat-file', 'blob', e.sha], { cwd })).stdout, 'utf8');
}

// Deviation from the plan text: on this branch .cairn/mechanisms (lib/mechanisms.mjs's
// MECHANISMS_DIR) is a directory of one canonical-JSON file per mechanism name
// (.cairn/mechanisms/<name>.json, written whole by declare()/reviewMechanism(), never appended
// to), not the single file the plan's literal `path === '.cairn/mechanisms'` branch assumed --
// reading that bare path as a file throws EISDIR. The mechanisms branch below matches any path
// under the directory instead, and validates it the same way the plan intended: the file's own
// bytes must be exactly one canonical JSON document (parseStrict, the same exactness test plan 05
// writeEntry produces), and the whole directory must still read cleanly through readMechanisms
// (which refuses an unknown top-level key, a malformed definition shape, or review metadata left
// bound to a stale definition digest).
export async function kernelManagedValid(cwd, path, baseTree) {
  const now = await readFile(join(cwd, path)).catch(() => null);
  if (now === null) return false;                                   // deletion
  if (path === 'docs/decisions.jsonl') {
    const base = await baseBytes(cwd, baseTree, path);
    // Deviation from the plan text: a bare prefix-equality check (`now`'s first base.length bytes
    // equal base) is trivially satisfied whenever now.length === base.length -- including the
    // degenerate case this file starts in, base.length === 0 (docs/decisions.jsonl does not yet
    // exist at the allowed base), where truncating an appended line back to an empty file has an
    // empty prefix that "equals" the empty base again. That made the plan's own third assertion
    // (truncating the file back to '' after a valid append) come back true instead of false.
    // Every genuine appendDecision() mutation strictly grows the file, so requiring now.length >
    // base.length closes the gap without narrowing any legitimate append.
    if (now.length <= base.length || !now.subarray(0, base.length).equals(base)) return false;    // not append-only: edit, reorder, deletion or no growth
    try { await readAdr(cwd); } catch { return false; }             // readAdr throws on any breach of the line rules
    for (const line of now.subarray(base.length).toString('utf8').split('\n').filter(Boolean)) {
      try { parseStrict(line); } catch { return false; }
    }
    return true;
  }
  if (path.startsWith('.cairn/mechanisms/') && path.endsWith('.json')) {
    try { parseStrict(now.toString('utf8')); await readMechanisms(cwd); } catch { return false; }
    return true;
  }
  return false;
}

export const pathToken = (path) => sha256(path).slice('sha256:'.length, 'sha256:'.length + 16);

export function openBreaches(log) {
  const disposed = new Set(log.filter((r) => r.kind === 'scope').map((r) => r.payload.breach));
  return log.filter((r) => r.kind === 'scope-breach' && !disposed.has(r.sha)).map((r) => ({ sha: r.sha, ...r.payload }));
}

// Deviation from the plan text: lib/records.mjs's settled 'authorization' schema names its three
// bound digests spec_digest/agreement_digest/settings_digest, not spec/agreement/settings (the
// plan's own field-name shorthand). authorized() must read the record by its real field names to
// ever find a match.
const AUTH_FIELD = { agreement: 'agreement_digest', settings: 'settings_digest', spec: 'spec_digest' };
function authorized(path, digests, log) {
  const key = path === 'AGENTS.md' ? 'agreement' : path === '.cairn/settings.json' ? 'settings' : 'spec';
  return log.some((r) => r.kind === 'authorization' && r.payload[AUTH_FIELD[key]] === digests[key]);
}

export async function preflight(cwd, log, { command = null } = {}) {
  if (!log.some((r) => r.kind === 'start')) return [];    // before the first start there is no allowed base to compare with
  const { settings } = await loadSettings(cwd);
  const base = await allowedBase(cwd, log);
  const { tree } = await readSnapshot(cwd, base, 'workspace');
  // Deviation from the plan text: readMechanisms(cwd) throws MechanismError for the whole
  // directory when even one entry is not exactly canonical JSON or has a malformed shape -- which
  // is exactly the state a hand-edited or corrupted mechanism file is in while this preflight is
  // trying to observe that very corruption as a scope breach. An uncaught throw here would stop
  // the preflight from ever reaching the loop that records the breach. Falling back to no
  // declarations at all when the directory cannot be read keeps every changed path in this pass
  // undeclared (never fewer breaches than a readable directory would produce), and
  // kernelManagedValid's own internal readMechanisms call (per path) still reports the specific
  // corrupted mechanism file as invalid.
  let mechanisms; try { mechanisms = await readMechanisms(cwd); } catch { mechanisms = {}; }
  const lease = await readLease(cwd);
  const declared = declaredPaths(mechanisms, lease);
  const open = new Set(openBreaches(log).map((b) => b.path));
  const rangeOpen = Boolean(range(log).start) && !range(log).closed;
  const digests = await protectedDigests(cwd);
  const shas = [];
  let firstObserved = null;
  for (const { path } of await workspaceDelta(cwd, tree)) {
    const cls = classify(path, settings);
    if (cls === 'outside' || cls === 'output' || open.has(path)) continue;
    if (cls === 'kernel-managed' && await kernelManagedValid(cwd, path, tree)) continue;
    if (cls === 'protected' && (command === 'authorize' || !rangeOpen || authorized(path, digests, log))) continue;
    if (cls !== 'kernel-managed' && cls !== 'protected' && cls !== 'reserved' && isDeclared(path, declared)) continue;
    firstObserved ??= await writeWorkspaceSnapshot(cwd);
    shas.push(await appendRecord(cwd, 'scope-breach', pathToken(path), {
      path, snapshot: firstObserved, base, declarations_digest: declarationSetDigest(mechanisms),
    }));
  }
  return shas;
}

// Deviation from the plan text: the plan destructures `breach.payload` as `{path, allowed_base}`,
// but the settled 'scope-breach' schema (lib/records.mjs) names that field `base`, not
// `allowed_base` (see Task 5's field-name note); this reads `base` and keeps the local variable
// name `base` throughout, which does not collide with lib/snapshots.mjs's allowedBase (a
// differently-named function this module does not import).
export async function dispose(cwd, breachSha, disposition) {
  if (disposition !== 'keep' && disposition !== 'restore') throw new ScopeError(`cairn: disposition is keep or restore, not ${disposition}`);
  const log = await readLog(cwd);
  const breach = log.find((r) => r.kind === 'scope-breach' && r.sha === breachSha);
  if (!breach) throw new ScopeError(`cairn: no scope-breach record ${breachSha}`);
  if (log.some((r) => r.kind === 'scope' && r.payload.breach === breachSha)) throw new ScopeError(`cairn: scope-breach ${breachSha} already has a disposition`);
  const { path, base } = breach.payload;
  let escalation = null, answer = null;
  if (disposition === 'keep') {
    const esc = log.filter((r) => r.kind === 'escalation' && r.payload.concerns === `scope-breach:${breachSha}`).at(-1);
    const ok = esc && log.filter((r) => r.kind === 'answer' && r.payload.escalation === esc.sha && r.payload.kind === 'ok').at(-1);
    if (!ok) throw new ScopeError(`cairn: keep needs an escalation answered ok that concerns scope-breach:${breachSha}`);
    escalation = esc.sha; answer = ok.sha;
  } else {
    const { tree } = await readSnapshot(cwd, base, 'workspace');
    if ((await workspaceDelta(cwd, tree)).some((d) => d.path === path)) throw new ScopeError(`cairn: ${path} still differs from its allowed base ${base}`);
  }
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'scope', pathToken(path), { breach: breachSha, disposition, snapshot, escalation, answer });
}

export const STATE_CHANGING = new Set(['begin', 'end', 'check', 'declare', 'review-mechanism', 'review', 'brief', 'report', 'resolve', 'accept', 'escalate', 'answer', 'reply', 'item', 'outside', 'fix', 'decide', 'realize', 'promote', 'authorize', 'start', 'done', 'supersede', 'scope', 'calibrate']);

export async function runWithPreflight(cwd, command, fn) {
  if (STATE_CHANGING.has(command)) await preflight(cwd, await readLog(cwd), { command });
  return fn();
}

// Deviation from the plan text: two adaptations to lib/cli.mjs's real (already-committed) command
// shape, neither of which this plan's Interfaces block anticipated.
//
// 1. COMMANDS entries on this branch are `{usage, run(args, ctx)}` where ctx carries Node-stream
// stdout/stderr (ctx.stdout.write(...)), the same shape lib/cli.mjs's own show/lintCommand use --
// not the plan's `run(cwd, argv) -> exit code`. cmdScope takes (argv, {cwd, stdout, stderr}) to
// match.
//
// 2. dispose() throws ScopeError with "cairn: " already the start of its message (Task 9's own
// interface note, and its tests check the message directly); lib/cli.mjs's main() catch always
// prepends its own "cairn: " with no check for an existing prefix, which every command reached
// through main() other than one with its own local catch (lib/lease.mjs's refusing(), lib/auth.mjs's
// refusing()) relies on. Routing a ScopeError through main() unchanged would print a doubled
// "cairn: cairn: ...". cmdScope catches locally and applies the same "only add the prefix if it is
// not already there" rule those two modules already use, so it never throws out to main().
export async function cmdScope(argv, { cwd, stdout, stderr }) {
  const [breach, disposition] = argv;
  try {
    if (!breach || !disposition) throw new ScopeError('cairn: usage: cairn scope <breach-sha> keep|restore');
    const sha = await dispose(cwd, breach, disposition);
    stdout.write(`scope ${sha} ${disposition} ${breach}\n`);
    return 0;
  } catch (e) {
    stderr.write(e.message.startsWith('cairn: ') ? `${e.message}\n` : `cairn: ${e.message}\n`);
    return 1;
  }
}
