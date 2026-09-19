// lib/evaluate.mjs
// Plan 15 (measurement core): the composite Score measurement the agent reads before it decides
// at a Consequential decision (spec section 10). This file replaces the superseded gate/shadow/
// route evaluator wholesale -- the old evaluate(), EVALUATOR_DEFAULTS, THRESHOLD_KEYS,
// validateEvaluatorSettings, applyEnvelope and calibrate() are gone with it, not carried forward
// or stubbed. Later tasks in this plan (4-10) add the floor, the state builder, the request
// builder, the parser, the veto/composite, measure() and calibrate() back in this plan's shape.
//
// This task (3) is the first slice: the policy constants (the five dimensions and their level
// 0-4 criteria text, copied verbatim from docs/spec/cairn-v2.md section 10's Score table and from
// .superpowers/bench/composite-design.md, which already ran this exact wording live at 0.895
// route accuracy -- .superpowers/bench/results.md), the construction version, the request/state
// size limits, the probability-sum tolerance, and the policy digest that covers all of them plus
// the settings fields section 10 says reset calibration.
import { canonicalize, sha256 } from './canon.mjs';
import { CREDENTIAL_PATTERNS } from './paths.mjs';
// Deviation from the brief text: the brief's Step 3 snippet writes
// `export { normalizeDraft, draftDigest, DRAFT_KEYS, FIELDS as FIVE_FIELDS } from './escalate.mjs';`
// but lib/escalate.mjs exports the ten-field validator as `validateDraft`, not `normalizeDraft` --
// it never has (git log -- lib/escalate.mjs shows no rename), and the interfaces line calls
// escalate.mjs "unchanged" by this plan, so escalate.mjs is not edited to add that name. The
// rename happens here instead, the same way FIELDS is renamed to FIVE_FIELDS on the same line: an
// aliased re-export, so escalate.mjs's actual export surface (validateDraft) is untouched and
// this module's normalizeDraft is that same function under this plan's name for it.
export { DraftError, validateDraft as normalizeDraft, draftDigest, DRAFT_KEYS, FIELDS as FIVE_FIELDS } from './escalate.mjs';

// Score criteria text, level index = array index, 0 to 4. Verbatim from docs/spec/cairn-v2.md
// section 10 and .superpowers/bench/composite-design.md.
const LEVELS = Object.freeze({
  evidence: Object.freeze(['none', 'a claim', 'names a command or file', 'quotes output or a diff',
    'quotes output and names the test that fails and the falsifier it maps to']),
  reach: Object.freeze(['wording or message text', 'internal structure, nothing visible',
    'behavior inside an agreed requirement', 'output or flags existing callers depend on',
    'data that cannot be regenerated, a migration, or a rewrite of user files']),
  contract: Object.freeze(['implements the cited requirement as written', 'chooses between readings the text allows',
    'adds behavior no requirement names', 'conflicts with a cited decision', "changes a requirement's text or falsifier"]),
  surface: Object.freeze(['no new surface', 'a new file or module', 'a new flag or output', 'a new dependency',
    'a network call, credential, or external service']),
  ambiguity: Object.freeze(['one reading, the draft names it', 'two readings, the draft picks one with a reason',
    'two readings, no reason', 'the question asks the developer to choose a policy',
    'the question cannot be answered without facts the draft lacks']),
});

export const POLICY = Object.freeze({
  DIMENSIONS: Object.freeze(['evidence', 'reach', 'contract', 'surface', 'ambiguity']),
  LEVELS,
  CONSTRUCTION: 1,
  // jev-1.13.0 permits 64k request tokens and 32k for state plus the longest question (section
  // 10, "Limits and failure"); the kernel estimates 3 bytes/token and refuses above 75% of either
  // limit before sending. Tasks 5 and 6 (the state builder's requestBytesEstimate and the request
  // builder's size check, per this plan's progress ledger) consume these.
  LIMITS: Object.freeze({ requestTokens: 64000, stateTokens: 32000, bytesPerToken: 3, factor: 0.75 }),
  // Closes the round-3 benchmark's 1e-6-tolerance data loss: 3 of 22 live jev-1.13.0 responses
  // summed to 0.99 across five levels (a rounding artifact), not 1.0, and a 1e-6 tolerance
  // rejected them as invalid with the raw response unsaved (.superpowers/bench/results.md,
  // "Data loss note"). Task 7's parser (parseScoreAnswers, per the progress ledger) consumes this.
  PROB_TOLERANCE: 0.02,
});

// Section 10: "The policy digest covers model, schemas, questions, request construction, the
// narrow floor, the veto rule, weights, agent_ceiling, confidence_floors, caps and egress; a
// change to any of them resets calibration." `enabled` picks the measurement's source (jev vs.
// review) -- both answer the same five dimensions in the same shape, so it is a source choice,
// not a policy fact, and is deliberately left out here. `developer` is routing presence (section
// 5), not measurement policy, and is also left out.
export function policyDigest(settings) {
  const t = settings.typesafeai;
  return sha256(canonicalize({
    model: t.model,
    dimensions: POLICY.DIMENSIONS,
    levels: POLICY.LEVELS,
    construction: POLICY.CONSTRUCTION,
    weights: t.weights,
    agent_ceiling: t.agent_ceiling,
    confidence_floors: t.confidence_floors,
    caps: { request_cap_bytes: t.request_cap_bytes, ...POLICY.LIMITS },
    egress: { network_exclude: [...settings.network_exclude], credential: [...CREDENTIAL_PATTERNS] },
  }));
}

// --- Task 4: the narrow floor -- kernelFacts(cwd, D), floorReasons(f) and authorityProjection(f) -
// Section 10, "The narrow floor": "a draft whose recommended option would change an Agreed
// requirement's text or its falsifier, would change the working agreement, or touches data that
// cannot be regenerated routes to the developer without a call" -- exactly three named conditions
// (contract, agreement, data) plus the technical no-request cases (missing recommendation, an
// incomplete authority projection; oversize request and call/answer failure are later tasks'
// concern). Fix round 1 (Controller Ruling 7): reserved/protected-path writes, the fourth-attempt
// rule and scope rulings are "already enforced by section 2 and section 5 independent of this
// floor" (same section) -- floorReasons no longer fires on them. The underlying facts
// (path class, attempts, a breach: concern) stay in kernelFacts/A(D) -- they are facts the model
// may see -- they just no longer force the developer here.
//
// This is the superseded design's kernelFacts/protectedReasons/authorityProjection, ported
// essentially unchanged (same kernel facts: path classification, attempt counts, open obligations,
// cited-decision projection) -- it reads kernel facts and is agnostic to the routing design above
// it. Renamed protectedReasons -> floorReasons to match section 10's own name for this code path.
// authorityProjection's shape (A(D), the closed JSON projection) is unchanged; it now also fails
// the projection (returns null) when the recommended option cannot be located in D.options.
import { classify } from './paths.mjs';
import { readLog, range, appendRecord } from './records.mjs';
import { attempts as reqAttempts } from './check.mjs';
import { readAdr, queue } from './adr.mjs';
import { readLease } from './lease.mjs';
import { loadSettings } from './settings.mjs';
import { parseConcern } from './escalate.mjs';

const FINDING_KINDS = new Set(['review', 'report', 'acceptance']);
// Fix round 1, Minor 5: hoisted out of concernValid, which used to rebuild this literal on every
// call; the three entries are fixed, so building it once at module load is equivalent and cheaper.
const RECORD_KIND = { item: 'item', breach: 'scope-breach', transaction: 'command-intent' };

// Mirrors lib/escalate.mjs's checkConcerns (which throws on the first invalid token) as a
// non-throwing per-token predicate: kernelFacts needs a validity flag for every concern, not just
// a yes/no for the whole list, since floorReasons/authorityProjection fail closed on individual
// invalid concerns rather than refusing to run.
function concernValid(token, log, startRec) {
  let c; try { c = parseConcern(token); } catch { return false; }
  if (c.kind === 'cycle' || c.kind === 'contract') return true;
  if (c.kind === 'requirement') return !!startRec && startRec.payload.requirements.some((q) => q.requirement === c.ref);
  if (c.kind === 'finding') {
    const src = log.find((x) => x.sha === c.ref);
    return !!src && FINDING_KINDS.has(src.kind) && Array.isArray(src.payload.findings) && src.payload.findings.some((f) => f.n === c.n);
  }
  // Fix round 1, Minor 6: the trailing `return false` this replaced was unreachable dead code --
  // parseConcern's kind set (cycle, contract, requirement, finding, item, breach, transaction) is
  // exhaustively handled: the three branches above cover cycle/contract/requirement/finding, and
  // RECORD_KIND covers exactly item/breach/transaction, so this line always executes its `if`.
  return !!RECORD_KIND[c.kind] && log.some((x) => x.sha === c.ref && x.kind === RECORD_KIND[c.kind]);
}
// classify() (lib/paths.mjs) throws PathError on a malformed path; named_paths entries are only
// checked for being strings by normalizeDraft, not for path grammar. A malformed named path fails
// closed to 'reserved' (blocks agent authority) rather than crashing kernelFacts or silently
// passing through unclassified.
function safeClassify(p, settings) { try { return classify(p, settings); } catch { return 'reserved'; } }
function unresolvedFindings(log) {
  let count = 0;
  for (const r of log) {
    if (!FINDING_KINDS.has(r.kind)) continue;
    for (const f of (r.payload.findings || [])) if (!log.some((x) => x.kind === 'resolution' && x.payload.source === r.sha && x.payload.finding === f.n)) count++;
  }
  return count;
}
function openEscalations(log) {
  return log.filter((r) => r.kind === 'escalation' && !log.some((a) => a.kind === 'answer' && a.payload.escalation === r.sha && ['ok', 'instead'].includes(a.payload.kind))).length;
}
function openDefects(log) { return log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && !log.some((x) => x.kind === 'fix' && x.payload.item === r.sha)).length; }
function openBreaches(log) { return log.filter((r) => r.kind === 'scope-breach' && !log.some((x) => x.kind === 'scope' && x.payload.breach === r.sha)).length; }

export async function kernelFacts(cwd, D) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const r = range(log);
  const slug = r.start ? r.start.payload.slug : null;
  const concerns = D.concerns.map((id) => ({ id, valid: concernValid(id, log, r.start) }));
  const pathClasses = Object.fromEntries(D.named_paths.map((p) => [p, safeClassify(p, settings)]));
  const attempts = {};
  for (const id of D.concerns) { let c; try { c = parseConcern(id); } catch { continue; } if (c.kind === 'requirement') attempts[c.ref] = reqAttempts(log, c.ref); }
  const openObligations = { escalations: openEscalations(log), findings: unresolvedFindings(log), defects: openDefects(log), breaches: openBreaches(log) };
  const adr = await readAdr(cwd);
  const unread = new Set(await queue(cwd));
  const decisions = D.cited_decisions.map((id) => {
    const line = adr.find((l) => l.kind === 'decision' && l.id === id);
    return line ? { id, by: line.by, read: !unread.has(id), body: line.body, title: line.title } : { id, by: null, read: false, body: null, title: null, missing: true };
  });
  return { slug, set: r.start ? r.start.payload.requirements : [], concerns, pathClasses, attempts, openObligations, decisions, lease: await readLease(cwd), D, settings };
}

export function floorReasons(f) {
  const out = [];
  const classes = Object.entries(f.pathClasses);
  // Fix round 1 (Controller Ruling 7): section 10's narrow floor names exactly three conditions
  // (contract, agreement, data) plus the technical no-request cases below. Reserved/protected-path
  // writes ('settings', a .cairn/settings.json write, and 'reserved'/'kernel-managed' paths), the
  // fourth-attempt rule and scope rulings are "already enforced by section 2 and section 5
  // independent of this floor" (same section) -- they no longer appear here. kernelFacts still
  // computes the underlying facts (pathClasses, attempts, a breach: concern) and authorityProjection
  // still exposes them in A(D) (protected.reserved, attempts) -- they are facts the model may see,
  // just not floor-firing ones.
  if (classes.some(([, c]) => c === 'data')) out.push('data');
  if (classes.some(([p, c]) => c === 'protected' && p.startsWith('docs/spec/'))) out.push('contract');
  if (classes.some(([p, c]) => c === 'protected' && p === 'AGENTS.md')) out.push('agreement');
  // Deviation from the brief text: the brief's Step 3 snippet has these as two independent `if`s.
  // authorityProjection's new adjustment (this task) returns null whenever the recommendation is
  // not found in D.options, and a blank/whitespace recommendation is also "not found" (indexOf
  // returns -1) -- run as two independent ifs, a blank recommendation pushes both
  // 'missing-recommendation' and 'incomplete-projection' together, which fails the brief's own
  // Step 1 test (`recommendation: '  '` expects exactly `['missing-recommendation']`). A missing
  // recommendation and a recommendation that does not match any option are different problems
  // (section 10 lists them as separate no-call reasons); `else if` reports the more specific one
  // first and does not also report the option-lookup failure it necessarily causes.
  if (!f.D.recommendation || !f.D.recommendation.trim()) out.push('missing-recommendation');
  else if (authorityProjection(f) === null) out.push('incomplete-projection');
  return out;
}

export function authorityProjection(f) {
  const n = f.D.options.indexOf(f.D.recommendation);
  if (n < 0 || f.concerns.some((c) => !c.valid) || f.decisions.some((d) => d.missing)) return null;
  const counts = {};
  for (const c of Object.values(f.pathClasses)) counts[c] = (counts[c] || 0) + 1;
  return {
    concerns: f.concerns.map((c) => c.id), option_index: n, option_count: f.D.options.length,
    path_counts: counts, paths_known: f.D.named_paths.length > 0,
    // Fix round 1, Important 1: this used to check the raw path string (`p.startsWith('docs/spec/')`)
    // with no regard for the path's actual classify() result, so it disagreed with floorReasons's
    // own 'contract' check (which does gate on `c === 'protected'`) for docs/spec/roadmap.md --
    // PROTECTED_EXCEPT (lib/paths.mjs) carves that one path out of 'protected' and into 'reserved',
    // but the old check here still reported protected.contract: true for it. Now derived from the
    // same class floorReasons reads, so the two never disagree.
    protected: { data: !!counts.data, contract: Object.entries(f.pathClasses).some(([p, c]) => c === 'protected' && p.startsWith('docs/spec/')),
      agreement: 'AGENTS.md' in f.pathClasses, reserved: !!(counts.reserved || counts['kernel-managed']) },
    attempts: f.attempts, open_obligations: f.openObligations,
    cited: f.decisions.filter((d) => d.by !== 'developer').map((d) => ({ id: d.id, read: d.read })),
  };
}

// --- Task 5: contract state C(c), the recommended option's code, and M(D) ----------------------
// Section 10, "State sent to the model": `M(D) := <D's five narrative fields, the recommended
// option, C(c), A(D)>` -- a closed four-part list. The superseded design's equivalent (last
// present at commit b40fd65c, before Task 3 replaced this file) carried a `rule` field
// (POLICY.RULE, the evaluator's own policy prose) on both contractState's C(c) and its
// optionState's state object, and a `context` field (declared mechanisms plus every cited
// decision's title/by/read, not only the developer-written ones) on the state object. Section
// 10's closed list for M(D) is exactly four things, and the task's Global Constraints quote "no
// policy prose in state" for this reason -- `rule` and `context` are both dropped here, not
// carried forward or stubbed. contractState/measureState are otherwise a close port of the
// superseded contractState/optionState: same egress logic, same touched-path/diff resolution,
// optionState renamed measureState per this task's name for it, and given the zero-based
// recommended-option index `n` (`D.options.indexOf(D.recommendation)`) as an explicit parameter
// rather than deriving it internally, since Task 6's request builder needs that same index for
// its own state paths and a caller already has it from authorityProjection's own option_index.
import { readSnapshot } from './snapshots.mjs';
import { git, listTree, writeTreeFromPaths } from './gitx.mjs';
import { matchGlob } from './paths.mjs';
import { readSpec } from './spec.mjs';
import { FIELDS as FIVE_FIELDS } from './escalate.mjs';

// Fix round 1 (review of commit fa4b36a9): the message now names the path, not only the class --
// the class alone ("unavailable excluded: reserved") did not distinguish which of several touched
// paths was refused; the "unavailable excluded: <klass>" prefix section 10 itself names is kept
// verbatim so anything matching on it (or on `instanceof EgressError`, the only thing a later
// measure() call actually checks -- docs/plans/15-measurement-core.md:1281) is unaffected.
export class EgressError extends Error { constructor(klass, path) { super(`unavailable excluded: ${klass} ${path}`); this.klass = klass; this.path = path; } }

// C(c): with the rule text gone (see above), what remains is section 10's other five -- start
// keystone, glossary, the open commitment, its frozen requirements (each one's obligation/
// falsifier text looked up from the spec, alongside the digest kernelFacts already carries in
// f.set) and developer-written cited decisions (by: developer) only. An agent-written decision
// never reaches C(c); A(D) is where it appears, and only as an id and a read flag
// (authorityProjection's own `cited`, above).
export async function contractState(cwd, f) {
  const { texts, roadmap, blocks } = await readSpec(cwd);
  const requirements = f.set.map(({ requirement, text_digest }) => {
    const b = blocks.get(requirement);
    return { id: requirement, obligation: b ? b.obligation : null, falsifier: b ? b.falsifier : null, text_digest };
  });
  return {
    keystone: texts['overview.md'] ?? '', glossary: texts['glossary.md'] ?? '',
    commitment: f.slug && roadmap.sections[f.slug] ? { slug: f.slug, requirements: roadmap.sections[f.slug].requirements } : null,
    requirements, decisions: f.decisions.filter((d) => d.by === 'developer').map((d) => ({ id: d.id, title: d.title, body: d.body })),
  };
}

function egressClass(path, settings) {
  if (settings.network_exclude.some((g) => matchGlob(g, path))) return 'network_exclude';
  if (CREDENTIAL_PATTERNS.some((g) => matchGlob(g, path))) return 'credential';
  if (path.startsWith('.cairn/output/')) return 'output';
  return null;
}

// The recommended option's code: D.named_paths plus the action lease's own touch list,
// deduplicated and sorted into one path order, read once here rather than per option -- section
// 10 sends only the recommended option, so reading every entry in D.options would read files the
// state never uses. An excluded class (a domain's own Host paths: header, network_exclude, a
// credential pattern, or a kernel output path) throws before a byte of that path is read; a key
// found in a touched file's text or in the diff throws too -- Cairn egress of excluded bytes is
// one of section 10's own falsifiers, and EgressError never reaches the caller with the excluded
// bytes attached. Reads never follow symlinks: writeTreeFromPaths (lib/gitx.mjs) lstats every
// path and records a symlink as its own 120000 blob (the link target text), never resolving
// through it to whatever it points at.
//
// Fix round 1 (review of commit fa4b36a9, Critical finding 1): D.named_paths is agent-authored
// and validateDraft (lib/escalate.mjs) only checks its entries are strings -- no path grammar
// check -- so before this fix a traversal ('../../etc/passwd') or an absolute path reached
// writeTreeFromPaths/resolveTreeEntries (lib/gitx.mjs) with nothing refusing it, reading a real
// file outside the repository into M(D). f.lease.touch entries are already safe (checkTouch,
// lib/lease.mjs, validates and classifies every touch path at `cairn begin` time, before this
// function ever runs), but D.named_paths is not, and the two are unioned into the same `touched`
// set below. safeClassify (Task 4, above) is the file's own existing fail-closed primitive --
// `classify()` (lib/paths.mjs) already calls `validatePath()` internally and throws PathError for
// a malformed/traversal/absolute path, and safeClassify already catches that and reports
// 'reserved' rather than letting the exception escape; reused here rather than duplicating a
// second validatePath/classify pairing. Every touched path -- named or leased -- is checked
// before any other egress check and before anything is read; a '.cairn/**' path that classify()
// does not already sort into 'protected' (.cairn/settings.json), 'kernel-managed'
// (.cairn/mechanisms, .cairn/mechanisms/**) or 'output' (.cairn/output/**) -- for example
// '.cairn/log', this task's own review reproduction -- falls through to RESERVED's own '.cairn/**'
// entry and is refused the same way a malformed path is. Scoped to 'reserved' only, matching the
// fix round's own instruction: 'protected' (docs/spec/**, AGENTS.md, .cairn/settings.json) and
// 'kernel-managed' paths are not refused here. In the real measure() call path (a later task),
// 'protected' writes to docs/spec/** or AGENTS.md already route to the developer at the floor
// (floorReasons's 'contract'/'agreement', Ruling 7) before measureState ever runs; a
// 'kernel-managed' touched path (docs/decisions.jsonl, .cairn/mechanisms/**) is not floor-blocked
// and is not refused here either -- an open item, not this fix's scope.
export async function measureState(cwd, D, n, C, f) {
  const settings = f.settings;
  const key = process.env.TYPESAFEAI_API_KEY || null;
  const { domains } = await readSpec(cwd);
  const hosts = Object.values(domains).flatMap((d) => d.header.hostPaths || []);
  const touched = [...new Set([...D.named_paths, ...((f.lease && f.lease.touch) || [])])].sort();
  for (const p of touched) if (safeClassify(p, settings) === 'reserved') throw new EgressError('reserved', p);
  for (const p of touched) if (hosts.includes(p)) throw new EgressError('host', p);
  for (const p of touched) { const klass = egressClass(p, settings); if (klass) throw new EgressError(klass, p); }
  const tree = touched.length ? await writeTreeFromPaths(cwd, { paths: touched, exclude: [] }) : null;
  const entries = tree ? new Map((await listTree(cwd, tree)).map((e) => [e.path, e])) : new Map();
  const files = [], omitted = [];
  for (const p of touched) {
    const e = entries.get(p);
    if (!e) { omitted.push({ path: p, reason: 'absent' }); continue; }
    const text = (await git(['cat-file', 'blob', e.sha], { cwd })).stdout;
    if (key && text.includes(key)) throw new EgressError('key', p);
    files.push({ path: p, mode: e.mode, text });
  }
  let diff = '';
  if (f.lease && f.lease.snapshot && touched.length) {
    const before = (await readSnapshot(cwd, f.lease.snapshot, 'workspace')).tree;
    diff = (await git(['diff', '--no-color', before, tree, '--', ...touched], { cwd })).stdout;
  }
  if (key && diff.includes(key)) throw new EgressError('key', 'diff');
  const A = authorityProjection(f);
  // M(D), built from the ten named fields explicitly (never a draft spread): the five narrative
  // fields, the recommended option (D.options[n], with its code), C(c) and A(D). No other key of
  // D -- concerns, options, named_paths, cited_decisions, commitment -- reaches the state; a caller
  // that wants them has D itself.
  const state = {
    five: Object.fromEntries(FIVE_FIELDS.map((k) => [k, D[k]])),
    option: { text: D.options[n], diff, files, omitted },
    contract: C,
    facts: A,
  };
  // Deviation from the brief's Step 3 snippet, which returns `{ state }` alone: this task's own
  // Interfaces line names `measureState(cwd, D, n, C, f) -> {state, requestBytesEstimate}`, and
  // Task 3's LIMITS comment ("Tasks 5 and 6 ... consume these") already anticipates a state-size
  // figure landing here, ahead of Task 6's full request. Estimated the same way Task 6's own
  // sizeCheck measures a request part (canonical-JSON byte length): state is the dominant term in
  // section 10's "32k for state plus the longest question" budget, so this is a cheap estimate a
  // caller can check before ever building the five-question request.
  const requestBytesEstimate = Buffer.byteLength(canonicalize(state));
  return { state, requestBytesEstimate };
}
