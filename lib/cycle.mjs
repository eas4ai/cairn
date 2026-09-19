// lib/cycle.mjs
import { readFile, writeFile, rename } from 'node:fs/promises';
import { gitPath } from './gitx.mjs';
import { canonicalize, parseStrict } from './canon.mjs';
import { appendRecord, readLog } from './records.mjs';
import { progressSummary, progressMade, doneRule, latest } from './wake.mjs';

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
