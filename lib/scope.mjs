// lib/scope.mjs
import { lstat, readlink, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git, listTree, gitPath, gitlinkSha } from './gitx.mjs';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { readAdr, withoutBookkeeping, ADR_PATH } from './adr.mjs';
import { loadSettings } from './settings.mjs';
import { protectedDigests } from './auth.mjs';
import { appendRecord, range, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot, allowedBase, SnapshotError } from './snapshots.mjs';
import { classify } from './paths.mjs';
import { isOutputPath, isMechanismDefinition, SETTINGS_PATHS, LAYOUTS } from './layout.mjs';
import { readLease } from './lease.mjs';

export { protectedDigests };
export class ScopeError extends Error { constructor(m) { super(m); this.name = 'ScopeError'; } }

async function workspacePaths(cwd) {
  const tracked = (await git(['ls-files', '-z'], { cwd })).stdout.split('\0').filter(Boolean);
  // Issue #19: an untracked nested repository or worktree is listed as its directory with a
  // trailing slash; it is not project content (lib/snapshots.mjs listPaths leaves it out too).
  const untracked = (await git(['ls-files', '-z', '--others', '--exclude-standard'], { cwd })).stdout.split('\0').filter((p) => p && !p.endsWith('/'));
  return new Set([...tracked, ...untracked].filter((p) => !isOutputPath(p)));
}

// Fix round 2 item 1 (Critical): `git hash-object --stdin-paths` opens the path and reads through
// it -- for a symlink that means the bytes of whatever it points at, not the link text the
// snapshot tree actually stores (an unchanged tracked symlink came back "modified", forever), and
// a dangling symlink makes the open fail and the spawn exit 128 (a raw GitError out of every
// state-changing command). It also runs the file through any clean filter and EOL conversion
// .gitattributes names, unlike the raw byte hashing this replaced (fix round 1 item 8), and
// C-unquotes an input line that begins with a literal double quote, matching git's own output-side
// quoting convention. Regular files are still batched into one spawn, with `--no-filters` to keep
// the raw bytes and a path beginning with `"` pulled out to hash on its own (positional argument
// mode, which is never C-quote-parsed) since `--stdin-paths` cannot represent a quoted line and a
// literal one; a symlink is never given to `--stdin-paths` at all -- its own link text is read
// with `readlink` and piped to `git hash-object --stdin` individually (one spawn per symlink; they
// are rare, and a dangling one is never opened at all this way).
export async function workspaceDelta(cwd, treeSha) {
  const entries = new Map((await listTree(cwd, treeSha)).map((e) => [e.path, e]));
  const present = [];
  const modes = new Map();
  const batchable = [];
  const quoted = [];
  const symlinks = [];
  const shas = new Map();
  for (const p of await workspacePaths(cwd)) {
    let st;
    try { st = await lstat(join(cwd, p)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    present.push(p);
    if (st.isSymbolicLink()) { modes.set(p, '120000'); symlinks.push(p); }
    else if (st.isDirectory()) {
      // A tracked submodule is a gitlink, as in the snapshot tree (lib/gitx.mjs gitlinkSha).
      const sha = await gitlinkSha(cwd, p);
      if (!sha) throw new ScopeError(`sudus: ${p} is a directory git tracks as a file; commit or remove it`);
      modes.set(p, '160000'); shas.set(p, sha);
    }
    else {
      modes.set(p, (st.mode & 0o100) ? '100755' : '100644');
      (p.startsWith('"') ? quoted : batchable).push(p);
    }
  }
  if (batchable.length) {
    const out = (await git(['hash-object', '--stdin-paths', '--no-filters'], { cwd, input: batchable.map((p) => p + '\n').join('') })).stdout.trim().split('\n');
    batchable.forEach((p, i) => shas.set(p, out[i]));
  }
  for (const p of quoted) shas.set(p, (await git(['hash-object', '--no-filters', '--', p], { cwd })).stdout.trim());
  for (const p of symlinks) {
    const target = await readlink(join(cwd, p));
    shas.set(p, (await git(['hash-object', '--stdin'], { cwd, input: Buffer.from(target) })).stdout.trim());
  }
  const presentSet = new Set(present);
  const out = [];
  present.forEach((p) => {
    const e = entries.get(p);
    const cur = { mode: modes.get(p), sha: shas.get(p) };
    if (!e) out.push({ path: p, change: 'added', mode: cur.mode, sha: cur.sha });
    else if (e.sha !== cur.sha || e.mode !== cur.mode) out.push({ path: p, change: 'modified', mode: cur.mode, sha: cur.sha });
  });
  for (const p of entries.keys()) if (!presentSet.has(p)) out.push({ path: p, change: 'deleted', mode: null, sha: null });
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

// A recorded snapshot still stands for the workspace when nothing differs but bookkeeping lines
// in the ADR (lib/adr.mjs BOOKKEEPING_KINDS). Wake's review predicate and the report check compare
// through this (spec item 50: valid bookkeeping may not generate its own violation). Before, the
// developer's ok on an escalation moved the workspace off the reviewed snapshot for one answered
// line.
export async function atSnapshot(cwd, tree) {
  const delta = await workspaceDelta(cwd, tree);
  if (delta.length === 0) return true;
  if (delta.length > 1 || delta[0].path !== ADR_PATH || delta[0].change === 'deleted') return false;
  const before = delta[0].change === 'added' ? '' : (await git(['cat-file', 'blob', `${tree}:${ADR_PATH}`], { cwd })).stdout;
  return withoutBookkeeping(before) === withoutBookkeeping(await readFile(join(cwd, ADR_PATH), 'utf8'));
}

export function declaredPaths(mechanisms, lease) {
  const out = new Set();
  for (const m of Object.values(mechanisms)) for (const p of [...m.definition.inputs, ...(m.definition.documents || [])]) out.add(p);
  for (const p of lease?.touch || []) out.add(p);
  return out;
}

// A trailing slash on a declared input (src/, in a definition written by hand or before declare
// validated inputs) names the same directory: without this, src/ covered nothing (review of 3.5.0).
export function isDeclared(path, declared) {
  for (const input of declared) {
    const d = input.replace(/\/+$/, '');
    if (path === d || path.startsWith(d + '/')) return true;
  }
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

async function baseBytes(cwd, treeSha, path) {
  const e = (await listTree(cwd, treeSha)).find((x) => x.path === path);
  if (!e) return Buffer.alloc(0);
  return (await git(['cat-file', 'blob', e.sha], { cwd })).raw;   // fix round 1 item 9: raw bytes, no UTF-8 round trip
}

const MANAGED_LEDGER = 'sudus-managed';

// Fix round 1 item 2: the local record of exactly what an assigned command wrote, so
// kernelManagedValid can tell that exact mutation apart from a hand edit that merely looks
// canonical and schema-valid. One line per write: "<path><TAB><sha256 of the bytes>".
// Fix round 2 item 3: keyed with a tab, not a space -- a space-separated line misreads a path
// that itself contains a space (indexOf(' ') would split inside the path, not after it).
export async function recordManagedWrite(cwd, path, bytes) {
  await appendFile(await gitPath(cwd, MANAGED_LEDGER), `${path}\t${sha256(bytes)}\n`);
}
export async function managedWriteDigest(cwd, path) {
  let text;
  try { text = await readFile(await gitPath(cwd, MANAGED_LEDGER), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  let latest = null;
  for (const line of text.split('\n')) {
    const sp = line.indexOf('\t');
    if (sp > 0 && line.slice(0, sp) === path) latest = line.slice(sp + 1);
  }
  return latest;
}

// Fix round 1 item 2: a kernel-managed path is exempt only when its current bytes are exactly
// what the ledger recorded for the assigned command's last write, or exactly the allowed base's
// bytes (no change at all); a canonical, schema-valid hand edit that never went through
// declare()/reviewMechanism()/appendDecision() no longer passes just by parsing cleanly. The ADR
// keeps its append-only check in addition, since decisions.jsonl's own invariant (never edited,
// reordered or shortened) is a separate rule from "who wrote it."
// Issue #7: sudus migrate moves the mechanism definitions from the former layout's directory to
// the current one between commitments, and the next preflight compares the workspace with a base
// that still holds the former paths. Each moved file read as two breaches: the former path as a
// deletion, the new path as bytes with no base and no ledger line (declare recorded its write
// under the former path). A path under either layout's mechanism directory resolves its
// counterpart under the other: the new path is valid when its bytes are the base's bytes at the
// former path, or the ledger's digest for it; the former path's deletion is valid when the
// counterpart is valid by that same rule. The move is the kernel's own, never a hand edit. The
// deletion used to need the base's bytes intact at the counterpart, so a definition redeclared
// after the move, before the next start, left a breach on its former path.
export function formerLayoutCounterpart(path) {
  for (const l of LAYOUTS) {
    if (!path.startsWith(`${l.mechanisms}/`)) continue;
    const other = LAYOUTS.find((x) => x !== l);
    return `${other.mechanisms}/${path.slice(l.mechanisms.length + 1)}`;
  }
  return null;
}
export async function kernelManagedValid(cwd, path, baseTree) {
  const now = await readFile(join(cwd, path)).catch(() => null);
  const counterpart = formerLayoutCounterpart(path);
  if (now === null) {                                                // deletion
    if (!counterpart || (await baseBytes(cwd, baseTree, path)).length === 0) return false;
    return (await readFile(join(cwd, counterpart)).catch(() => null)) !== null && kernelManagedValid(cwd, counterpart, baseTree);
  }
  const base = await baseBytes(cwd, baseTree, path);
  let matches = sha256(now) === await managedWriteDigest(cwd, path) || now.equals(base);
  if (!matches && counterpart) {
    const formerBase = await baseBytes(cwd, baseTree, counterpart);
    matches = (formerBase.length > 0 && now.equals(formerBase)) || sha256(now) === await managedWriteDigest(cwd, counterpart);
  }
  if (!matches) return false;
  if (path === 'docs/decisions.jsonl') {
    if (now.length <= base.length || !now.subarray(0, base.length).equals(base)) return false;    // not append-only: edit, reorder, deletion or no growth
    try { await readAdr(cwd); } catch { return false; }             // readAdr throws on any breach of the line rules
    for (const line of now.subarray(base.length).toString('utf8').split('\n').filter(Boolean)) {
      try { parseStrict(line); } catch { return false; }
    }
    return true;
  }
  return isMechanismDefinition(path);
}

export const pathToken = (path) => sha256(path).slice('sha256:'.length, 'sha256:'.length + 16);

// A breach recorded between commitments (versions through 2.2.1 recorded them, and the spec
// phase's own instructions guaranteed one for every new mechanism file) is closed by the next
// start: its snapshot is the new allowed base and holds the path.
export function closedByStart(log) {
  const out = new Set();
  let inGap = false, pending = [];
  for (const r of log) {
    if (r.kind === 'done' || r.kind === 'superseded') { inGap = true; continue; }
    if (r.kind === 'start') { inGap = false; for (const s of pending) out.add(s); pending = []; continue; }
    if (r.kind === 'scope-breach' && inGap) pending.push(r.sha);
  }
  return out;
}
export function openBreaches(log) {
  const disposed = new Set(log.filter((r) => r.kind === 'scope').map((r) => r.payload.breach));
  const byStart = closedByStart(log);
  return log.filter((r) => r.kind === 'scope-breach' && !disposed.has(r.sha) && !byStart.has(r.sha)).map((r) => ({ sha: r.sha, ...r.payload }));
}

const AUTH_FIELD = { agreement: 'agreement_digest', settings: 'settings_digest', spec: 'spec_digest' };
function authorized(path, digests, log) {
  const key = path === 'AGENTS.md' ? 'agreement' : SETTINGS_PATHS.includes(path) ? 'settings' : 'spec';
  return log.some((r) => r.kind === 'authorization' && r.payload[AUTH_FIELD[key]] === digests[key]);
}

export async function preflight(cwd, log, { command = null } = {}) {
  if (!log.some((r) => r.kind === 'start')) return [];    // before the first start there is no allowed base to compare with
  // Fix round 1 item 3: loadSettings can throw SettingsError (missing or unreadable
  // .sudus/settings.json); without classify()'s own glob lists there is nothing left to compare
  // against, so this is a clean sudus: refusal naming the repair, never a raw error out of preflight.
  // Fix (Minor, final-review.md, replacing a stale fix-round-3 comment naming the deleted
  // escalateWithRoute/route mode): loadSettings (lib/settings.mjs) is a plain read-parse-validate-
  // digest function -- no calibration option, no route-mode gate; route mode is gone. This check
  // still runs one layer before every STATE_CHANGING command's own handler is ever reached,
  // including the measured work-loop's decideConsequential/escalateConsequential (lib/escalate.mjs),
  // which now run after sudus measure rather than through any route.
  let settings;
  try { ({ settings } = await loadSettings(cwd)); }
  catch (e) { throw new ScopeError(e.message.startsWith('sudus: ') ? e.message : `sudus: ${e.message}`); }
  const base = await allowedBase(cwd, log);
  const { tree } = await readSnapshot(cwd, base, 'workspace');
  // Fix round 2 item 2 (replaces fix round 1 item 4's approach): an unreadable mechanisms
  // directory always refuses the preflight, naming the file and the repair, whether or not the
  // corrupted entry is itself a currently-changed path. It may already be part of the allowed
  // base (e.g. accepted by an earlier keep), in which case it never appears in workspaceDelta at
  // all -- reproduced: with the fix round 1 approach (record only the corrupted path as a breach,
  // skip everything else), a stray file and an unauthorized AGENTS.md edit produced zero breaches
  // and no refusal, a silent failure.
  let mechanisms;
  try { mechanisms = await readMechanisms(cwd); }
  catch (e) { throw new ScopeError(`sudus: ${e.message}; repair it before the preflight can run`); }
  const lease = await readLease(cwd);
  const declared = declaredPaths(mechanisms, lease);
  const open = new Set(openBreaches(log).map((b) => b.path));
  const kept = await keptContent(cwd, log);
  const { start, closed } = range(log);          // fix round 1 item 9: range(log) computed once
  const rangeOpen = Boolean(start) && !closed;
  // Fix round 3 (plan 11 review): lib/auth.mjs's protectedDigests(cwd) computes its own `settings`
  // digest via loadSettings(cwd), now calibration-aware in lib/settings.mjs itself, so the round 2
  // workaround (computing the digest locally from an already-loaded `settings`) is redundant; call
  // protectedDigests directly again, the same re-export tests/scope.test.mjs already relies on.
  const digests = await protectedDigests(cwd);
  const shas = [];
  let firstObserved = null;
  for (const { path, mode, sha } of await workspaceDelta(cwd, tree)) {
    const cls = classify(path, settings);
    if (cls === 'outside' || cls === 'output' || open.has(path)) continue;
    if (kept.has(path) && kept.get(path) === `${mode} ${sha}`) continue;
    // Between commitments the workspace is being prepared for the next start, whose snapshot
    // becomes the allowed base: the spec phase writes the next commitment's mechanism files,
    // tests and declarations before sudus start, and every one of them read as an undeclared
    // change against the finished commitment's base. Only the kernel-managed ledger is checked.
    if (!rangeOpen && cls !== 'kernel-managed') continue;
    // Fix round 1 item 5, ruling: the roadmap is exempt from scope only between commitments
    // (when the developer and agent write the next section, and when start/promote edit it);
    // while a range is open it is an undeclared change like any other reserved path.
    if (path === 'docs/spec/roadmap.md' && !rangeOpen) continue;
    if (cls === 'kernel-managed') {
      if (await kernelManagedValid(cwd, path, tree)) continue;
    } else {
      if (cls === 'protected' && (command === 'authorize' || !rangeOpen || authorized(path, digests, log))) continue;
      if (cls !== 'protected' && cls !== 'reserved' && isDeclared(path, declared)) continue;
    }
    try { firstObserved ??= await writeWorkspaceSnapshot(cwd); }
    catch (e) {
      // Fix round 1 item 6: an untracked credential-shaped file anywhere in the workspace made
      // writeWorkspaceSnapshot throw a raw SnapshotError out of preflight, with no breach ever
      // recorded. Refuse cleanly instead, naming the actual offending path(s) from that error.
      if (!(e instanceof SnapshotError)) throw e;
      const detail = e.message.replace(/^refusing to snapshot untracked sensitive paths: /, '');
      throw new ScopeError(`sudus: ${detail} looks like a credential; remove it or list it in network_exclude before continuing`);
    }
    shas.push(await appendRecord(cwd, 'scope-breach', pathToken(path), {
      path, snapshot: firstObserved, base, declarations_digest: declarationSetDigest(mechanisms),
    }));
  }
  return shas;
}

// A keep is a disposition of the path's content, not of one record. While any other breach is
// still open the keep's snapshot cannot become the allowed base (allowedBase advances only when
// every breach is disposed), so the kept path still differs from the base at the next preflight;
// it used to be observed again and given a fresh breach, and a keep lasted exactly one command
// (fifteen concurrent breaches never converged). The path is skipped while its current mode and
// blob equal what the keep's snapshot holds (a kept deletion is `null null`); a later edit to a
// kept path is a new breach, as it should be.
async function keptContent(cwd, log) {
  const breachPath = new Map(log.filter((r) => r.kind === 'scope-breach').map((r) => [r.sha, r.payload.path]));
  const kept = new Map();
  const trees = new Map();
  for (const r of log) {
    if (r.kind !== 'scope' || r.payload.disposition !== 'keep') continue;
    const path = breachPath.get(r.payload.breach);
    if (path === undefined) continue;
    if (!trees.has(r.payload.snapshot)) {
      const { tree } = await readSnapshot(cwd, r.payload.snapshot, 'workspace');
      trees.set(r.payload.snapshot, new Map((await listTree(cwd, tree)).map((e) => [e.path, `${e.mode} ${e.sha}`])));
    }
    kept.set(path, trees.get(r.payload.snapshot).get(path) ?? 'null null');
  }
  return kept;
}

export async function dispose(cwd, breachRef, disposition) {
  if (disposition !== 'keep' && disposition !== 'restore') throw new ScopeError(`sudus: disposition is keep or restore, not ${disposition}`);
  const log = await readLog(cwd);
  let breachSha = breachRef;
  if (!/^[0-9a-f]{40}$/.test(breachRef)) {
    // wake names `scope PATH`; the path resolves to its one open breach.
    const open = openBreaches(log).filter((b) => b.path === breachRef);
    if (open.length === 0) throw new ScopeError(`sudus: no open scope-breach for ${breachRef}`);
    if (open.length > 1) throw new ScopeError(`sudus: ${open.length} open scope-breaches for ${breachRef}: ${open.map((b) => b.sha).join(', ')}; name one by sha`);
    breachSha = open[0].sha;
  }
  const breach = log.find((r) => r.kind === 'scope-breach' && r.sha === breachSha);
  if (!breach) throw new ScopeError(`sudus: no scope-breach record ${breachSha}`);
  if (log.some((r) => r.kind === 'scope' && r.payload.breach === breachSha)) throw new ScopeError(`sudus: scope-breach ${breachSha} already has a disposition`);
  const { path, base } = breach.payload;
  let escalation = null, answer = null;
  if (disposition === 'keep') {
    // The concern token the parser accepts and `sudus escalate` stores is `breach:<sha>`
    // (lib/escalate.mjs parseConcern); this used to look for `scope-breach:<sha>`, which the
    // parser refuses, so no escalation written through the command could ever satisfy keep.
    // Matched as one token of the space-joined concerns string, the way concerns() does.
    const token = `breach:${breachSha}`;
    const esc = log.filter((r) => r.kind === 'escalation' && r.payload.concerns.split(' ').includes(token)).at(-1);
    const ok = esc && log.filter((r) => r.kind === 'answer' && r.payload.escalation === esc.sha && r.payload.kind === 'ok').at(-1);
    if (!ok) throw new ScopeError(`sudus: keep needs an escalation answered ok that concerns ${token}`);
    // Review of 3.8.2: keep sealed whatever was on disk when it ran, so bytes swapped in after
    // the developer's ok were kept as approved. The ok keeps the bytes the breach captured.
    const { tree: captured } = await readSnapshot(cwd, breach.payload.snapshot, 'workspace');
    if ((await workspaceDelta(cwd, captured)).some((d) => d.path === path)) throw new ScopeError(`sudus: ${path} differs from the bytes breach ${breachSha} captured, which the developer's ok keeps; put those bytes back, or restore ${path} and escalate its new bytes as a new breach`);
    escalation = esc.sha; answer = ok.sha;
  } else {
    const { tree } = await readSnapshot(cwd, base, 'workspace');
    if ((await workspaceDelta(cwd, tree)).some((d) => d.path === path)) throw new ScopeError(`sudus: ${path} still differs from its allowed base ${base}`);
  }
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'scope', pathToken(path), { breach: breachSha, disposition, snapshot, escalation, answer });
}

// Sudus 4.0.0: 'decline' writes a record the way 'resolve' does, so it runs behind the same
// preflight; 'accept' and 'dispute' are gone with the acceptance rounds.
//
// Plan 16, Task 5, fix round 1 (controller ruling): 'measure' added -- measure() (lib/evaluate.mjs)
// writes 'evaluation-intent', 'evaluation-call' and 'measurement' records the same way `calibrate`
// (already in this set) writes its own 'calibration' record, so the same rule applies identically:
// a log-writing, non-begin/non-declare command needs the scope preflight and the cycle-counter
// settle exactly like its peers. Without this, `sudus measure` computed and recorded a measurement
// over a workspace that could hold a live, unrecorded scope breach, and the administrative cycle
// counter never settled after a measurement.
export const STATE_CHANGING = new Set(['begin', 'end', 'check', 'declare', 'review-mechanism', 'review', 'brief', 'report', 'resolve', 'decline', 'escalate', 'answer', 'reply', 'item', 'outside', 'fix', 'decide', 'realize', 'promote', 'authorize', 'start', 'done', 'supersede', 'scope', 'calibrate', 'measure']);

export async function runWithPreflight(cwd, command, fn) {
  if (STATE_CHANGING.has(command)) await preflight(cwd, await readLog(cwd), { command });
  return fn();
}

// Fix round 1 item 9: cmdScope no longer catches its own errors -- dispose()'s ScopeError already
// starts with "sudus: " (its own interface contract) and any other error is a genuine bug, not a
// domain refusal; both now reach lib/cli.mjs's main(), whose catch carries the one shared
// only-add-the-prefix-if-missing guard instead of a third local copy of it here.
//
// Issue #30: one escalation may name several breaches and one ok covers them, but this took one
// breach per call, so clearing N kept files took N commands. Every positional before the
// disposition is a breach, by sha or path; each gets its own scope record and its own line, in
// order, and a refusal names the breach it stopped at, after the lines already written.
export async function cmdScope(argv, { cwd, stdout }) {
  const disposition = argv.at(-1);
  const breaches = argv.slice(0, -1);
  if (breaches.length === 0) throw new ScopeError('sudus: usage: sudus scope <breach-sha or path>... keep|restore');
  for (const breach of breaches) {
    const sha = await dispose(cwd, breach, disposition);
    stdout.write(`scope ${sha} ${disposition} ${breach}\n`);
  }
  return 0;
}
