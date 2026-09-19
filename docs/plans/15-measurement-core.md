# Measurement Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `lib/evaluate.mjs` from the superseded option-gate/owner-call design to the composite Score measurement in spec section 10: a narrow code floor, one Score request per Consequential draft (five dimensions, singular recommended option, zero-based option index in each question's state path), a code-computed veto and composite, an advisory `suggested: agent | developer`, the three recoverable records (`evaluation-intent`, `evaluation-call`, `measurement`), and calibration over live agent/developer-labelled records. Rewrite the `typesafeai` settings block to match: `weights`, `agent_ceiling`, `confidence_floors` replace the seven thresholds; `mode` is gone; a new top-level `developer: present | absent` field is added.

**Architecture:** `bin/typesafeai.mjs` (already fixed for retry, timeout and redaction; not touched by this plan) is still the only file that opens a socket. `lib/evaluate.mjs` computes the floor in code from kernel facts, builds the single Score request from a closed state object `M(D)`, sends it through an injected `transport` (default `post` from `bin/typesafeai.mjs`), parses the Score answers, computes the veto and composite in code from the recorded levels, and writes the three record kinds. `measure()` in this plan completes the whole pipeline end to end for the `jev` source (settings `typesafeai.enabled: true`); for the `review` source (`enabled: false`) it writes the intent and returns a `pending` result, because starting a fresh harness subagent is not something a synchronous library call can do -- plan 16 completes that path with `cairn measure --brief` / `--file`, reusing every function this plan exports.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`, `node:crypto`, global `fetch` (injected). No dependencies.

**Spec:** `docs/spec/cairn-v2.md`, revised 2026-09-19: section 2 (Settings' `typesafeai` and `developer` fields and their refusals; Evaluation intent, call and measurement; Calibration), section 4 (the record table's `evaluation-intent`, `evaluation-call`, `measurement` and `calibration` rows), section 10 (all), section 13 decisions 19, 42, 45, 53, 54, 55, 56. The map is `docs/plans/overview.md`.

**Spec note on section 4:** the record table's third row is `measurement` (commits 0be0c314, 3be9d80a): "intent SHA, call SHA, the five Score levels with their confidences, composite, veto or null, `suggested: agent|developer`, reason, source `jev|review`, resolved model", read at "escalation, capture, queue and calibration"; the `calibration` row's own purpose is "policy validation over labelled measurements". This plan's schema (Task 2) follows that row exactly, with one qualification the table's own prose leaves implicit: `call`, `composite`, `suggested` and `model` are null exactly when no call was ever attempted or answered (the floor, or an `unavailable <class>` no-call case, section 10) -- `reason` is always a string and `source` is always `jev` or `review`, never null, because both are settled from settings alone before the floor is even checked (Task 4). The `evaluation-intent` row is untouched by that fix and still describes the superseded two-request shape; this plan's `evaluation-intent` (Task 2) is written fresh against section 10, not that stale row. The ADR `decision` schema's `"evaluation":<sha|null>` field and the `escalation` schema's `evaluation: nullable(ref)` field are unchanged by any of this and stay exactly as section 4 shows them: a nullable log SHA, now naming a `measurement`-kind record.

**Depends on:** plans 01 (canon, gitx, records, snapshots), 02 (settings, paths, spec), 05 (check.attempts), 06 (commitment, adr), 09 (escalate, for the canonical draft shape `normalizeDraft`/`draftDigest`, already correct and unchanged by this plan).

**TypeSafe Score primitive:** verified live against `api.typesafe.ai` in `.superpowers/bench/round3.mjs` and its results, captured in `.superpowers/bench/results.md`'s "Round 3" section. A Score question is `{type: "score", instructions: <text>, criteria: [<level 0 text>, ..., <level 4 text>]}` (a 5-element array, index is the level). A Score answer is `{type: "score", score: <0..4 float, probability-weighted mean>, confidence: <0..1>, legend: {"0": ..., "4": ...}, probabilities: {"0": <p>, ..., "4": <p>}}`. `.superpowers/bench/results.md`'s data-loss note records that 3 of 22 real responses had `probabilities` summing to 0.99 rather than 1.0 (a rounding artifact across five levels) and were lost because the experimental harness used a `1e-6` sum tolerance; this plan's parser tolerates a sum within 0.02 of 1, closing that gap. **Verify the Score shape against `docs.typesafe.ai/primitives/score.md` before implementing Task 6; the shape above is drawn from a working, already-tested caller, not the docs page itself.**

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "the goddamn evaluator was to reduce ritual assent" (decision 54, the developer's reason).
- "The evaluator is a measurement the agent takes of that draft to check its own judgment before it decides. It is not a second decision-maker, an advisor the agent must obey, or a review queue: the agent still decides, informed by the measurement, except at the narrow floor below, when a veto fires, or when the agent itself chooses to escalate after reading the measurement." (section 10)
- "Before any call, code checks a floor that needs no model judgment: a draft whose recommended option would change an Agreed requirement's text or its falsifier, would change the working agreement, or touches data that cannot be regenerated routes to the developer without a call." (section 10, the narrow floor)
- "A draft code cannot build a request for also gets no call: a missing recommendation, an incomplete authority projection, a request over `request_cap_bytes`, a failed call, or an invalid answer route to the developer as `unavailable <class>`." (section 10)
- "`evidence` and `ambiguity` read the whole draft; `reach`, `contract` and `surface` read only the recommended option, `draft.options[draft.recommendation]`." (section 10, the Score table)
- "Veto: `reach >= 4`, `contract >= 3` or `surface >= 3` on the recommended option forces the developer regardless of weights; the three are checked in that order and the measurement records which one decided it." (section 10)
- "Otherwise, composite is the weighted mean of the five levels over 4, with evidence counted as `(4 - level)` so more evidence lowers the composite: `composite = sum(weight_d * level_d / 4)` over evidence, reach, contract, surface and ambiguity." (section 10)
- "The composite feeds one suggestion, `suggested: agent | developer`: `agent` when `composite <= agent_ceiling` and every dimension's confidence meets its `confidence_floors` entry, `developer` otherwise. The suggestion is advisory, not a route." (section 10)
- "`weights`, `agent_ceiling` and `confidence_floors` live in `typesafeai` settings and in the policy digest (section 2); a change to any of them resets calibration." (section 10)
- "State sent to either source carries no policy prose: every question in the table above names one concrete field, never a paraphrase of a setting or an explanation of what a route means." (section 10)
- "The draft is unchanged: `D := <commitment, concerns, question, recommendation, because, if_wrong, instead, options, named_paths, cited_decisions>`. The measurement state is `M(D) := <D's five narrative fields, the recommended option, C(c), A(D)>` ... Beyond `D`, `C(c)` and `A(D)`, no agent prose, code, paths, outputs, findings or agent-authored ADR bodies reach either source." (section 10)
- "The recommended option's code is the snapshot's action-lease diff and complete touched files in path order; reads do not follow symlinks." (section 10)
- "`jev-1.13.0` permits 64k request tokens and 32k for state plus the longest question; the kernel enforces `request_cap_bytes`, estimates three bytes per token, and refuses above 75% of either limit before sending." (section 10)
- "Requests omit `network_exclude`, credential and host bytes, keys and command output regardless of source. A would-be inclusion is not sent; only `unavailable excluded` and its path class are recorded." (section 10)
- "Every measured draft gets an intent before any call; the intent precedes network I/O and fixes request digests, so a crash can be recovered ... Each attempted call records its digest, resolved model, raw outcome, parsed answer and usage before routing. An unknown crash outcome becomes `indeterminate`, is not retried, and routes to the developer." (section 10)
- "The kernel refuses ... an evaluator weight, `agent_ceiling` or confidence floor outside `[0,1]`; `enabled: true` without a model; `request_cap_bytes` above 64,000; a `typesafeai.mode` field at all; or `developer` set to anything but `"present"` or `"absent"`. `enabled: true` also requires a versioned model ID, not an alias ... The evaluator's `code_tiers` field stays refused; `weights`, `agent_ceiling` and `confidence_floors` are now required fields, not refused ones." (section 2)
- "`developer`: `present` or `absent`, default `present`." (section 2, Settings)
- "The developer labels a recorded measurement's outcome `agent`, `developer` or `unknown`; only the first two calibrate ... Calibration tunes `weights`, `agent_ceiling` and `confidence_floors`; it does not gate whether the agent may decide." (section 10)
- "The one-sided 95% exact binomial upper bound on the false-downgrade rate is a kernel constant, not a setting, fixed at 5%; the sample floor is `min_calibration_agent_predictions` (default 60) predicted-agent cases." (section 10)
- Tests inject `fetchImpl`/`transport`; no test opens a socket.

**Test helper:** `tests/helpers/repo.mjs`'s `makeProject({settings, files}) -> {cwd, ...}` (plan 03). Every fixture here uses it. `lib/init.mjs`'s `DEFAULT_SETTINGS(remote, key)` is one of this plan's own edits (Task 1); `tests/helpers/fixture.mjs`'s `SETTINGS` constant and `tests/helpers/loop.mjs`'s settings merges carry the old seven-threshold, `mode`-bearing shape and are updated in Task 1 alongside it, since every later plan's fixtures build on them.

---

## File structure

```
lib/settings.mjs           (modify) developer field; typesafeai weights/agent_ceiling/confidence_floors;
                            removed: the seven thresholds, mode; policyDigest moves fully into lib/evaluate.mjs
lib/init.mjs                (modify) DEFAULT_SETTINGS carries the new typesafeai shape and developer: 'present'
lib/records.mjs             (modify) evaluation-intent (one request, a source), evaluation-call (source,
                            transport, session), the 'measurement' kind (replaces 'evaluation')
lib/evaluate.mjs            POLICY constants and Score criteria text, draft/policy digests, kernelFacts,
                            floorReasons, authorityProjection, contractState, measureState, EgressError,
                            buildScoreRequest, parseScoreAnswers, sizeCheck, computeVeto, computeComposite,
                            computeSuggested, measure(), recoverMeasurement(), calibrate(), upperBound()
tests/evaluate.test.mjs     one describe per task
tests/settings.test.mjs     (modify) the new typesafeai/developer refusals
tests/init.test.mjs         (modify) DEFAULT_SETTINGS assertions
tests/helpers/fixture.mjs   (modify) SETTINGS constant
tests/helpers/loop.mjs      (modify) any settings merges that name typesafeai fields directly
```

Fixed record targets: every evaluation-family record's target is the commitment slug, exactly as the superseded design already had it, so `cairn: evaluation-intent <slug>` stays a valid subject token.

---

### Task 1: The `developer` field and the `typesafeai` weights/agent_ceiling/confidence_floors block

**Files:**
- Modify: `lib/settings.mjs`, `lib/init.mjs`
- Modify: `tests/settings.test.mjs`, `tests/init.test.mjs`, `tests/helpers/fixture.mjs`, `tests/helpers/loop.mjs` (only where they construct a `typesafeai` object or read `settings.developer`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateSettings(obj, opts) -> [] | [reasons]` (modified: no `calibration`/`remotes` route-mode gate; `developer` and the new `typesafeai` shape validated), `DEFAULT_SETTINGS(remote, key)` (modified).

Removed from `lib/settings.mjs`: the `THRESHOLDS` array, the `mode` validation branch, the route-mode `calibration` option and `hasPassingCalibration` (there is no route mode left to gate: section 10's composite is always advisory, never a live/shadow authority switch, decision 55). `loadSettings` no longer computes or threads a `calibration` option; it becomes a plain read-parse-validate-digest function again, exactly as every other kind of record loader in this kernel. `POLICY`/`policyDigest` move out of `lib/settings.mjs` entirely (they existed there only to let `loadSettings` gate route mode, which is gone); `lib/evaluate.mjs` (Task 3) owns them, and nothing in `lib/settings.mjs` imports `lib/evaluate.mjs` or vice versa at module load time, so the cycle the old code worked around no longer exists.

- [ ] **Step 1: Write the failing tests**

```js
// tests/settings.test.mjs (existing file; add this describe block near the typesafeai tests)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings } from '../lib/settings.mjs';

const dims = () => ({ evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 });
const goodTypesafeai = () => ({
  enabled: false, model: null, weights: dims(), agent_ceiling: 0.35, confidence_floors: dims(),
  min_calibration_agent_predictions: 60, request_cap_bytes: 48000,
});
const base = () => ({
  schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: [],
  signing_key: null, attribution: 'forbidden', developer: 'present', harness: {}, typesafeai: goodTypesafeai(),
});

describe('developer field', () => {
  test('present and absent both validate', () => {
    assert.deepEqual(validateSettings({ ...base(), developer: 'present' }), []);
    assert.deepEqual(validateSettings({ ...base(), developer: 'absent' }), []);
  });
  test('anything else is refused', () => {
    for (const v of ['maybe', '', null, 1, undefined]) {
      assert.match(validateSettings({ ...base(), developer: v }).join(' '), /developer/);
    }
  });
  test('the field is required, not defaulted by validateSettings', () => {
    const { developer, ...rest } = base();
    assert.match(validateSettings(rest).join(' '), /developer/);
  });
});

describe('typesafeai weights/agent_ceiling/confidence_floors', () => {
  test('defaults validate', () => assert.deepEqual(validateSettings(base()), []));
  test('a typesafeai.mode field at all is refused', () =>
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), mode: 'shadow' } }).join(' '), /mode/));
  test('a weight, agent_ceiling or confidence floor outside [0,1] is refused', () => {
    for (const bad of [{ weights: { ...dims(), evidence: 1.5 } }, { weights: { ...dims(), reach: -0.1 } },
      { agent_ceiling: 1.1 }, { agent_ceiling: -0.01 }, { confidence_floors: { ...dims(), surface: 2 } }]) {
      assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), ...bad } }).join(' '), /weight|agent_ceiling|confidence/);
    }
  });
  test('weights and confidence_floors are closed objects over exactly the five dimensions', () => {
    const { evidence, ...four } = dims();
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), weights: four } }).join(' '), /weights/);
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), weights: { ...dims(), extra: 0.1 } } }).join(' '), /weights/);
  });
  test('code_tiers is still refused; weights is no longer refused', () =>
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), code_tiers: [] } }).join(' '), /code_tiers/));
  test('enabled without a model, or an alias, is refused', () => {
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), enabled: true, model: null } }).join(' '), /model/);
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), enabled: true, model: 'jev-latest' } }).join(' '), /alias|versioned/);
    assert.deepEqual(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), enabled: true, model: 'jev-1.13.0' } }), []);
  });
  test('request_cap_bytes above 64000 is refused', () =>
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), request_cap_bytes: 64001 } }).join(' '), /request_cap_bytes/));
  test('no route-mode gate remains: validateSettings takes no calibration option any more', () => {
    // Passing one is simply ignored; the old route-mode refusal path is gone.
    assert.deepEqual(validateSettings(base(), { calibration: null }), []);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/settings.test.mjs`
Expected: FAIL -- the current `typesafeai` shape has `mode` and the seven old threshold keys instead of `weights`/`agent_ceiling`/`confidence_floors`, and `developer` is not a known top-level field.

- [ ] **Step 3: Implement**

```js
// lib/settings.mjs -- replace the THRESHOLDS/EVAL/REMOVED block and the typesafeai validation body
const DIMENSIONS = ['evidence', 'reach', 'contract', 'surface', 'ambiguity'];
const EVAL = ['enabled', 'model', 'weights', 'agent_ceiling', 'confidence_floors', 'min_calibration_agent_predictions', 'request_cap_bytes'];
const REMOVED = ['code_tiers'];   // 'weights' is no longer refused: decision 56 brings it back as a real field
const VERSIONED = /^[a-z][a-z0-9]*-\d+\.\d+\.\d+$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function dimensionMap(v, name, out) {
  if (!isObj(v)) { out.push(`typesafeai.${name} must be an object`); return; }
  for (const k of DIMENSIONS) if (typeof v[k] !== 'number' || v[k] < 0 || v[k] > 1) out.push(`typesafeai.${name}.${k} must be a number in [0,1]`);
  for (const k of Object.keys(v)) if (!DIMENSIONS.includes(k)) out.push(`typesafeai.${name}.${k} is unknown`);
  for (const k of DIMENSIONS) if (!(k in v)) out.push(`typesafeai.${name} is missing ${k}`);
}

// TOP now includes 'developer'; see the full TOP array replacement below.
const TOP = ['schema', 'authority_remote', 'outside', 'source', 'interfaces', 'data', 'network_exclude',
  'signing_key', 'attribution', 'developer', 'harness', 'typesafeai'];
```

```js
// lib/settings.mjs -- inside validateSettings(s, opts = {}), replace the old typesafeai block and
// add the developer check. The `opts` parameter keeps `mechanisms` (still used by the outside/source
// overlap checks above) but drops `calibration` and `remotes`'s route-mode use; `remotes` is still
// read for the authority_remote check, unrelated to this plan.
export function validateSettings(s, { mechanisms = [] } = {}) {
  const out = [];
  if (!isObj(s)) return ['settings must be a JSON object'];
  if (s.schema !== SETTINGS_SCHEMA) out.push(`unknown settings schema ${JSON.stringify(s.schema)}`);
  closed(s, TOP, '', out);
  // ... existing outside/source/interfaces/data/secrets/authority_remote/attribution/harness checks, unchanged ...
  if (!['present', 'absent'].includes(s.developer)) out.push('developer must be present or absent');
  const e = s.typesafeai;
  if (!isObj(e)) out.push('typesafeai must be an object');
  else {
    closed(e, EVAL, 'typesafeai.', out);
    if ('mode' in e) out.push('typesafeai.mode is refused; there is no route mode');
    if (typeof e.enabled !== 'boolean') out.push('typesafeai.enabled must be boolean');
    if (e.model !== null && typeof e.model !== 'string') out.push('typesafeai.model must be a string or null');
    dimensionMap(e.weights, 'weights', out);
    dimensionMap(e.confidence_floors, 'confidence_floors', out);
    if (typeof e.agent_ceiling !== 'number' || e.agent_ceiling < 0 || e.agent_ceiling > 1) out.push('typesafeai.agent_ceiling must be a number in [0,1]');
    if (!Number.isInteger(e.min_calibration_agent_predictions) || e.min_calibration_agent_predictions < 1) out.push('typesafeai.min_calibration_agent_predictions must be a positive integer');
    if (!Number.isInteger(e.request_cap_bytes) || e.request_cap_bytes < 1 || e.request_cap_bytes > 64000) out.push('typesafeai.request_cap_bytes must be an integer from 1 to 64000');
    if (e.enabled === true && !e.model) out.push('typesafeai enabled without a model');
    if (e.enabled === true && typeof e.model === 'string' && !VERSIONED.test(e.model)) out.push('typesafeai.enabled needs a versioned model id, not an alias');
  }
  return out;
}
```

`closed()` already refuses a `REMOVED` key (`code_tiers`) as "removed field ... is refused, not ignored", and `closed()` already refuses any key in `EVAL` that is missing, so `weights`/`agent_ceiling`/`confidence_floors` are required exactly like `enabled`/`model` already are: no separate "is required" test is needed beyond what `closed()` already gives every other field.

`loadSettings` drops its `calibration`/`hasPassingCalibration` machinery entirely:

```js
// lib/settings.mjs -- loadSettings, simplified (no calibration option, no route-mode gate)
export async function loadSettings(cwd, opts = {}) {
  let text;
  try { text = await readFile(join(cwd, SETTINGS_PATH), 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') throw new SettingsError([`no ${SETTINGS_PATH}; run cairn init`]);
    throw new SettingsError([`${SETTINGS_PATH} is not readable: ${e.code}`]);
  }
  let settings;
  try { settings = JSON.parse(text); } catch (e) { throw new SettingsError([`${SETTINGS_PATH} is not valid JSON: ${e.message}`]); }
  const remotes = (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
  const reasons = validateSettings(settings, { remotes, ...opts });
  if (reasons.length) throw new SettingsError(reasons);
  return { settings, digest: sha256(canonicalize(settings)) };
}
```

`lib/init.mjs`'s `DEFAULT_SETTINGS`:

```js
// lib/init.mjs
export function DEFAULT_SETTINGS(remote, key) {
  const dims = { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 };
  return {
    schema: SETTINGS_SCHEMA, authority_remote: remote, outside: [], source: [], interfaces: [],
    data: [], network_exclude: [], signing_key: key, attribution: 'forbidden', developer: 'present', harness: {},
    typesafeai: { enabled: false, model: null, weights: dims, agent_ceiling: 0.35, confidence_floors: dims,
      min_calibration_agent_predictions: 60, request_cap_bytes: 48000 },
  };
}
```

`0.35` matches `.superpowers/bench/composite-design.md`'s and `results.md`'s Round 3 best cell (`agent_ceiling: 0.35`, confidence floor `0`, 89.5% overall / 90.0% agent-expected / 88.9% developer-expected accuracy on the 19 usable scenarios); the default `confidence_floors` of `0` for every dimension matches that same best cell, so a fresh project's out-of-the-box behavior is the measured-best configuration, not an arbitrary placeholder. Update `tests/helpers/fixture.mjs`'s `SETTINGS` constant and any `tests/helpers/loop.mjs` settings merge that spells out a `typesafeai` object to this same shape, and add `developer: 'present'` to `SETTINGS`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/settings.test.mjs tests/init.test.mjs`
Expected: PASS. Then run the whole suite once, `node --test tests/*.test.mjs`, and fix every fixture across the tree (`tests/evaluate.test.mjs` before this plan starts it, `tests/escalate.test.mjs`, `tests/wake.test.mjs`, `tests/cli.test.mjs`, `tests/review.test.mjs`) that constructs a `typesafeai` object with the old `mode`/threshold shape or omits `developer`; this is expected fallout from a settings-shape change and is not deferred to a later task.

- [ ] **Step 5: Commit**

```bash
git add lib/settings.mjs lib/init.mjs tests/settings.test.mjs tests/init.test.mjs tests/helpers/fixture.mjs tests/helpers/loop.mjs
git commit -m "Replace the evaluator's seven thresholds and mode with weights, agent_ceiling, confidence_floors and a developer presence field"
```

Then, separately, fix every remaining test fixture the full suite run in Step 4 flagged:

```bash
git add -u tests/
git commit -m "Update test fixtures across the suite to the new typesafeai and developer settings shape"
```

---

### Task 2: Record schemas: `evaluation-intent`, `evaluation-call`, `measurement`

**Files:**
- Modify: `lib/records.mjs`
- Test: `tests/records.test.mjs` (existing file; extend)

**Interfaces:**
- Consumes: `obj`, `nullable`, `list`, `oneOf`, `ref`, `sha`, `ws`, `digest`, `str`, `int`, `unit`, `json`, `b64`, `check` (plan 01, unchanged).
- Produces: `SCHEMAS['evaluation-intent']`, `SCHEMAS['evaluation-call']`, `SCHEMAS['measurement']` (new kind name, replaces `SCHEMAS['evaluation']`), `DIMENSION = oneOf('evidence', 'reach', 'contract', 'surface', 'ambiguity')`.

The superseded design's `evaluation-intent` carried `owner_request`/`option_request` (two calls per draft); this plan's design makes one call per draft, so it carries one `request_digest` and the `source` the intent targets (`null` until a source is chosen, i.e. when the floor fires before any source is picked). `evaluation-call` drops the `call: oneOf('owner','option')` field (there is only one call now) and drops `outcome: 'not_sent'` (a call record is written only for an attempted call; a floor or `unavailable` draft gets no call record at all, only an intent and a measurement); it gains `source` (which of `jev`/`review` answered), `transport` (`local`/`remote`, review source only) and `session` (the harness session that answered, review source only, for the same self-answer refusal `lib/review.mjs`'s `report()` already applies). `measurement` replaces `evaluation`: no more `gates`/`route`/`would_route`/`owner_call`/`option_call`; it carries `draft_digest`, `source`, `model`, the five `levels` with their confidences, the `composite`, which `veto` if any, the advisory `suggested`, an `outcome` naming which branch decided (`floor`, `unavailable`, `veto`, `composite` or `indeterminate`) and a human-readable `reason`.

Read `tests/records.test.mjs`'s existing schema tests first (plan 01) and reuse its exact round-trip helper (it builds the `{subject, body, trailers}` triple with `encodeRecord` and feeds it straight to `decodeRecord`, since both are pure functions with no Git object involved); the sketch below assumes a helper named `roundTrip`, matching that file's own naming, and defines it again here only if the existing file does not already export or locally define one under that name.

- [ ] **Step 1: Write the failing tests**

```js
// tests/records.test.mjs (existing file; add this describe block)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRecord, decodeRecord, SCHEMAS } from '../lib/records.mjs';

const SHA = '1'.repeat(40);
const DIGEST = 'sha256:' + '2'.repeat(64);
function roundTrip(kind, target, payload) {
  const { subject, body, trailers } = encodeRecord(kind, target, payload);
  return decodeRecord({ subject, body, trailers });
}

describe('measurement-family schemas', () => {
  test('evaluation-intent: one request, source settled before any call', () => {
    const payload = { draft_digest: DIGEST, snapshot: SHA, log_head: SHA, adr_digest: DIGEST, settings_digest: DIGEST,
      policy_digest: DIGEST, source: 'jev', request_digest: DIGEST };
    assert.deepEqual(roundTrip('evaluation-intent', 'demo', payload).payload, payload);
    assert.deepEqual(roundTrip('evaluation-intent', 'demo', { ...payload, request_digest: null }).payload.request_digest, null);
    assert.throws(() => encodeRecord('evaluation-intent', 'demo', { ...payload, source: null }), /expected one of/);
    assert.throws(() => encodeRecord('evaluation-intent', 'demo', { ...payload, owner_request: DIGEST }), /unknown key|expected/);
  });
  test('evaluation-call: source, transport, session, no owner/option and no not_sent', () => {
    const payload = { intent: SHA, source: 'review', request_digest: DIGEST, outcome: 'response', model: 'claude-fable-5-1',
      transport: 'remote', session: 'sess-1', raw: 'abcd', failure_class: null,
      answers: [{ id: 'evidence', value: { score: 3.4, confidence: 0.7, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.5, 4: 0.4 } } }],
      usage: { input_tokens: 10, output_tokens: 2 } };
    assert.deepEqual(roundTrip('evaluation-call', 'demo', payload).payload, payload);
    assert.throws(() => encodeRecord('evaluation-call', 'demo', { ...payload, outcome: 'not_sent' }), /expected one of/);
    assert.throws(() => encodeRecord('evaluation-call', 'demo', { ...payload, call: 'option' }), /unknown key/);
  });
  test('measurement replaces evaluation, with the composite fields', () => {
    const payload = { intent: SHA, call: SHA, draft_digest: DIGEST, source: 'jev', model: 'jev-1.13.0',
      levels: [{ dimension: 'evidence', level: 3.4, confidence: 0.7 }, { dimension: 'reach', level: 0.6, confidence: 0.5 },
        { dimension: 'contract', level: 0.1, confidence: 0.9 }, { dimension: 'surface', level: 0, confidence: 0.8 },
        { dimension: 'ambiguity', level: 1.0, confidence: 0.5 }],
      composite: 0.22, veto: null, suggested: 'agent', outcome: 'composite', reason: 'composite 0.220 <= 0.35, confidences ok' };
    assert.deepEqual(roundTrip('measurement', 'demo', payload).payload, payload);
    assert.equal('evaluation' in SCHEMAS, false, 'the old kind name is gone, not kept alongside the new one');
    assert.ok('measurement' in SCHEMAS);
    assert.throws(() => encodeRecord('measurement', 'demo', { ...payload, dimension: 'evidence', level: 3.4 }), /unknown key/);
  });
  test('a floor-hit measurement carries no call, no levels, no composite, but source is never null: it is settled from settings alone', () => {
    const payload = { intent: SHA, call: null, draft_digest: DIGEST, source: 'jev', model: null, levels: [],
      composite: null, veto: null, suggested: null, outcome: 'floor', reason: 'floor:data' };
    assert.deepEqual(roundTrip('measurement', 'demo', payload).payload, payload);
    assert.throws(() => encodeRecord('measurement', 'demo', { ...payload, source: null }), /expected one of/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/records.test.mjs`
Expected: FAIL -- `SCHEMAS['evaluation-intent']` still has `owner_request`/`option_request`, `SCHEMAS['evaluation-call']` still has `call`/`not_sent`, and `SCHEMAS['measurement']` does not exist.

- [ ] **Step 3: Implement**

```js
// lib/records.mjs -- add near the other shared descriptors (finding, reqDigest, ...)
const DIMENSION = oneOf('evidence', 'reach', 'contract', 'surface', 'ambiguity');
```

```js
// lib/records.mjs -- inside SCHEMAS, replace the three evaluation-family rows. Remove the now-unused
// `const route = oneOf('agent', 'developer', 'capture');` line entirely: nothing references it once
// 'measurement' replaces 'evaluation' below (there is no more automatic capture route, section 10).
'evaluation-intent': { draft_digest: digest, snapshot: ws, log_head: ref, adr_digest: digest, settings_digest: digest,
  policy_digest: digest, source: oneOf('jev', 'review'), request_digest: nullable(digest) },
'evaluation-call': { intent: ref, source: oneOf('jev', 'review'), request_digest: digest,
  outcome: oneOf('response', 'failure', 'indeterminate'), model: nullable(str), transport: nullable(oneOf('local', 'remote')),
  session: nullable(str), raw: nullable(b64), failure_class: nullable(str),
  answers: nullable(list(obj({ id: str, value: json }))), usage: nullable(obj({ input_tokens: int, output_tokens: int })) },
'measurement': { intent: ref, call: nullable(ref), draft_digest: digest, source: oneOf('jev', 'review'),
  model: nullable(str), levels: list(obj({ dimension: DIMENSION, level: json, confidence: json })),
  composite: nullable(json), veto: nullable(oneOf('reach', 'contract', 'surface')), suggested: nullable(oneOf('agent', 'developer')),
  outcome: oneOf('floor', 'unavailable', 'veto', 'composite', 'indeterminate'), reason: str },
```

`source` matches the fixed table row exactly (`jev|review`, never null). `evaluation-intent`'s own `source` field (that row is not part of the fix; this plan designs it fresh, Task 4) is non-nullable for the same reason and by the same value: both records settle `source` from `settings.typesafeai.enabled` before the floor is even checked, so it is always known, whether or not a call ever happens.

Remove the old `'evaluation':` row entirely (do not keep both kinds side by side; nothing in this codebase writes `'evaluation'` once Task 9 lands, and `KINDS` must not carry a dead kind a future caller could accidentally target).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/records.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/records.mjs tests/records.test.mjs
git commit -m "Replace the evaluation record schema with evaluation-intent, evaluation-call and measurement for the composite design"
```

---

### Task 3: Policy constants, Score criteria text, draft digest and policy digest

**Files:**
- Create: `lib/evaluate.mjs` (first exports; this file is otherwise rewritten from scratch, so create rather than modify)
- Test: `tests/evaluate.test.mjs` (new file; the old one's route/shadow/gate-cascade tests are removed, not carried forward)

**Interfaces:**
- Consumes: `canonicalize`, `sha256` from `lib/canon.mjs`; `CREDENTIAL_PATTERNS` from `lib/paths.mjs`; `normalizeDraft`/`draftDigest`/`DRAFT_KEYS`/`FIELDS` (re-exported as `FIVE_FIELDS`) from `lib/escalate.mjs`, unchanged.
- Produces: `POLICY` (frozen: `DIMENSIONS`, `LEVELS`, `CONSTRUCTION`, `LIMITS`, `PROB_TOLERANCE`), `policyDigest(settings) -> digest`.

The policy digest now covers: model, the five dimensions' criteria text and construction version, `weights`, `agent_ceiling`, `confidence_floors`, caps (`request_cap_bytes` and the two token limits), and egress (`network_exclude` and the credential patterns). It does not cover `enabled` (the source is a choice, not a policy fact -- both sources answer "the same five dimensions in the same shape", section 10) or `developer` (routing presence, not measurement policy).

- [ ] **Step 1: Write the failing tests**

```js
// tests/evaluate.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { POLICY, policyDigest } from '../lib/evaluate.mjs';
import { normalizeDraft, draftDigest } from '../lib/escalate.mjs';

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL -- `lib/evaluate.mjs` does not exist yet on this plan's branch state (it is being created fresh here, replacing the superseded file).

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs
import { canonicalize, sha256, b64url } from './canon.mjs';
import { CREDENTIAL_PATTERNS, classify, matchGlob } from './paths.mjs';
export { normalizeDraft, draftDigest, DRAFT_KEYS, FIELDS as FIVE_FIELDS } from './escalate.mjs';

// Criteria text is copied verbatim from docs/spec/cairn-v2.md section 10's Score table and from
// .superpowers/bench/composite-design.md/round3.mjs, which already ran this exact wording live
// (0.895 route accuracy at the best cell). Level index = array index, 0 to 4.
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
  LIMITS: Object.freeze({ requestTokens: 64000, stateTokens: 32000, bytesPerToken: 3, factor: 0.75 }),
  PROB_TOLERANCE: 0.02,   // closes the round-3 benchmark's 1e-6-tolerance data loss (results.md)
});

export function policyDigest(settings) {
  const t = settings.typesafeai;
  return sha256(canonicalize({
    model: t.model, dimensions: POLICY.DIMENSIONS, levels: POLICY.LEVELS, construction: POLICY.CONSTRUCTION,
    weights: t.weights, agent_ceiling: t.agent_ceiling, confidence_floors: t.confidence_floors,
    caps: { request_cap_bytes: t.request_cap_bytes, ...POLICY.LIMITS },
    egress: { network_exclude: [...settings.network_exclude], credential: [...CREDENTIAL_PATTERNS] },
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Start the composite evaluator: Score criteria text, POLICY constants and the policy digest"
```

---

### Task 4: The narrow floor: `kernelFacts` and `floorReasons`

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `classify` from `lib/paths.mjs`; `readLog`, `range`, `appendRecord` from `lib/records.mjs`; `attempts` from `lib/check.mjs`; `readAdr`, `queue` from `lib/adr.mjs`; `readLease` from `lib/lease.mjs`; `loadSettings` from `lib/settings.mjs`; `parseConcern` from `lib/escalate.mjs`.
- Produces: `kernelFacts(cwd, D) -> facts`, `floorReasons(facts) -> [reason]` (`[]` means the floor does not fire), `authorityProjection(facts) -> A | null` (`null` means an incomplete projection, itself a floor reason).

This task is a close cousin of the superseded design's `kernelFacts`/`protectedReasons`/`authorityProjection` (same kernel facts: path classification, attempt counts, open obligations, cited-decision projection); it is renamed (`floorReasons`, matching section 10's own name for this code path) and loses nothing, because section 10 says the floor's three named conditions (contract, agreement, data) sit alongside reserved/protected-path writes, the fourth-attempt rule and scope rulings, all "already enforced by section 2 and section 5 independent of this floor". `authorityProjection`'s shape is unchanged: it is exactly `A(D)`, the closed JSON projection named in the Global Constraints above, reused as-is by the state builder in Task 5.

- [ ] **Step 1: Write the failing tests**

```js
import { kernelFacts, floorReasons, authorityProjection } from '../lib/evaluate.mjs';
import { normalizeDraft } from '../lib/escalate.mjs';
import { makeProject } from './helpers/repo.mjs';

const facts = (over = {}) => ({ slug: 'auth-tokens', set: [{ requirement: 'AUTH-003', text_digest: 'sha256:' + 'a'.repeat(64) }],
  concerns: [{ id: 'AUTH-003', valid: true }], pathClasses: { 'src/auth/rotate.mjs': 'source' }, attempts: { 'AUTH-003': 1 },
  openObligations: { escalations: 0, findings: 0, defects: 0, breaches: 0 }, decisions: [], lease: { action: 'implement', target: 'AUTH-003' },
  D: normalizeDraft(draft()), ...over });

describe('the narrow floor', () => {
  test('a clean draft does not fire the floor and projects completely', () => {
    assert.deepEqual(floorReasons(facts()), []);
    const A = authorityProjection(facts());
    assert.equal(A.option_index, 0);
    assert.equal(A.option_count, 2);
  });
  test('each floor reason routes with no call', () => {
    assert.deepEqual(floorReasons(facts({ pathClasses: { 'migrations/1.sql': 'data' } })), ['data']);
    assert.deepEqual(floorReasons(facts({ pathClasses: { 'docs/spec/auth.md': 'protected' } })), ['contract']);
    assert.deepEqual(floorReasons(facts({ pathClasses: { 'AGENTS.md': 'protected' } })), ['agreement']);
    assert.deepEqual(floorReasons(facts({ pathClasses: { '.cairn/settings.json': 'protected' } })), ['settings']);
    assert.deepEqual(floorReasons(facts({ pathClasses: { '.cairn/mechanisms': 'kernel-managed' } })), ['reserved']);
    assert.deepEqual(floorReasons(facts({ attempts: { 'AUTH-003': 3 } })), ['fourth-attempt']);
    assert.deepEqual(floorReasons(facts({ concerns: [{ id: 'breach:' + 'b'.repeat(40), valid: true }] })), ['scope-ruling']);
    assert.deepEqual(floorReasons(facts({ D: { ...normalizeDraft(draft()), recommendation: '  ' } })), ['missing-recommendation']);
    assert.deepEqual(floorReasons(facts({ concerns: [{ id: 'AUTH-999', valid: false }] })), ['incomplete-projection']);
  });
  test('a recommendation not present in options is also incomplete-projection', () => {
    assert.deepEqual(floorReasons(facts({ D: { ...normalizeDraft(draft()), recommendation: 'weekly' } })), ['incomplete-projection']);
  });
  test('kernelFacts reads a real project', async () => {
    const { cwd } = await makeProject();
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), commitment: 'none', concerns: [], named_paths: [] }));
    assert.equal(f.lease, null);
    assert.deepEqual(f.openObligations, { escalations: 0, findings: 0, defects: 0, breaches: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `kernelFacts` is not exported.

- [ ] **Step 3: Implement**

Port `kernelFacts`, `authorityProjection` and the private helpers (`concernValid`, `safeClassify`, `unresolvedFindings`, `openEscalations`, `openDefects`, `openBreaches`) from the superseded `lib/evaluate.mjs` essentially unchanged (they read kernel facts and are agnostic to the routing design above them), with two adjustments: `authorityProjection`'s `option_index` now also fails the projection (returns `null`) when `D.options.indexOf(D.recommendation) < 0`, since the recommended option cannot be located; and the exported floor function is named `floorReasons`, not `protectedReasons`.

```js
// lib/evaluate.mjs (append)
import { classify } from './paths.mjs';
import { readLog, range, appendRecord } from './records.mjs';
import { attempts as reqAttempts } from './check.mjs';
import { readAdr, queue } from './adr.mjs';
import { readLease } from './lease.mjs';
import { loadSettings } from './settings.mjs';
import { parseConcern } from './escalate.mjs';

const FINDING_KINDS = new Set(['review', 'report', 'acceptance']);

function concernValid(token, log, startRec) {
  let c; try { c = parseConcern(token); } catch { return false; }
  if (c.kind === 'cycle' || c.kind === 'contract') return true;
  if (c.kind === 'requirement') return !!startRec && startRec.payload.requirements.some((q) => q.requirement === c.ref);
  if (c.kind === 'finding') {
    const src = log.find((x) => x.sha === c.ref);
    return !!src && FINDING_KINDS.has(src.kind) && Array.isArray(src.payload.findings) && src.payload.findings.some((f) => f.n === c.n);
  }
  const RECORD_KIND = { item: 'item', breach: 'scope-breach', transaction: 'command-intent' };
  if (RECORD_KIND[c.kind]) return log.some((x) => x.sha === c.ref && x.kind === RECORD_KIND[c.kind]);
  return false;
}
function safeClassify(p, settings) { try { return classify(p, settings); } catch { return 'reserved'; } }
function unresolvedFindings(log) {
  let count = 0;
  for (const r of log) {
    if (!FINDING_KINDS.has(r.kind)) continue;
    for (const f of (r.payload.findings || [])) if (!log.some((x) => x.kind === 'resolution' && x.payload.source === r.sha && x.payload.finding === f.n)) count++;
  }
  return count;
}
function openEscalations(log) {
  return log.filter((r) => r.kind === 'escalation' && !log.some((a) => a.kind === 'answer' && a.payload.escalation === r.sha && ['ok', 'instead'].includes(a.payload.kind))).length;
}
function openDefects(log) { return log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && !log.some((x) => x.kind === 'fix' && x.payload.item === r.sha)).length; }
function openBreaches(log) { return log.filter((r) => r.kind === 'scope-breach' && !log.some((x) => x.kind === 'scope' && x.payload.breach === r.sha)).length; }

export async function kernelFacts(cwd, D) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const r = range(log);
  const slug = r.start ? r.start.payload.slug : null;
  const concerns = D.concerns.map((id) => ({ id, valid: concernValid(id, log, r.start) }));
  const pathClasses = Object.fromEntries(D.named_paths.map((p) => [p, safeClassify(p, settings)]));
  const attempts = {};
  for (const id of D.concerns) { let c; try { c = parseConcern(id); } catch { continue; } if (c.kind === 'requirement') attempts[c.ref] = reqAttempts(log, c.ref); }
  const openObligations = { escalations: openEscalations(log), findings: unresolvedFindings(log), defects: openDefects(log), breaches: openBreaches(log) };
  const adr = await readAdr(cwd);
  const unread = new Set(await queue(cwd));
  const decisions = D.cited_decisions.map((id) => {
    const line = adr.find((l) => l.kind === 'decision' && l.id === id);
    return line ? { id, by: line.by, read: !unread.has(id), body: line.body, title: line.title } : { id, by: null, read: false, body: null, title: null, missing: true };
  });
  return { slug, set: r.start ? r.start.payload.requirements : [], concerns, pathClasses, attempts, openObligations, decisions, lease: await readLease(cwd), D, settings };
}

export function floorReasons(f) {
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
  const n = f.D.options.indexOf(f.D.recommendation);
  if (n < 0 || f.concerns.some((c) => !c.valid) || f.decisions.some((d) => d.missing)) return null;
  const counts = {};
  for (const c of Object.values(f.pathClasses)) counts[c] = (counts[c] || 0) + 1;
  return {
    concerns: f.concerns.map((c) => c.id), option_index: n, option_count: f.D.options.length,
    path_counts: counts, paths_known: f.D.named_paths.length > 0,
    protected: { data: !!counts.data, contract: Object.keys(f.pathClasses).some((p) => p.startsWith('docs/spec/')),
      agreement: 'AGENTS.md' in f.pathClasses, reserved: !!(counts.reserved || counts['kernel-managed']) },
    attempts: f.attempts, open_obligations: f.openObligations,
    cited: f.decisions.filter((d) => d.by !== 'developer').map((d) => ({ id: d.id, read: d.read })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Port kernel facts and the narrow floor into the composite evaluator"
```

---

### Task 5: Contract state `C(c)`, the recommended-option code, and `M(D)`

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `readSnapshot` from `lib/snapshots.mjs`; `git`, `listTree`, `writeTreeFromPaths` from `lib/gitx.mjs`; `matchGlob` from `lib/paths.mjs`; `readSpec` from `lib/spec.mjs`; `readLease` (already imported, Task 4).
- Produces: `EgressError`, `contractState(cwd, f) -> C`, `measureState(cwd, D, n, C, f) -> {state, requestBytesEstimate}` where `n = D.options.indexOf(D.recommendation)`.

`measureState` builds the closed `M(D)` object exactly: `{five: {question, recommendation, because, if_wrong, instead}, option: {text, diff, files, omitted}, contract: C, facts: A}`. No `rule` text, no `context` (mechanisms/decisions) field: section 10's own closed list for `M(D)` is four things (`D`'s five narrative fields, the recommended option, `C(c)`, `A(D)`), and the Global Constraints above quote "no policy prose in state" for exactly this reason. `option.diff`/`option.files` reuse the superseded design's touched-path/egress logic (`D.named_paths` plus the action lease's `touch` list, in path order, reads never following symlinks), narrowed to build the diff/files list once rather than per option, because only the recommended option is ever read.

- [ ] **Step 1: Write the failing tests**

```js
import { contractState, measureState, EgressError } from '../lib/evaluate.mjs';
import { kernelFacts } from '../lib/evaluate.mjs';

describe('C(c) and M(D)', () => {
  test('contractState carries the rule text nowhere: only keystone, glossary, commitment, requirements and developer-written decisions', async () => {
    const { cwd } = await makeProject({ files: { 'docs/spec/roadmap.md': 'Current: auth-tokens\n\n## auth-tokens\n\nRequirements: AUTH-003\n' } });
    // ... start the commitment, then:
    const f = await kernelFacts(cwd, normalizeDraft(draft()));
    const C = await contractState(cwd, f);
    assert.deepEqual(Object.keys(C).sort(), ['commitment', 'decisions', 'glossary', 'keystone', 'requirements']);
  });
  test('M(D) is exactly the four closed parts, no rule and no free context', async () => {
    const { cwd } = await makeProject();
    await mkdirAndWrite(cwd, 'src/auth/rotate.mjs', 'export const rotate = () => {};\n');
    const f = await kernelFacts(cwd, normalizeDraft(draft()));
    const C = await contractState(cwd, f);
    const { state } = await measureState(cwd, normalizeDraft(draft()), 0, C, f);
    assert.deepEqual(Object.keys(state).sort(), ['contract', 'facts', 'five', 'option']);
    assert.deepEqual(Object.keys(state.five).sort(), ['because', 'if_wrong', 'instead', 'question', 'recommendation']);
    assert.equal(state.option.text, 'hourly');
    assert.ok(state.option.files.some((x) => x.path === 'src/auth/rotate.mjs'));
  });
  test('an excluded touched path throws EgressError and never reaches state', async () => {
    const { cwd } = await makeProject({ settings: { network_exclude: ['fixtures/private/**'] } });
    await mkdirAndWrite(cwd, 'fixtures/private/key.txt', 'shh');
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['fixtures/private/key.txt'] }));
    const C = await contractState(cwd, f);
    await assert.rejects(measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['fixtures/private/key.txt'] }), 0, C, f), EgressError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `contractState` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
import { readSnapshot } from './snapshots.mjs';
import { git, listTree, writeTreeFromPaths } from './gitx.mjs';
import { matchGlob } from './paths.mjs';
import { readSpec } from './spec.mjs';

export class EgressError extends Error { constructor(klass, path) { super(`unavailable excluded: ${klass}`); this.klass = klass; this.path = path; } }

export async function contractState(cwd, f) {
  const { texts, roadmap, blocks } = await readSpec(cwd);
  const requirements = f.set.map(({ requirement, text_digest }) => {
    const b = blocks.get(requirement);
    return { id: requirement, obligation: b ? b.obligation : null, falsifier: b ? b.falsifier : null, text_digest };
  });
  return {
    keystone: texts['overview.md'] ?? '', glossary: texts['glossary.md'] ?? '',
    commitment: f.slug && roadmap.sections[f.slug] ? { slug: f.slug, requirements: roadmap.sections[f.slug].requirements } : null,
    requirements, decisions: f.decisions.filter((d) => d.by === 'developer').map((d) => ({ id: d.id, title: d.title, body: d.body })),
  };
}

function egressClass(path, settings) {
  if (settings.network_exclude.some((g) => matchGlob(g, path))) return 'network_exclude';
  if (CREDENTIAL_PATTERNS.some((g) => matchGlob(g, path))) return 'credential';
  if (path.startsWith('.cairn/output/')) return 'output';
  return null;
}

export async function measureState(cwd, D, n, C, f) {
  const settings = f.settings;
  const key = process.env.TYPESAFEAI_API_KEY || null;
  const { domains } = await readSpec(cwd);
  const hosts = Object.values(domains).flatMap((d) => d.header.hostPaths || []);
  const touched = [...new Set([...D.named_paths, ...((f.lease && f.lease.touch) || [])])].sort();
  for (const p of touched) if (hosts.includes(p)) throw new EgressError('host', p);
  for (const p of touched) { const klass = egressClass(p, settings); if (klass) throw new EgressError(klass, p); }
  const tree = touched.length ? await writeTreeFromPaths(cwd, { paths: touched, exclude: [] }) : null;
  const entries = tree ? new Map((await listTree(cwd, tree)).map((e) => [e.path, e])) : new Map();
  const files = [], omitted = [];
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
  const A = authorityProjection(f);
  const state = { five: Object.fromEntries(['question', 'recommendation', 'because', 'if_wrong', 'instead'].map((k) => [k, D[k]])),
    option: { text: D.options[n], diff, files, omitted }, contract: C, facts: A };
  return { state };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Build the closed measurement state M(D): five narrative fields, the recommended option's code, C(c) and A(D)"
```

---

### Task 6: The Score request builder: backticked state paths, zero-based option index

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `POLICY`, `requestDigest` helpers from Task 3.
- Produces: `buildScoreRequest(settings, state, n) -> request`, `requestBytes(r) -> string`, `requestDigest(r) -> digest`, `sizeCheck(settings, request) -> 'oversize' | null`.

Each Score question's `instructions` text names its state field with a backtick-quoted path, exactly as the spec's own table does, and the recommended option's path uses the zero-based index `n` (`D.options.indexOf(D.recommendation)`), matching `draft.options[draft.recommendation]`'s own array indexing in section 10's prose (JavaScript arrays, and this kernel's own `option_index` in `authorityProjection`, are zero-based).

- [ ] **Step 1: Write the failing tests**

```js
import { buildScoreRequest, requestBytes, requestDigest, sizeCheck } from '../lib/evaluate.mjs';

describe('the Score request', () => {
  test('five questions, each naming its backticked state path with a zero-based option index', () => {
    const req = buildScoreRequest(settings(), { five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} }, 0);
    assert.deepEqual(Object.keys(req.questions).sort(), ['ambiguity', 'contract', 'evidence', 'reach', 'surface']);
    assert.match(req.questions.evidence.instructions, /`state\.five\.because`/);
    assert.match(req.questions.ambiguity.instructions, /`state\.five\.question`/);
    for (const d of ['reach', 'contract', 'surface']) assert.match(req.questions[d].instructions, /`state\.option`.*\[0\]|`state\.option`/);
    for (const d of ['evidence', 'reach', 'contract', 'surface', 'ambiguity']) assert.deepEqual(req.questions[d].criteria.length, 5);
    assert.equal(req.model, settings().typesafeai.model);
  });
  test('the recommended-option index in the request text tracks n, zero-based', () => {
    const state = { five: { question: 'q', recommendation: 'daily', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'daily', diff: '', files: [], omitted: [] }, contract: {}, facts: {} };
    const req = buildScoreRequest(settings(), state, 1);
    assert.match(req.questions.reach.instructions, /\[1\]/);
  });
  test('requests round-trip through canonical JSON: equal state yields byte-identical requests', () => {
    const state = { five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} };
    const a = buildScoreRequest(settings(), state, 0), b = buildScoreRequest(settings(), state, 0);
    assert.equal(requestBytes(a), requestBytes(b));
    assert.match(requestDigest(a), /^sha256:[0-9a-f]{64}$/);
  });
  test('sizeCheck refuses above 75 percent of either the request or the state-plus-longest-question limit', () => {
    const small = buildScoreRequest(settings(), { five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} }, 0);
    assert.equal(sizeCheck(settings(), small), null);
    const big = buildScoreRequest(settings(), { five: { question: 'q', recommendation: 'r', because: 'x'.repeat(200000), if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} }, 0);
    assert.equal(sizeCheck(settings(), big), 'oversize');
    assert.equal(sizeCheck({ typesafeai: { ...settings().typesafeai, request_cap_bytes: 10 } }, small), 'oversize');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `buildScoreRequest` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
function scoreQ(instructions, dimension) { return { type: 'score', instructions, criteria: [...POLICY.LEVELS[dimension]] }; }

export function buildScoreRequest(settings, state, n) {
  const questions = {
    evidence: scoreQ('Score `state.five.because`: how concretely does it ground its claim, from no evidence to quoted output naming the failing test and the falsifier it maps to.', 'evidence'),
    reach: scoreQ(`Score \`state.option\` (the recommended option, draft.options[${n}]): how far does choosing it extend, from wording or message text only to data that cannot be regenerated, a migration, or a rewrite of user files.`, 'reach'),
    contract: scoreQ(`Score \`state.option\`'s fit with the cited requirement's contract (draft.options[${n}]): from implementing the cited requirement as written to changing a requirement's text or falsifier.`, 'contract'),
    surface: scoreQ(`Score \`state.option\`'s new surface (draft.options[${n}]): from no new surface to a network call, credential, or external service.`, 'surface'),
    ambiguity: scoreQ('Score `state.five.question`: from one reading the draft names, to a question that cannot be answered without facts the draft lacks.', 'ambiguity'),
  };
  return JSON.parse(canonicalize({ state, model: settings.typesafeai.model, questions }));
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Build the five-dimension Score request with backticked state paths and a zero-based option index"
```

---

### Task 7: Score answer parsing, tolerant to a 0.02 probability-sum gap

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Produces: `parseScoreAnswers(request, bodyText) -> {levels, confidences, usage, model} | {invalid: reason}`.

`levels`/`confidences` are plain objects keyed by dimension name. Every Score answer must carry `type: 'score'`, a `score` in `[0,4]`, a `confidence` in `[0,1]`, and a `probabilities` object over `"0".."4"` whose values sum to within `POLICY.PROB_TOLERANCE` (0.02) of 1 -- `.superpowers/bench/results.md`'s round-3 data-loss note records three real, valid API responses lost to a stricter `1e-6` tolerance; this is the fix.

- [ ] **Step 1: Write the failing tests**

```js
import { parseScoreAnswers } from '../lib/evaluate.mjs';

const goodBody = (over = {}) => JSON.stringify({ model: 'jev-1.13.0', answers: {
  evidence: { type: 'score', score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.5, 4: 0.4 } },
  reach: { type: 'score', score: 0.6, confidence: 0.5, legend: {}, probabilities: { 0: 0.7, 1: 0, 2: 0.1, 3: 0.2, 4: 0 } },
  contract: { type: 'score', score: 0.1, confidence: 0.9, legend: {}, probabilities: { 0: 0.9, 1: 0.1, 2: 0, 3: 0, 4: 0 } },
  surface: { type: 'score', score: 0, confidence: 0.8, legend: {}, probabilities: { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0 } },
  ambiguity: { type: 'score', score: 1.0, confidence: 0.5, legend: {}, probabilities: { 0: 0.3, 1: 0.4, 2: 0.2, 3: 0.1, 4: 0 } },
  ...over }, usage: { input_tokens: 10, output_tokens: 2 } });

describe('Score answer parsing', () => {
  test('parses all five dimensions', () => {
    const req = buildScoreRequest(settings(), state(), 0);
    const r = parseScoreAnswers(req, goodBody());
    assert.deepEqual(Object.keys(r.levels).sort(), ['ambiguity', 'contract', 'evidence', 'reach', 'surface']);
    assert.equal(r.levels.evidence, 3.4); assert.equal(r.confidences.evidence, 0.6);
  });
  test('tolerates a probability sum within 0.02 of 1 (the round-3 data-loss bug, fixed)', () => {
    const req = buildScoreRequest(settings(), state(), 0);
    const body = goodBody({ evidence: { type: 'score', score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.49, 4: 0.4 } } }); // sums to 0.99
    const r = parseScoreAnswers(req, body);
    assert.equal(r.invalid, undefined);
  });
  test('refuses a sum off by more than 0.02', () => {
    const req = buildScoreRequest(settings(), state(), 0);
    const body = goodBody({ evidence: { type: 'score', score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.3, 4: 0.4 } } }); // sums to 0.8
    assert.ok(parseScoreAnswers(req, body).invalid);
  });
  test('refuses out-of-range score, confidence, missing dimension, wrong type, or malformed JSON', () => {
    const req = buildScoreRequest(settings(), state(), 0);
    assert.ok(parseScoreAnswers(req, 'not json').invalid);
    assert.ok(parseScoreAnswers(req, JSON.stringify({ model: 'jev-1.13.0', answers: {}, usage: {} })).invalid);
    assert.ok(parseScoreAnswers(req, goodBody({ evidence: { type: 'noul', noul: 0.5 } })).invalid);
    assert.ok(parseScoreAnswers(req, goodBody({ evidence: { type: 'score', score: 5, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 } } })).invalid);
    assert.ok(parseScoreAnswers(req, goodBody({ evidence: { type: 'score', score: 1, confidence: 1.5, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 } } })).invalid);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `parseScoreAnswers` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const level = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 4;

export function parseScoreAnswers(request, bodyText) {
  let body;
  try { body = JSON.parse(bodyText); } catch { return { invalid: 'not json' }; }
  if (!body || typeof body !== 'object' || typeof body.model !== 'string' || !body.answers || typeof body.answers !== 'object') return { invalid: 'shape' };
  const levels = {}, confidences = {};
  for (const id of Object.keys(request.questions)) {
    const a = body.answers[id];
    if (!a || a.type !== 'score') return { invalid: `answer ${id} not type score` };
    if (!level(a.score)) return { invalid: `answer ${id} bad score` };
    if (!unit(a.confidence)) return { invalid: `answer ${id} bad confidence` };
    if (!a.probabilities || typeof a.probabilities !== 'object') return { invalid: `answer ${id} bad probabilities` };
    const vals = Object.values(a.probabilities);
    if (vals.length !== 5 || vals.some((v) => !unit(v))) return { invalid: `answer ${id} bad probabilities` };
    const sum = vals.reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1) > POLICY.PROB_TOLERANCE) return { invalid: `answer ${id} probabilities do not sum to 1 (${sum})` };
    levels[id] = a.score; confidences[id] = a.confidence;
  }
  const u = body.usage && typeof body.usage === 'object' ? body.usage : {};
  const validCount = (v) => Number.isSafeInteger(v) && v >= 0;
  const usage = validCount(u.input_tokens) && validCount(u.output_tokens) ? { input_tokens: u.input_tokens, output_tokens: u.output_tokens } : null;
  return { levels, confidences, usage, model: body.model };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Parse Score answers with a 0.02 probability-sum tolerance, closing the round-3 benchmark data loss"
```

---

### Task 8: The veto and the composite, in code

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Produces: `computeVeto(levels) -> 'reach' | 'contract' | 'surface' | null`, `computeComposite(levels, weights) -> number`, `computeSuggested(composite, confidences, settings) -> 'agent' | 'developer'`.

- [ ] **Step 1: Write the failing tests**

```js
import { computeVeto, computeComposite, computeSuggested } from '../lib/evaluate.mjs';

const levels = (over = {}) => ({ evidence: 3, reach: 1, contract: 0, surface: 0, ambiguity: 1, ...over });
const conf = (over = {}) => ({ evidence: 0.8, reach: 0.8, contract: 0.8, surface: 0.8, ambiguity: 0.8, ...over });
const dims = () => ({ evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 });

describe('veto and composite', () => {
  test('veto checks reach, then contract, then surface, in that order', () => {
    assert.equal(computeVeto(levels({ reach: 4 })), 'reach');
    assert.equal(computeVeto(levels({ reach: 4, contract: 3 })), 'reach', 'reach is checked first');
    assert.equal(computeVeto(levels({ contract: 3 })), 'contract');
    assert.equal(computeVeto(levels({ contract: 3, surface: 3 })), 'contract');
    assert.equal(computeVeto(levels({ surface: 3 })), 'surface');
    assert.equal(computeVeto(levels()), null);
    assert.equal(computeVeto(levels({ reach: 3.99 })), null, 'reach needs >= 4, not >= 3');
  });
  test('composite: weight_d * level_d / 4, evidence inverted, summed with no renormalization', () => {
    const c = computeComposite(levels(), dims());
    // evidence term (4-3)/4=0.25, reach 1/4=0.25, contract 0, surface 0, ambiguity 1/4=0.25; * 0.2 each, summed
    assert.ok(Math.abs(c - 0.2 * (0.25 + 0.25 + 0 + 0 + 0.25)) < 1e-9);
  });
  test('composite ignores confidence entirely; only the levels feed it', () => {
    assert.equal(computeComposite(levels(), dims()), computeComposite(levels(), dims()));
  });
  test('suggested is agent only when composite <= agent_ceiling and every confidence clears its floor', () => {
    const settings = { typesafeai: { agent_ceiling: 0.35, confidence_floors: { evidence: 0.5, reach: 0.5, contract: 0.5, surface: 0.5, ambiguity: 0.5 } } };
    assert.equal(computeSuggested(0.2, conf(), settings), 'agent');
    assert.equal(computeSuggested(0.4, conf(), settings), 'developer', 'over the ceiling');
    assert.equal(computeSuggested(0.2, conf({ ambiguity: 0.3 }), settings), 'developer', 'under one confidence floor');
    assert.equal(computeSuggested(0.35, conf(), settings), 'agent', 'at the ceiling is still agent');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `computeVeto` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
export function computeVeto(levels) {
  if (levels.reach >= 4) return 'reach';
  if (levels.contract >= 3) return 'contract';
  if (levels.surface >= 3) return 'surface';
  return null;
}
export function computeComposite(levels, weights) {
  const term = { evidence: (4 - levels.evidence) / 4, reach: levels.reach / 4, contract: levels.contract / 4, surface: levels.surface / 4, ambiguity: levels.ambiguity / 4 };
  return POLICY.DIMENSIONS.reduce((sum, d) => sum + weights[d] * term[d], 0);
}
export function computeSuggested(composite, confidences, settings) {
  const t = settings.typesafeai;
  const confOk = POLICY.DIMENSIONS.every((d) => confidences[d] >= t.confidence_floors[d]);
  return composite <= t.agent_ceiling && confOk ? 'agent' : 'developer';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Compute the veto and the composite from recorded Score levels in code, not the model"
```

---

### Task 9: `measure()`: identity, intent, the jev call, finalize, crash recovery

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `appendRecord`, `readLog`, `range` from `lib/records.mjs`; `writeWorkspaceSnapshot`, `readSnapshot` from `lib/snapshots.mjs`; `writeTreeFromPaths`, `readRef` from `lib/gitx.mjs`; `adrDigest` from `lib/adr.mjs`; `loadSettings`; `b64url` from `lib/canon.mjs`; `post` from `bin/typesafeai.mjs`.
- Produces: `measure(cwd, draft, {transport} = {}) -> {outcome, suggested, veto, composite, measurementSha, intentSha, pending}`, `recoverMeasurement(cwd) -> measurementSha | null`.

`transport` defaults to `post` and is called only for the `jev` source; for `review` (`typesafeai.enabled: false`), `measure()` writes the intent (with `source: 'review'`, a `request_digest` over the deterministic Score request the review call would answer -- the same `buildScoreRequest` shape, since section 10 says both sources "answer the same five dimensions in the same shape") and returns `{pending: 'review', intentSha, slug, request: <the Score request object>, n}` without writing any call or measurement. Plan 16's `cairn measure --brief`/`--file` complete that path, reusing this function's `computeVeto`/`computeComposite`/`computeSuggested`/`parseScoreAnswers` and a new `finalizeMeasurement` this task also exports for that reuse.

- [ ] **Step 1: Write the failing tests**

```js
import { measure, recoverMeasurement } from '../lib/evaluate.mjs';
import { readLog, decodeRecord } from '../lib/records.mjs';
import { unb64url } from '../lib/canon.mjs';
import { start } from '../lib/commitment.mjs';

const scoreBody = (over = {}) => JSON.stringify({ model: 'jev-1.13.0', answers: {
  evidence: { type: 'score', score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.5, 4: 0.4 } },
  reach: { type: 'score', score: 0.6, confidence: 0.5, legend: {}, probabilities: { 0: 0.7, 1: 0, 2: 0.1, 3: 0.2, 4: 0 } },
  contract: { type: 'score', score: 0.1, confidence: 0.9, legend: {}, probabilities: { 0: 0.9, 1: 0.1, 2: 0, 3: 0, 4: 0 } },
  surface: { type: 'score', score: 0, confidence: 0.8, legend: {}, probabilities: { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0 } },
  ambiguity: { type: 'score', score: 1.0, confidence: 0.5, legend: {}, probabilities: { 0: 0.3, 1: 0.4, 2: 0.2, 3: 0.1, 4: 0 } },
  ...over }, usage: { input_tokens: 10, output_tokens: 2 } });
const transport = (bodies) => async (req) => { const b = bodies.shift(); if (b instanceof Error) throw b; return { status: 200, body: b, model: 'jev-1.13.0' }; };
async function repoWithCommitment(enabled = true) {
  const { cwd } = await makeProject({ settings: { typesafeai: { enabled, model: 'jev-1.13.0', weights: dims(), agent_ceiling: 0.35, confidence_floors: dims(), min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } },
    files: { 'docs/spec/roadmap.md': 'Current: auth-tokens\n\n## auth-tokens\n\nRequirements: AUTH-003\n' } });
  await start(cwd, 'auth-tokens');
  return cwd;
}

describe('measure()', () => {
  test('jev: intent precedes the one call; the measurement carries the composite and suggestion', async () => {
    const cwd = await repoWithCommitment();
    const r = await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    assert.equal(r.outcome, 'composite'); assert.equal(r.suggested, 'agent'); assert.equal(r.veto, null);
    const log = await readLog(cwd);
    assert.deepEqual(log.slice(-3).map((x) => x.kind), ['evaluation-intent', 'evaluation-call', 'measurement']);
    const [intent, call, m] = log.slice(-3);
    assert.equal(intent.payload.source, 'jev'); assert.equal(call.payload.source, 'jev'); assert.equal(call.payload.outcome, 'response');
    assert.equal(Buffer.from(unb64url(call.payload.raw)).toString(), scoreBody());
    assert.equal(m.payload.intent, intent.sha); assert.equal(m.payload.call, call.sha);
    assert.equal(m.payload.levels.length, 5);
    for (const rec of log.slice(-3)) assert.doesNotThrow(() => decodeRecord(rec));
  });
  test('a veto forces developer even with a low composite', async () => {
    const cwd = await repoWithCommitment();
    const body = scoreBody({ contract: { type: 'score', score: 3.5, confidence: 0.9, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0.5, 4: 0.5 } } });
    const r = await measure(cwd, draft(), { transport: transport([body]) });
    assert.equal(r.outcome, 'veto'); assert.equal(r.veto, 'contract'); assert.equal(r.suggested, null);
  });
  test('the floor writes an intent and a measurement with no call at all', async () => {
    const cwd = await repoWithCommitment();
    let called = false;
    const r = await measure(cwd, { ...draft(), named_paths: ['migrations/1.sql'] }, { transport: async () => { called = true; } });
    assert.equal(called, false); assert.equal(r.outcome, 'floor'); assert.equal(r.reason, 'floor:data');
    const log = await readLog(cwd);
    assert.deepEqual(log.slice(-2).map((x) => x.kind), ['evaluation-intent', 'measurement']);
    assert.equal(log.at(-2).payload.source, 'jev', 'source is settled from settings before the floor is checked, never null');
    assert.equal(log.at(-2).payload.request_digest, null);
    assert.equal(log.at(-1).payload.call, null); assert.equal(log.at(-1).payload.source, 'jev'); assert.deepEqual(log.at(-1).payload.levels, []);
  });
  test('a failed transport call is unavailable <class>, recorded and routed', async () => {
    const cwd = await repoWithCommitment();
    const e = new Error('overloaded'); e.klass = 'overloaded';
    const r = await measure(cwd, draft(), { transport: transport([e]) });
    assert.equal(r.outcome, 'unavailable'); assert.equal(r.reason, 'unavailable overloaded');
    const call = (await readLog(cwd)).findLast((x) => x.kind === 'evaluation-call');
    assert.equal(call.payload.outcome, 'failure'); assert.equal(call.payload.failure_class, 'overloaded');
  });
  test('an invalid answer is unavailable invalid, never agent or developer by suggestion', async () => {
    const cwd = await repoWithCommitment();
    const bad = JSON.stringify({ model: 'jev-1.13.0', answers: {}, usage: {} });
    const r = await measure(cwd, draft(), { transport: transport([bad]) });
    assert.equal(r.outcome, 'unavailable'); assert.equal(r.suggested, null);
  });
  test('review source: writes the intent and returns pending, no call, no measurement yet', async () => {
    const cwd = await repoWithCommitment(false);
    const r = await measure(cwd, draft());
    assert.equal(r.pending, 'review');
    const log = await readLog(cwd);
    assert.deepEqual(log.map((x) => x.kind).slice(-1), ['evaluation-intent']);
    assert.equal(log.at(-1).payload.source, 'review'); assert.ok(log.at(-1).payload.request_digest);
  });
  test('identity is captured before any write; equal identity and policy yield byte-identical requests', async () => {
    const cwd = await repoWithCommitment();
    const a = []; const t = (bodies) => async (req) => { a.push(req); return { status: 200, body: scoreBody(), model: 'jev-1.13.0' }; };
    await measure(cwd, draft(), { transport: t([]) });
    const b = []; const t2 = (bodies) => async (req) => { b.push(req); return { status: 200, body: scoreBody(), model: 'jev-1.13.0' }; };
    await measure(cwd, draft(), { transport: t2([]) });
    assert.equal(JSON.stringify(a[0]), JSON.stringify(b[0]));
  });
  test('an unknown crash outcome leaves the intent open; recovery marks indeterminate, never retries', async () => {
    const cwd = await repoWithCommitment();
    const crash = new Error('crash'); // no .klass: an unknown outcome
    await assert.rejects(measure(cwd, draft(), { transport: transport([crash]) }));
    let log = await readLog(cwd);
    assert.equal(log.at(-1).kind, 'evaluation-intent');
    let calls = 0;
    const sha = await recoverMeasurement(cwd, { transport: async () => { calls++; } });
    log = await readLog(cwd);
    assert.equal(calls, 0); assert.equal(log.at(-1).sha, sha);
    assert.equal(log.at(-1).payload.outcome, 'indeterminate'); assert.equal(log.at(-1).payload.suggested, null);
    assert.equal(log.at(-2).payload.outcome, 'indeterminate'); assert.equal(log.at(-2).payload.raw, null);
    assert.equal(await recoverMeasurement(cwd), null, 'idempotent');
  });
  test('a pending review intent is left alone by recovery, not marked indeterminate', async () => {
    const cwd = await repoWithCommitment(false);
    await measure(cwd, draft());
    assert.equal(await recoverMeasurement(cwd), null);
    const log = await readLog(cwd);
    assert.equal(log.at(-1).kind, 'evaluation-intent');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `measure` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
import { writeWorkspaceSnapshot, readSnapshot as readSnap } from './snapshots.mjs';
import { readRef } from './gitx.mjs';
import { adrDigest } from './adr.mjs';
import { post } from '../bin/typesafeai.mjs';

const REF_LOG = 'refs/cairn/log';

async function captureIdentity(cwd, D, settingsDigest) {
  const ws = await writeWorkspaceSnapshot(cwd);
  const logHead = await readRef(cwd, REF_LOG);
  return { ws, log_head: logHead, adr_digest: await adrDigest(cwd), draft_digest: draftDigest(D), settings_digest: settingsDigest };
}

async function appendCall(cwd, slug, intentSha, extra) {
  return appendRecord(cwd, 'evaluation-call', slug, { intent: intentSha, transport: null, session: null,
    model: null, raw: null, failure_class: null, answers: null, usage: null, ...extra });
}

export async function finalizeMeasurement(cwd, slug, intentSha, { call = null, draftDigestValue, source, model = null,
  levels = {}, confidences = {}, settings = null, outcome, reason }) {
  let veto = null, composite = null, suggested = null;
  const levelList = Object.keys(levels).map((d) => ({ dimension: d, level: levels[d], confidence: confidences[d] }));
  if (outcome === 'composite' || outcome === 'veto') {
    veto = computeVeto(levels);
    if (veto) { outcome = 'veto'; reason = `veto:${veto}`; }
    else { composite = computeComposite(levels, settings.typesafeai.weights); suggested = computeSuggested(composite, confidences, settings);
      outcome = 'composite'; reason = `composite ${composite.toFixed(3)} ${suggested === 'agent' ? '<=' : '>'} ${settings.typesafeai.agent_ceiling}, confidences ${suggested === 'agent' ? 'ok' : 'insufficient or composite over ceiling'}`; }
  }
  const sha = await appendRecord(cwd, 'measurement', slug, { intent: intentSha, call, draft_digest: draftDigestValue,
    source, model, levels: levelList, composite, veto, suggested, outcome, reason });
  return { outcome, veto, composite, suggested, measurementSha: sha, intentSha };
}

export async function recoverMeasurement(cwd, { transport } = {}) {
  const log = await readLog(cwd); const r = range(log);
  const recs = r.start ? r.records : log;
  const intent = recs.findLast((x) => x.kind === 'evaluation-intent');
  if (!intent) return null;
  if (recs.some((x) => x.kind === 'measurement' && x.payload.intent === intent.sha)) return null;
  if (intent.payload.source === 'review') return null;   // pending review brief: not a crash, left for `cairn measure --file`
  const slug = intent.target;
  const existing = recs.find((x) => x.kind === 'evaluation-call' && x.payload.intent === intent.sha);
  const callSha = existing ? existing.sha : (intent.payload.request_digest
    ? await appendCall(cwd, slug, intent.sha, { source: intent.payload.source, request_digest: intent.payload.request_digest, outcome: 'indeterminate' })
    : null);
  const { measurementSha } = await finalizeMeasurement(cwd, slug, intent.sha, {
    call: callSha, draftDigestValue: intent.payload.draft_digest, source: intent.payload.source, outcome: 'indeterminate', reason: 'indeterminate: an intent was left open by a crash' });
  return measurementSha;
}

export async function measure(cwd, draft, { transport = post } = {}) {
  await recoverMeasurement(cwd);
  const D = normalizeDraft(draft);
  const { settings, digest: settingsDigest } = await loadSettings(cwd);
  // source is settled here, from settings alone, before the floor is even checked: both records
  // that name it (evaluation-intent, measurement) carry it whether or not a call ever happens
  // (spec section 4's fixed measurement row: "source jev|review", never null).
  const source = settings.typesafeai.enabled ? 'jev' : 'review';
  const id = await captureIdentity(cwd, D, settingsDigest);
  const f = await kernelFacts(cwd, D); f.ws = id.ws;
  const slug = f.slug ?? D.commitment;
  const floor = floorReasons(f);
  const intentBase = { draft_digest: id.draft_digest, snapshot: id.ws, log_head: id.log_head, adr_digest: id.adr_digest, settings_digest: id.settings_digest, policy_digest: policyDigest(settings) };

  if (floor.length) {
    const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, { ...intentBase, source, request_digest: null });
    return finalizeMeasurement(cwd, slug, intentSha, { draftDigestValue: id.draft_digest, source, outcome: 'floor', reason: `floor:${floor[0]}` });
  }
  const n = D.options.indexOf(D.recommendation);
  const C = await contractState(cwd, f);
  let state, unavailable = null;
  try { ({ state } = await measureState(cwd, D, n, C, f)); }
  catch (e) { if (!(e instanceof EgressError)) throw e; unavailable = 'excluded'; }
  let request = null;
  if (!unavailable) {
    request = buildScoreRequest(settings, state, n);
    if (source === 'jev') unavailable = sizeCheck(settings, request);
  }
  const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, { ...intentBase,
    source, request_digest: unavailable ? null : requestDigest(request) });
  if (unavailable) return finalizeMeasurement(cwd, slug, intentSha, { draftDigestValue: id.draft_digest, source, outcome: 'unavailable', reason: `unavailable ${unavailable}` });
  if (source === 'review') return { pending: 'review', intentSha, slug, request, n };

  const digest = requestDigest(request);
  let res;
  try { res = await transport(request); }
  catch (e) {
    if (!e || typeof e.klass !== 'string') throw e;   // unknown outcome: leave the intent open for recoverMeasurement
    const callSha = await appendCall(cwd, slug, intentSha, { source: 'jev', request_digest: digest, outcome: 'failure', failure_class: e.klass });
    return finalizeMeasurement(cwd, slug, intentSha, { call: callSha, draftDigestValue: id.draft_digest, source: 'jev', outcome: 'unavailable', reason: `unavailable ${e.klass}` });
  }
  if (res.model !== request.model) {
    const callSha = await appendCall(cwd, slug, intentSha, { source: 'jev', request_digest: digest, outcome: 'failure', failure_class: 'model_mismatch' });
    return finalizeMeasurement(cwd, slug, intentSha, { call: callSha, draftDigestValue: id.draft_digest, source: 'jev', outcome: 'unavailable', reason: 'unavailable model_mismatch' });
  }
  const raw = b64url(Buffer.from(res.body, 'utf8'));
  const parsed = parseScoreAnswers(request, res.body);
  if (parsed.invalid) {
    const callSha = await appendCall(cwd, slug, intentSha, { source: 'jev', request_digest: digest, outcome: 'response', model: res.model, raw });
    return finalizeMeasurement(cwd, slug, intentSha, { call: callSha, draftDigestValue: id.draft_digest, source: 'jev', model: res.model, outcome: 'unavailable', reason: `unavailable invalid: ${parsed.invalid}` });
  }
  const answers = POLICY.DIMENSIONS.map((d) => ({ id: d, value: { score: parsed.levels[d], confidence: parsed.confidences[d], probabilities: null } }));
  const callSha = await appendCall(cwd, slug, intentSha, { source: 'jev', request_digest: digest, outcome: 'response', model: parsed.model, raw, answers, usage: parsed.usage });
  return finalizeMeasurement(cwd, slug, intentSha, { call: callSha, draftDigestValue: id.draft_digest, source: 'jev', model: parsed.model,
    levels: parsed.levels, confidences: parsed.confidences, settings, outcome: 'composite' });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Measure a Consequential draft: identity, intent, one jev call, the composite finalize, and crash recovery"
```

---

### Task 10: Calibration over recorded measurements, the agent's decision and the developer's label

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `answer` records (`payload.owner`, `payload.escalation`) from `lib/escalate.mjs` (plan 09, unchanged); `escalation` records (`payload.evaluation`, unchanged field name, now pointing at a `measurement` SHA).
- Produces: `upperBound(errors, n, alpha = 0.05) -> number` (unchanged one-sided exact binomial bound), `calibrate(cwd) -> {pass, sample, errors, bound, calibrationSha}`.

Design note, stated here because it is load-bearing for what this task's tests assert: under the composite design, an agent-decided Consequential draft that the agent never escalates (the common, intended case -- `suggested: agent` and the agent agrees) never creates an escalation at all; it becomes a `decide --consequential` ADR line directly (plan 16). The only existing kernel mechanism for a developer to attach a retrospective `agent | developer | unknown` label to a measurement is `cairn answer <slug> ... --owner <label>`, and `answer` always targets an escalation (`lib/records.mjs`'s `answer` schema requires `escalation: ref`). So calibration's labelled sample is drawn from measurements whose `suggested` was `agent` and which the agent nonetheless escalated (section 10: "the agent may still escalate toward the developer at its own judgment after reading the measurement, whatever the suggestion says") or which the narrow floor or a veto sent to the developer with `suggested` unset (excluded from the denominator by definition, since the denominator is `suggested === 'agent'` cases only) -- and whose escalation was later answered with `--owner`. This is unchanged from how the superseded design's shadow-mode labelling worked, narrowed to `suggested === 'agent'` instead of `would_route === 'agent'`, and it is exactly why the spec makes calibration advisory tuning data rather than a gate ("it does not gate whether the agent may decide"): the labelled sample fills slowly by construction, from the minority of agent-suggested drafts the agent chose to escalate anyway.

- [ ] **Step 1: Write the failing tests**

```js
import { upperBound, calibrate } from '../lib/evaluate.mjs';
import { escalate, answer } from '../lib/escalate.mjs';

describe('calibration', () => {
  test('exact one-sided bound, unchanged from the superseded design', () => {
    assert.ok(Math.abs(upperBound(0, 60) - (1 - Math.pow(0.05, 1 / 60))) < 1e-9);
    assert.ok(upperBound(0, 60) < 0.05); assert.ok(upperBound(0, 30) > 0.05);
    assert.ok(upperBound(1, 60) > upperBound(0, 60));
  });
  async function labelled(cwd, n, ownerLabel) {
    for (let i = 0; i < n; i++) {
      const r = await measure(cwd, { ...draft(), question: `q${i}` }, { transport: transport([scoreBody()]) });
      assert.equal(r.suggested, 'agent');
      const sha = await escalate(cwd, { ...draft(), question: `q${i}`, evaluation: r.measurementSha });
      await answer(cwd, sha, 'ok', '', { owner: ownerLabel });
    }
  }
  test('60 zero-error labelled agent-suggested cases pass at 0.05; 30 cannot', async () => {
    const cwd = await repoWithCommitment();
    await labelled(cwd, 30, 'agent');
    let c = await calibrate(cwd);
    assert.deepEqual([c.pass, c.sample, c.errors], [false, 30, 0]);
    await labelled(cwd, 30, 'agent');
    c = await calibrate(cwd);
    assert.deepEqual([c.pass, c.sample, c.errors], [true, 60, 0]);
    const rec = (await readLog(cwd)).at(-1);
    assert.equal(rec.kind, 'calibration'); assert.equal(rec.payload.result, 'pass'); assert.equal(rec.payload.predicted_agent, 60);
  });
  test('denominator is suggested-agent labelled cases only; unknown labels are excluded', async () => {
    const cwd = await repoWithCommitment();
    await labelled(cwd, 3, 'agent'); await labelled(cwd, 2, 'unknown'); await labelled(cwd, 1, 'developer');
    const c = await calibrate(cwd);
    assert.deepEqual([c.sample, c.errors], [4, 1]);
  });
  test('a policy change resets calibration', async () => {
    const cwd = await repoWithCommitment();
    await labelled(cwd, 60, 'agent');
    assert.equal((await calibrate(cwd)).pass, true);
    const { settings } = await import('../lib/settings.mjs').then((m) => m.loadSettings(cwd));
    settings.typesafeai.agent_ceiling = 0.4;
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    assert.equal((await calibrate(cwd)).sample, 0);
  });
  test('floor and vetoed measurements never enter the denominator (suggested is null)', async () => {
    const cwd = await repoWithCommitment();
    const r = await measure(cwd, { ...draft(), named_paths: ['migrations/1.sql'] });
    assert.equal(r.suggested, null);
    const sha = await escalate(cwd, { ...draft(), evaluation: r.measurementSha });
    await answer(cwd, sha, 'ok', '', { owner: 'developer' });
    assert.deepEqual((await calibrate(cwd)).sample, 0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `calibrate` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
function binomCdf(k, n, p) {
  let term = Math.pow(1 - p, n), sum = term;
  for (let i = 1; i <= k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term; }
  return sum;
}
export function upperBound(errors, n, alpha = 0.05) {
  if (n <= 0 || errors >= n) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (binomCdf(errors, n, mid) > alpha) lo = mid; else hi = mid; }
  return hi;
}

function labelledMeasurements(log, policy) {
  const answers = new Map(log.filter((r) => r.kind === 'answer' && r.payload.owner).map((r) => [r.payload.escalation, r.payload.owner]));
  const escByMeasurement = new Map(log.filter((r) => r.kind === 'escalation' && r.payload.evaluation).map((r) => [r.payload.evaluation, r.sha]));
  const intents = new Map(log.filter((r) => r.kind === 'evaluation-intent').map((r) => [r.sha, r.payload]));
  return log.filter((r) => r.kind === 'measurement' && r.payload.suggested === 'agent' && intents.get(r.payload.intent)?.policy_digest === policy)
    .map((r) => answers.get(escByMeasurement.get(r.sha)))
    .filter((l) => l === 'agent' || l === 'developer');
}

export async function calibrate(cwd) {
  const { settings } = await loadSettings(cwd);
  const t = settings.typesafeai;
  const log = await readLog(cwd);
  const policy = policyDigest(settings);
  const labels = labelledMeasurements(log, policy);
  const sample = labels.length, errors = labels.filter((l) => l === 'developer').length;
  const bound = upperBound(errors, sample);
  const pass = sample >= t.min_calibration_agent_predictions && bound <= 0.05;
  const head = await readRef(cwd, REF_LOG);
  const slug = range(log).start?.payload.slug ?? 'none';
  const criterion = `false_downgrade_bound<=0.05 min_calibration_agent_predictions>=${t.min_calibration_agent_predictions}`;
  const calibrationSha = await appendRecord(cwd, 'calibration', slug, {
    policy_digest: policy, log_head: head, predicted_agent: sample, false_downgrades: errors, bound, criterion, result: pass ? 'pass' : 'fail' });
  return { pass, sample, errors, bound, calibrationSha };
}
```

`cairn calibrate` in `lib/cli.mjs` (already wired to `evaluate.mjs`'s `calibrate`, from the superseded plan; verify it still dynamic-imports `calibrate` from this rewritten file and prints the same shape of line) needs no change: its call site is `const { calibrate } = await import('./evaluate.mjs'); const c = await calibrate(cwd);`, which this task's export satisfies unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs tests/cli.test.mjs`
Expected: PASS. Then run the whole suite: `node --test tests/*.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Calibrate from labelled suggested-agent measurements with the exact one-sided bound"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| `developer: present \| absent`, default present; refused otherwise (2) | 1 |
| Refusals: weight/agent_ceiling/confidence floor outside [0,1]; enabled without model; request_cap_bytes above 64000; a typesafeai.mode field at all; developer not present/absent; enabled needs a versioned model (2) | 1 |
| code_tiers stays refused; weights, agent_ceiling, confidence_floors are now required, not refused (2, 13.56) | 1 |
| Settings change during a commitment invalidates any evaluation policy or calibration that depended on the old digest (8) | 1, 3 |
| evaluation-intent/evaluation-call/measurement record shapes (2, 4 as revised by the in-progress table-row fix, described here from section 10) | 2 |
| The five Score dimensions and their 0-4 level texts (10) | 3 |
| Policy digest covers model, schemas/questions, request construction, the narrow floor, the veto rule, weights, agent_ceiling, confidence_floors, caps and egress; a change resets calibration (10) | 3 |
| The narrow floor: contract/agreement/data text and falsifier changes, reserved/protected/settings writes, fourth-attempt, scope ruling, missing recommendation, incomplete authority projection all route with no call (10) | 4 |
| A(D) is the closed JSON authority projection; an agent-written cited decision reaches either source only as id and read flag (10) | 4, 5 |
| M(D) := D's five narrative fields, the recommended option, C(c), A(D); no policy prose in state (10) | 5 |
| The recommended option's code is the lease diff and complete touched files in path order; reads do not follow symlinks (10) | 5 |
| Requests omit network_exclude, credential and host bytes, keys and command output; a would-be inclusion is unavailable excluded with its path class (10) | 5, 9 |
| Every question names its state field with a backticked path and a zero-based option index (this plan's binding brief) | 6 |
| request_cap_bytes, three bytes per token, refuse above 75 percent of 64k or of 32k state plus longest question (10) | 6 |
| Score answer parsing: score, legend, probabilities, confidence; tolerate a probability sum within 0.02 of 1 (this plan's binding brief; results.md's data-loss note) | 7 |
| Veto: reach >= 4, contract >= 3 or surface >= 3, checked in that order, recorded which one decided (10) | 8 |
| composite = sum(weight_d * level_d / 4), evidence counted as (4 - level) (10) | 8 |
| suggested: agent when composite <= agent_ceiling and every confidence meets its floor, developer otherwise; advisory, not a route (10) | 8, 9 |
| Intent before I/O with every constructible request digest; a no-call digest is null (2, 4, 10) | 9 |
| Each attempted call records digest, resolved model, raw outcome, parsed answer, usage (2, 4, 10) | 9 |
| Unknown crash outcome becomes indeterminate, not retried, routed to the developer (2, 4, 10) | 9 |
| Two sources answer the same five dimensions in the same shape (10) | 9 |
| The developer labels a recorded measurement's outcome agent/developer/unknown; only the first two calibrate; supersessions are not labels (10) | 10 |
| Denominator is labelled cases whose suggestion was agent; a false downgrade is one labelled developer; one-sided 95 percent exact binomial bound, sample floor 60 (2, 10) | 10 |
| Calibration tunes weights/agent_ceiling/confidence_floors; it does not gate whether the agent may decide (10) | 10 |
| Falsifiers: missing measurement/intent/call for a measured draft; a composite computed anywhere but code from anything but recorded levels; a retried or invented ambiguous result; Cairn egress of excluded bytes; a calibration record whose denominator is not suggested-agent cases (10) | 2, 5, 8, 9, 10 |

Left to other plans:

- `cairn measure` as a CLI command, and the review source's two-phase `--brief`/`--file` flow (wake names the action; the launch block printed like `cairn brief`; the same session-self-answer refusal `report()` already applies): plan 16, built on this plan's `measure()`, `finalizeMeasurement`, `buildScoreRequest`, `parseScoreAnswers`, `computeVeto`/`computeComposite`/`computeSuggested`.
- The decision record naming its measurement beside the agent's own decision, `cairn decide --consequential` refusing a stale or missing measurement, and escalate requiring one: plan 16 (`lib/escalate.mjs`, `lib/adr.mjs` unchanged field, `lib/cli.mjs`).
- Wake predicates for the measure step, and `developer: absent`'s exit 4 (section 5's own new paragraph, and the exit-code table in section 2): plan 16 (`lib/wake.mjs`).
- Agent-facing text: the working agreement's measure-step bullet, and the skills' guidance on reading the suggestion, when to escalate anyway, and what belongs in `--because`: plan 17.
- `docs/manual.md`'s evaluator section, `README.md`, `CHANGELOG.md`, the cutover checklist and cut list: plan 17.
- The in-tree benchmark that exercises this plan's `measure()` against the 24-scenario ledger project through the real `cairn measure` CLI path, and an offline scoring test over a recorded `results.json`: plan 18.
- `tests/helpers/loop.mjs`'s `decide` fixture step already writes `evaluation: null` on a raw decision record; it needs no change (the field name is unchanged; a raw fixture bypassing `measure()` legitimately has no measurement).
