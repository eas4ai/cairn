// lib/wake.mjs
import { readLog, range } from './records.mjs';
import { readRef, catCommit, git, listTree } from './gitx.mjs';
import { readSnapshot } from './snapshots.mjs';
import { loadSettings } from './settings.mjs';
import { lint } from './spec.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { isCurrent, attempts } from './check.mjs';
import { readAdr } from './adr.mjs';
import { readLease, isStale } from './lease.mjs';
import { pendingTransaction } from './tx.mjs';
import { matchGlob } from './paths.mjs';
import { openBreaches, leaseCovers, workspaceDelta, declaredPaths, isDeclared } from './scope.mjs';

export const ORDER = ['repair', 'recover', 'reconcile', 'scope', 'waiting', 'fix', 'record', 'declare', 'run', 'review mechanism', 'capture', 'review', 'report', 'resolve', 'accept', 'build', 'done', 'promote'];
export const FETCH_LINE = (remote) => `git fetch ${remote} 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'`;
export const PREDICATES = {
  repair: 'the named hand-written file reads under its grammar and no unrelated byte changed',
  recover: 'the intent has one terminal domain or abort record and every store matches its resulting identity',
  reconcile: 'the local action lease is gone and the action it named finished or was explicitly abandoned',
  scope: 'every scope-breach record for the path has a developer-approved keep disposition or a restore snapshot equal to its allowed base',
  fix: 'a fix record names the item and a workspace snapshot that changes no protected contract; its requirement has a current pass at or after it',
  record: "the action lease covers the path through its target's declared inputs, or the path is clean",
  commit: 'the path is clean, or the action lease covers it',
  declare: 'a mechanism definition names the requirement and no pre-existing undeclared delta was legalized',
  run: 'a current receipt carries a result for the requirement',
  implement: 'a current receipt says pass and review metadata binds the requirement to the current definition and text digests with a fail receipt',
  escalate: 'after three distinct attempts without a pass, an escalation concerns the requirement before a fourth',
  'review mechanism': 'review metadata has that binding and fail receipt; no declared product input changed',
  capture: 'an outside record names the item, or an escalation concerns it',
  review: 'a review names the current workspace snapshot and answers every fixed question for every target',
  report: 'a current brief and report name the reviewed snapshot and projection; every question and interface obligation has an attempt',
  resolve: 'a resolution names finding N of its exact source record, or an escalation disputes it',
  accept: 'an acceptance at the current workspace snapshot examines the cumulative post-report delta and gives a verdict on every submitted resolution; new findings may remain for the next resolve action',
  build: "a realized ADR line names the decision's base and resulting snapshots and the realization check passed",
  done: 'a done record names the commitment and final workspace snapshot',
  promote: 'no commitment is open; one promotion names a backlog item and decision; Current: and a one-item successor start were written transactionally',
  reply: 'a reply record names the open ask escalation',
  waiting: 'an answer record names the escalation with ok or instead',
};

async function inProject(cwd) {
  const r = await git(['rev-parse', '--show-toplevel'], { cwd }).catch(() => null);
  return r && r.code === 0;
}

export async function readState(cwd, { now = Date.now(), session = process.env.CAIRN_SESSION ?? null } = {}) {
  const st = { cwd, now, session, unreadable: [] };
  const attempt = async (path, fn) => { try { return await fn(); } catch (e) { st.unreadable.push({ path, reason: e.message }); return null; } };
  st.settings = (await attempt('.cairn/settings.json', () => loadSettings(cwd)))?.settings ?? null;
  const findings = await attempt('docs/spec', () => lint(cwd));
  // Deviation from the plan text: lib/spec.mjs's lint() (plan 02) reports each finding as
  // {file, line, reason}, not {path, message}; adapted to the real field names.
  if (findings?.length) st.unreadable.push({ path: findings[0].file ?? 'docs/spec', reason: findings[0].reason ?? String(findings[0]) });
  st.mechanisms = (await attempt('.cairn/mechanisms', () => readMechanisms(cwd))) ?? {};
  // The task briefing for this plan calls for readAdr(cwd, {verify: true}) on wake's read path
  // (the full cross-reference check, not the cheap structural-only default), so a dangling
  // sha/snapshot reference in the ADR is caught as an unreadable hand-written input.
  st.adr = (await attempt('docs/decisions.jsonl', () => readAdr(cwd, { verify: true }))) ?? [];
  st.log = await readLog(cwd);
  st.range = range(st.log);
  st.start = st.range.start ?? null;
  st.records = st.range.records ?? [];
  st.closed = Boolean(st.range.closed);
  st.slug = st.start?.payload.slug ?? null;
  st.set = st.start?.payload.requirements ?? [];
  st.lease = await readLease(cwd);
  // Deviation from the plan text: lib/tx.mjs's pendingTransaction is async (it reads the
  // repository), so its result must be awaited; the plan's literal skeleton assigned the Promise
  // itself, which is always truthy and never has a usable .target or .payload.
  st.tx = await pendingTransaction(cwd, st.log);
  const head = await readRef(cwd, 'HEAD');
  st.dirty = head ? await workspaceDelta(cwd, (await catCommit(cwd, head)).tree) : [];
  st.current = {};
  for (const { requirement } of st.set) st.current[requirement] = await currentReceipt(cwd, st.log, requirement);
  st.treeOf = async (snap) => (await readSnapshot(cwd, snap, 'workspace')).tree;
  st.atWorkspace = async (snap) => (await workspaceDelta(cwd, await st.treeOf(snap))).length === 0;
  return st;
}

// Deviation from the plan text: lib/check.mjs's real isCurrent(cwd, receipt, REQ, now) treats its
// fourth argument as an optional precomputed identitiesNow() object (mechanism/definitionDigest/
// textDigest/tree/identity), not a wall-clock timestamp; the plan's readState passed its own `now`
// option (a millisecond number) straight through, so every property lookup on it (`now.mechanism`,
// `now.tree`, ...) was undefined and no receipt was ever found current. Dropped the argument here
// so isCurrent recomputes its own identitiesNow per call; readState's `now` option is kept on the
// returned state for interface parity with the plan's Produces line, but nothing in this module
// currently reads it.
async function currentReceipt(cwd, log, req) {
  for (const r of [...log].reverse()) {
    if (r.kind !== 'receipt') continue;
    const res = r.payload.results.find((x) => x.requirement === req);
    if (!res) continue;
    if (await isCurrent(cwd, r, req)) return { sha: r.sha, status: r.payload.status, result: res.result };
  }
  return null;
}

export async function wake(cwd, opts = {}) {
  if (!(await inProject(cwd))) return { exit: 3, line: 'cairn: outside a project; run /new-project or /existing-project' };
  for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots']) {
    if (await readRef(cwd, ref)) continue;
    const remote = (await loadSettings(cwd).catch(() => null))?.settings.authority_remote;
    return { exit: 3, line: remote ? FETCH_LINE(remote) : `cairn: missing ${ref}; run cairn init` };
  }
  return verdictOf(await readState(cwd, opts));
}

export const predicates = [];   // filled by the tasks below, in ORDER
export async function verdictOf(st) {
  for (const p of predicates) {
    const unmet = await p.test(st);
    if (unmet) return unmet.exit ? unmet : { predicate: PREDICATES[unmet.action ?? 'waiting'], ...unmet };
  }
  return { verdict: 'Done', action: null, target: st.slug, reason: `done record closes ${st.slug} and no backlog item waits`, predicate: PREDICATES.done };
}
const define = (name, test) => predicates.push({ name, test });
const unmet = (action, target, reason) => ({ verdict: 'Resolvable', action, target, reason });

define('repair', (st) => st.unreadable.length ? unmet('repair', st.unreadable[0].path, st.unreadable[0].reason) : null);
// Deviation from the plan text: st.tx is now the actual (awaited) command-intent record object,
// whose own `target` field (set by readLog/decodeRecord from the record's subject, e.g.
// 'cairn: command-intent tx01') names the transaction id; the plan's `st.tx.payload.transaction`
// read a field the real 'command-intent' schema does not have (its own transaction id field is
// `tx`, carried in the payload, but the record's `target` already names it and is what
// appendRecord's caller passed as the transaction id in the first place).
define('recover', (st) => st.tx ? { exit: 3, line: `cairn recover ${st.tx.target}` } : null);
define('supersession', (st) => {
  if (!st.start) return { exit: 3, line: 'cairn: no commitment; run /new-project or /existing-project' };
  const sup = st.records.find((r) => r.kind === 'superseded');
  return sup ? { exit: 3, line: `cairn: pending supersession to ${sup.payload.successor}; run /existing-project` } : null;
});

// Deviation from the plan text: the session-staleness leg below delegates to lib/lease.mjs's real
// isStale(lease, env), one of the exports this plan's task briefing names for wake to use, instead
// of the plan's own hand-rolled `l.session && st.session && l.session !== st.session` comparison
// (isStale's own rule differs slightly: it only asks whether the current session is known and
// differs from the lease's, treating a session-less lease as stale under a known session too).
// The other three legs (target not in the commitment, its implement target already passing, or
// the commitment closed) are wake-specific state isStale/reconcilePredicate cannot see, so they
// stay here.
function leaseStale(st) {
  const l = st.lease;
  if (!l) return null;
  if (isStale(l, { CAIRN_SESSION: st.session })) return 'its session ended';
  const inSet = st.set.some((x) => x.requirement === l.target);
  if (/^[A-Z]+-\d+$/.test(l.target) && !inSet) return `${l.target} is not in the commitment`;
  if (l.action === 'implement' && st.current[l.target]?.result === 'pass') return `${l.target} already passes`;
  if (st.closed) return 'the commitment is closed';
  return null;
}
define('reconcile', (st) => { const why = leaseStale(st); return why ? unmet('reconcile', `${st.lease.action} ${st.lease.target}`, `the action lease is stale: ${why}`) : null; });

// Deviation from the plan text: lib/scope.mjs's real openBreaches(log) spreads a scope-breach
// record's own payload fields onto each entry (sha, path, snapshot, base, declarations_digest);
// the field naming the workspace at which the breach was first observed is `snapshot`, not
// `first_observed` as the plan's code read it.
define('scope', (st) => { const b = openBreaches(st.log)[0]; return b ? unmet('scope', b.path, `scope-breach ${b.sha.slice(0, 7)} observed ${b.path} undeclared at ${b.snapshot.slice(0, 7)}`) : null; });

function openEscalations(log) {
  return log.filter((r) => r.kind === 'escalation').map((e) => {
    const after = log.slice(log.indexOf(e) + 1);
    const answers = after.filter((a) => a.kind === 'answer' && a.payload.escalation === e.sha);
    const final = answers.find((a) => a.payload.kind !== 'ask');
    const lastAsk = answers.at(-1)?.payload.kind === 'ask' ? answers.at(-1) : null;
    const replied = lastAsk && after.slice(after.indexOf(lastAsk) + 1).some((x) => x.kind === 'reply' && x.payload.escalation === e.sha);
    return { e, final, lastAsk, replied };
  }).filter((x) => !x.final);
}
define('waiting', (st) => {
  const o = openEscalations(st.log)[0];
  if (!o) return null;
  if (o.lastAsk && !o.replied) return unmet('reply', o.e.payload.slug, `the developer asked: ${o.lastAsk.payload.text}`);
  const { slug, question, recommendation, because, if_wrong, instead } = o.e.payload;
  return { verdict: 'Waiting', party: 'developer', reason: `escalation ${o.e.sha.slice(0, 7)} awaits an answer`, escalation: { sha: o.e.sha, slug, question, recommendation, because, if_wrong, instead }, predicate: PREDICATES.waiting };
});

async function protectedChanged(st, fromSnap, toSnap) {
  const a = new Map((await listTree(st.cwd, await st.treeOf(fromSnap))).map((e) => [e.path, e.sha]));
  const b = new Map((await listTree(st.cwd, await st.treeOf(toSnap))).map((e) => [e.path, e.sha]));
  const isProt = (p) => p === 'AGENTS.md' || p === '.cairn/settings.json' || p.startsWith('docs/spec/');
  return [...new Set([...a.keys(), ...b.keys()])].filter((p) => isProt(p) && a.get(p) !== b.get(p));
}
define('fix', async (st) => {
  for (const it of st.log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && st.set.some((x) => x.requirement === r.payload.source))) {
    const fix = st.log.filter((r) => r.kind === 'fix' && r.payload.item === it.sha).at(-1);
    if (!fix) return unmet('fix', it.payload.slug, `defect ${it.payload.slug} against ${it.payload.source} has no fix record`);
    if ((await protectedChanged(st, st.start.payload.snapshot, fix.payload.snapshot)).length) return unmet('fix', it.payload.slug, 'the fix snapshot changes a protected path');
    const pass = st.current[it.payload.source];
    if (!pass || pass.result !== 'pass' || st.log.findIndex((r) => r.sha === pass.sha) < st.log.indexOf(fix)) return unmet('fix', it.payload.slug, `${it.payload.source} has no current pass at or after the fix`);
  }
  return null;
});

define('record', (st) => {
  const declared = declaredPaths(st.mechanisms, null);
  for (const { path } of st.dirty) {
    if (!isDeclared(path, declared)) continue;
    if (!st.lease) return unmet('record', path, `${path} is a declared input with uncommitted changes and no action lease`);
    if (!leaseCovers(st.lease, st.mechanisms, path)) return unmet('commit', path, `${path} is dirty and the lease for ${st.lease.action} ${st.lease.target} does not cover it`);
  }
  return null;
});

const mechanismsFor = (st, req) => Object.entries(st.mechanisms).filter(([, m]) => m.definition.requirements.includes(req));
define('declare', (st) => {
  if (st.closed) return null;
  const missing = st.set.find((x) => mechanismsFor(st, x.requirement).length === 0);
  return missing ? unmet('declare', missing.requirement, `no mechanism definition names ${missing.requirement}`) : null;
});

function lastPassIndex(st, req) {
  return st.log.findLastIndex((r) => r.kind === 'receipt' && r.payload.status === 'ran' && r.payload.results.some((x) => x.requirement === req && x.result === 'pass'));
}
define('run', (st) => {
  if (st.closed) return null;
  for (const { requirement: req } of st.set) {
    const c = st.current[req];
    if (c && c.status === 'ran' && c.result === 'pass') continue;
    const tried = attempts(st.log, req);
    const escalated = st.log.slice(lastPassIndex(st, req) + 1).some((r) => r.kind === 'escalation' && r.payload.concerns === req);
    if (tried >= 3 && !escalated) return unmet('escalate', req, `${tried} distinct failing attempts at ${req} without a pass`);
    if (!c) return unmet('run', req, `no current receipt carries a result for ${req}`);
    return unmet('implement', req, `the current receipt for ${req} says ${c.status === 'ran' ? c.result : 'error'}`);
  }
  return null;
});

function reviewBound(st, req) {
  const frozen = st.set.find((x) => x.requirement === req)?.text_digest;
  return mechanismsFor(st, req).some(([, m]) => {
    const rv = m.review?.[req];
    if (!rv || rv.definitionDigest !== m.definitionDigest || rv.textDigest !== frozen) return false;
    const fr = st.log.find((r) => r.sha === rv.failReceipt);
    return Boolean(fr && fr.kind === 'receipt' && fr.payload.status === 'ran' && fr.payload.results.some((x) => x.requirement === req && x.result === 'fail'));
  });
}
define('review mechanism', (st) => {
  if (st.closed) return null;
  const stale = st.set.find((x) => !reviewBound(st, x.requirement));
  return stale ? unmet('review mechanism', stale.requirement, `review metadata for ${stale.requirement} is missing or bound to another definition or text digest`) : null;
});

define('capture', (st) => {
  if (st.closed) return null;
  for (const it of st.records.filter((r) => r.kind === 'item' && r.payload.kind !== 'defect' && st.set.some((x) => x.requirement === r.payload.source))) {
    const covered = st.log.some((r) => (r.kind === 'outside' && r.payload.item === it.sha) || (r.kind === 'escalation' && r.payload.concerns === `item:${it.sha}`));
    if (!covered) return unmet('capture', it.payload.slug, `item ${it.payload.slug} surfaced from ${it.payload.source} and nothing says why it is outside`);
  }
  return null;
});

function requiredQuestions(st) {
  const mech = [...new Set(st.set.flatMap((x) => mechanismsFor(st, x.requirement).map(([n]) => n)))];
  return [...mech.flatMap((m) => [['Q1', m], ['Q2', m]]), ...st.set.flatMap((x) => [['Q3', x.requirement], ['Q4', x.requirement]]), ['Q5', st.slug], ['Q6', st.slug]];
}
export const latest = (st, kind) => st.records.filter((r) => r.kind === kind).at(-1) ?? null;
define('review', async (st) => {
  if (st.closed) return null;
  const rev = latest(st, 'review');
  if (!rev) return unmet('review', st.slug, `no review names a workspace snapshot for ${st.slug}`);
  const missing = requiredQuestions(st).find(([q, t]) => !rev.payload.answers.some((a) => a.question === q && a.target === t));
  if (missing) return unmet('review', st.slug, `the review answers nothing for ${missing[0]} for ${missing[1]}`);
  if (!latest(st, 'report') && !(await st.atWorkspace(rev.payload.snapshot))) return unmet('review', st.slug, 'the workspace differs from the reviewed snapshot and no report exists yet');
  return null;
});
