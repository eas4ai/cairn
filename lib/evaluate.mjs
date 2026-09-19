// lib/evaluate.mjs
// Deviation from the plan text: this file's Task 2 note says "lib/settings.mjs (modify)
// validateSettings appends validateEvaluatorSettings reasons". Reading lib/settings.mjs (plan 02,
// already committed) shows validateSettings already validates the whole typesafeai block inline
// (closed key set via the shared closed() helper, REMOVED weights/code_tiers, threshold ranges,
// enabled-needs-model, request_cap_bytes bounds, route-mode calibration and versioned-model
// checks) -- functionally equivalent to every refusal this task's tests require, and already
// exercised by tests/settings.test.mjs. Editing it to delegate to a new validateEvaluatorSettings
// would duplicate the same logic for no behavior change and risk drifting the two apart, so
// lib/settings.mjs is left unmodified. validateEvaluatorSettings/EVALUATOR_DEFAULTS/
// THRESHOLD_KEYS/isVersionedModel are added here instead, as a standalone, equivalent
// implementation: later tasks in this file (policyDigest, buildOptionRequest, tests) use
// EVALUATOR_DEFAULTS and THRESHOLD_KEYS directly, and this task's own tests exercise
// validateEvaluatorSettings per the plan's stated interface.
export const THRESHOLD_KEYS = ['route_confidence', 'sufficient_threshold', 'outside_threshold',
  'contradicts_ceiling', 'reversible_floor', 'observed_floor', 'max_false_downgrade'];
export const EVALUATOR_DEFAULTS = Object.freeze({
  enabled: false, mode: 'shadow', model: null, route_confidence: 0.8, sufficient_threshold: 0.7,
  outside_threshold: 0.8, contradicts_ceiling: 0.3, reversible_floor: 0.7, observed_floor: 0.6,
  max_false_downgrade: 0.05, min_calibration_agent_predictions: 60, request_cap_bytes: 48000,
});
const KNOWN = new Set(Object.keys(EVALUATOR_DEFAULTS));
const REMOVED_FIELDS = ['weights', 'code_tiers'];
const VERSIONED = /^[a-z][a-z0-9]*-\d+\.\d+\.\d+$/;

export function isVersionedModel(id) { return typeof id === 'string' && VERSIONED.test(id); }

export function validateEvaluatorSettings(block) {
  if (block === undefined) return [];
  const r = [];
  if (block === null || typeof block !== 'object' || Array.isArray(block)) return ['typesafeai must be an object'];
  for (const k of Object.keys(block)) {
    if (REMOVED_FIELDS.includes(k)) r.push(`typesafeai.${k} was removed and is refused`);
    else if (!KNOWN.has(k)) r.push(`typesafeai.${k} is unknown`);
  }
  if (typeof block.enabled !== 'boolean') r.push('typesafeai.enabled must be true or false');
  if (!['shadow', 'route'].includes(block.mode)) r.push('typesafeai.mode must be shadow or route');
  if (block.model !== null && typeof block.model !== 'string') r.push('typesafeai.model must be a string or null');
  if (block.enabled === true && !block.model) r.push('typesafeai.enabled needs a model');
  if (block.mode === 'route' && !isVersionedModel(block.model)) r.push('typesafeai.mode route needs a versioned model id, not an alias');
  for (const k of THRESHOLD_KEYS) {
    const v = block[k];
    if (typeof v !== 'number' || !(v >= 0 && v <= 1)) r.push(`typesafeai.${k} must be a number in [0,1]`);
  }
  if (!Number.isInteger(block.min_calibration_agent_predictions) || block.min_calibration_agent_predictions < 1)
    r.push('typesafeai.min_calibration_agent_predictions must be a positive integer');
  if (!Number.isInteger(block.request_cap_bytes) || block.request_cap_bytes < 1 || block.request_cap_bytes > 64000)
    r.push('typesafeai.request_cap_bytes must be an integer from 1 to 64000');
  return r;
}

// Deviation from the plan text: the plan's Task 3 has this file define its own normalizeDraft,
// draftDigest, DraftError and DRAFT_KEYS from scratch. lib/escalate.mjs (plan 09, already
// committed) already defines the identical canonical draft D -- DRAFT_KEYS is exactly
// [commitment, concerns, question, recommendation, because, if_wrong, instead, options,
// named_paths, cited_decisions] (spec section 10's D), validateDraft already refuses unknown or
// missing/mistyped fields, and draftDigest already strips the optional `evaluation` field and
// digests the canonical ten. escalateWithRoute (lib/escalate.mjs) hands evaluate() exactly the
// object validateDraft returns, so reusing that same function as this module's normalizeDraft
// (rather than a second, independently-written validator) guarantees the digest evaluate()
// computes is always the same one escalate.mjs would compute for the same draft, with no risk of
// the two drifting apart. Re-exported under this task's interface names so callers of
// lib/evaluate.mjs never need to know the implementation lives in lib/escalate.mjs.
export { DraftError, validateDraft as normalizeDraft, draftDigest, DRAFT_KEYS, FIELDS as FIVE_FIELDS } from './escalate.mjs';
import { DRAFT_KEYS as DK, FIELDS as FIVE_FIELDS, validateDraft as normalizeDraft, draftDigest } from './escalate.mjs';
import { canonicalize, sha256, b64url } from './canon.mjs';
import { CREDENTIAL_PATTERNS, classify } from './paths.mjs';

// Fix round 3 (plan 11 review): POLICY and policyDigest moved to lib/settings.mjs, since
// lib/settings.mjs's own loadSettings needs them now (see its own comment) and this module cannot
// be a static dependency of lib/settings.mjs without closing a cycle. Re-exported/composed here so
// every existing caller of this module's POLICY/policyDigest is unaffected: this file's own
// DRAFT_KEYS (escalate.mjs's canonical draft field list, unrelated to the evaluator's policy
// digest) is merged back in, since lib/settings.mjs cannot statically depend on lib/escalate.mjs
// either (escalate.mjs already statically imports loadSettings from settings.mjs).
import { POLICY as SETTINGS_POLICY, policyDigest } from './settings.mjs';
export { policyDigest };
export const POLICY = Object.freeze({ ...SETTINGS_POLICY, DRAFT_KEYS: DK });

// --- Task 4: protected(D) and the closed authority projection A(D) ---------------------------
import { readLog, range, appendRecord, LOG_REF } from './records.mjs';
import { attempts as reqAttempts } from './check.mjs';
import { readAdr, queue, adrDigest, ADR_PATH } from './adr.mjs';
import { readLease } from './lease.mjs';
// Fix round 3 (plan 11 review): lib/settings.mjs's own loadSettings(cwd) is now calibration-aware
// by itself (it computes route-mode calibration status internally, from the settings it already
// parsed), so the round 1-2 loadSettingsFull wrapper this file used to define no longer exists --
// every call site in this file (kernelFacts, recoverEvaluation, evaluate(), calibrate()) now calls
// plain loadSettings, the same function every other caller in the kernel already called.
//
// Kernel fix round (item 3): that same settings.mjs-side route-mode gate is exactly why
// assertRouteMode (this file's own, separate route-mode check, added earlier in plan 11's round
// 3 as a belt-and-suspenders guard) was dead: lib/settings.mjs's loadSettings/validateSettings
// already refuse a route-mode project without a passing calibration or a versioned model before
// any caller in this file gets that far, so nothing ever called assertRouteMode (confirmed:
// grepping lib/, bin/, hooks/ and skills/ finds no caller). Removed, along with RouteModeError
// (used only by it) and the hasPassingCalibration/SETTINGS_PATH/readFile/join imports that
// existed only to support it.
import { loadSettings } from './settings.mjs';

import { parseConcern } from './escalate.mjs';

const FINDING_KINDS = new Set(['review', 'report', 'acceptance']);
// Deviation from the plan text: the plan's Interfaces line for this task names
// requirementSet(cwd, slug) (lib/spec.mjs) as what kernelFacts consumes to know the frozen
// requirement set. The open commitment's own 'start' record (already read via range(log)) already
// carries that exact frozen set as payload.requirements -- the same field lib/escalate.mjs's own
// checkConcerns reads for the identical check -- so kernelFacts reads it from there instead of
// re-parsing docs/spec a second time; this also means a concern is judged against the same frozen
// set escalate.mjs itself already enforced before evaluate() was ever reached.
const CONCERN_RECORD_KIND = { item: 'item', breach: 'scope-breach', transaction: 'command-intent' };

// Mirrors lib/escalate.mjs's checkConcerns (which throws on the first invalid token) as a
// non-throwing per-token predicate: kernelFacts needs a validity flag for every concern, not just
// a yes/no for the whole list, since protectedReasons/authorityProjection fail closed on
// individual invalid concerns rather than refusing to run.
function concernValid(token, log, startRec) {
  let c;
  try { c = parseConcern(token); } catch { return false; }
  if (c.kind === 'cycle' || c.kind === 'contract') return true;
  if (c.kind === 'requirement') return !!startRec && startRec.payload.requirements.some((q) => q.requirement === c.ref);
  if (c.kind === 'finding') {
    const src = log.find((x) => x.sha === c.ref);
    return !!src && FINDING_KINDS.has(src.kind) && Array.isArray(src.payload.findings) && src.payload.findings.some((f) => f.n === c.n);
  }
  if (CONCERN_RECORD_KIND[c.kind]) return log.some((x) => x.sha === c.ref && x.kind === CONCERN_RECORD_KIND[c.kind]);
  return false;
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
    const findings = Array.isArray(r.payload.findings) ? r.payload.findings : [];
    for (const f of findings) if (!log.some((x) => x.kind === 'resolution' && x.payload.source === r.sha && x.payload.finding === f.n)) count++;
  }
  return count;
}
// The same "answered" rule lib/commitment.mjs's carriedRecords already applies (an 'ok' or
// 'instead' answer settles an escalation; 'ask' does not), kept local since carriedRecords returns
// SHAs mixed across every obligation kind, not the per-kind counts kernelFacts needs.
function openEscalations(log) {
  return log.filter((r) => r.kind === 'escalation' && !log.some((a) => a.kind === 'answer' && a.payload.escalation === r.sha && ['ok', 'instead'].includes(a.payload.kind))).length;
}
function openDefects(log) {
  return log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && !log.some((x) => x.kind === 'fix' && x.payload.item === r.sha)).length;
}
function openBreaches(log) {
  return log.filter((r) => r.kind === 'scope-breach' && !log.some((x) => x.kind === 'scope' && x.payload.breach === r.sha)).length;
}

export async function kernelFacts(cwd, D) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const r = range(log);
  const slug = r.start ? r.start.payload.slug : null;
  const concerns = D.concerns.map((id) => ({ id, valid: concernValid(id, log, r.start) }));
  const pathClasses = Object.fromEntries(D.named_paths.map((p) => [p, safeClassify(p, settings)]));
  const attempts = {};
  for (const id of D.concerns) {
    let c; try { c = parseConcern(id); } catch { continue; }
    if (c.kind === 'requirement') attempts[c.ref] = reqAttempts(log, c.ref);
  }
  const openObligations = { escalations: openEscalations(log), findings: unresolvedFindings(log), defects: openDefects(log), breaches: openBreaches(log) };
  const adr = await readAdr(cwd);
  const unread = new Set(await queue(cwd));
  const decisions = D.cited_decisions.map((id) => {
    const line = adr.find((l) => l.kind === 'decision' && l.id === id);
    return line
      ? { id, by: line.by, read: !unread.has(id), body: line.body, title: line.title }
      : { id, by: null, read: false, body: null, title: null, missing: true };
  });
  const lease = await readLease(cwd);
  const set = r.start ? r.start.payload.requirements : [];
  return { slug, set, concerns, pathClasses, attempts, openObligations, decisions, lease, D, settings };
}

export function protectedReasons(f) {
  const out = [];
  const classes = Object.entries(f.pathClasses);
  if (classes.some(([, c]) => c === 'data')) out.push('data');
  if (classes.some(([p, c]) => c === 'protected' && p.startsWith('docs/spec/'))) out.push('contract');
  if (classes.some(([p, c]) => c === 'protected' && p === 'AGENTS.md')) out.push('agreement');
  if (classes.some(([p, c]) => c === 'protected' && p === '.cairn/settings.json')) out.push('settings');
  if (classes.some(([, c]) => c === 'reserved' || c === 'kernel-managed')) out.push('reserved');
  if (Object.values(f.attempts).some((n) => n >= 3)) out.push('fourth-attempt');
  if (f.concerns.some((c) => c.id.startsWith('breach:'))) out.push('scope-ruling');
  if (!f.D.recommendation || !f.D.recommendation.trim()) out.push('missing-recommendation');
  if (authorityProjection(f) === null) out.push('incomplete-projection');
  return out;
}

export function authorityProjection(f) {
  if (f.concerns.some((c) => !c.valid) || f.decisions.some((d) => d.missing)) return null;
  const counts = {};
  for (const c of Object.values(f.pathClasses)) counts[c] = (counts[c] || 0) + 1;
  return {
    concerns: f.concerns.map((c) => c.id),
    option_index: f.D.options.indexOf(f.D.recommendation), option_count: f.D.options.length,
    path_counts: counts, paths_known: f.D.named_paths.length > 0,
    protected: {
      data: !!counts.data,
      contract: Object.entries(f.pathClasses).some(([p, c]) => c === 'protected' && p.startsWith('docs/spec/')),
      agreement: Object.entries(f.pathClasses).some(([p, c]) => c === 'protected' && p === 'AGENTS.md'),
      reserved: !!(counts.reserved || counts['kernel-managed']),
    },
    attempts: f.attempts, open_obligations: f.openObligations,
    cited: f.decisions.filter((d) => d.by !== 'developer').map((d) => ({ id: d.id, read: d.read })),
  };
}

// --- Task 5: contract state, owner state, option state and egress -----------------------------
import { readSnapshot, writeWorkspaceSnapshot } from './snapshots.mjs';
import { git, listTree, writeTreeFromPaths, readRef } from './gitx.mjs';
import { matchGlob } from './paths.mjs';
import { readSpec } from './spec.mjs';
import { readMechanisms } from './mechanisms.mjs';

export class EgressError extends Error { constructor(klass, path) { super(`unavailable excluded: ${klass}`); this.klass = klass; this.path = path; } }

// Deviation from the plan text: this task's Interfaces line names requirementSet(cwd, slug) and
// parseDomainFile per-file; readSpec (lib/spec.mjs) already does that whole-directory read once
// (texts, roadmap and a blocks Map keyed by requirement id across every domain file) and is what
// contractState/hostPaths below use instead, for the same reason kernelFacts reuses the open
// commitment's own frozen set rather than re-deriving it.
export async function contractState(cwd, f) {
  const { texts, roadmap, blocks } = await readSpec(cwd);
  const requirements = f.set.map(({ requirement, text_digest }) => {
    const b = blocks.get(requirement);
    return { id: requirement, obligation: b ? b.obligation : null, falsifier: b ? b.falsifier : null, text_digest };
  });
  return {
    rule: POLICY.RULE,
    keystone: texts['overview.md'] ?? '', glossary: texts['glossary.md'] ?? '',
    commitment: f.slug && roadmap.sections[f.slug] ? { slug: f.slug, requirements: roadmap.sections[f.slug].requirements } : null,
    requirements,
    decisions: f.decisions.filter((d) => d.by === 'developer').map((d) => ({ id: d.id, title: d.title, body: d.body })),
  };
}

export function ownerState(D, C, A) {
  const s = {};
  for (const k of FIVE_FIELDS) s[k] = D[k];
  s.options = [...D.options]; s.contract = C; s.facts = A;
  return s;
}

function egressClass(path, settings) {
  if (settings.network_exclude.some((g) => matchGlob(g, path))) return 'network_exclude';
  if (CREDENTIAL_PATTERNS.some((g) => matchGlob(g, path))) return 'credential';
  if (path.startsWith('.cairn/output/')) return 'output';
  return null;
}

// Deviation from the plan text: the plan's optionState reads the whole workspace snapshot
// (writeWorkspaceSnapshot + readSnapshot) and slices it down to the touched paths. That snapshot
// call refuses the whole write (SnapshotError) the moment ANY untracked file anywhere in the
// worktree matches a credential pattern or network_exclude, not only a touched one -- which would
// make optionState throw the wrong error class (SnapshotError, not EgressError) for this task's own
// "excluded classes never enter the state" test, whose fixture files sit untracked in the worktree.
// Reading only the touched paths through writeTreeFromPaths (the same primitive
// writeWorkspaceSnapshot itself calls) avoids that: it builds a tree, and therefore reads bytes,
// for exactly the paths this function already egress-classified path-by-path first.
export async function optionState(cwd, D, C, f) {
  const settings = f.settings;
  const key = process.env.TYPESAFEAI_API_KEY || null;
  const { domains } = await readSpec(cwd);
  const hosts = Object.values(domains).flatMap((d) => d.header.hostPaths || []);
  const touched = [...new Set([...D.named_paths, ...((f.lease && f.lease.touch) || [])])].sort();
  for (const p of touched) if (hosts.includes(p)) throw new EgressError('host', p);
  for (const p of touched) { const klass = egressClass(p, settings); if (klass) throw new EgressError(klass, p); }
  const tree = touched.length ? await writeTreeFromPaths(cwd, { paths: touched, exclude: [] }) : null;
  const entries = tree ? new Map((await listTree(cwd, tree)).map((e) => [e.path, e])) : new Map();
  const files = []; const omitted = [];
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
  const mech = await readMechanisms(cwd);
  const context = {
    mechanisms: Object.fromEntries(Object.entries(mech)
      .filter(([, m]) => (m.definition.requirements || []).some((r) => D.concerns.includes(r)))
      .map(([n, m]) => [n, { command: m.definition.command, inputs: m.definition.inputs, requirements: m.definition.requirements }])),
    decisions: f.decisions.map((d) => ({ id: d.id, by: d.by, read: d.read, title: d.title })),
  };
  const state = { rule: POLICY.RULE, draft: D, contract: C, context, facts: authorityProjection(f), open_obligations: f.openObligations, code: { diff, files, omitted } };
  return { state, excluded: [] };
}

// --- Task 6: requests, size rule and deterministic bytes ---------------------------------------
export class OversizeError extends Error { constructor() { super('unavailable oversize'); this.klass = 'oversize'; } }
const Q = Object.fromEntries(POLICY.QUESTIONS.map((q) => [q.id, q]));
const noul = (text) => ({ type: 'noul', instructions: text });

// Requests round-trip through JSON.parse(canonicalize(...)) before being returned: bin/typesafeai.mjs
// sends `JSON.stringify(request)` verbatim (Task 1's own test fixes that contract -- the transport
// never re-sorts), so byte-identity ("equal identity and policy digest must yield byte-identical
// requests", spec section 10) can only hold if the object handed to it already has canonical
// (RFC 8785 sorted) key order at every level, including the caller-supplied state. Canonicalizing
// once here, at construction, is simpler than threading that guarantee through every call site.
export function buildOptionRequest(settings, state, optionCount) {
  const questions = { sufficient: noul(Q.sufficient.text) };
  for (let n = 1; n <= optionCount; n++) for (const id of ['reversible_n', 'contradicts_n', 'outside_n'])
    questions[id.replace('_n', `_${n}`)] = noul(Q[id].text.replace('option n', `option ${n}`));
  questions.observed = noul(Q.observed.text);
  return JSON.parse(canonicalize({ state, model: settings.typesafeai.model, questions }));
}
export function buildOwnerRequest(settings, state) {
  return JSON.parse(canonicalize({ state, model: settings.typesafeai.model,
    questions: { owner: { type: 'choice', instructions: Q.owner.text, criteria: Q.owner.criteria } } }));
}
export const requestBytes = (r) => canonicalize(r);
export const requestDigest = (r) => sha256(requestBytes(r));

export function sizeCheck(settings, request) {
  const { requestTokens, stateTokens, bytesPerToken, factor } = POLICY.LIMITS;
  const len = (v) => Buffer.byteLength(canonicalize(v));
  const total = len(request);
  const longest = Math.max(...Object.values(request.questions).map(len));
  if (total > Math.min(settings.typesafeai.request_cap_bytes, requestTokens * bytesPerToken * factor)) return 'oversize';
  if (len(request.state) + longest > stateTokens * bytesPerToken * factor) return 'oversize';
  return null;
}

// --- Task 7: the envelope: answer validation and first-match routing ---------------------------
const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function parseAnswers(request, bodyText) {
  let body;
  try { body = JSON.parse(bodyText); } catch { return { invalid: 'not json' }; }
  if (!body || typeof body !== 'object' || typeof body.model !== 'string' || !body.answers || typeof body.answers !== 'object') return { invalid: 'shape' };
  const answers = {};
  for (const [id, q] of Object.entries(request.questions)) {
    const a = body.answers[id];
    if (!a || a.type !== q.type) return { invalid: `answer ${id}` };
    if (q.type === 'noul') { if (!unit(a.noul)) return { invalid: `answer ${id} range` }; answers[id] = a.noul; }
    else {
      const opts = Object.keys(q.criteria);
      const p = a.probabilities;
      if (!p || typeof p !== 'object' || Object.keys(p).some((k) => !opts.includes(k)) || opts.some((k) => !unit(p[k]))) return { invalid: `answer ${id} distribution` };
      if (Math.abs(Object.values(p).reduce((s, x) => s + x, 0) - 1) > 1e-6) return { invalid: `answer ${id} sum` };
      if (!opts.includes(a.choice) || !unit(a.confidence)) return { invalid: `answer ${id} choice` };
      answers[id] = { choice: a.choice, probabilities: p, confidence: a.confidence };
    }
  }
  // Fix (found integrating Task 8): the 'evaluation-call' schema's usage field (lib/records.mjs) is
  // nullable(obj({input_tokens: int, output_tokens: int})) -- an *int* field never accepts null, so
  // a partial or missing usage object must make the whole field null, not null inside it (which
  // encodeRecord would refuse when the answer is later recorded).
  const u = body.usage && typeof body.usage === 'object' ? body.usage : {};
  const validCount = (v) => Number.isSafeInteger(v) && v >= 0;
  const usage = validCount(u.input_tokens) && validCount(u.output_tokens) ? { input_tokens: u.input_tokens, output_tokens: u.output_tokens } : null;
  return { answers, usage, model: body.model };
}

function validOwner(w) {
  if (!w || typeof w !== 'object' || !w.probabilities) return false;
  const keys = Object.keys(w.probabilities);
  return keys.length === 2 && keys.includes('agent') && keys.includes('developer') && keys.every((k) => unit(w.probabilities[k]))
    && Math.abs(w.probabilities.agent + w.probabilities.developer - 1) <= 1e-6 && ['agent', 'developer'].includes(w.choice) && unit(w.confidence);
}

// Returns {gates, route, reason, option}. `gates` is in lib/records.mjs's 'evaluation' schema
// shape ({gate, value, passed}) and order (the section 10 rule table's order); `reason` is the
// deciding gate's name (the schema's `reason` field is a plain string, not a separate structure).
// `optionOnly` (used by evaluate() to check the option fan-out before ever attempting the owner
// call) skips the owner-decision step entirely rather than passing a null ownerAnswer through the
// normal path: the 'invalid' gate correctly fails closed on a missing owner answer for a *final*
// evaluation (Task 7's own test: a null ownerAnswer against otherwise-fine option answers is
// 'unavailable invalid'), but at the option-only stage the owner call has not been attempted yet
// on purpose, and that is not the same condition. Under optionOnly, 'invalid' reflects only the
// option answers' own validity; if no option gate decided a route, `decided` stays null (the gates
// all pass and the owner call should proceed) rather than falling through to the owner rule.
// Fix round 1 finding 2: `excludedClass` carries optionState/egressClass's specific
// EgressError.klass (network_exclude|credential|host|key|output) through to the 'call' gate's own
// persisted value when unavailable === 'excluded', instead of the plain string losing it. The
// schema's `reason` field stays the fixed, spec-named phrase "unavailable excluded" (matching
// every other 'unavailable <class>' outcome's naming); the specific path class rides on the gate's
// `value` (already `json`-typed, no schema change needed), the same field an 'unavailable <class>'
// transport failure already uses to record its own failure_class-equivalent detail.
export function applyEnvelope(settings, { protectedReasons: prot = [], unavailable = null, excludedClass = null, optionAnswers: o = {}, ownerAnswer: w = null, optionCount = 0, optionOnly = false }) {
  const t = settings.typesafeai; const gates = []; let decided = null;
  const decide = (route, reason, option) => { if (!decided) decided = { route, reason, option: option ?? null }; };
  const g = (gate, value, passed) => gates.push({ gate, value: value === undefined ? null : value, passed });
  g('protected', prot, prot.length === 0); if (prot.length) decide('developer', 'protected');
  g('oversize', unavailable, unavailable !== 'oversize'); if (unavailable === 'oversize') decide('developer', 'unavailable oversize');
  const callFail = unavailable && !['oversize', 'invalid'].includes(unavailable);
  const callValue = unavailable === 'excluded' ? { unavailable, class: excludedClass } : unavailable;
  g('call', callValue, !callFail); if (callFail) decide('developer', `unavailable ${unavailable}`);
  const ids = ['sufficient', 'observed']; for (let n = 1; n <= optionCount; n++) ids.push(`reversible_${n}`, `contradicts_${n}`, `outside_${n}`);
  const optionInvalid = unavailable === 'invalid' || (!unavailable && ids.some((id) => !unit(o[id])));
  const invalid = optionOnly ? optionInvalid : (optionInvalid || (!unavailable && !validOwner(w)));
  g('invalid', invalid ? 'invalid' : null, !invalid); if (invalid) decide('developer', 'unavailable invalid');
  // null, not NaN: gate values are recorded as JSON (canonicalize() refuses a non-finite number),
  // and null >= threshold coerces to false, which is the correct fail-closed reading of "missing".
  const num = (id) => (unit(o[id]) ? o[id] : null);
  g('sufficient', num('sufficient'), num('sufficient') >= t.sufficient_threshold); if (!(num('sufficient') >= t.sufficient_threshold)) decide('developer', 'sufficient');
  const outsideN = [...Array(optionCount)].map((_, i) => i + 1).find((n) => num(`outside_${n}`) >= t.outside_threshold) ?? null;
  g('outside', [...Array(optionCount)].map((_, i) => num(`outside_${i + 1}`)), outsideN === null); if (outsideN !== null) decide('capture', 'outside', outsideN);
  const anyBad = (id, test) => [...Array(optionCount)].map((_, i) => num(`${id}_${i + 1}`)).some((v) => !(test(v)));
  const contradicts = anyBad('contradicts', (v) => v < t.contradicts_ceiling);
  g('contradicts', [...Array(optionCount)].map((_, i) => num(`contradicts_${i + 1}`)), !contradicts); if (contradicts) decide('developer', 'contradicts');
  const reversible = anyBad('reversible', (v) => v >= t.reversible_floor);
  g('reversible', [...Array(optionCount)].map((_, i) => num(`reversible_${i + 1}`)), !reversible); if (reversible) decide('developer', 'reversible');
  g('observed', num('observed'), num('observed') >= t.observed_floor); if (!(num('observed') >= t.observed_floor)) decide('developer', 'observed');
  if (optionOnly) { g('owner', null, false); return { gates, ...(decided ?? { route: null, reason: null, option: null }) }; }
  const agent = validOwner(w) && w.choice === 'agent' && w.confidence >= t.route_confidence;
  g('owner', validOwner(w) ? { choice: w.choice, probabilities: w.probabilities, confidence: w.confidence } : null, agent);
  if (agent) decide('agent', 'owner'); else decide('developer', 'otherwise');
  return { gates, ...decided };
}

// --- Task 8: evaluate(): identity, intent, calls, result, shadow, recovery ---------------------
import { post } from '../bin/typesafeai.mjs';

// Reads the ADR's own content as of the last Done's workspace snapshot (not wall-clock time: a
// log record carries no timestamp of its own, and comparing the ADR line's millisecond-precision
// `ts` against the 'done' record's second-precision Git commit date is unreliable when the two
// happen close together, as they routinely do in a fast test run -- the rounding can put "done"
// before the decision it should count after). The snapshot IS the ADR file's exact state at Done,
// so decision ids present there, still unread now, are exactly "unread Consequential decisions at
// Done" (spec section 10).
async function decisionIdsAtSnapshot(cwd, ws) {
  const { tree } = await readSnapshot(cwd, ws, 'workspace');
  const entry = (await listTree(cwd, tree)).find((e) => e.path === ADR_PATH);
  if (!entry) return new Set();
  const text = (await git(['cat-file', 'blob', entry.sha], { cwd })).stdout;
  const ids = new Set();
  for (const line of text.split('\n')) {
    if (!line) continue;
    try { const obj = JSON.parse(line); if (obj && obj.kind === 'decision') ids.add(obj.id); } catch { /* a breach elsewhere; not this function's concern */ }
  }
  return ids;
}

export async function callsDisabled(cwd, log) {
  const lastDone = log.findLast((r) => r.kind === 'done');
  if (!lastDone) return null;
  const idsAtDone = await decisionIdsAtSnapshot(cwd, lastDone.payload.snapshot);
  const unread = new Set(await queue(cwd));
  const stillUnread = [...idsAtDone].filter((id) => unread.has(id)).sort();
  return stillUnread.length ? `unread Consequential decisions at Done: ${stillUnread.join(', ')}` : null;
}

// Fix round 3 (plan 11 review): the round 1 workaround here (passing {exclude:
// settings.network_exclude} explicitly to skip lib/snapshots.mjs's own internal loadSettings(cwd)
// call) is redundant now that loadSettings itself is calibration-aware: writeWorkspaceSnapshot's
// internal call reads a route-mode project correctly on its own, the same as every other loadSettings
// caller in the kernel.
async function captureIdentity(cwd, D, settingsDigest) {
  const ws = await writeWorkspaceSnapshot(cwd);
  const logHead = await readRef(cwd, LOG_REF);
  return { ws, log_head: logHead, adr_digest: await adrDigest(cwd), draft_digest: draftDigest(D), settings_digest: settingsDigest };
}

async function appendCall(cwd, slug, intentSha, call, requestDigestValue, outcome, extra) {
  return appendRecord(cwd, 'evaluation-call', slug, {
    intent: intentSha, call, request_digest: requestDigestValue ?? null, outcome,
    model: null, raw: null, failure_class: null, answers: null, usage: null, ...extra,
  });
}

// Attempts one call. Four outcomes: `{crashed:true, error}` for an unknown-class throw (evaluate()
// re-throws it immediately and appends nothing -- the request may or may not have reached the
// server, so recovery, not this function, decides what the record says); `{sha, unavailable}` for
// a classified TransportError, a resolved-model mismatch, or an invalid answer (a 'failure' or
// 'response' call record is appended either way); `{sha, answers}` for a valid response.
//
// Fix round 1 finding 3: the response's resolved model (res.model) is checked against the model
// actually requested (request.model, the same value settings.typesafeai.model and the policy
// digest name) before the answer is even parsed. A mismatch is classified exactly like a
// transport-level failure -- outcome 'failure', failure_class 'model_mismatch', no raw body
// persisted -- so the envelope's existing 'call' gate fails closed on it the same as any other
// unavailable class, and an unverified vendor identity can never reach owner-answer parsing, let
// alone agent-routing or calibration's would_route === 'agent' denominator.
async function attemptCall(cwd, slug, intentSha, call, request, transport) {
  const digest = requestDigest(request);
  let res;
  try { res = await transport(request); }
  catch (e) {
    if (!e || typeof e.klass !== 'string') return { crashed: true, error: e };
    const sha = await appendCall(cwd, slug, intentSha, call, digest, 'failure', { failure_class: e.klass });
    return { sha, unavailable: e.klass };
  }
  if (res.model !== request.model) {
    const sha = await appendCall(cwd, slug, intentSha, call, digest, 'failure', { failure_class: 'model_mismatch' });
    return { sha, unavailable: 'model_mismatch' };
  }
  const raw = b64url(Buffer.from(res.body, 'utf8'));
  const parsed = parseAnswers(request, res.body);
  if (parsed.invalid) {
    const sha = await appendCall(cwd, slug, intentSha, call, digest, 'response', { model: res.model, raw });
    return { sha, unavailable: 'invalid' };
  }
  const answers = Object.entries(parsed.answers).map(([id, value]) => ({ id, value }));
  const sha = await appendCall(cwd, slug, intentSha, call, digest, 'response', { model: parsed.model, raw, answers, usage: parsed.usage });
  return { sha, answers: parsed.answers };
}

async function finalize(cwd, slug, intentSha, settings, env, calls) {
  const shadow = settings.typesafeai.mode === 'shadow';
  const payload = {
    intent: intentSha, gates: env.gates,
    route: shadow ? 'developer' : env.route, would_route: shadow ? env.route : null,
    reason: env.reason, option_call: calls.option ?? null, owner_call: calls.owner ?? null,
  };
  const sha = await appendRecord(cwd, 'evaluation', slug, payload);
  return { route: payload.route, would_route: payload.would_route, reason: payload.reason, option: env.option ?? null, evaluationSha: sha, intentSha };
}

// Finalizes a pending intent left by a crash with no final evaluation, never retrying the network.
// The option call always runs first and the owner call only after it succeeds, so a missing option
// call record means the crash happened during (or before) that call -- the owner call, in that
// case, provably never started, and is recorded 'not_sent' rather than 'indeterminate'. An
// existing option call record with no owner call record means the crash happened during the owner
// call itself (the only way to reach that state without a final evaluation already existing), so
// that call is 'indeterminate'.
export async function recoverEvaluation(cwd) {
  const log = await readLog(cwd);
  const r = range(log);
  const recs = r.start ? r.records : log;
  const intent = recs.findLast((x) => x.kind === 'evaluation-intent');
  if (!intent || recs.some((x) => x.kind === 'evaluation' && x.payload.intent === intent.sha)) return null;
  const { settings } = await loadSettings(cwd);
  const slug = intent.target;
  const optionCall = recs.find((x) => x.kind === 'evaluation-call' && x.payload.intent === intent.sha && x.payload.call === 'option');
  const ownerCall = recs.find((x) => x.kind === 'evaluation-call' && x.payload.intent === intent.sha && x.payload.call === 'owner');
  const calls = {};
  if (!intent.payload.option_request) {
    calls.option = null; calls.owner = null;
  } else if (!optionCall) {
    calls.option = await appendCall(cwd, slug, intent.sha, 'option', intent.payload.option_request, 'indeterminate', {});
    calls.owner = await appendCall(cwd, slug, intent.sha, 'owner', intent.payload.owner_request, 'not_sent', {});
  } else if (!ownerCall) {
    calls.option = optionCall.sha;
    calls.owner = await appendCall(cwd, slug, intent.sha, 'owner', intent.payload.owner_request, 'indeterminate', {});
  } else {
    calls.option = optionCall.sha; calls.owner = ownerCall.sha;
  }
  const env = { gates: [{ gate: 'call', value: 'indeterminate', passed: false }], route: 'developer', reason: 'indeterminate', option: null };
  return (await finalize(cwd, slug, intent.sha, settings, env, calls)).evaluationSha;
}

export async function evaluate(cwd, draft, { transport = post } = {}) {
  await recoverEvaluation(cwd);
  const D = normalizeDraft(draft);
  const { settings, digest: settingsDigest } = await loadSettings(cwd);
  const t = settings.typesafeai;
  const none = (reason) => ({ route: 'developer', would_route: null, reason, option: null, evaluationSha: null, intentSha: null });
  if (!t || !t.enabled) return none('disabled');
  const log = await readLog(cwd);
  const disabled = await callsDisabled(cwd, log);
  if (disabled) return none('unread-decisions');
  // Fix round 3 (plan 11 review): the route-mode-without-calibration check that used to live here
  // is gone -- lib/settings.mjs's own loadSettings (above) already refuses to load a route-mode
  // project's settings without a passing calibration at the exact current policy digest, so this
  // line was unreachable dead code (confirmed empirically: calling evaluate() against a route-mode
  // project with no calibration record throws SettingsError from the loadSettings call above,
  // before this line could ever run). Removing it also drops this file's last direct reference to
  // the calibration record kind outside lib/settings.mjs.

  const id = await captureIdentity(cwd, D, settingsDigest);
  const f = await kernelFacts(cwd, D);
  f.touched = [...new Set([...D.named_paths, ...((f.lease && f.lease.touch) || [])])];
  const slug = f.slug ?? D.commitment;
  const prot = protectedReasons(f);
  const intentBase = {
    draft_digest: id.draft_digest, snapshot: id.ws, log_head: id.log_head, adr_digest: id.adr_digest,
    settings_digest: id.settings_digest, policy_digest: policyDigest(settings), owner_request: null, option_request: null,
  };

  if (prot.length) {
    const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, intentBase);
    const env = applyEnvelope(settings, { protectedReasons: prot, optionCount: D.options.length });
    return finalize(cwd, slug, intentSha, settings, env, {});
  }

  const C = await contractState(cwd, f);
  const A = authorityProjection(f);
  let optionReq, ownerReq, unavailable = null, excludedClass = null;
  try {
    const { state } = await optionState(cwd, D, C, f);
    optionReq = buildOptionRequest(settings, state, D.options.length);
    ownerReq = buildOwnerRequest(settings, ownerState(D, C, A));
    unavailable = sizeCheck(settings, optionReq) || sizeCheck(settings, ownerReq);
  } catch (e) {
    if (!(e instanceof EgressError)) throw e;
    unavailable = 'excluded'; excludedClass = e.klass;
  }
  const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, {
    ...intentBase,
    option_request: unavailable ? null : requestDigest(optionReq),
    owner_request: unavailable ? null : requestDigest(ownerReq),
  });
  if (unavailable) {
    const env = applyEnvelope(settings, { unavailable, excludedClass, optionCount: D.options.length });
    return finalize(cwd, slug, intentSha, settings, env, {});
  }

  const calls = {};
  const opt = await attemptCall(cwd, slug, intentSha, 'option', optionReq, transport);
  if (opt.crashed) throw opt.error;
  calls.option = opt.sha;
  let env = applyEnvelope(settings, { unavailable: opt.unavailable ?? null, optionAnswers: opt.answers ?? {}, optionCount: D.options.length, optionOnly: true });
  // optionOnly leaves `decided` (and so env.route) null exactly when every option gate passed;
  // any option-gate decision (developer or capture) means the owner call never happens.
  const optionGatesPass = env.route === null;
  if (!optionGatesPass) {
    calls.owner = await appendCall(cwd, slug, intentSha, 'owner', requestDigest(ownerReq), 'not_sent', {});
    return finalize(cwd, slug, intentSha, settings, env, calls);
  }
  const own = await attemptCall(cwd, slug, intentSha, 'owner', ownerReq, transport);
  if (own.crashed) throw own.error;
  calls.owner = own.sha;
  env = applyEnvelope(settings, { unavailable: own.unavailable ?? null, optionAnswers: opt.answers, ownerAnswer: own.answers ? own.answers.owner : null, optionCount: D.options.length });
  return finalize(cwd, slug, intentSha, settings, env, calls);
}

// --- Task 9: calibration: exact bound ------------------------------------------------------------

// P(X = k | n, p) built up term by term from P(X = 0) = (1-p)^n, so the whole CDF is one pass with
// no factorials (n can be in the hundreds).
function binomCdf(k, n, p) {
  let term = Math.pow(1 - p, n), sum = term;
  for (let i = 1; i <= k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term; }
  return sum;
}
// The exact one-sided (1 - alpha) Clopper-Pearson upper confidence bound on an error rate: the
// smallest p with P(X <= errors | n, p) <= alpha. Bisection works because that CDF is monotonically
// decreasing in p for fixed errors and n.
export function upperBound(errors, n, alpha = 0.05) {
  if (n <= 0 || errors >= n) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (binomCdf(errors, n, mid) > alpha) lo = mid; else hi = mid; }
  return hi;
}

// A labelled shadow case: a shadow evaluation the evaluator predicted 'agent' for (would_route),
// under the exact policy digest calibrate() is checking, whose escalation (the one naming that
// evaluation) was later answered with an owner label. 'unknown' labels, and cases the evaluator
// predicted 'developer' for, are not in the denominator at all (spec section 10: "only the first
// two calibrate").
function labelledShadow(log, policy) {
  const answers = new Map(log.filter((r) => r.kind === 'answer' && r.payload.owner).map((r) => [r.payload.escalation, r.payload.owner]));
  const byEval = new Map(log.filter((r) => r.kind === 'escalation' && r.payload.evaluation).map((r) => [r.payload.evaluation, r.sha]));
  const intents = new Map(log.filter((r) => r.kind === 'evaluation-intent').map((r) => [r.sha, r.payload]));
  return log.filter((r) => r.kind === 'evaluation' && r.payload.would_route === 'agent' && intents.get(r.payload.intent)?.policy_digest === policy)
    .map((r) => answers.get(byEval.get(r.sha)))
    .filter((l) => l === 'agent' || l === 'developer');
}

export async function calibrate(cwd) {
  const { settings } = await loadSettings(cwd);
  const t = settings.typesafeai;
  const log = await readLog(cwd);
  const policy = policyDigest(settings);
  const labels = labelledShadow(log, policy);
  const sample = labels.length;
  const errors = labels.filter((l) => l === 'developer').length;
  const bound = upperBound(errors, sample);
  const pass = sample >= t.min_calibration_agent_predictions && bound <= t.max_false_downgrade;
  const head = await readRef(cwd, LOG_REF);
  const slug = range(log).start?.payload.slug ?? 'none';
  // 'calibration' schema's criterion field (lib/records.mjs) is a plain string, not the plan's
  // object -- a short, readable rendering of both configured limits this calibration is judged
  // against.
  const criterion = `max_false_downgrade<=${t.max_false_downgrade} min_calibration_agent_predictions>=${t.min_calibration_agent_predictions}`;
  const calibrationSha = await appendRecord(cwd, 'calibration', slug, {
    policy_digest: policy, log_head: head, predicted_agent: sample, false_downgrades: errors, bound, criterion, result: pass ? 'pass' : 'fail',
  });
  return { pass, sample, errors, bound, calibrationSha };
}
