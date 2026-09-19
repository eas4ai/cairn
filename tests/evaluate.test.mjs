// tests/evaluate.test.mjs
// Plan 15 (measurement core), task 3: policy constants, the Score criteria text, the draft digest
// and the policy digest -- the first exports of lib/evaluate.mjs, rewritten from scratch on this
// plan. The old file's gate-cascade/route/shadow tests are not carried forward (they tested a
// design decisions 55 and 56 superseded); this file's structure is left open for the describe
// blocks tasks 4-10 add back (the floor, the state, the request, the parser, the composite,
// measure() and calibrate() -- ruling 5).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { POLICY, policyDigest } from '../lib/evaluate.mjs';
// Deviation from the brief text: the brief's Step 1 snippet imports normalizeDraft/draftDigest
// directly from '../lib/escalate.mjs'. lib/escalate.mjs exports validateDraft, not a function
// named normalizeDraft -- it never has, on any commit on this branch (git log -- lib/escalate.mjs
// shows no rename). lib/evaluate.mjs re-exports escalate.mjs's validateDraft under the name
// normalizeDraft (`export { validateDraft as normalizeDraft, ... } from './escalate.mjs'`, per
// the brief's own Step 3 code and the interfaces line "re-exported as FIVE_FIELDS" pattern for
// FIELDS) -- escalate.mjs itself is unchanged, exactly as the brief's interfaces line promises.
// Importing normalizeDraft from lib/evaluate.mjs, where that name actually exists, is what the
// test below ("normalizeDraft/draftDigest still come from lib/escalate.mjs, unchanged by this
// plan") is actually proving: that evaluate.mjs's re-export is the same underlying function
// escalate.mjs already had, not a new implementation.
import { normalizeDraft, draftDigest } from '../lib/evaluate.mjs';

const draft = () => ({ commitment: 'auth-tokens', concerns: ['AUTH-003'], question: 'Rotate tokens hourly?',
  recommendation: 'hourly', because: 'observed: node scripts/rotate.mjs prints ok', if_wrong: 'sessions drop',
  instead: 'daily', options: ['hourly', 'daily'], named_paths: ['src/auth/rotate.mjs'], cited_decisions: [] });
const dims = () => ({ evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 });
const settings = () => ({ typesafeai: { enabled: true, model: 'jev-1.13.0', weights: dims(), agent_ceiling: 0.35, confidence_floors: dims(),
  min_calibration_agent_predictions: 60, request_cap_bytes: 48000 }, network_exclude: ['fixtures/private/**'] });

describe('policy constants and digests', () => {
  test('the five dimensions and their level-0..4 criteria text are fixed', () => {
    assert.deepEqual(POLICY.DIMENSIONS, ['evidence', 'reach', 'contract', 'surface', 'ambiguity']);
    for (const d of POLICY.DIMENSIONS) assert.equal(POLICY.LEVELS[d].length, 5);
    assert.deepEqual(POLICY.LEVELS.evidence[0], 'none');
    assert.deepEqual(POLICY.LEVELS.evidence[4], 'quotes output and names the test that fails and the falsifier it maps to');
    assert.deepEqual(POLICY.LEVELS.surface[4], 'a network call, credential, or external service');
  });
  test('normalizeDraft/draftDigest still come from lib/escalate.mjs, unchanged by this plan', () => {
    const D = normalizeDraft(draft());
    assert.deepEqual(Object.keys(D).sort(), ['because', 'cited_decisions', 'commitment', 'concerns', 'if_wrong',
      'instead', 'named_paths', 'options', 'question', 'recommendation'].sort());
    assert.match(draftDigest(D), /^sha256:[0-9a-f]{64}$/);
  });
  test('policy digest changes with every covered input and nothing else', () => {
    const base = policyDigest(settings());
    const s1 = settings(); s1.typesafeai.agent_ceiling = 0.4;
    const s2 = settings(); s2.typesafeai.weights.evidence = 0.3;
    const s3 = settings(); s3.typesafeai.confidence_floors.ambiguity = 0.6;
    const s4 = settings(); s4.network_exclude = [];
    const s5 = settings(); s5.typesafeai.model = 'jev-1.14.0';
    const s6 = settings(); s6.typesafeai.enabled = false;
    assert.notEqual(base, policyDigest(s1)); assert.notEqual(base, policyDigest(s2)); assert.notEqual(base, policyDigest(s3));
    assert.notEqual(base, policyDigest(s4)); assert.notEqual(base, policyDigest(s5));
    assert.equal(base, policyDigest(s6), 'enabled is a source choice, not policy');
  });
});
