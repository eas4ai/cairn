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
