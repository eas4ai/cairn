// lib/scope.mjs
import { lstat, readlink, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git, listTree, gitPath } from './gitx.mjs';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { readAdr } from './adr.mjs';
import { loadSettings } from './settings.mjs';
import { protectedDigests } from './auth.mjs';
import { appendRecord, range, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot, allowedBase, SnapshotError } from './snapshots.mjs';
import { classify } from './paths.mjs';
import { readLease } from './lease.mjs';

export { protectedDigests };
export class ScopeError extends Error { constructor(m) { super(m); this.name = 'ScopeError'; } }

async function workspacePaths(cwd) {
  const tracked = (await git(['ls-files', '-z'], { cwd })).stdout.split('\0').filter(Boolean);
  const untracked = (await git(['ls-files', '-z', '--others', '--exclude-standard'], { cwd })).stdout.split('\0').filter(Boolean);
  return new Set([...tracked, ...untracked].filter((p) => !p.startsWith('.cairn/output/')));
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
  for (const p of await workspacePaths(cwd)) {
    let st;
    try { st = await lstat(join(cwd, p)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    present.push(p);
    if (st.isSymbolicLink()) { modes.set(p, '120000'); symlinks.push(p); }
    else {
      modes.set(p, (st.mode & 0o100) ? '100755' : '100644');
      (p.startsWith('"') ? quoted : batchable).push(p);
    }
  }
  const shas = new Map();
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

async function baseBytes(cwd, treeSha, path) {
  const e = (await listTree(cwd, treeSha)).find((x) => x.path === path);
  if (!e) return Buffer.alloc(0);
  return (await git(['cat-file', 'blob', e.sha], { cwd })).raw;   // fix round 1 item 9: raw bytes, no UTF-8 round trip
}

const MANAGED_LEDGER = 'cairn-managed';

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
export async function kernelManagedValid(cwd, path, baseTree) {
  const now = await readFile(join(cwd, path)).catch(() => null);
  if (now === null) return false;                                   // deletion
  const base = await baseBytes(cwd, baseTree, path);
  const matches = sha256(now) === await managedWriteDigest(cwd, path) || now.equals(base);
  if (!matches) return false;
  if (path === 'docs/decisions.jsonl') {
    if (now.length <= base.length || !now.subarray(0, base.length).equals(base)) return false;    // not append-only: edit, reorder, deletion or no growth
    try { await readAdr(cwd); } catch { return false; }             // readAdr throws on any breach of the line rules
    for (const line of now.subarray(base.length).toString('utf8').split('\n').filter(Boolean)) {
      try { parseStrict(line); } catch { return false; }
    }
    return true;
  }
  return path.startsWith('.cairn/mechanisms/') && path.endsWith('.json');
}

export const pathToken = (path) => sha256(path).slice('sha256:'.length, 'sha256:'.length + 16);

export function openBreaches(log) {
  const disposed = new Set(log.filter((r) => r.kind === 'scope').map((r) => r.payload.breach));
  return log.filter((r) => r.kind === 'scope-breach' && !disposed.has(r.sha)).map((r) => ({ sha: r.sha, ...r.payload }));
}

const AUTH_FIELD = { agreement: 'agreement_digest', settings: 'settings_digest', spec: 'spec_digest' };
function authorized(path, digests, log) {
  const key = path === 'AGENTS.md' ? 'agreement' : path === '.cairn/settings.json' ? 'settings' : 'spec';
  return log.some((r) => r.kind === 'authorization' && r.payload[AUTH_FIELD[key]] === digests[key]);
}

export async function preflight(cwd, log, { command = null } = {}) {
  if (!log.some((r) => r.kind === 'start')) return [];    // before the first start there is no allowed base to compare with
  // Fix round 1 item 3: loadSettings can throw SettingsError (missing or unreadable
  // .cairn/settings.json); without classify()'s own glob lists there is nothing left to compare
  // against, so this is a clean cairn: refusal naming the repair, never a raw error out of preflight.
  // Fix (Minor, final-review.md, replacing a stale fix-round-3 comment naming the deleted
  // escalateWithRoute/route mode): loadSettings (lib/settings.mjs) is a plain read-parse-validate-
  // digest function -- no calibration option, no route-mode gate; route mode is gone. This check
  // still runs one layer before every STATE_CHANGING command's own handler is ever reached,
  // including the measured work-loop's decideConsequential/escalateConsequential (lib/escalate.mjs),
  // which now run after cairn measure rather than through any route.
  let settings;
  try { ({ settings } = await loadSettings(cwd)); }
  catch (e) { throw new ScopeError(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); }
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
  catch (e) { throw new ScopeError(`cairn: ${e.message}; repair it before the preflight can run`); }
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
      throw new ScopeError(`cairn: ${detail} looks like a credential; remove it or list it in network_exclude before continuing`);
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

export async function dispose(cwd, breachSha, disposition) {
  if (disposition !== 'keep' && disposition !== 'restore') throw new ScopeError(`cairn: disposition is keep or restore, not ${disposition}`);
  const log = await readLog(cwd);
  const breach = log.find((r) => r.kind === 'scope-breach' && r.sha === breachSha);
  if (!breach) throw new ScopeError(`cairn: no scope-breach record ${breachSha}`);
  if (log.some((r) => r.kind === 'scope' && r.payload.breach === breachSha)) throw new ScopeError(`cairn: scope-breach ${breachSha} already has a disposition`);
  const { path, base } = breach.payload;
  let escalation = null, answer = null;
  if (disposition === 'keep') {
    // The concern token the parser accepts and `cairn escalate` stores is `breach:<sha>`
    // (lib/escalate.mjs parseConcern); this used to look for `scope-breach:<sha>`, which the
    // parser refuses, so no escalation written through the command could ever satisfy keep.
    // Matched as one token of the space-joined concerns string, the way concerns() does.
    const token = `breach:${breachSha}`;
    const esc = log.filter((r) => r.kind === 'escalation' && r.payload.concerns.split(' ').includes(token)).at(-1);
    const ok = esc && log.filter((r) => r.kind === 'answer' && r.payload.escalation === esc.sha && r.payload.kind === 'ok').at(-1);
    if (!ok) throw new ScopeError(`cairn: keep needs an escalation answered ok that concerns ${token}`);
    escalation = esc.sha; answer = ok.sha;
  } else {
    const { tree } = await readSnapshot(cwd, base, 'workspace');
    if ((await workspaceDelta(cwd, tree)).some((d) => d.path === path)) throw new ScopeError(`cairn: ${path} still differs from its allowed base ${base}`);
  }
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'scope', pathToken(path), { breach: breachSha, disposition, snapshot, escalation, answer });
}

// Fix round 1 finding 3 (plan 09 review): 'dispute' added -- dispute() (lib/escalate.mjs) calls
// the same escalate() 'escalate', 'answer' and 'reply' already run behind this preflight, and
// writes the same 'escalation' record kind, so section 5's "before any state-changing command"
// scope check applies to it identically. Without this, `cairn dispute` wrote an escalation
// record with no preflight scope check and no cycle-counter settle.
//
// Plan 16, Task 5, fix round 1 (controller ruling): 'measure' added -- measure() (lib/evaluate.mjs)
// writes 'evaluation-intent', 'evaluation-call' and 'measurement' records the same way `calibrate`
// (already in this set) writes its own 'calibration' record, so the same rule applies identically:
// a log-writing, non-begin/non-declare command needs the scope preflight and the cycle-counter
// settle exactly like its peers. Without this, `cairn measure` computed and recorded a measurement
// over a workspace that could hold a live, unrecorded scope breach, and the administrative cycle
// counter never settled after a measurement.
export const STATE_CHANGING = new Set(['begin', 'end', 'check', 'declare', 'review-mechanism', 'review', 'brief', 'report', 'resolve', 'accept', 'escalate', 'answer', 'reply', 'dispute', 'item', 'outside', 'fix', 'decide', 'realize', 'promote', 'authorize', 'start', 'done', 'supersede', 'scope', 'calibrate', 'measure']);

export async function runWithPreflight(cwd, command, fn) {
  if (STATE_CHANGING.has(command)) await preflight(cwd, await readLog(cwd), { command });
  return fn();
}

// Fix round 1 item 9: cmdScope no longer catches its own errors -- dispose()'s ScopeError already
// starts with "cairn: " (its own interface contract) and any other error is a genuine bug, not a
// domain refusal; both now reach lib/cli.mjs's main(), whose catch carries the one shared
// only-add-the-prefix-if-missing guard instead of a third local copy of it here.
export async function cmdScope(argv, { cwd, stdout }) {
  const [breach, disposition] = argv;
  if (!breach || !disposition) throw new ScopeError('cairn: usage: cairn scope <breach-sha> keep|restore');
  const sha = await dispose(cwd, breach, disposition);
  stdout.write(`scope ${sha} ${disposition} ${breach}\n`);
  return 0;
}
