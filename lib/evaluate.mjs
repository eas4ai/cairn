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
import { DRAFT_KEYS as DK, FIELDS as FIVE_FIELDS } from './escalate.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { CREDENTIAL_PATTERNS } from './paths.mjs';

export const POLICY = Object.freeze({
  DRAFT_KEYS: DK,
  RULE: 'Cairn code rule: a Consequential draft stays the agent\'s decision only when every option gate passes and the owner answer is agent at or above route_confidence. Data, contract, agreement, reserved or settings writes, a fourth attempt, a scope ruling, a missing recommendation and an incomplete authority projection are the developer\'s without a call.',
  ENVELOPE: 'protected->developer; oversize->developer; call fails->developer; invalid answer->developer; sufficient<t->developer; outside_n>=t->capture n; contradicts_n>=c->developer; reversible_n<f->developer; observed<f->developer; owner=agent and confidence>=r->agent; otherwise->developer',
  CONSTRUCTION: 1, ROUTER: 1,
  LIMITS: Object.freeze({ requestTokens: 64000, stateTokens: 32000, bytesPerToken: 3, factor: 0.75 }),
  QUESTIONS: Object.freeze([
    { id: 'sufficient', type: 'noul', call: 'option', text: 'Does the state suffice for every option gate?' },
    { id: 'reversible_n', type: 'noul', call: 'option', text: 'Can option n be reverted without migration, data repair or caller change?' },
    { id: 'contradicts_n', type: 'noul', call: 'option', text: 'Does option n contradict the frozen contract or a cited decision?' },
    { id: 'outside_n', type: 'noul', call: 'option', text: 'Is option n outside the frozen requirement set?' },
    { id: 'observed', type: 'noul', call: 'option', text: 'Does because cite an observed command, path or output?' },
    { id: 'owner', type: 'choice', call: 'owner', text: 'Do closed facts assign this to agent or developer?',
      criteria: { agent: 'The closed facts and contract let the agent decide and queue this for later review', developer: 'The decision is the developer\'s' } },
  ]),
});

export function policyDigest(settings) {
  const t = settings.typesafeai;
  return sha256(canonicalize({
    model: t.model, questions: POLICY.QUESTIONS, construction: POLICY.CONSTRUCTION, rule: POLICY.RULE,
    envelope: POLICY.ENVELOPE, router: POLICY.ROUTER,
    thresholds: Object.fromEntries(THRESHOLD_KEYS.map((k) => [k, t[k]])),
    caps: { request_cap_bytes: t.request_cap_bytes, ...POLICY.LIMITS },
    egress: { network_exclude: [...settings.network_exclude], credential: [...CREDENTIAL_PATTERNS] },
  }));
}

// --- Task 4: protected(D) and the closed authority projection A(D) ---------------------------
import { readLog, range } from './records.mjs';
import { attempts as reqAttempts } from './check.mjs';
import { readAdr, queue } from './adr.mjs';
import { readLease } from './lease.mjs';
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
import { readSnapshot } from './snapshots.mjs';
import { git, listTree, writeTreeFromPaths } from './gitx.mjs';
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
