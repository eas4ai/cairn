// lib/cycle.mjs
import { readFile, writeFile, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gitPath } from './gitx.mjs';
import { canonicalize, parseStrict } from './canon.mjs';
import { readLog } from './records.mjs';
import { progressSummary, progressMade, doneRule, latest, readState, verdictOf, ORDER, predicates } from './wake.mjs';
import { runWithPreflight } from './scope.mjs';
import { writeEscalation } from './escalate.mjs';
// mechanisms.mjs imports guardKernelWrite from this module (plan 08 task 24), so this import
// closes a two-way cycle between the two files. Safe under Node's ESM loader because every use on
// both sides is inside a function body, never at either module's top level; a later top-level use
// on either side would be the risk to watch for (deferred by ruling to final review, along with
// guardKernelWrite's own readState cost).
import { definitionDigest, reviewDigest } from './mechanisms.mjs';

export const BOUNDS = Object.freeze({ sameTarget: 4, total: 28, acceptanceRounds: 3 });
export const ADMIN = new Set(['repair', 'recover', 'reconcile', 'scope', 'record', 'commit', 'declare', 'review mechanism', 'capture']);
const EMPTY = () => ({ counts: {}, total: 0, last: null, progress: null });

const counterFile = (cwd) => gitPath(cwd, 'cairn-cycle.json');

// Fix round 1, item 11(c): a missing counter file (ENOENT: nothing has been counted yet) is the
// only case that legitimately means "start empty." Any other failure -- most importantly
// parseStrict's CanonError on a corrupted or hand-edited counter file -- used to be caught by the
// same blanket try/catch and silently treated as an empty counter too, quietly discarding a real
// cycle count instead of refusing. Only ENOENT is now swallowed; everything else propagates.
export async function readCounter(cwd) {
  const file = await counterFile(cwd);
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return EMPTY(); throw e; }
  try { return parseStrict(text); }
  catch (e) { throw new Error(`cairn: ${file} is corrupt: ${e.message}`); }
}

export async function writeCounter(cwd, counter) {
  const file = await counterFile(cwd);
  await writeFile(file + '.tmp', canonicalize(counter));
  await rename(file + '.tmp', file);
}

export async function bump(cwd, actionClass, target) {
  const c = await readCounter(cwd);
  const key = `${actionClass}\t${target}`;
  c.counts[key] = (c.counts[key] || 0) + 1;
  c.total += 1;
  await writeCounter(cwd, c);
  const bound = c.counts[key] >= BOUNDS.sameTarget ? 'sameTarget' : c.total >= BOUNDS.total ? 'total' : null;
  return { sameTarget: c.counts[key], total: c.total, bound };
}

export async function resetOnProgress(cwd) {
  const c = await readCounter(cwd);
  await writeCounter(cwd, { ...c, counts: {}, total: 0 });
}

export function openCycleEscalation(log) {
  return log.find((r) => r.kind === 'escalation' && r.payload.concerns === 'cycle' && !log.some((a) => a.kind === 'answer' && a.payload.escalation === r.sha && a.payload.kind !== 'ask')) ?? null;
}

// Plan 09 note: lib/escalate.mjs now owns the escalation record's payload shape; this calls its
// exported writeEscalation instead of building the same field list here (never validated the same
// way escalate() does, since a cycle escalation targets 'none' when no commitment is open and its
// concern is the fixed 'cycle' token, not a checked one).
export async function writeCycleEscalation(cwd, slug, bound) {
  const open = openCycleEscalation(await readLog(cwd));
  if (open) return open.sha;                                    // one escalation per cycle, never one per completion
  const what = bound.kind === 'acceptanceRounds' ? `${BOUNDS.acceptanceRounds} acceptance rounds after the report have not reached Done`
    : bound.kind === 'sameTarget' ? `${bound.actionClass} ${bound.target} completed ${BOUNDS.sameTarget} times without semantic progress`
    : bound.kind === 'liveness' ? `${bound.actionClass} would write ${bound.target} in a form Cairn itself refuses`
    : `${BOUNDS.total} administrative actions completed without semantic progress`;
  return writeEscalation(cwd, slug ?? 'none', {
    question: `The loop is cycling: ${what}. What should change?`,
    recommendation: 'Read the repeated actions with the developer before any further administrative action',
    because: 'the same bookkeeping keeps being redone while no requirement, finding or phase moves',
    if_wrong: 'the count is reset by an ok answer and the loop continues from the same verdict',
    instead: 'supersede the commitment or restore the workspace to its allowed base', concerns: 'cycle',
  });
}

function acceptanceRounds(st) {
  const rep = latest(st, 'report');
  return rep ? st.records.slice(st.records.indexOf(rep) + 1).filter((r) => r.kind === 'acceptance').length : 0;
}

// Deviation from the plan text: the "already open" check below reads the cycle escalation fresh
// from the repository (`await readLog(cwd)`), not from the `st` the caller passed in. A caller
// that reuses one `st` snapshot across several settle() calls (as this plan's own synthetic
// cycling-fixture test does, and as a rotating-cycle detector naturally would) never sees an
// escalation settle() itself wrote on an earlier call if this read the stale `st.log` instead;
// the fourth-occurrence test's own "one escalation, not one per completion" assertion (the second
// settle() call, immediately after the bound-triggering one, expecting bound: null) only holds
// with a fresh read here, since writeCycleEscalation's own suppression only stops the extra log
// record, not settle()'s separately-computed return value.
export async function settle(cwd, verdict, st) {
  let c = await readCounter(cwd);
  const now = progressSummary(st);
  if (progressMade(c.progress, now)) { await resetOnProgress(cwd); c = await readCounter(cwd); }
  let bound = null;
  const cur = verdict.verdict === 'Resolvable' ? { action: verdict.action, target: verdict.target } : null;
  if (c.last && ADMIN.has(c.last.action) && (!cur || cur.action !== c.last.action || cur.target !== c.last.target)) {
    const b = await bump(cwd, c.last.action, c.last.target);
    if (b.bound) bound = { kind: b.bound, actionClass: c.last.action, target: c.last.target };
  }
  if (!bound && acceptanceRounds(st) >= BOUNDS.acceptanceRounds && !(await doneRule(st)).holds && !st.closed) bound = { kind: 'acceptanceRounds', actionClass: 'accept', target: st.slug };
  const open = Boolean(openCycleEscalation(await readLog(cwd)));
  if (bound && !open) await writeCycleEscalation(cwd, st.slug, bound);
  await writeCounter(cwd, { ...(await readCounter(cwd)), last: cur, progress: now });
  return { bound: bound && !open ? bound : null };
}

export class LivenessError extends Error {}
// readFile is already imported at the top of this module (task 1); basename, join and the other
// module imports above are new.

// Deviation from the plan text: the kernel-managed write this guard protects is not a single
// '.cairn/mechanisms' file -- lib/mechanisms.mjs (plan 05, already committed) stores one JSON
// entry per mechanism at '.cairn/mechanisms/<name>.json' (readMechanisms reads the directory);
// readFile(join(cwd, '.cairn/mechanisms')) on that real layout throws EISDIR, and no single write
// ever targets that literal path. The mechanisms branch below checks any path matching
// '.cairn/mechanisms/*.json' and parses it as one mechanism entry {schema, definition, review}
// instead.
//
// This is the cheap gate only: is the write even parseable, canonical bookkeeping (a repair-class
// problem if not, an ADR breach of the append-only rule if not for that file)? It cannot by itself
// see whether the write is a genuine Cairn violation -- that needs the scratch-state walk in
// guardKernelWrite below.
async function bookkeepingViolation(cwd, path, bytes) {
  const text = bytes.toString('utf8');
  if (path.startsWith('.cairn/mechanisms/') && path.endsWith('.json')) {
    try {
      const obj = parseStrict(text);
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return 'repair';
      if (obj.schema !== 1 || !obj.definition || !obj.review || Object.keys(obj).length !== 3) return 'repair';
      return null;
    } catch { return 'repair'; }
  }
  if (path === 'docs/decisions.jsonl') {
    const base = await readFile(join(cwd, path)).catch(() => Buffer.alloc(0));
    if (!bytes.subarray(0, base.length).equals(base)) return 'scope';
    for (const line of text.slice(base.length).split('\n').filter(Boolean)) { try { parseStrict(line); } catch { return 'scope'; } }
    return null;
  }
  return 'scope';
}

// Fix round 1, item 3 (Important): the cheap bookkeepingViolation check above only re-parses the
// bytes the kernel itself just produced -- valid, canonical bookkeeping always passes it, so the
// liveness invariant it alone guarded could never actually fire in production. Spec: "if its
// specified bookkeeping alone would create a new Cairn violation of equal or higher precedence, it
// refuses the mutation." Builds a scratch copy of the read state with the write already applied --
// the mechanism entry the write would install, or the ADR lines it would append.
async function scratchState(cwd, before, path, bytes) {
  const st = { ...before };
  if (path.startsWith('.cairn/mechanisms/') && path.endsWith('.json')) {
    const obj = parseStrict(bytes.toString('utf8'));
    const name = basename(path, '.json');
    st.mechanisms = { ...before.mechanisms, [name]: { definition: obj.definition, definitionDigest: definitionDigest(obj.definition), review: obj.review, reviewDigest: reviewDigest(obj.review) } };
  } else if (path === 'docs/decisions.jsonl') {
    const base = await readFile(join(cwd, path)).catch(() => Buffer.alloc(0));
    const added = bytes.subarray(base.length).toString('utf8').split('\n').filter(Boolean).map((l) => parseStrict(l));
    st.adr = [...before.adr, ...added];
  }
  return st;
}

// Reproduced by hand while building this fix: a per-predicate diff (flag any predicate at or
// before `mine` that goes null -> non-null) over-refuses. Two real cases: (1) `cairn declare`
// preflighted first, as the spec's own "declare runs the preflight first" flow requires -- the
// preflight already recorded a 'scope' breach for the widened path before declare's own write, so
// 'scope' is already unmet before the write and stays unmet after (the same breach, still there);
// widening the declared inputs on top of that also makes 'record' newly unmet (the now-declared
// path is dirty with no lease) -- a per-predicate diff flags that as a second, brand-new
// violation, even though the developer is not worse off: the path was already the single tracked
// problem via 'scope', and still is, just also visible through 'record' now. (2) `cairn decide`:
// writing a new Consequential decision line always makes 'build' go from satisfied (no open
// decisions) to unmet (the one just written) -- a per-predicate diff flags every first decision as
// refusing itself. Comparing the WHOLE precedence order's first unmet position, before the write
// against after, avoids both: it only refuses when the write makes an EARLIER predicate than
// whatever already blocked become the new bottleneck, not merely a different predicate at the same
// or a later point. `predicates` (the same ordered list verdictOf walks) supplies the check, so
// this never carries a second copy of precedence logic; 'supersession' (tested between recover and
// reconcile, not itself an ORDER entry, and true before any 'start' record exists -- which is when
// every fixture's own initial declare() calls run) is skipped by its absence from ORDER, the walk
// continuing past it to the next real predicate rather than stopping there.
async function firstUnmetIndex(st, cap) {
  for (const p of predicates) {
    const idx = ORDER.indexOf(p.name);
    if (idx < 0) continue;
    if (idx > cap) return cap + 1;                  // beyond what this guard call cares about
    if (await p.test(st)) return idx;
  }
  return ORDER.length;
}

// 'realize' maps to 'build': realize is supposed to close an open 'build' obligation. 'decide' is
// deliberately NOT mapped to 'build': opening exactly that obligation is decide's whole purpose,
// never a violation of it. An action with no ORDER position at all (mine < 0) gets no scratch-
// state check beyond the cheap bookkeepingViolation gate above.
export async function guardKernelWrite(cwd, path, bytes, { action }) {
  const mine = ORDER.indexOf(action === 'realize' ? 'build' : action);
  const mineIdx = mine < 0 ? -1 : mine;
  let refuseAs = await bookkeepingViolation(cwd, path, bytes);
  let slug = null;
  if (!refuseAs && mineIdx >= 0) {
    const before = await readState(cwd);
    slug = before.slug;
    const beforeIdx = await firstUnmetIndex(before, mineIdx);
    const after = await scratchState(cwd, before, path, bytes);
    const afterIdx = await firstUnmetIndex(after, mineIdx);
    if (afterIdx < beforeIdx) {
      const p = predicates.find((pp) => ORDER.indexOf(pp.name) === afterIdx);
      const result = await p.test(after);
      refuseAs = result.action ?? p.name;
    }
  }
  if (!refuseAs) return;
  if (slug === null) slug = (await readState(cwd)).slug;
  await writeCycleEscalation(cwd, slug, { kind: 'liveness', actionClass: action, target: path });
  throw new LivenessError(`cairn: writing ${path} for ${action} would create a ${refuseAs} violation; cycle escalation written`);
}

export async function withLoop(cwd, command, fn) {
  const result = await runWithPreflight(cwd, command, fn);
  const st = await readState(cwd);
  await settle(cwd, await verdictOf(st), st);
  return result;
}
