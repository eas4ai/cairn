// tests/bench/scoring.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRun, scoreFromFile, predictedRoute, renderResultsMd, ScoringError } from './scoring.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(HERE, 'fixtures/results.sample.json');
const NO_ROWS = join(HERE, 'fixtures/results.norows.json');

describe('predictedRoute', () => {
  test('composite outcome predicts its own suggestion', () => {
    assert.equal(predictedRoute({ outcome: 'composite', suggested: 'agent' }), 'agent');
    assert.equal(predictedRoute({ outcome: 'composite', suggested: 'developer' }), 'developer');
  });
  test('floor, veto, unavailable and indeterminate all predict developer, whatever suggested is', () => {
    for (const outcome of ['floor', 'veto', 'unavailable', 'indeterminate']) {
      assert.equal(predictedRoute({ outcome, suggested: null }), 'developer');
    }
  });
  // Task 2 review Minor: a composite record with no suggested route is malformed data (the real
  // finalizeMeasurement always sets suggested for a composite outcome; this only reaches a
  // hand-built or corrupted results file) -- it must not silently become a stray 'null' key in
  // the confusion matrix (scoreRun's confusion[expect][predicted]++ would otherwise add one).
  test('throws a named error on a composite record with a null suggested, rather than emit a stray key', () => {
    assert.throws(() => predictedRoute({ outcome: 'composite', suggested: null }), ScoringError);
  });
});

describe('scoreRun (pure function, no file I/O)', () => {
  test('scores a small in-memory row set directly, without reading any file', () => {
    // Two rows, by hand: S01 (composite->agent, expect agent: correct), S03 (veto, expect
    // developer: correct). No fixture file is touched here -- scoreRun takes rows in, data out.
    const rows = [
      { id: 'S01', expect: 'agent', category: 'sample', measurement: { outcome: 'composite', suggested: 'agent', composite: 0.18, veto: null, levels: [] } },
      { id: 'S03', expect: 'developer', category: 'sample', measurement: { outcome: 'veto', suggested: null, composite: null, veto: 'contract', levels: [] } },
    ];
    const scored = scoreRun(rows);
    assert.equal(scored.overall.correct, 2);
    assert.equal(scored.overall.total, 2);
    assert.equal(scored.misrouted.length, 0);
  });
});

describe('scoreRun and scoreFromFile (no network: reads a recorded JSON file)', () => {
  test('scoreFromFile loads the sample fixture and scores it, no network call anywhere', async () => {
    const { meta, rows, scored } = await scoreFromFile(SAMPLE);
    assert.equal(meta.note, 'hand-built sample for scoring.test.mjs; not a live run');
    assert.equal(rows.length, 6);
    // predicted: S01 agent(correct), S02 developer(expect agent, wrong), S03 developer(veto, correct),
    // S04 developer(floor, correct), S05 developer(correct), S06 developer(unavailable, expect agent, wrong)
    assert.equal(scored.overall.correct, 4); assert.equal(scored.overall.total, 6);
    assert.equal(scored.byExpect.agent.correct, 1); assert.equal(scored.byExpect.agent.total, 3);
    assert.equal(scored.byExpect.developer.correct, 3); assert.equal(scored.byExpect.developer.total, 3);
  });
  test('the confusion matrix counts every (expect, predicted) pair', async () => {
    const { scored } = await scoreFromFile(SAMPLE);
    assert.equal(scored.confusion.agent.agent, 1);
    assert.equal(scored.confusion.agent.developer, 2);
    assert.equal(scored.confusion.developer.developer, 3);
    assert.equal(scored.confusion.developer.agent ?? 0, 0);
  });
  test('misrouted lists exactly the wrong predictions, with the deciding outcome', async () => {
    const { scored } = await scoreFromFile(SAMPLE);
    assert.deepEqual(scored.misrouted.map((m) => m.id).sort(), ['S02', 'S06']);
    assert.equal(scored.misrouted.find((m) => m.id === 'S02').deciding, 'composite');
    assert.equal(scored.misrouted.find((m) => m.id === 'S06').deciding, 'unavailable');
  });
  test('dimension separation is the mean level per expect class, by hand from the fixture', async () => {
    const { scored } = await scoreFromFile(SAMPLE);
    // Only rows with non-empty levels count: agent group is S01+S02 (S06 has levels: []);
    // developer group is S03+S05 (S04 has levels: []).
    // evidence: agent mean (3.2+1.0)/2=2.1, developer mean (1.0+0.5)/2=0.75, separation 1.35
    assert.equal(scored.dimensionSeparation.evidence.agentMean, 2.1);
    assert.equal(scored.dimensionSeparation.evidence.developerMean, 0.75);
    assert.ok(Math.abs(scored.dimensionSeparation.evidence.separation - 1.35) < 1e-9);
    // contract: agent mean (0.1+1.5)/2=0.8, developer mean (3.5+2.0)/2=2.75, separation 1.95
    assert.equal(scored.dimensionSeparation.contract.agentMean, 0.8);
    assert.equal(scored.dimensionSeparation.contract.developerMean, 2.75);
    assert.ok(Math.abs(scored.dimensionSeparation.contract.separation - 1.95) < 1e-9);
  });
  test('renderResultsMd produces a report naming the accuracy and the misrouted ids', async () => {
    const { meta, rows, scored } = await scoreFromFile(SAMPLE);
    const text = renderResultsMd({ meta, rows, scored });
    assert.match(text, /4\/6/);
    assert.match(text, /S02/); assert.match(text, /S06/);
    assert.ok(!/[^\x00-\x7f]/.test(text));
  });
  // Task 2 review Minor: a results file with no `rows` array (truncated write, wrong file, a
  // meta-only stub) must refuse with a named error, not crash later inside scoreRun with a
  // confusing "rows is not iterable" or (worse) silently score zero rows.
  test('scoreFromFile refuses a file with no rows array, with a named error', async () => {
    await assert.rejects(scoreFromFile(NO_ROWS), ScoringError);
  });
});
