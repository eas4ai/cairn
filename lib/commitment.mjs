// lib/commitment.mjs
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot, listPaths, refuseSensitive, ALWAYS_EXCLUDED } from './snapshots.mjs';
import { listTree, git, writeTreeFromPaths } from './gitx.mjs';
import { parseRoadmap, lint, readSpec, requirementSet, SpecError } from './spec.mjs';
import { classify, KERNEL_MANAGED, matchGlob } from './paths.mjs';
import { loadSettings } from './settings.mjs';
import { canonicalize, ulid } from './canon.mjs';
import { withTransaction } from './tx.mjs';
import { refuseUnauthorizedProtected, authorizations, authenticateDeveloper, verifyEvidence, AuthError } from './auth.mjs';
import { readAdr, appendDecision, decisionFileBytes } from './adr.mjs';
import { readMechanisms, MechanismError } from './mechanisms.mjs';

export class CommitmentError extends Error { constructor(m) { super(m); this.name = 'CommitmentError'; } }
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KINDS = ['backlog', 'next-feature', 'defect'];
const refuse = (m) => { throw new CommitmentError(m); };

export function openCommitment(log) {
  let open = null, pending = null;
  for (const r of log) {
    if (r.kind === 'start') { open = r; pending = null; }
    else if (r.kind === 'done' && open) open = null;
    else if (r.kind === 'superseded' && open) { pending = r; open = null; }
  }
  return { open, pending };
}

export async function treeDelta(cwd, treeA, treeB) {
  const a = new Map((await listTree(cwd, treeA)).map((e) => [e.path, e.sha]));
  const b = new Map((await listTree(cwd, treeB)).map((e) => [e.path, e.sha]));
  const out = [];
  for (const p of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    if (a.get(p) !== b.get(p)) out.push({ path: p, before: a.get(p) ?? null, after: b.get(p) ?? null });
  }
  return out;
}

async function findItem(log, sha) {
  const it = log.find((r) => r.sha === sha && r.kind === 'item');
  if (!it) refuse(`${sha} is not an item record`);
  return it;
}

export async function item(cwd, { kind, slug, source, body }) {
  if (!KINDS.includes(kind)) refuse(`item kind is one of ${KINDS.join(', ')}`);
  if (typeof slug !== 'string' || !SLUG.test(slug)) refuse(`invalid item slug ${slug}`);
  if (typeof body !== 'string' || body.trim() === '') refuse('an item needs a body');
  if (typeof source !== 'string' || source.trim() === '') refuse('an item names its source requirement or the contract it changes');
  if (kind !== 'next-feature') {
    // Fix round 1 finding 8 (Important, quality): reads lib/spec.mjs's own readSpec instead of a
    // second, hand-maintained scan of docs/spec that had drifted from it (first-duplicate-wins
    // here vs. readSpec's own first-wins rule was actually the same by luck, but the NON_DOMAIN
    // exclusion -- overview.md/glossary.md/roadmap.md are never domain files even if one of them
    // happened to contain a line matching /^Prefix:/ -- was not).
    const { blocks } = await readSpec(cwd);
    const b = blocks.get(source);
    if (!b || b.status?.kind !== 'Agreed') refuse(`${source} is not an Agreed requirement`);
  }
  const log = await readLog(cwd);
  if (log.some((r) => r.kind === 'item' && r.payload.slug === slug)) refuse(`item slug ${slug} is taken`);
  return appendRecord(cwd, 'item', slug, { kind, slug, source, body });
}

export async function outside(cwd, itemSha, reason, { evaluation = null } = {}) {
  const it = await findItem(await readLog(cwd), itemSha);
  if (typeof reason !== 'string' || reason.trim() === '') refuse('outside needs a reason');
  return appendRecord(cwd, 'outside', it.payload.slug, { item: itemSha, reason, evaluation });
}

export async function protectedDelta(cwd, snapA, snapB) {
  const { settings } = await loadSettings(cwd);
  const a = await readSnapshot(cwd, snapA, 'workspace');
  const b = await readSnapshot(cwd, snapB, 'workspace');
  return (await treeDelta(cwd, a.tree, b.tree)).map((d) => d.path).filter((p) => classify(p, settings) === 'protected');
}

export async function fix(cwd, itemSha) {
  const log = await readLog(cwd);
  const it = await findItem(log, itemSha);
  if (it.payload.kind !== 'defect') refuse('only a defect item is fixed');
  const { open } = openCommitment(log);
  if (!open) refuse('a fix is recorded under an open commitment');
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const changed = await protectedDelta(cwd, open.payload.snapshot, snapshot);
  if (changed.length) refuse(`fix changes protected contract ${changed[0]}`);
  return appendRecord(cwd, 'fix', it.payload.slug, { item: itemSha, snapshot });
}

const ROADMAP = 'docs/spec/roadmap.md';
const noop = async () => {};

export function setCurrent(text, slug) {
  const m = /^Current:[ \t]*.*$/m.exec(text);
  if (!m) throw new CommitmentError(`${ROADMAP} has no Current: line`);
  return text.slice(0, m.index) + `Current: ${slug}` + text.slice(m.index + m[0].length);
}

// Fix round 1 finding 8 (Important, quality): this duplicated lib/spec.mjs's own requirementSet
// (roadmap-section-plus-scopeEvery-Agreed-blocks resolution, exactly what "the frozen set" is)
// with a diverging duplicate-id rule (see readSpec's own comment above item()) and no NON_DOMAIN
// exclusion. Now a thin wrapper: requirementSet does the resolution, and its {id, textDigest}
// shape is remapped to the record schema's {requirement, text_digest} field names. Its SpecError
// messages ("no roadmap section X", "X is Y, not Agreed") differ from the plan's own wording
// ("roadmap has no section X", "X is Y; a commitment names only Agreed requirements"); this is a
// deliberate consequence of using the shared, canonical implementation rather than a second one
// tuned to match the plan's exact prose -- tests/commitment.test.mjs's two matching assertions
// were updated to requirementSet's real message text.
export async function frozenSet(cwd, slug) {
  let set;
  try { set = await requirementSet(cwd, slug); }
  catch (e) { if (e instanceof SpecError) refuse(e.message); throw e; }
  return set.map(({ id, textDigest }) => ({ requirement: id, text_digest: textDigest }));
}

// Fix round 1 finding 7 (Important, quality): this was a second, hand-maintained reimplementation
// of lib/auth.mjs's protectedDigests, never actually called by anything in this module (start's
// own authorization gate goes through currentAuthorization -> refuseUnauthorizedProtected, which
// uses auth.mjs's own protectedDigests internally) -- dead in production, and a second place the
// digest rule could silently drift from the one refuseUnauthorizedProtected actually enforces.
// Deleted outright; callers (including this module's own tests) import protectedDigests from
// lib/auth.mjs directly.

// Carried obligation 2: `cairn start` must call refuseUnauthorizedProtected (lib/auth.mjs) before
// writing anything and refuse without a current authorization. Rather than reimplementing that
// chain-verification logic (forged-record detection, signature re-verification; see lib/auth.mjs's
// own extensive comments), currentAuthorization delegates to it directly: any refusal from
// refuseUnauthorizedProtected means "no current authorization", matching this function's
// null-on-failure contract, and prepareStart below calls this function early, before any write.
// Fix round 1 finding 9 (Important, quality): the bare `catch { return null }` turned every
// exception from refuseUnauthorizedProtected into "no current authorization", including a
// structural breach (a forged second 'init' record on refs/cairn/log) and a SettingsError from a
// broken .cairn/settings.json -- both real problems a developer needs to see and fix, not ones
// `cairn authorize` can solve. Only the three messages refuseUnauthorizedProtected itself uses for
// a genuine "nothing to verify" or "no longer matches" state map to null; anything else
// (including its own breach message, and any non-AuthError at all) is rethrown.
const NO_CURRENT_AUTH = [
  /^cairn: run cairn init first/,
  /without a developer authorization; run cairn authorize/,
  /evidence does not verify against the current signing_key/,
];
export async function currentAuthorization(cwd, log) {
  try { await refuseUnauthorizedProtected(cwd, log); }
  catch (e) {
    if (e instanceof AuthError && NO_CURRENT_AUTH.some((re) => re.test(e.message))) return null;
    throw e;
  }
  return authorizations(log).at(-1) ?? null;
}

async function prepareStart(cwd, slug, log) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) refuse(`invalid slug ${slug}`);
  const { open, pending } = openCommitment(log);
  if (open) refuse(`commitment ${open.payload.slug} is open; at most one commitment is open`);
  if (pending && pending.payload.successor !== slug) refuse(`pending supersession names successor ${pending.payload.successor}, not ${slug}`);
  const findings = await lint(cwd);
  if (findings.length) refuse(`docs/spec does not lint: ${JSON.stringify(findings[0])}`);
  const roadmapText = await readFile(join(cwd, ROADMAP), 'utf8');
  const set = await frozenSet(cwd, slug);
  if (!(await currentAuthorization(cwd, log))) refuse('no current authorization binds the specification, working agreement and settings; run cairn authorize');
  const { settings } = await loadSettings(cwd);
  return { pending, set, roadmapText, settings };
}

// Deviation from the plan text: lib/tx.mjs's withTransaction (already committed, plan 04) does not
// accept an arbitrary `plan` object naming only the caller's own fields -- it requires
// plan.identity, plan.writes (an ordered list of {store, ...} descriptors: 'file', 'branch',
// 'snapshot' or 'log') and plan.terminal ({kind, target, payload}), and it unconditionally injects
// intent/results into the appended terminal record after running plan.writes and an optional fn.
// A 'file' write's bytes must be fully known before staging (before any write in the transaction
// executes), so a write whose content depends on another write's own result (e.g. a snapshot sha)
// cannot be expressed as a 'file' descriptor. Roadmap and ADR content that must reference such a
// result is therefore written directly to the working tree before the transaction starts (the same
// pattern lib/auth.mjs's authorize() already uses: it writes nothing itself and just detects which
// protected paths are already dirty), and the transaction's own 'branch' write commits whatever is
// then on disk for the given paths via `git commit --only`, which needs no bytes staged up front.
// This mirrors the spec's own crash-recovery text ("stages exact bytes ... before ... performs the
// ordered writes") for the writes that tx.mjs can express; the roadmap/ADR bytes are not part of
// its own pre/post identity tracking, an accepted, already-precedented limitation (authorize()'s
// 'branch' write has the same property).
// Fix round 1 finding 4 (Minor): this moved Current: for any slug that differed from the
// roadmap's own Current: line, not only a supersession successor's start -- a plain start()
// (never following a supersede()) silently retargeted Current: to whatever slug was asked for,
// even though the spec-phase-tail workflow (outside this plan) is what is supposed to have
// already written Current: to name that section before cairn start ever runs. Current: now moves
// only when this call is the successor of a pending supersession (prepared.pending is set); any
// other mismatch refuses instead of silently rewriting the roadmap.
// Fix round 1 findings 2 and 12: writeStart is now the one place either start() or promote()
// builds and runs the successor-start transaction (finding 12: promote no longer duplicates this
// body). The roadmap's Current: edit is a {store:'file'} write like any other planned write --
// known before staging (setCurrent's own throw, e.g. "no Current: line", now happens before
// withTransaction is ever entered, the same as every other precondition in prepareStart) -- rather
// than a direct pre-transaction writeFile with no crash-recovery coverage of its own (finding 2).
// `extraFileWrites`/`extraWrites` let promote() add its ADR {store:'file'} write and 'promotion'
// {store:'log'} write (also both now known before staging; see decisionFileBytes and promote's own
// comment) without this function needing to know anything about the ADR or promotion at all.
async function writeStart(cwd, slug, prepared, subject, command, { moveCurrent = false, extraFileWrites = [], extraWrites = [], failAfterWrite = -1 } = {}) {
  const { pending, set, roadmapText } = prepared;
  const current = parseRoadmap(roadmapText).current;
  const fileWrites = [...extraFileWrites];
  if (current !== slug) {
    if (!moveCurrent) refuse(`roadmap names ${current} as Current:, not ${slug}; start only the section the spec-phase tail already named Current:, or supersede first`);
    fileWrites.push({ store: 'file', path: ROADMAP, bytes: setCurrent(roadmapText, slug) });
  }
  const paths = ['docs/spec', 'AGENTS.md', '.cairn'];
  if (fileWrites.some((w) => w.path === 'docs/decisions.jsonl') || await access(join(cwd, 'docs/decisions.jsonl')).then(() => true, () => false)) paths.push('docs/decisions.jsonl');
  const writes = [...extraWrites, ...fileWrites, { store: 'branch', paths, message: subject }, { store: 'snapshot' }];
  const snapshotIndex = writes.length - 1;
  const identity = { command, slug, from_superseded: pending ? pending.sha : null };
  const plan = {
    identity,
    writes,
    terminal: { kind: 'start', target: slug, payload: { slug, snapshot: { stepRef: snapshotIndex }, requirements: set, from_superseded: pending ? pending.sha : null } },
  };
  const r = await withTransaction(cwd, { command, plan, failAfterWrite }, null);
  return r.terminalSha;
}

export async function start(cwd, slug, { installRefspecs = noop, failAfterWrite = -1 } = {}) {
  const log = await readLog(cwd);
  const prepared = await prepareStart(cwd, slug, log);
  const sha = await writeStart(cwd, slug, prepared, `Start commitment ${slug}`, 'start', { moveCurrent: !!prepared.pending, failAfterWrite });
  if (prepared.settings.authority_remote !== null) await installRefspecs(cwd, prepared.settings.authority_remote);
  return sha;
}

export async function done(cwd, slug) {
  const log = await readLog(cwd);
  const { open } = openCommitment(log);
  if (!open) refuse('no commitment is open');
  if (open.payload.slug !== slug) refuse(`commitment ${open.payload.slug} is open, not ${slug}`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'done', slug, { slug, snapshot });
}

// Fix round 1 finding 3 (Important): slicing the log to "after open.sha" dropped an open record
// that was itself already carried once, by an earlier supersession: its item/escalation/review
// record sits before the CURRENT open commitment's own start (it was created under an even
// earlier one), so it never appeared in `after` and was reported as not carried on the second
// supersession even though it was still genuinely unfixed/unanswered/unresolved. Scans the whole
// log instead, the same way promote's own unfixed-defect scan (above) already does; `open` is
// still accepted (matching the plan's declared signature and every existing caller) but no longer
// used to bound the scan.
export function carriedRecords(log, open) {
  const has = (kind, pred) => log.some((r) => r.kind === kind && pred(r));
  const carried = [];
  for (const r of log) {
    if (r.kind === 'escalation' && !has('answer', (a) => a.payload.escalation === r.sha && ['ok', 'instead'].includes(a.payload.kind))) carried.push(r.sha);
    else if (r.kind === 'item' && r.payload.kind === 'defect' && !has('fix', (f) => f.payload.item === r.sha)) carried.push(r.sha);
    else if (['review', 'report', 'acceptance'].includes(r.kind)) {
      const n = Array.isArray(r.payload.findings) ? r.payload.findings.length : 0;
      const unresolved = [...Array(n).keys()].some((i) => !has('resolution', (x) => x.payload.source === r.sha && x.payload.finding === i + 1));
      if (unresolved) carried.push(r.sha);
    }
  }
  return carried;
}

// Deviation from the plan text, two parts:
// 1. withTransaction's real contract (see writeStart's own note above) means the decision's ADR
//    line -- which must embed base_snap, a snapshot store's own result -- cannot be expressed as a
//    'file' write inside this same transaction (a write's bytes must be known before staging, and
//    a same-transaction snapshot's result is only known after). base_snap is instead taken directly
//    before the transaction starts (as the plan's own code already did, just not inside `fn`), and
//    appendDecision (Task 1) writes the ADR line straight to disk the same way; the transaction's
//    'branch' write then commits whatever is on disk for docs/decisions.jsonl via `git commit
//    --only`, needing no bytes staged up front. No 'snapshot' write is needed for supersede's own
//    terminal record -- unlike 'start' and 'promotion', the 'superseded' schema carries no
//    snapshot field (spec section 4's table: "slug, old start SHA, developer decision ID,
//    transition ID, successor slug, carried record SHAs").
// 2. authenticateDeveloper/verifyEvidence added explicitly (the plan's own code called
//    authenticateDeveloper with no `subject` at all, which would confirm-prompt with a literal
//    "undefined" in the text, and never re-verified the result the way authorize()/readDecision()
//    do); {confirm, sign, nonce} are accepted as passthrough options the same way those two
//    functions take them, so a caller (CLI or test) can supply non-interactive evidence.
export async function supersede(cwd, successor, { quote, confirm, sign, nonce, failAfterWrite = -1 } = {}) {
  if (typeof successor !== 'string' || !SLUG.test(successor)) refuse(`invalid slug ${successor}`);
  const log = await readLog(cwd);
  const { open } = openCommitment(log);
  if (!open) refuse('no commitment is open to supersede');
  // Fix round 1 finding 6 (Minor): the open commitment's own slug was accepted as its own
  // successor, which would supersede a commitment with itself.
  if (successor === open.payload.slug) refuse(`successor ${successor} is the same as the open commitment ${open.payload.slug}`);
  if (typeof quote !== 'string' || quote.trim() === '') refuse("supersede needs the developer's words: quote: \"<text>\"");
  const { settings } = await loadSettings(cwd);
  const subject = canonicalize({ from: open.payload.slug, to: successor });
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'supersede', subject, sign, confirm, nonce });
  if (!verifyEvidence(settings, evidence, { purpose: 'supersede', subject })) refuse('developer evidence does not verify');
  const carried = carriedRecords(log, open);
  const transition = ulid();
  const base_snap = await writeWorkspaceSnapshot(cwd);
  // Fix round 1 finding 2 (Important): the ADR line's bytes are computed here, in memory, by
  // decisionFileBytes (lib/adr.mjs) -- no disk write yet -- and staged as an ordinary
  // {store:'file'} write below, instead of being written directly to disk before the transaction
  // (an orphan queued decision on any failure between that write and the transaction completing).
  const { id: decision, bytes: adrBytes } = await decisionFileBytes(cwd, {
    kind: 'decision', level: 'Consequential', by: 'developer', title: `Supersede ${open.payload.slug} with ${successor}`,
    rests_on: [`start ${open.sha}`], wrong_if: 'the developer did not choose this successor', body: quote, base_snap, evaluation: null, interfaces: [],
  }, { command: 'supersede' });
  const plan = {
    identity: { command: 'supersede', slug: open.payload.slug, successor },
    writes: [
      { store: 'file', path: 'docs/decisions.jsonl', bytes: adrBytes },
      { store: 'branch', paths: ['docs/decisions.jsonl'], message: `Supersede commitment ${open.payload.slug} with ${successor}` },
    ],
    terminal: { kind: 'superseded', target: open.payload.slug, payload: { slug: open.payload.slug, start: open.sha, decision, transition, successor, carried } },
  };
  const r = await withTransaction(cwd, { command: 'supersede', plan, failAfterWrite }, null);
  return r.terminalSha;
}

// Fix round 1 finding 1 (Critical): recover() always finishes with fn: null (lib/tx.mjs:
// `finish(cwd, s, tx, intent.sha, null)` in its forward-completion branch), so anything written
// only inside withTransaction's own `fn` callback -- as the 'promotion' record was here -- never
// runs again during recovery. An interrupted promote (crash after the branch or snapshot write,
// before the terminal 'start' record) recovered forward with a successor start and no promotion
// record at all. The fix: 'promotion' is now a plan.writes 'log' descriptor, fully known before
// staging (its own payload never needs a same-transaction result), so applyWrites' idempotent
// log-write branch (kind+target+payload match against the log slice after this transaction's own
// intent) replays it correctly on every recovery path, the same way the branch and snapshot writes
// already do. `intent` is nullable(ref) on the 'promotion' schema and stays null here: the real
// intentSha is only known once the transaction's own command-intent record exists, after every
// plan.writes entry (including this one) is already staged.
export async function promote(cwd, itemSha, { installRefspecs = noop, failAfterWrite = -1 } = {}) {
  const log = await readLog(cwd);
  const it = await findItem(log, itemSha);
  const { open, pending } = openCommitment(log);
  if (open) refuse(`commitment ${open.payload.slug} is open; promote runs only after done`);
  if (pending) refuse(`a supersession to ${pending.payload.successor} is pending; start it first`);
  if (it.payload.kind === 'next-feature') refuse('a next-feature item waits for the developer; it is never promoted');
  if (it.payload.kind !== 'backlog') refuse('only a backlog item is promoted');
  if (log.some((r) => r.kind === 'promotion' && r.payload.item === itemSha)) refuse(`item ${it.payload.slug} was already promoted`);
  const unfixed = log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && !log.some((f) => f.kind === 'fix' && f.payload.item === r.sha));
  if (unfixed.length) refuse(`defect item ${unfixed[0].payload.slug} is unfixed; defects are fixed before promotion`);
  const slug = it.payload.slug;
  const prepared = await prepareStart(cwd, slug, log);
  const base_snap = await writeWorkspaceSnapshot(cwd);
  // Fix round 1 finding 2 (Important): the ADR line's bytes, like supersede's own (above), are
  // computed here without writing anything, then staged as a {store:'file'} write inside
  // writeStart's plan below -- not written directly to disk before the transaction.
  const { id: decision, bytes: adrBytes } = await decisionFileBytes(cwd, {
    kind: 'decision', level: 'Consequential', by: 'agent', title: `Promote ${slug}`, rests_on: [`item ${itemSha}`],
    wrong_if: 'the item is not covered by the Agreed requirements its roadmap section names', body: it.payload.body, base_snap, evaluation: null, interfaces: [],
  }, { command: 'promote' });
  // Fix round 1 finding 12: calls the shared writeStart (above) instead of duplicating its body.
  // promote always moves Current: (it is the only way a successor commitment starts without a
  // supersession), and adds its own ADR file write and 'promotion' log write (Fix round 1 finding
  // 1: a plan.writes descriptor, not an fn side effect) alongside the ones writeStart always makes.
  const sha = await writeStart(cwd, slug, prepared, `Promote ${slug}`, 'promote', {
    moveCurrent: true,
    extraFileWrites: [{ store: 'file', path: 'docs/decisions.jsonl', bytes: adrBytes }],
    extraWrites: [{ store: 'log', kind: 'promotion', target: slug, payload: { item: itemSha, decision, intent: null, results: [] } }],
    failAfterWrite,
  });
  if (prepared.settings.authority_remote !== null) await installRefspecs(cwd, prepared.settings.authority_remote);
  return sha;
}

export class RealizationError extends CommitmentError {
  constructor(message, paths) { super(message); this.paths = paths; }
}
const STOPS = ['data', 'protected', 'reserved'];

// Fix round 1 finding 5 (Minor): a kernel-managed path (.cairn/mechanisms/**, docs/decisions.jsonl)
// in the delta was always skipped, unconditionally -- so a decision could realize a hand-edited,
// invalid mechanism definition or a corrupted ADR file and the check would never notice, exactly
// the mutation section 2 calls a breach ("A direct edit ... by another command is a breach").
// Correct: a kernel-managed path is allowed through only when the file it belongs to still
// validates under its own reader (readMechanisms for .cairn/mechanisms/**, readAdr for
// docs/decisions.jsonl) at the realized state; otherwise every kernel-managed path in the delta
// stops as 'reserved', the same class an ordinary invalid reserved-path edit gets.
//
// Fix round 1 finding 12: the workspace snapshot (a durable, permanent commit on
// refs/cairn/snapshots) used to be taken unconditionally, before the delta was even computed, so a
// realize() that stopped still left a dangling snapshot commit behind for no reason. The delta is
// now computed from an uncommitted tree (writeTreeFromPaths, the same primitive
// writeWorkspaceSnapshot itself builds on, with no commit and no ref advance) and the real,
// durable snapshot is written only once the stop check has already passed; `snap` is null when
// `stops.length` is non-empty, since nothing durable was recorded to name.
async function kernelManagedValid(cwd, path) {
  if (matchGlob('docs/decisions.jsonl', path)) {
    try { await readAdr(cwd); return true; } catch { return false; }
  }
  try { await readMechanisms(cwd); return true; }
  catch (e) { if (e instanceof MechanismError) return false; throw e; }
}

export async function realizationDelta(cwd, decision) {
  const { settings } = await loadSettings(cwd);
  const base = await readSnapshot(cwd, decision.base_snap, 'workspace');
  const { tracked, untracked } = await listPaths(cwd);
  refuseSensitive(untracked, settings.network_exclude ?? []);
  const realizedTree = await writeTreeFromPaths(cwd, { paths: [...tracked, ...untracked], exclude: ALWAYS_EXCLUDED });
  const delta = await treeDelta(cwd, base.tree, realizedTree);
  const stops = [], interfaces = [];
  for (const { path } of delta) {
    if (KERNEL_MANAGED.some((g) => matchGlob(g, path))) {
      if (!(await kernelManagedValid(cwd, path))) stops.push({ path, class: 'reserved' });
      continue;
    }
    const c = classify(path, settings);
    if (STOPS.includes(c)) stops.push({ path, class: c });
    else if (c === 'interface') interfaces.push(path);
  }
  const snap = stops.length ? null : await writeWorkspaceSnapshot(cwd);
  return { snap, delta, stops, interfaces };
}

export async function realize(cwd, decisionId, { subject }) {
  if (typeof subject !== 'string' || subject.trim() === '') refuse('realize needs a subject');
  const adr = await readAdr(cwd);
  const decision = adr.find((l) => l.kind === 'decision' && l.id === decisionId);
  if (!decision) refuse(`no decision ${decisionId}`);
  if (adr.some((l) => l.kind === 'realized' && l.of === decisionId)) refuse(`decision ${decisionId} is already realized`);
  const { snap, stops, interfaces } = await realizationDelta(cwd, decision);
  if (stops.length) {
    const list = stops.map((s) => `${s.path} (${s.class})`).join(', ');
    throw new RealizationError(`realization of ${decisionId} touches ${list}; the decision is the developer's`, stops);
  }
  return appendDecision(cwd, { kind: 'realized', of: decisionId, base_snap: decision.base_snap, snap, subject, interfaces }, { command: 'realize' });
}
