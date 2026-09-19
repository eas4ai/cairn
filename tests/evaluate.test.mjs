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
