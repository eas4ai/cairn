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
import { DRAFT_KEYS as DK } from './escalate.mjs';
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
