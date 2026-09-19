// lib/commitment.mjs
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
import { listTree, git } from './gitx.mjs';
import { parseDomainFile, parseRoadmap, lint } from './spec.mjs';
import { classify, KERNEL_MANAGED, matchGlob } from './paths.mjs';
import { loadSettings } from './settings.mjs';
import { canonicalize, ulid } from './canon.mjs';
import { withTransaction } from './tx.mjs';
import { refuseUnauthorizedProtected, authorizations, authenticateDeveloper, verifyEvidence, AuthError } from './auth.mjs';
import { readAdr, appendDecision } from './adr.mjs';

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

// Deviation from the plan text: parseDomainFile's block.status (lib/spec.mjs, already committed)
// is an object { kind, date } produced by parseStatus, not a plain "Agreed 2026-09-19" string --
// the plan's own specBlocks/item/frozenSet code assumed a string and called .startsWith('Agreed').
// Every status check below reads b.status.kind instead; the plan's literal error text is kept
// unchanged since b.status.kind already holds the bare word ('Agreed', 'Draft', ...).
export async function specBlocks(cwd) {
  const dir = join(cwd, 'docs/spec');
  const blocks = new Map();
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const text = await readFile(join(dir, f), 'utf8');
    if (!/^Prefix:/m.test(text)) continue;
    const parsed = parseDomainFile(text);
    for (const b of parsed.blocks) blocks.set(b.id, { ...b, scopeEvery: parsed.header.scopeEvery === true });
  }
  return blocks;
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
    const b = (await specBlocks(cwd)).get(source);
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

// Deviation from the plan text: the status-shape bug fixed above (specBlocks) applies here too --
// b.status.kind, not b.status.startsWith(...). The message text is unchanged.
export async function frozenSet(cwd, slug) {
  const roadmap = parseRoadmap(await readFile(join(cwd, ROADMAP), 'utf8'));
  const section = roadmap.sections[slug];
  if (!section) refuse(`roadmap has no section ${slug}`);
  const blocks = await specBlocks(cwd);
  const ids = new Set(section.requirements);
  for (const [id, b] of blocks) if (b.scopeEvery && b.status?.kind === 'Agreed') ids.add(id);
  const set = [];
  for (const id of [...ids].sort()) {
    const b = blocks.get(id);
    if (!b) refuse(`${id} is not in docs/spec`);
    if (b.status?.kind !== 'Agreed') refuse(`${id} is ${b.status?.kind ?? 'unreadable'}; a commitment names only Agreed requirements`);
    set.push({ requirement: id, text_digest: b.textDigest });
  }
  return set;
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
async function writeStart(cwd, slug, prepared, subject) {
  const { pending, set, roadmapText } = prepared;
  const current = parseRoadmap(roadmapText).current;
  if (current !== slug) {
    if (!pending) refuse(`roadmap names ${current} as Current:, not ${slug}; start only the section the spec-phase tail already named Current:, or supersede first`);
    await writeFile(join(cwd, ROADMAP), setCurrent(roadmapText, slug));
  }
  const paths = ['docs/spec', 'AGENTS.md', '.cairn'];
  if (await access(join(cwd, 'docs/decisions.jsonl')).then(() => true, () => false)) paths.push('docs/decisions.jsonl');
  const identity = { command: 'start', slug, from_superseded: pending ? pending.sha : null };
  const plan = {
    identity,
    writes: [{ store: 'branch', paths, message: subject }, { store: 'snapshot' }],
    terminal: { kind: 'start', target: slug, payload: { slug, snapshot: { stepRef: 1 }, requirements: set, from_superseded: pending ? pending.sha : null } },
  };
  const r = await withTransaction(cwd, { command: 'start', plan }, null);
  return r.terminalSha;
}

export async function start(cwd, slug, { installRefspecs = noop } = {}) {
  const log = await readLog(cwd);
  const prepared = await prepareStart(cwd, slug, log);
  const sha = await writeStart(cwd, slug, prepared, `Start commitment ${slug}`);
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
export async function supersede(cwd, successor, { quote, confirm, sign, nonce } = {}) {
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
  const decision = await appendDecision(cwd, {
    kind: 'decision', level: 'Consequential', by: 'developer', title: `Supersede ${open.payload.slug} with ${successor}`,
    rests_on: [`start ${open.sha}`], wrong_if: 'the developer did not choose this successor', body: quote, base_snap, evaluation: null, interfaces: [],
  }, { command: 'supersede' });
  const plan = {
    identity: { command: 'supersede', slug: open.payload.slug, successor },
    writes: [{ store: 'branch', paths: ['docs/decisions.jsonl'], message: `Supersede commitment ${open.payload.slug} with ${successor}` }],
    terminal: { kind: 'superseded', target: open.payload.slug, payload: { slug: open.payload.slug, start: open.sha, decision, transition, successor, carried } },
  };
  const r = await withTransaction(cwd, { command: 'supersede', plan }, null);
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
  const decision = await appendDecision(cwd, {
    kind: 'decision', level: 'Consequential', by: 'agent', title: `Promote ${slug}`, rests_on: [`item ${itemSha}`],
    wrong_if: 'the item is not covered by the Agreed requirements its roadmap section names', body: it.payload.body, base_snap, evaluation: null, interfaces: [],
  }, { command: 'promote' });
  const current = parseRoadmap(prepared.roadmapText).current;
  if (current !== slug) await writeFile(join(cwd, ROADMAP), setCurrent(prepared.roadmapText, slug));
  const paths = ['docs/spec', 'AGENTS.md', '.cairn', 'docs/decisions.jsonl'];
  const plan = {
    identity: { command: 'promote', item: itemSha, slug },
    writes: [
      { store: 'log', kind: 'promotion', target: slug, payload: { item: itemSha, decision, intent: null, results: [] } },
      { store: 'branch', paths, message: `Promote ${slug}` },
      { store: 'snapshot' },
    ],
    terminal: { kind: 'start', target: slug, payload: { slug, snapshot: { stepRef: 2 }, requirements: prepared.set, from_superseded: null } },
  };
  const r = await withTransaction(cwd, { command: 'promote', plan, failAfterWrite }, null);
  if (prepared.settings.authority_remote !== null) await installRefspecs(cwd, prepared.settings.authority_remote);
  return r.terminalSha;
}

export class RealizationError extends CommitmentError {
  constructor(message, paths) { super(message); this.paths = paths; }
}
const STOPS = ['data', 'protected', 'reserved'];

export async function realizationDelta(cwd, decision) {
  const { settings } = await loadSettings(cwd);
  const snap = await writeWorkspaceSnapshot(cwd);
  const base = await readSnapshot(cwd, decision.base_snap, 'workspace');
  const realized = await readSnapshot(cwd, snap, 'workspace');
  const delta = await treeDelta(cwd, base.tree, realized.tree);
  const stops = [], interfaces = [];
  for (const { path } of delta) {
    if (KERNEL_MANAGED.some((g) => matchGlob(g, path))) continue;
    const c = classify(path, settings);
    if (STOPS.includes(c)) stops.push({ path, class: c });
    else if (c === 'interface') interfaces.push(path);
  }
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
