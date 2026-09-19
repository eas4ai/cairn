// lib/cycle.mjs
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { gitPath } from './gitx.mjs';
import { canonicalize, parseStrict } from './canon.mjs';
import { appendRecord, readLog } from './records.mjs';
import { progressSummary, progressMade, doneRule, latest, readState, verdictOf, ORDER } from './wake.mjs';
import { runWithPreflight } from './scope.mjs';

export const BOUNDS = Object.freeze({ sameTarget: 4, total: 28, acceptanceRounds: 3 });
export const ADMIN = new Set(['repair', 'recover', 'reconcile', 'scope', 'record', 'commit', 'declare', 'review mechanism', 'capture']);
const EMPTY = () => ({ counts: {}, total: 0, last: null, progress: null });

const counterFile = (cwd) => gitPath(cwd, 'cairn-cycle.json');

export async function readCounter(cwd) {
  try { return parseStrict(await readFile(await counterFile(cwd), 'utf8')); } catch { return EMPTY(); }
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

export async function writeCycleEscalation(cwd, slug, bound) {
  const open = openCycleEscalation(await readLog(cwd));
  if (open) return open.sha;                                    // one escalation per cycle, never one per completion
  const what = bound.kind === 'acceptanceRounds' ? `${BOUNDS.acceptanceRounds} acceptance rounds after the report have not reached Done`
    : bound.kind === 'sameTarget' ? `${bound.actionClass} ${bound.target} completed ${BOUNDS.sameTarget} times without semantic progress`
    : bound.kind === 'liveness' ? `${bound.actionClass} would write ${bound.target} in a form Cairn itself refuses`
    : `${BOUNDS.total} administrative actions completed without semantic progress`;
  return appendRecord(cwd, 'escalation', slug ?? 'none', {
    slug: slug ?? 'none', question: `The loop is cycling: ${what}. What should change?`,
    recommendation: 'Read the repeated actions with the developer before any further administrative action',
    because: 'the same bookkeeping keeps being redone while no requirement, finding or phase moves',
    if_wrong: 'the count is reset by an ok answer and the loop continues from the same verdict',
    instead: 'supersede the commitment or restore the workspace to its allowed base', concerns: 'cycle', evaluation: null,
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
// readFile is already imported at the top of this module (task 1); only join and the two module
// imports above are new.

// Deviation from the plan text: the kernel-managed write this guard protects is not a single
// '.cairn/mechanisms' file -- lib/mechanisms.mjs (plan 05, already committed) stores one JSON
// entry per mechanism at '.cairn/mechanisms/<name>.json' (readMechanisms reads the directory);
// readFile(join(cwd, '.cairn/mechanisms')) on that real layout throws EISDIR, and no single write
// ever targets that literal path. The mechanisms branch below checks any path matching
// '.cairn/mechanisms/*.json' and parses it as one mechanism entry {schema, definition, review}
// instead.
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

export async function guardKernelWrite(cwd, path, bytes, { action }) {
  const violation = await bookkeepingViolation(cwd, path, bytes);
  if (!violation) return;
  const mine = ORDER.indexOf(action === 'decide' || action === 'realize' ? 'build' : action);
  if (ORDER.indexOf(violation) <= (mine < 0 ? ORDER.length : mine)) {
    const st = await readState(cwd);
    await writeCycleEscalation(cwd, st.slug, { kind: 'liveness', actionClass: action, target: path });
    throw new LivenessError(`cairn: writing ${path} for ${action} would create a ${violation} violation; cycle escalation written`);
  }
}

export async function withLoop(cwd, command, fn) {
  const result = await runWithPreflight(cwd, command, fn);
  const st = await readState(cwd);
  await settle(cwd, await verdictOf(st), st);
  return result;
}
