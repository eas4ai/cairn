# Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the TypeSafe evaluator benchmark in-tree as `tests/bench/`: the 24-scenario ledger project (`.superpowers/bench/scenarios.json` and its live results, `.superpowers/bench/results.md`, already prove the composite design's shape live -- 89.5% overall / 90.0% agent-expected / 88.9% developer-expected accuracy at the best cell), a project builder, an offline scorer with its own no-network fixture test, and a live harness that runs the real `cairn measure` CLI path against a built project and never opens a socket unless both `CAIRN_BENCH=1` and a real key are present.

**Architecture:** `tests/bench/scenarios.json` is data (24 scenarios, ported from `.superpowers/bench/scenarios.json` with one mechanical fix, Task 1). `tests/bench/build.mjs` builds one real Cairn project (the ledger CLI, EXP-001..EXP-005) under a fresh temp directory, through the same real `lib/` functions `tests/helpers/fixture.mjs` and the reference bench build script already use -- no shortcuts, no stub records. `tests/bench/scoring.mjs` is a pure module: it turns an array of `{id, expect, measurement}` rows into accuracy, a confusion matrix and a rendered `results.md`, and it can load that array from a recorded JSON file, so it needs no network to test. `tests/bench/harness.mjs` is the live-call orchestrator: it refuses to run (`assertBenchEnabled`) unless `CAIRN_BENCH=1` and `TYPESAFEAI_API_KEY` are both present, and only past that gate does it build the project, spawn `bin/cairn.mjs measure ...` once per scenario (the real CLI, the real transport, `typesafeai.enabled: true`), read back each resulting `measurement` record, score the run, and write `tests/bench/results.json` (raw) and `tests/bench/results.md` (rendered). Every `*.test.mjs` file under `tests/bench/` runs under ordinary `node --test` with no network dependency; only `harness.mjs`'s own live-call path, invoked directly (`node tests/bench/harness.mjs`) or via the `npm run bench` script this plan adds, ever touches the network, and only when both guard conditions hold.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`, `node:child_process`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md`, revised 2026-09-19, section 10 (all; this plan is what measures the design's own claims against a real project), section 13 decision 53 (the developer's own reason: "The reason I wanted this design was to be able to use Cairn in an autonomous benchmark"). This plan proves plans 15 and 16's implementation against real scenarios; it defines no new requirement or falsifier of its own.

**Evidence already in the repository:** `.superpowers/bench/composite-design.md` (the dimension shape and levels), `.superpowers/bench/results.md` (round 1: the superseded gate cascade routed 0 of 12 agent-expected drafts to the agent; round 3: the composite design this plan exercises, live, at 89.5% overall accuracy, best cell `agent_ceiling: 0.35`, `confidence_floors: 0`), `.superpowers/bench/scenarios.json` (the 24 scenarios and the one real ledger project they run against).

**Depends on:** plans 15 (`measure`, the `measurement` record shape, `POLICY.DIMENSIONS`) and 16 (`cairn measure`'s CLI surface, `--transport-module` is gone from `escalate` but `measure` still carries it for test-only injection, per plan 16 Task 5's `COMMANDS.measure.usage`). Consumes plan 03 (`tests/helpers/repo.mjs`'s `makeProject`, not used directly here since this plan needs the exact ledger project text, but the same real-`lib/`-functions construction pattern `tests/helpers/fixture.mjs`'s `buildProject` already demonstrates), plan 04 (`lib/lease.mjs`'s `begin`), plan 06 (`lib/commitment.mjs`'s `start`), plan 05 (`lib/mechanisms.mjs`'s `declare`).

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan:

- The harness's own binding instruction: "a harness that runs the real kernel path (`cairn measure`) on a built ledger project, never runs without `CAIRN_BENCH=1` and a key" (this plan's brief).
- "its offline scoring test needs no network" (this plan's brief).
- "Only `bin/typesafeai.mjs` performs network I/O" (section 10; this plan's harness never bypasses it with a second transport -- the real CLI path is the only path Task 3 calls).
- "The reason I wanted this design was to be able to use Cairn in an autonomous benchmark" (section 10, quoting the developer, decision 53) -- this plan is that benchmark, run through the real command surface, not a library-level shortcut.
- Tests never call the network (`docs/plans/overview.md`'s own Global Constraints): every `*.test.mjs` file this plan adds is bound by that rule exactly as every other plan's tests are; only `harness.mjs`, invoked outside `node --test`, may.
- Shipped text is ASCII. No AI attribution anywhere in commits, docs or output.

---

## File structure

```
tests/bench/scenarios.json     the 24 scenarios and the one ledger project (ported, one field fixed)
tests/bench/build.mjs          buildLedgerProject() -> {dir, slug, leaseTarget, startSha, leaseSha, requirements}
tests/bench/build.test.mjs     proves the built project is real and current (no network)
tests/bench/scoring.mjs        scoreRun(), scoreFromFile(), renderResultsMd()
tests/bench/fixtures/results.sample.json   a small, hand-built, honestly-labelled sample (not a full run)
tests/bench/scoring.test.mjs   scoreRun/scoreFromFile against the sample fixture (no network)
tests/bench/harness.mjs        assertBenchEnabled(); runBenchmark(): builds, calls cairn measure 24x, writes results
tests/bench/harness.test.mjs   proves the guard refuses without CAIRN_BENCH=1 and a key (no network)
tests/bench/results.json       (written by a real run of harness.mjs, committed once produced; Task 3)
tests/bench/results.md         (written by a real run of harness.mjs, committed once produced; Task 3)
package.json                   (modify) test script covers tests/bench/*.test.mjs; a "bench" script
```

---

### Task 1: `scenarios.json` and the ledger project builder

**Files:**
- Create: `tests/bench/scenarios.json`, `tests/bench/build.mjs`, `tests/bench/build.test.mjs`

**Interfaces:**
- Consumes: `init` from `lib/init.mjs`; `declare` from `lib/mechanisms.mjs`; `authorize` from `lib/auth.mjs`; `start` from `lib/commitment.mjs`; `begin` from `lib/lease.mjs`; `git` primitives from `lib/gitx.mjs` (a bare `git init`, matching `tests/helpers/fixture.mjs`'s own construction, not `makeProject`, since this project needs the ledger's own spec text, not the generic fixture text).
- Produces: `buildLedgerProject({dir} = {}) -> {dir, slug, leaseTarget, startSha, leaseSha, requirements}`. `dir` defaults to a fresh `mkdtempSync` directory when omitted; every call builds a complete, independent project (no shared, reused fixture directory across test runs).

**Porting note, applied to the data, not the code:** `.superpowers/bench/scenarios.json`'s 24 drafts predate section 10's "the recommended option, `draft.options[draft.recommendation]`" rule (spec section 10; this plan's design in Tasks 2-3 relies on `lib/evaluate.mjs`'s `D.options.indexOf(D.recommendation)`, plan 15 Task 4). In the original data, `draft.recommendation` is a free sentence describing the chosen option in its own words, not a byte-identical copy of one `draft.options[n]` entry -- checked directly (`A01`'s `recommendation` reads "Print `ledger: expected header ...`", while `options[0]` reads "Print the long form naming the full expected header."; they agree in substance, not in bytes). Fed through `measure()` unchanged, every one of the 24 scenarios would fail `D.options.indexOf(D.recommendation) < 0` and hit the `incomplete-projection` floor, scoring nothing. The port fixes this the same way for all 24: `recommendation` is set to the exact text of `options[0]` (the option each scenario's original recommendation already agreed with in substance), and the old per-question `truth` object (`sufficient`/`observed`/`reversible`/`contradicts`/`outside`/`owner` -- the superseded gate cascade's own ground truth, not this design's) is dropped; `expect` (`agent`/`developer`) and `category` are kept unchanged, since they are the ground truth this design's own `suggested` is scored against. `paths` is renamed `named_paths` nowhere in the JSON itself -- it stays `paths` in `scenarios.json`, matching the source data, and `build.mjs`/`harness.mjs` (Task 3) map it to `named_paths` when constructing the actual CLI call, exactly as the original `.superpowers/bench/harness.mjs`'s own `draftFor()` already did.

- [ ] **Step 1: Write the failing test**

```js
// tests/bench/build.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLedgerProject } from './build.mjs';
import { wake } from '../../lib/wake.mjs';
import { readLog } from '../../lib/records.mjs';
import { loadSettings } from '../../lib/settings.mjs';

describe('the ledger project builder', () => {
  test('builds a real, current project with an open commitment and a lease', async () => {
    const p = await buildLedgerProject();
    assert.equal(p.slug, 'ledger');
    assert.equal(p.leaseTarget, 'EXP-002');
    assert.deepEqual(p.requirements, ['EXP-001', 'EXP-002', 'EXP-003', 'EXP-004', 'EXP-005']);
    const log = await readLog(p.dir);
    assert.ok(log.some((r) => r.kind === 'start' && r.payload.slug === 'ledger'));
    const w = await wake(p.dir);
    // Resolvable, not Waiting or Done: the project is mid-implementation, exactly where the
    // benchmark's own scenarios assume a Consequential draft would be raised from.
    assert.equal(w.verdict, 'Resolvable');
  });
  test('typesafeai is enabled, jev, with the composite-design fields (no mode, no old thresholds)', async () => {
    const p = await buildLedgerProject();
    const { settings } = await loadSettings(p.dir);
    assert.equal(settings.typesafeai.enabled, true);
    assert.equal(settings.typesafeai.model, 'jev-1.13.0');
    assert.deepEqual(Object.keys(settings.typesafeai.weights).sort(), ['ambiguity', 'contract', 'evidence', 'reach', 'surface']);
    assert.equal('mode' in settings.typesafeai, false);
    assert.equal(settings.developer, 'present');
  });
  test('the touched paths have a real, non-empty uncommitted diff (so code.diff is not empty)', async () => {
    const p = await buildLedgerProject();
    const src = readFileSync(join(p.dir, 'src/ledger.mjs'), 'utf8');
    assert.match(src, /EXP-002/);
  });
  test('two calls build two independent projects', async () => {
    const a = await buildLedgerProject(), b = await buildLedgerProject();
    assert.notEqual(a.dir, b.dir);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/bench/build.test.mjs`
Expected: FAIL, `Cannot find module './build.mjs'`.

- [ ] **Step 3: Write `scenarios.json` and implement**

Copy `.superpowers/bench/scenarios.json`'s `project` block (`name`, `description`, `requirements`, `mechanism`, `files`) unchanged into `tests/bench/scenarios.json`'s own `project` key. Copy the 24 `scenarios` entries, applying the one mechanical fix above to each: `draft.recommendation = draft.options[0]`; delete `truth`. `id`, `expect`, `category`, `concerns`, `question`, `because`, `if_wrong`, `instead`, `options`, `paths` are otherwise unchanged.

```js
// tests/bench/build.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { init } from '../../lib/init.mjs';
import { declare } from '../../lib/mechanisms.mjs';
import { authorize } from '../../lib/auth.mjs';
import { start } from '../../lib/commitment.mjs';
import { begin } from '../../lib/lease.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = JSON.parse(readFileSync(join(HERE, 'scenarios.json'), 'utf8'));
const SLUG = 'ledger';
const LEASE_TARGET = 'EXP-002';
const GIT = '/usr/bin/git';

function sh(cwd, args) {
  const r = spawnSync(GIT, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}
function write(dir, p, text) { const full = join(dir, p); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); }
function domainFile(reqs) {
  return `Prefix: EXP\n\n${Object.keys(reqs).sort().map((id) =>
    `[${id}] ${reqs[id].text}\nFalsifier: ${reqs[id].falsifier}\nMechanism: ${SCENARIOS.project.mechanism.name}\nStatus: Agreed 2026-09-19`).join('\n\n')}\n`;
}

export async function buildLedgerProject({ dir } = {}) {
  const project = SCENARIOS.project;
  const cwd = dir ?? mkdtempSync(join(tmpdir(), 'cairn-bench-'));
  sh(cwd, ['init', '-q', '-b', 'main']);
  sh(cwd, ['config', 'user.email', 'bench@example.invalid']);
  sh(cwd, ['config', 'user.name', 'Cairn Bench']);
  sh(cwd, ['config', 'commit.gpgsign', 'false']);

  const dims = { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 };
  const settings = {
    schema: 1, authority_remote: null, outside: ['README.md'], source: ['src/**'], interfaces: [], data: [],
    network_exclude: [], signing_key: null, attribution: 'forbidden', developer: 'present', harness: {},
    typesafeai: { enabled: true, model: 'jev-1.13.0', weights: dims, agent_ceiling: 0.35, confidence_floors: { evidence: 0, reach: 0, contract: 0, surface: 0, ambiguity: 0 },
      min_calibration_agent_predictions: 60, request_cap_bytes: 48000 },
  };
  write(cwd, '.cairn/settings.json', JSON.stringify(settings, null, 2) + '\n');
  write(cwd, 'docs/spec/overview.md', `# Ledger\n\n${project.description}\n\n| File | Prefix |\n|---|---|\n| ledger.md | EXP |\n`);
  write(cwd, 'docs/spec/glossary.md', '# Glossary\n\n- ledger: this CLI.\n- category: a free-text label on an expense row.\n');
  write(cwd, 'docs/spec/roadmap.md', `Current: ${SLUG}\n\n## ${SLUG}\n\nRequirements: ${Object.keys(project.requirements).sort().join(' ')}\n\nDelivers the ledger CLI for a two-person bookkeeping shop.\n`);
  write(cwd, 'docs/spec/ledger.md', domainFile(project.requirements));
  write(cwd, 'AGENTS.md', '# Working agreement\n\nThis is a benchmark fixture project. Run cairn wake.\n');
  write(cwd, 'README.md', `# ledger\n\n${project.description}\n`);
  for (const [p, text] of Object.entries(project.files)) write(cwd, p, text);
  sh(cwd, ['add', '-A']); sh(cwd, ['commit', '-q', '-m', 'Prepare the ledger project']);

  const confirm = async () => true;
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirm, confirmDigest: async () => true });

  const inputs = project.mechanism.inputs.map((p) => p.replace(/\/$/, ''));   // trailing '/' is an empty path component (lib/paths.mjs)
  await declare(cwd, project.mechanism.name, { command: project.mechanism.command, cwd: null, inputs, documents: [], requirements: project.mechanism.requirements, results: 'per-requirement' });
  sh(cwd, ['add', '-A']); sh(cwd, ['commit', '-q', '-m', `Declare the ${project.mechanism.name} mechanism`]);

  await authorize(cwd, { confirm });
  const startSha = await start(cwd, SLUG);
  const leaseSha = await begin(cwd, { action: 'implement', target: LEASE_TARGET, touch: ['src/ledger.mjs', 'tests/ledger.test.mjs'], env: { ...process.env, CAIRN_SESSION: 'bench' } });

  // A small, real, uncommitted edit on both touched paths, so the measurement's code.diff is not
  // empty -- the same edit the reference benchmark used (.superpowers/bench/build-project.mjs).
  const src = readFileSync(join(cwd, 'src/ledger.mjs'), 'utf8');
  const editedSrc = src.replace('export function totals(rows, since)', '// EXP-002: cents are summed as integers here, never as floating-point dollars.\nexport function totals(rows, since)');
  if (editedSrc === src) throw new Error('bench: edit anchor not found in src/ledger.mjs');
  writeFileSync(join(cwd, 'src/ledger.mjs'), editedSrc);
  const testSrc = readFileSync(join(cwd, 'tests/ledger.test.mjs'), 'utf8');
  writeFileSync(join(cwd, 'tests/ledger.test.mjs'), testSrc + `\ntest('sums a second category separately', () => { const rows = parse('date,category,amount,note\\n2026-01-01,Fees,1.00,a'); assert.deepEqual(totals(rows), [['Fees', 100]]); });\n`);

  return { dir: cwd, slug: SLUG, leaseTarget: LEASE_TARGET, startSha, leaseSha, requirements: Object.keys(project.requirements).sort() };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/bench/build.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/bench/scenarios.json tests/bench/build.mjs tests/bench/build.test.mjs
git commit -m "Port the 24-scenario benchmark's ledger project builder in-tree, fixing recommendation to match an option"
```

---

### Task 2: The offline scorer, and its own no-network fixture test

**Files:**
- Create: `tests/bench/scoring.mjs`, `tests/bench/fixtures/results.sample.json`, `tests/bench/scoring.test.mjs`

**Interfaces:**
- Consumes: nothing from `lib/` (pure data in, pure data/text out); reads the `measurement` record shape plan 15 Task 2 defines (`levels`, `composite`, `veto`, `suggested`, `outcome`).
- Produces: `scoreRun(rows) -> {overall, byExpect, confusion, misrouted, dimensionSeparation}` where `rows` is `[{id, expect, category, measurement}]`; `scoreFromFile(resultsPath) -> {meta, rows, scored}` (reads a recorded JSON file, calls `scoreRun`, returns both); `predictedRoute(measurement) -> 'agent' | 'developer'`; `renderResultsMd({meta, scored}) -> text`.

`predictedRoute` is the one piece of routing logic this plan needs outside `lib/evaluate.mjs`: a `measurement` whose `outcome` is `'composite'` predicts `suggested`; every other outcome (`floor`, `veto`, `unavailable`, `indeterminate`) predicts `developer`, because every one of those outcomes is, by `lib/evaluate.mjs`'s own design (plan 15 Task 9), a forced-developer case with no agent authority to grant. This mirrors `lib/wake.mjs`'s own reading of a measurement's outcome; it does not reimplement the veto or composite math, only reads their already-computed result.

`tests/bench/fixtures/results.sample.json` is a small, honestly-labelled hand-built sample -- six rows, not the full 24, and explicitly not a claim that a live run ever produced it -- in the exact shape `harness.mjs` (Task 3) writes, so `scoreFromFile` has something real to load without a network call ever happening in this test.

- [ ] **Step 1: Write the failing tests**

Write the fixture file first (plain JSON, by hand): `tests/bench/fixtures/results.sample.json`

```json
{
  "meta": { "note": "hand-built sample for scoring.test.mjs; not a live run", "model": "jev-1.13.0" },
  "rows": [
    { "id": "S01", "expect": "agent", "category": "sample", "measurement": { "outcome": "composite", "suggested": "agent", "composite": 0.18, "veto": null,
      "levels": [{ "dimension": "evidence", "level": 3.2, "confidence": 0.7 }, { "dimension": "reach", "level": 0.5, "confidence": 0.6 }, { "dimension": "contract", "level": 0.1, "confidence": 0.9 }, { "dimension": "surface", "level": 0, "confidence": 0.8 }, { "dimension": "ambiguity", "level": 1.0, "confidence": 0.6 }] } },
    { "id": "S02", "expect": "agent", "category": "sample", "measurement": { "outcome": "composite", "suggested": "developer", "composite": 0.5, "veto": null,
      "levels": [{ "dimension": "evidence", "level": 1.0, "confidence": 0.5 }, { "dimension": "reach", "level": 1.8, "confidence": 0.6 }, { "dimension": "contract", "level": 1.5, "confidence": 0.6 }, { "dimension": "surface", "level": 0.5, "confidence": 0.7 }, { "dimension": "ambiguity", "level": 2.0, "confidence": 0.5 }] } },
    { "id": "S03", "expect": "developer", "category": "sample", "measurement": { "outcome": "veto", "suggested": null, "composite": null, "veto": "contract",
      "levels": [{ "dimension": "evidence", "level": 1.0, "confidence": 0.8 }, { "dimension": "reach", "level": 1.0, "confidence": 0.7 }, { "dimension": "contract", "level": 3.5, "confidence": 0.9 }, { "dimension": "surface", "level": 0.5, "confidence": 0.8 }, { "dimension": "ambiguity", "level": 1.0, "confidence": 0.6 }] } },
    { "id": "S04", "expect": "developer", "category": "sample", "measurement": { "outcome": "floor", "suggested": null, "composite": null, "veto": null, "levels": [] } },
    { "id": "S05", "expect": "developer", "category": "sample", "measurement": { "outcome": "composite", "suggested": "developer", "composite": 0.62, "veto": null,
      "levels": [{ "dimension": "evidence", "level": 0.5, "confidence": 0.6 }, { "dimension": "reach", "level": 2.5, "confidence": 0.7 }, { "dimension": "contract", "level": 2.0, "confidence": 0.6 }, { "dimension": "surface", "level": 1.0, "confidence": 0.7 }, { "dimension": "ambiguity", "level": 2.5, "confidence": 0.4 }] } },
    { "id": "S06", "expect": "agent", "category": "sample", "measurement": { "outcome": "unavailable", "suggested": null, "composite": null, "veto": null, "levels": [] } }
  ]
}
```

```js
// tests/bench/scoring.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRun, scoreFromFile, predictedRoute, renderResultsMd } from './scoring.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(HERE, 'fixtures/results.sample.json');

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
  test('renderResultsMd produces a report naming the accuracy and the misrouted ids', async () => {
    const { meta, rows, scored } = await scoreFromFile(SAMPLE);
    const text = renderResultsMd({ meta, rows, scored });
    assert.match(text, /4\/6/);
    assert.match(text, /S02/); assert.match(text, /S06/);
    assert.ok(!/[^\x00-\x7f]/.test(text));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/bench/scoring.test.mjs`
Expected: FAIL, `Cannot find module './scoring.mjs'`.

- [ ] **Step 3: Implement**

```js
// tests/bench/scoring.mjs
import { readFile } from 'node:fs/promises';

export function predictedRoute(m) {
  return m.outcome === 'composite' ? m.suggested : 'developer';
}

export function scoreRun(rows) {
  const pairs = rows.map((r) => ({ id: r.id, expect: r.expect, predicted: predictedRoute(r.measurement), deciding: r.measurement.outcome }));
  const acc = (list) => ({ correct: list.filter((p) => p.predicted === p.expect).length, total: list.length });
  const overall = acc(pairs);
  const byExpect = { agent: acc(pairs.filter((p) => p.expect === 'agent')), developer: acc(pairs.filter((p) => p.expect === 'developer')) };
  const classes = ['agent', 'developer'];
  const confusion = Object.fromEntries(classes.map((e) => [e, Object.fromEntries(classes.map((p) => [p, 0]))]));
  for (const p of pairs) confusion[p.expect][p.predicted]++;
  const misrouted = pairs.filter((p) => p.predicted !== p.expect);
  const dims = ['evidence', 'reach', 'contract', 'surface', 'ambiguity'];
  const dimensionSeparation = Object.fromEntries(dims.map((d) => {
    const levelsFor = (expect) => rows.filter((r) => r.expect === expect && r.measurement.levels.length)
      .map((r) => r.measurement.levels.find((l) => l.dimension === d)?.level).filter((v) => v !== undefined);
    const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    const a = mean(levelsFor('agent')), b = mean(levelsFor('developer'));
    return [d, { agentMean: a, developerMean: b, separation: a !== null && b !== null ? Math.abs(a - b) : null }];
  }));
  return { overall, byExpect, confusion, misrouted, dimensionSeparation };
}

export async function scoreFromFile(resultsPath) {
  const raw = JSON.parse(await readFile(resultsPath, 'utf8'));
  const rows = raw.rows;
  return { meta: raw.meta, rows, scored: scoreRun(rows) };
}

function pct(c, t) { return t === 0 ? 'n/a' : `${((c / t) * 100).toFixed(1)}% (${c}/${t})`; }

export function renderResultsMd({ meta, rows, scored }) {
  const L = [`# TypeSafe evaluator benchmark: results`, '', `Model: ${meta.model ?? 'n/a'}. ${meta.note ?? ''}`.trim(), '',
    `## Route accuracy`, '', `Overall: ${pct(scored.overall.correct, scored.overall.total)}`, '',
    `| expect | accuracy |`, `|---|---|`,
    `| agent | ${pct(scored.byExpect.agent.correct, scored.byExpect.agent.total)} |`,
    `| developer | ${pct(scored.byExpect.developer.correct, scored.byExpect.developer.total)} |`, '',
    `## Confusion matrix (rows = expect, cols = predicted)`, '', `| expect \\ predicted | agent | developer |`, `|---|---|---|`,
    `| agent | ${scored.confusion.agent.agent} | ${scored.confusion.agent.developer} |`,
    `| developer | ${scored.confusion.developer.agent} | ${scored.confusion.developer.developer} |`, '',
    `## Misrouted`, '', `| id | expect | predicted | deciding |`, `|---|---|---|---|`,
    ...scored.misrouted.map((m) => `| ${m.id} | ${m.expect} | ${m.predicted} | ${m.deciding} |`), '',
    `## Per-dimension separation (mean level, agent-expected vs developer-expected)`, '',
    `| dimension | agent mean | developer mean | separation |`, `|---|---|---|---|`,
    ...Object.entries(scored.dimensionSeparation).map(([d, s]) => `| ${d} | ${s.agentMean?.toFixed(2) ?? 'n/a'} | ${s.developerMean?.toFixed(2) ?? 'n/a'} | ${s.separation?.toFixed(2) ?? 'n/a'} |`),
    ''];
  return L.join('\n');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/bench/scoring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/bench/scoring.mjs tests/bench/fixtures/results.sample.json tests/bench/scoring.test.mjs
git commit -m "Add the offline benchmark scorer with a hand-built, no-network sample fixture"
```

---

### Task 3: The live harness, guarded by `CAIRN_BENCH=1` and a key

**Files:**
- Create: `tests/bench/harness.mjs`, `tests/bench/harness.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildLedgerProject` (Task 1); `scoreRun`, `renderResultsMd` (Task 2); `readLog` from `lib/records.mjs` (to read back each scenario's written `measurement` record); `bin/cairn.mjs` (spawned as a real child process, the actual CLI entry point).
- Produces: `class BenchGuardError extends Error`, `assertBenchEnabled(env) -> void` (throws `BenchGuardError` unless `env.CAIRN_BENCH === '1'` and `env.TYPESAFEAI_API_KEY` is a non-empty string), `runBenchmark({env = process.env} = {}) -> Promise<{meta, rows, scored}>` (calls `assertBenchEnabled` first, before anything else; builds the project; for each scenario, spawns `cairn measure` and reads back the resulting `measurement` record; writes `tests/bench/results.json` and `tests/bench/results.md`; returns what it wrote).

- [ ] **Step 1: Write the failing test**

```js
// tests/bench/harness.test.mjs -- this file exercises only the guard: no project is ever built, no
// child process is ever spawned, no network call is ever attempted, because assertBenchEnabled
// throws before runBenchmark does anything else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertBenchEnabled, BenchGuardError, runBenchmark } from './harness.mjs';

describe('the CAIRN_BENCH and key guard', () => {
  test('refuses with neither set', () => assert.throws(() => assertBenchEnabled({}), BenchGuardError));
  test('refuses with CAIRN_BENCH=1 but no key', () => assert.throws(() => assertBenchEnabled({ CAIRN_BENCH: '1' }), BenchGuardError));
  test('refuses with a key but CAIRN_BENCH unset or not exactly "1"', () => {
    assert.throws(() => assertBenchEnabled({ TYPESAFEAI_API_KEY: 'k' }), BenchGuardError);
    assert.throws(() => assertBenchEnabled({ CAIRN_BENCH: 'true', TYPESAFEAI_API_KEY: 'k' }), BenchGuardError);
  });
  test('passes with both set', () => assert.doesNotThrow(() => assertBenchEnabled({ CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k' })));
  test('runBenchmark refuses before building anything, spawning anything, or touching the network', async () => {
    let built = false;
    await assert.rejects(runBenchmark({ env: {} }), BenchGuardError);
    assert.equal(built, false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/bench/harness.test.mjs`
Expected: FAIL, `Cannot find module './harness.mjs'`.

- [ ] **Step 3: Implement**

```js
// tests/bench/harness.mjs
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildLedgerProject } from './build.mjs';
import { scoreRun, renderResultsMd } from './scoring.mjs';
import { readLog } from '../../lib/records.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KERNEL = join(HERE, '..', '..', 'bin', 'cairn.mjs');
const SCENARIOS = JSON.parse(await readFile(join(HERE, 'scenarios.json'), 'utf8'));

export class BenchGuardError extends Error {}

export function assertBenchEnabled(env) {
  if (env.CAIRN_BENCH !== '1') throw new BenchGuardError('cairn bench: set CAIRN_BENCH=1 to run the live benchmark (it makes real network calls)');
  if (!env.TYPESAFEAI_API_KEY || typeof env.TYPESAFEAI_API_KEY !== 'string') throw new BenchGuardError('cairn bench: TYPESAFEAI_API_KEY is not set');
}

function draftArgs(slug, sc) {
  const argv = ['--commitment', slug];
  for (const c of sc.draft.concerns) argv.push('--concern', c);
  argv.push('--question', sc.draft.question, '--recommendation', sc.draft.recommendation, '--because', sc.draft.because,
    '--if-wrong', sc.draft.if_wrong, '--instead', sc.draft.instead);
  for (const o of sc.draft.options) argv.push('--option', o);
  for (const p of sc.draft.paths) argv.push('--path', p);
  return argv;
}

export async function runBenchmark({ env = process.env } = {}) {
  assertBenchEnabled(env);
  const project = await buildLedgerProject();
  const rows = [];
  for (const sc of SCENARIOS.scenarios) {
    const before = (await readLog(project.dir)).length;
    const r = spawnSync(process.execPath, [KERNEL, 'measure', ...draftArgs(project.slug, sc)], { cwd: project.dir, encoding: 'utf8', env });
    const log = await readLog(project.dir);
    const added = log.slice(before);
    const measurement = added.find((x) => x.kind === 'measurement');
    if (!measurement) { rows.push({ id: sc.id, expect: sc.expect, category: sc.category, error: `no measurement record written (exit ${r.status}): ${r.stderr}` }); continue; }
    rows.push({ id: sc.id, expect: sc.expect, category: sc.category, measurement: measurement.payload });
  }
  const usable = rows.filter((r) => r.measurement);
  const scored = scoreRun(usable);
  const meta = { ranAt: new Date().toISOString(), model: 'jev-1.13.0', scenario_count: SCENARIOS.scenarios.length, usable_count: usable.length, project_dir: project.dir };
  await writeFile(join(HERE, 'results.json'), JSON.stringify({ meta, rows }, null, 2) + '\n');
  await writeFile(join(HERE, 'results.md'), renderResultsMd({ meta, rows: usable, scored }));
  return { meta, rows, scored };
}

// `node tests/bench/harness.mjs` runs the live benchmark directly. Node has no `import.meta.main`;
// this is the same "am I the entry module" check `scripts/release.mjs` and `scripts/cutlist.mjs`
// already use (already committed, so already proven correct on this Node version).
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBenchmark().then((r) => { console.log(`wrote tests/bench/results.md: ${r.scored.overall.correct}/${r.scored.overall.total}`); })
    .catch((e) => { console.error(e instanceof BenchGuardError ? e.message : e.stack || e.message); process.exit(1); });
}
```

Add to `package.json`: `"test": "node --test tests/*.test.mjs tests/bench/*.test.mjs"` (was `"node --test tests/*.test.mjs"`; the non-recursive glob does not otherwise reach `tests/bench/`) and `"bench": "node tests/bench/harness.mjs"`.

- [ ] **Step 4: Run to verify the guard test passes, then run the harness for real**

Run: `node --test tests/bench/harness.test.mjs`
Expected: PASS -- no network call is made by this step.

Then, separately, with a real key (not part of the automated suite, and not run by this plan-writing pass; run this when the plan is actually implemented):

Run: `CAIRN_BENCH=1 TYPESAFEAI_API_KEY=<the real key> npm run bench`
Expected: writes `tests/bench/results.json` and `tests/bench/results.md`; the printed line reports `<correct>/24` (or `/<usable_count>` if any scenario's response was lost to a transport failure the retry policy in `bin/typesafeai.mjs` could not recover, matching the honesty `.superpowers/bench/results.md`'s own data-loss note already models). Compare the reported accuracy against `.superpowers/bench/results.md`'s round-3 best cell (89.5% overall) as a sanity check, not an exact-match requirement: this run uses live model calls, `.superpowers/bench/results.md`'s own settings-shape and 0.02-probability-tolerance fixes (plan 15 Tasks 1, 7) which round 3 did not have, and the port's `recommendation := options[0]` fix (Task 1), so a close but not identical number is expected and correct.

- [ ] **Step 5: Commit**

```bash
git add tests/bench/harness.mjs tests/bench/harness.test.mjs package.json
git commit -m "Add the live benchmark harness, guarded by CAIRN_BENCH=1 and a key, running the real cairn measure CLI path"
```

Then, once the real run in Step 4 has produced `tests/bench/results.json` and `tests/bench/results.md`, commit them separately, as evidence, not as a claim this plan-writing pass itself ran them:

```bash
git add tests/bench/results.json tests/bench/results.md
git commit -m "Record a live benchmark run of the composite design against the 24-scenario ledger project"
```

---

## Spec coverage

This plan proves plans 15 and 16's implementation; it names no new spec requirement. The table maps what it measures to where that claim is made.

| Claim measured | Source | This plan's task |
|---|---|---|
| The composite design routes real drafts with usable accuracy (not the superseded design's 0 of 12 agent-expected) | `.superpowers/bench/results.md` (evidence, not spec) | 3 |
| `cairn measure` writes a current `measurement` record reachable from the real CLI path | plan 15 Task 9, plan 16 Task 5 | 1, 3 |
| The 0.02 probability-sum tolerance recovers responses the round-3 harness's 1e-6 tolerance lost | plan 15 Task 7 | 3 (the real run's own usable-count reporting) |
| `weights`, `agent_ceiling`, `confidence_floors` (not the seven old thresholds) govern a real project's settings | plan 15 Task 1 | 1 |
| Only `bin/typesafeai.mjs` performs network I/O | section 10; plan 15 (unmodified) | 3 (the harness calls no other transport) |

Left to other plans:

- Any correctness property of `measure()`, `decideConsequential`, `escalateConsequential`, or wake's exit-4 case: plans 15 and 16 own those falsifiers and their own unit tests; this plan only exercises the already-proven code against real scenarios.
- The review source (`typesafeai.enabled: false`, `cairn measure --brief`/`--file`): not benchmarked here. The 24 scenarios and `.superpowers/bench/results.md`'s evidence are all `jev`-source; a review-source benchmark, if wanted, needs a harness that can actually start a fresh subagent per scenario, which is a different kind of harness (an interactive one) than this plan's guarded, unattended `node tests/bench/harness.mjs` script, and is not built here.
- Calibration (`cairn calibrate`) over the benchmark's own runs: out of scope. The benchmark's ground truth (`expect`) is not a developer label on an actual escalation (plan 15 Task 10's calibration denominator), so feeding benchmark rows into `cairn calibrate` would not calibrate anything real; the benchmark measures route accuracy against known-good `expect` labels directly, which is a different, simpler question than calibration answers.
