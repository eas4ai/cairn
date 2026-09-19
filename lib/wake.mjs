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
import { matchGlob, classify } from './paths.mjs';
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
  // Fix round 1, item 11(f): readLease used to be called directly, so a corrupted lease commit
  // (parseStrict throwing on its body) propagated out of readState as a raw, uncaught exception
  // instead of becoming an 'unreadable' entry (and so a clean 'repair' verdict) the same way a
  // corrupted settings, mechanisms or ADR read already does.
  st.lease = await attempt('refs/cairn/in-progress', () => readLease(cwd));
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
// Fix round 1, item 8: section 2 names four exit-3 cases (outside a project, missing durable
// refs, a pending supersession, an interrupted transaction); this is a fifth. Ruling: keep it -- a
// project with durable refs but no start record at all is the pending-initialization state (the
// spec-phase tail has not run `cairn start` yet), and the existing-project skill is what resumes
// it, the same as the other four. The line now names the skill in the spec's own exact words,
// rather than the plan's paraphrase.
define('supersession', (st) => {
  if (!st.start) return { exit: 3, line: 'cairn: no commitment started; run /new-project or /existing-project' };
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

// Fix round 1, item 11(d): shared by protectedChanged (below) and interfaceObligations, which
// duplicated this same before/after tree-diff.
async function snapshotDelta(st, fromSnap, toSnap) {
  const a = new Map((await listTree(st.cwd, await st.treeOf(fromSnap))).map((e) => [e.path, e.sha]));
  const b = new Map((await listTree(st.cwd, await st.treeOf(toSnap))).map((e) => [e.path, e.sha]));
  return [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p));
}
// Fix round 1, item 4: the plan's own three-way literal check (AGENTS.md, .cairn/settings.json, a
// docs/spec/ prefix) treats every docs/spec/** path as protected, but lib/paths.mjs's real
// classify() carries the roadmap's own exception (PROTECTED_EXCEPT: docs/spec/roadmap.md is
// edited by the kernel at start and promote, bound structurally rather than by digest, per section
// 2's Settings note) -- so a fix snapshot that only touches the roadmap was refused forever, with
// no way to ever pass 'fix'. classify(p, st.settings) is the same protected/kernel-managed/
// reserved/... classification scope.mjs's own preflight() uses, so this agrees with it instead of
// carrying a second, narrower copy of the protected-path rule.
async function protectedChanged(st, fromSnap, toSnap) {
  const changed = await snapshotDelta(st, fromSnap, toSnap);
  return changed.filter((p) => classify(p, st.settings) === 'protected');
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

// Item 10 (fix round 1): closed by ruling, no change. The review-metadata binding below is
// already covered by the definition digest; a declared input's own bytes, including a pass/fail
// flag, are expected to differ from the fail receipt's recorded product once a requirement is
// fixed, so no separate product-digest check is added. See plan-08-report.md for the earlier attempt.
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

async function interfaceObligations(st, rev) {
  const changed = await snapshotDelta(st, st.start.payload.snapshot, rev.payload.snapshot);
  const globs = st.settings?.interfaces ?? [];
  return changed.filter((p) => globs.some((g) => matchGlob(g, p)));
}
// Deviation from the plan text: the real 'brief' schema's own digest field is projection_digest
// (not projection) and the real 'report' schema's is also projection_digest, so the brief/report
// cross-check below compares those field names, not the plan's `projection`.
// Fix round 2, finding 4: corrected. Guards against being reached with no review at all (`rev`
// null). Under wake's own cascading precedence, and under lib/cycle.mjs's guardKernelWrite's
// firstUnmetIndex (which stops at the FIRST unmet predicate in ORDER, not every one), 'report' is
// never actually reached with a null `rev` in practice -- 'review' would already be that first
// unmet predicate. This guard is defensive: cheap, harmless, and exercised directly by
// tests/wake.test.mjs's own unit test of the predicate, not by a real code path that needs it
// today. Kept so `rev.payload.snapshot` inside the later unmet(...) message cannot throw if a
// future caller ever asks this predicate about a state out of the usual cascading order.
define('report', async (st) => {
  if (st.closed) return null;
  const rev = latest(st, 'review');
  const rep = latest(st, 'report');
  if (!rev) return unmet('report', st.slug, `no review exists yet for ${st.slug}`);
  const brief = rep && st.records.find((r) => r.kind === 'brief' && r.sha === rep.payload.brief);
  if (!rep || !brief || brief.payload.review !== rev.sha || rep.payload.snapshot !== rev.payload.snapshot || rep.payload.projection_digest !== brief.payload.projection_digest) return unmet('report', st.slug, `no report names the reviewed snapshot ${rev.payload.snapshot.slice(0, 7)} through a current brief`);
  const q = requiredQuestions(st).find(([q, t]) => !rep.payload.attempts.some((a) => a.question === q && a.target === t));
  if (q) return unmet('report', st.slug, `the report has no attempt at ${q[0]} for ${q[1]}`);
  const iface = (await interfaceObligations(st, rev)).find((p) => !rep.payload.interface_attempts.some((a) => a.path === p));
  if (iface) return unmet('report', st.slug, `the report has no caller-level attempt at interface ${iface}`);
  return null;
});

function findingSources(st) {
  const rev = latest(st, 'review'), rep = latest(st, 'report');
  return [rev, rep, ...st.records.filter((r) => r.kind === 'acceptance')].filter(Boolean);
}
function openFindings(st) {
  const accs = st.records.filter((r) => r.kind === 'acceptance');
  const rejected = new Set(accs.flatMap((a) => a.payload.rejected.map((x) => x.resolution)));
  const rejections = (src, n) => accs.flatMap((a) => a.payload.rejected).filter((x) => { const res = st.log.find((r) => r.sha === x.resolution); return res && res.payload.source === src && res.payload.finding === n; }).length;
  const out = [];
  for (const src of findingSources(st)) for (const f of src.payload.findings) {
    const resolved = st.records.some((r) => r.kind === 'resolution' && r.payload.source === src.sha && r.payload.finding === f.n && !rejected.has(r.sha));
    const disputed = st.log.some((r) => r.kind === 'escalation' && r.payload.concerns === `finding:${src.sha}#${f.n}`);
    if (!resolved && !disputed) out.push({ source: src, n: f.n, rejections: rejections(src.sha, f.n) });
  }
  return out;
}
// Fix round 1, item 9(a): "a second rejection of a resolution for the same finding escalates"
// (section 5) named the action itself, not just a longer reason on the same 'resolve' action. The
// predicate field is set explicitly (not looked up from PREDICATES.escalate, which is the
// unrelated run/implement/escalate flow's text for a requirement without a pass) because
// verdictOf's own spread (`{predicate: PREDICATES[unmet.action], ...unmet}`) lets a returned
// object's own `predicate` key win over that lookup.
//
// Fix round 2, finding 5: the predicate text is PREDICATES.resolve itself -- "a resolution names
// finding N of its exact source record, or an escalation disputes it" (section 5's own row for
// this action), not an invented sentence. The row's own "or an escalation disputes it" clause is
// exactly the condition being named here.
define('resolve', (st) => {
  if (st.closed) return null;
  const f = openFindings(st)[0];
  if (!f) return null;
  if (f.rejections >= 2) {
    return { verdict: 'Resolvable', action: 'escalate', target: `${st.slug} ${f.n}`,
      reason: `finding ${f.n} on the ${f.source.kind} ${f.source.sha.slice(0, 7)} was rejected twice; an escalation must concern it`,
      predicate: PREDICATES.resolve };
  }
  return unmet('resolve', `${st.slug} ${f.n}`, `finding ${f.n} on the ${f.source.kind} ${f.source.sha.slice(0, 7)} has no accepted resolution`);
});

// Fix round 2, finding 4: corrected, matching the 'report' comment above. Guards against being
// reached with no report at all. As with 'report', wake's own cascading precedence and
// guardKernelWrite's firstUnmetIndex short circuit (it stops at the first unmet predicate, never
// visiting every one) mean this is never actually reached with a null `rep` in practice; the guard
// is defensive, cheap and exercised directly by tests/wake.test.mjs's own unit test, so
// `rep.payload.snapshot` below cannot throw if a future caller asks this predicate out of order.
define('accept', async (st) => {
  if (st.closed) return null;
  const rep = latest(st, 'report');
  if (!rep) return null;
  const after = st.records.slice(st.records.indexOf(rep) + 1);
  const resolutions = after.filter((r) => r.kind === 'resolution');
  const acc = after.filter((r) => r.kind === 'acceptance').at(-1) ?? null;
  const lastRes = resolutions.at(-1);
  const unexamined = lastRes && (!acc || after.indexOf(acc) < after.indexOf(lastRes));
  const moved = !(await st.atWorkspace(acc ? acc.payload.snapshot : rep.payload.snapshot));
  if (unexamined) return unmet('accept', st.slug, `resolution ${lastRes.sha.slice(0, 7)} has no acceptance after it`);
  if (moved) return unmet('accept', st.slug, `the workspace differs from the ${acc ? 'last accepted' : 'reported'} snapshot; the cumulative delta needs an acceptance`);
  return null;
});

// Fix round 1, item 5: shared by 'build' (below) and doneRule's bullet 4. Only a 'realized' or
// 'superseded' line closes a Consequential decision for this purpose; a 'read' line (kind !==
// 'decision', which the old doneRule code below used to select on) records only that the
// developer looked at it, never that it was realized.
function closedDecisionIds(adr) {
  return new Set(adr.filter((l) => l.kind === 'realized' || l.kind === 'superseded').map((l) => l.of));
}
define('build', (st) => {
  const closedIds = closedDecisionIds(st.adr);
  const open = st.adr.find((l) => l.kind === 'decision' && l.level === 'Consequential' && !closedIds.has(l.id));
  return open ? unmet('build', open.id, `decision ${open.id} (${open.title}) has no realized line`) : null;
});

export async function doneRule(st) {
  const failed = [];
  if (!st.set.every((x) => st.current[x.requirement]?.result === 'pass' && st.current[x.requirement].status === 'ran' && reviewBound(st, x.requirement))) failed.push('evidence');
  const rev = latest(st, 'review'), rep = latest(st, 'report');
  if (!rev || !rep || rep.payload.snapshot !== rev.payload.snapshot) failed.push('review-report');
  else {
    const after = st.records.slice(st.records.indexOf(rep) + 1);
    const acc = after.filter((r) => r.kind === 'acceptance').at(-1);
    const resolutions = after.filter((r) => r.kind === 'resolution');
    const accepted = new Set(after.flatMap((a) => a.kind === 'acceptance' ? a.payload.accepted.map((x) => x.resolution) : []));
    const needsAcc = resolutions.length > 0 || !(await st.atWorkspace(rep.payload.snapshot));
    const atFinal = acc ? await st.atWorkspace(acc.payload.snapshot) : !needsAcc;
    if (!atFinal || !resolutions.every((r) => accepted.has(r.sha) || after.some((a) => a.kind === 'acceptance' && a.payload.rejected.some((x) => x.resolution === r.sha))) || openFindings(st).length) failed.push('acceptance');
  }
  // Fix round 1, item 5: this used to select every non-'decision' ADR line (including 'read' and
  // 'answered', neither of which closes a Consequential decision) and never checked
  // level === 'Consequential' at all -- a 'read' line (from `cairn decisions --read`, a mere
  // developer acknowledgment) wrongly closed an unrealized decision, and the missing level check
  // meant nothing there actually distinguished a Consequential decision from any other line kind
  // that happened to carry an `of` field. Shares closedDecisionIds with the 'build' predicate
  // above, so both bullets agree on what closes a decision.
  const closedIds = closedDecisionIds(st.adr);
  if (openEscalations(st.log).length || openBreaches(st.log).length || st.tx || leaseStale(st) || st.adr.some((l) => l.kind === 'decision' && l.level === 'Consequential' && !closedIds.has(l.id))
    || st.log.some((r) => r.kind === 'item' && r.payload.kind === 'defect' && st.set.some((x) => x.requirement === r.payload.source) && !st.log.some((f) => f.kind === 'fix' && f.payload.item === r.sha))) failed.push('obligations');
  return { holds: failed.length === 0, failed };
}
define('done', async (st) => {
  if (st.closed) return null;
  const { holds, failed } = await doneRule(st);
  return holds ? unmet('done', st.slug, `the Done rule holds for ${st.slug} and no done record exists`) : unmet('done', st.slug, `the Done rule fails on ${failed.join(', ')} although every earlier predicate holds`);
});

define('promote', (st) => {
  if (!st.closed || st.records.some((r) => r.kind === 'superseded')) return null;
  const promoted = new Set(st.log.filter((r) => r.kind === 'promotion').map((r) => r.payload.item));
  const item = st.log.find((r) => r.kind === 'item' && r.payload.kind === 'backlog' && !promoted.has(r.sha));
  return item ? unmet('promote', item.payload.slug, `backlog item ${item.payload.slug} waits and no commitment is open`) : null;
});

// Fix round 1, item 7: dropped the trailing `answer: cairn answer ...` line -- section 6's own
// contract is verdict, action or party, one reason line and the predicate; an `answer:` line
// names a command Waiting's own five fields never claimed to include. The working agreement tells
// the developer the command to run.
export function render(v) {
  if (v.exit === 3) return v.line + '\n';
  if (v.verdict === 'Waiting') {
    const e = v.escalation;
    return ['verdict: Waiting', 'party: developer', `reason: ${v.reason}`, `question: ${e.question}`, `recommendation: ${e.recommendation}`, `because: ${e.because}`, `if wrong: ${e.if_wrong}`, `instead: ${e.instead}`, `predicate: ${v.predicate}`].join('\n') + '\n';
  }
  const action = v.verdict === 'Done' ? `commitment: ${v.target}` : `action: ${v.action} ${v.target}`;
  return [`verdict: ${v.verdict}`, action, `reason: ${v.reason}`, `predicate: ${v.predicate}`].join('\n') + '\n';
}
export async function cmdWake(cwd) {
  const v = await wake(cwd);
  process.stdout.write(render(v));
  return v.exit === 3 ? 3 : 0;
}

// Fix round 1, item 6: semantic progress is exactly the spec's four clauses ("a start-set
// requirement gains a current pass; an unresolved finding, defect or escalation is closed without
// an equal-or-higher priority obligation being created; the loop advances ...; or the developer
// explicitly authorizes continuation") -- a scope breach is not in that list. `obligations` used
// to include openBreaches(st.log).length, so disposing a breach (keep or restore) lowered the
// count and progressMade below read that as progress on its own, resetting the cycle counter for
// something the spec never names as a progress trigger.
//
// Fix round 1, item 11(e): the `head` field was carried on every summary but progressMade (below)
// never reads it; dropped.
export function progressSummary(st) {
  const passes = st.set.filter((x) => st.current[x.requirement]?.result === 'pass').map((x) => x.requirement).sort();
  const rep = latest(st, 'report'), rev = latest(st, 'review');
  const phase = st.closed ? 3 : rep ? 2 : rev ? 1 : 0;
  const defects = st.log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && !st.log.some((f) => f.kind === 'fix' && f.payload.item === r.sha)).length;
  const obligations = openFindings(st).length + defects + openEscalations(st.log).length;
  const answered = st.log.filter((r) => r.kind === 'answer' && r.payload.kind !== 'ask').length;
  return { passes, obligations, phase, answered };
}
export function progressMade(before, after) {
  if (!before) return false;
  if (after.passes.some((p) => !before.passes.includes(p))) return true;
  if (after.obligations < before.obligations) return true;
  if (after.phase > before.phase) return true;
  if (after.answered > before.answered) return true;
  return false;
}
