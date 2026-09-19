// tests/evaluate.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvaluatorSettings, isVersionedModel, EVALUATOR_DEFAULTS } from '../lib/evaluate.mjs';
import { validateSettings } from '../lib/settings.mjs';

const good = () => ({ ...EVALUATOR_DEFAULTS, enabled: true, mode: 'shadow', model: 'jev-1.13.0' });

describe('settings block', () => {
  test('defaults validate', () => assert.deepEqual(validateEvaluatorSettings({ ...EVALUATOR_DEFAULTS }), []));
  test('threshold outside [0,1] is refused', () => {
    for (const k of ['route_confidence', 'sufficient_threshold', 'outside_threshold', 'contradicts_ceiling', 'reversible_floor', 'observed_floor', 'max_false_downgrade']) {
      assert.match(validateEvaluatorSettings({ ...good(), [k]: 1.5 }).join(' '), new RegExp(k));
      assert.match(validateEvaluatorSettings({ ...good(), [k]: -0.1 }).join(' '), new RegExp(k));
    }
  });
  test('enabled without a model is refused', () =>
    assert.match(validateEvaluatorSettings({ ...good(), model: null }).join(' '), /model/));
  test('request_cap_bytes above 64000 is refused', () =>
    assert.match(validateEvaluatorSettings({ ...good(), request_cap_bytes: 64001 }).join(' '), /request_cap_bytes/));
  test('weights and code_tiers are refused, not ignored', () => {
    assert.match(validateEvaluatorSettings({ ...good(), weights: {} }).join(' '), /weights/);
    assert.match(validateEvaluatorSettings({ ...good(), code_tiers: [] }).join(' '), /code_tiers/);
  });
  test('unknown field, unknown mode, unknown value fail closed', () => {
    assert.match(validateEvaluatorSettings({ ...good(), extra: 1 }).join(' '), /extra/);
    assert.match(validateEvaluatorSettings({ ...good(), mode: 'auto' }).join(' '), /mode/);
    assert.match(validateEvaluatorSettings({ ...good(), enabled: 'yes' }).join(' '), /enabled/);
  });
  test('route mode requires a versioned model id, not an alias', () => {
    assert.equal(isVersionedModel('jev-1.13.0'), true);
    assert.equal(isVersionedModel('jev-latest'), false);
    assert.match(validateEvaluatorSettings({ ...good(), mode: 'route', model: 'jev-latest' }).join(' '), /alias/);
  });
  test('validateSettings (lib/settings.mjs, already committed) carries the same evaluator reasons', () => {
    const s = { schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: [],
      signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { ...good(), weights: {} } };
    assert.match(validateSettings(s).join(' '), /weights/);
  });
});

// Shared test fixture: every later describe block in this file builds on tests/helpers/loop.mjs's
// loopRepo(), an initialized project with commitment 'first', requirement DEMO-001 (Agreed,
// mechanism declared), src/** classified 'source' and README.md/notes/** classified 'outside'
// (see tests/helpers/loop.mjs). draft() below matches that fixture instead of the plan's own
// illustrative auth-tokens/AUTH-003 example, so every fixture in this file authorizes and starts
// cleanly through the real lib/commitment.mjs and lib/spec.mjs machinery.
export function draft(over = {}) {
  return {
    commitment: 'first', concerns: ['DEMO-001'],
    question: 'Should the demo mechanism run hourly?',
    recommendation: 'hourly',
    because: 'observed: node --test tests/typesafeai.test.mjs passes against src/demo.mjs',
    if_wrong: 'the demo drifts from the mechanism',
    instead: 'daily',
    options: ['hourly', 'daily'],
    named_paths: ['src/demo.mjs'],
    cited_decisions: [],
    ...over,
  };
}

import { POLICY, normalizeDraft, draftDigest, policyDigest, DraftError } from '../lib/evaluate.mjs';

function settingsFixture(over = {}) {
  return { typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true, mode: 'shadow', model: 'jev-1.13.0' },
    network_exclude: ['fixtures/private/**'], ...over };
}

describe('policy and draft digests', () => {
  test('normalizeDraft keeps exactly the ten fields and refuses extras and missing/invalid ones', () => {
    assert.deepEqual(Object.keys(normalizeDraft(draft())).sort(), [...POLICY.DRAFT_KEYS].sort());
    assert.throws(() => normalizeDraft({ ...draft(), score: 1 }), DraftError);
    assert.throws(() => normalizeDraft({ ...draft(), question: undefined }), DraftError);
  });
  test('draft digest is stable under key order and matches lib/escalate.mjs (the same canonical draft)', () => {
    const a = draftDigest(normalizeDraft(draft()));
    const d = draft(); const reordered = Object.fromEntries(Object.entries(d).reverse());
    assert.equal(a, draftDigest(normalizeDraft(reordered)));
    assert.match(a, /^sha256:[0-9a-f]{64}$/);
  });
  test('policy digest changes with any covered input and nothing else', () => {
    const base = policyDigest(settingsFixture());
    const s1 = settingsFixture(); s1.typesafeai = { ...s1.typesafeai, route_confidence: 0.9 };
    const s2 = settingsFixture(); s2.network_exclude = [];
    const s3 = settingsFixture(); s3.typesafeai = { ...s3.typesafeai, model: 'jev-1.14.0' };
    const s4 = settingsFixture(); s4.typesafeai = { ...s4.typesafeai, enabled: false, mode: 'route' };
    assert.notEqual(base, policyDigest(s1)); assert.notEqual(base, policyDigest(s2)); assert.notEqual(base, policyDigest(s3));
    assert.equal(base, policyDigest(s4), 'enabled and mode are not policy');
  });
  test('the six question ids and types are fixed', () => {
    assert.deepEqual(POLICY.QUESTIONS.map((q) => [q.id, q.type]), [
      ['sufficient', 'noul'], ['reversible_n', 'noul'], ['contradicts_n', 'noul'], ['outside_n', 'noul'], ['observed', 'noul'], ['owner', 'choice']]);
  });
});
