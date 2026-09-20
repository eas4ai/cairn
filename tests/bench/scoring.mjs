// tests/bench/scoring.mjs
//
// The offline benchmark scorer (plan 18 Task 2). Pure data in, pure data/text out: this module
// imports nothing from lib/, so a scoring change never needs a rerun of any recorded results
// file. `predictedRoute` is the one piece of routing logic this plan needs outside
// lib/evaluate.mjs: it only reads a measurement's already-computed outcome/suggested fields
// (lib/records.mjs's 'measurement' schema, plan 15 Task 2/9), mirroring lib/wake.mjs's own
// reading of that outcome -- it never reimplements the veto or composite math itself.
import { readFile } from 'node:fs/promises';

const DIMENSIONS = ['evidence', 'reach', 'contract', 'surface', 'ambiguity'];
const CLASSES = ['agent', 'developer'];

// A 'composite' outcome predicts its own `suggested` route; every other outcome (floor, veto,
// unavailable, indeterminate) is a forced-developer case by lib/evaluate.mjs's own design (plan
// 15 Task 9), so there is no agent authority to grant and predictedRoute names 'developer'.
export function predictedRoute(measurement) {
  return measurement.outcome === 'composite' ? measurement.suggested : 'developer';
}

function accuracyOf(pairs) {
  return { correct: pairs.filter((p) => p.predicted === p.expect).length, total: pairs.length };
}

// rows: [{id, expect, category, measurement}] -> {overall, byExpect, confusion, misrouted, dimensionSeparation}
export function scoreRun(rows) {
  const pairs = rows.map((r) => ({
    id: r.id,
    expect: r.expect,
    predicted: predictedRoute(r.measurement),
    deciding: r.measurement.outcome,
  }));

  const overall = accuracyOf(pairs);
  const byExpect = Object.fromEntries(CLASSES.map((c) => [c, accuracyOf(pairs.filter((p) => p.expect === c))]));

  const confusion = Object.fromEntries(CLASSES.map((e) => [e, Object.fromEntries(CLASSES.map((p) => [p, 0]))]));
  for (const p of pairs) confusion[p.expect][p.predicted]++;

  const misrouted = pairs.filter((p) => p.predicted !== p.expect);

  // Mean level per dimension, split by expected class, over rows that actually carry levels
  // (a floor/unavailable/indeterminate outcome has an empty levels list and is excluded from the
  // mean rather than treated as a zero).
  const dimensionSeparation = Object.fromEntries(DIMENSIONS.map((d) => {
    const meanFor = (expectClass) => {
      const values = rows
        .filter((r) => r.expect === expectClass && r.measurement.levels.length > 0)
        .map((r) => r.measurement.levels.find((l) => l.dimension === d)?.level)
        .filter((v) => v !== undefined);
      return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
    };
    const agentMean = meanFor('agent');
    const developerMean = meanFor('developer');
    const separation = agentMean !== null && developerMean !== null ? Math.abs(agentMean - developerMean) : null;
    return [d, { agentMean, developerMean, separation }];
  }));

  return { overall, byExpect, confusion, misrouted, dimensionSeparation };
}

// resultsPath -> {meta, rows, scored}: reads a recorded results JSON file ({meta, rows}, the
// shape harness.mjs (Task 3) writes) and scores it. No network call: readFile only.
export async function scoreFromFile(resultsPath) {
  const raw = JSON.parse(await readFile(resultsPath, 'utf8'));
  const rows = raw.rows;
  return { meta: raw.meta, rows, scored: scoreRun(rows) };
}

function pct(correct, total) {
  return total === 0 ? 'n/a' : `${((correct / total) * 100).toFixed(1)}% (${correct}/${total})`;
}
function num(v) { return v === null || v === undefined ? 'n/a' : v.toFixed(2); }

// {meta, scored} -> text: mirrors .superpowers/bench/results.md's round-3 table shape (route
// accuracy, confusion matrix, misrouted list, per-dimension separation), scaled down to this
// scorer's own two-way (agent/developer) route rather than the round-3 sweep's grid search.
export function renderResultsMd({ meta, scored }) {
  const lines = [
    '# TypeSafe evaluator benchmark: results',
    '',
    `Model: ${meta?.model ?? 'n/a'}. ${meta?.note ?? ''}`.trim(),
    '',
    '## Route accuracy',
    '',
    `Overall: ${pct(scored.overall.correct, scored.overall.total)}`,
    '',
    '| expect | accuracy |',
    '|---|---|',
    `| agent | ${pct(scored.byExpect.agent.correct, scored.byExpect.agent.total)} |`,
    `| developer | ${pct(scored.byExpect.developer.correct, scored.byExpect.developer.total)} |`,
    '',
    '## Confusion matrix (rows = expect, cols = predicted)',
    '',
    '| expect \\ predicted | agent | developer |',
    '|---|---|---|',
    `| agent | ${scored.confusion.agent.agent} | ${scored.confusion.agent.developer} |`,
    `| developer | ${scored.confusion.developer.agent} | ${scored.confusion.developer.developer} |`,
    '',
    '## Misrouted',
    '',
    '| id | expect | predicted | deciding |',
    '|---|---|---|---|',
    ...scored.misrouted.map((m) => `| ${m.id} | ${m.expect} | ${m.predicted} | ${m.deciding} |`),
    '',
    '## Per-dimension separation (mean level, agent-expected vs developer-expected)',
    '',
    '| dimension | agent mean | developer mean | separation |',
    '|---|---|---|---|',
    ...Object.entries(scored.dimensionSeparation).map(([d, s]) =>
      `| ${d} | ${num(s.agentMean)} | ${num(s.developerMean)} | ${num(s.separation)} |`),
    '',
  ];
  return lines.join('\n');
}
