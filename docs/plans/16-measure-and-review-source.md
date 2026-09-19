# Measure Step and Review Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire plan 15's `measure()` into the command surface: `cairn measure` as the standalone step the agent runs before `cairn decide --consequential` or `cairn escalate --consequential` on a Consequential draft; the `review` source's two-phase flow (`cairn measure --brief` prints a launch block exactly as `cairn brief` does, `cairn measure <slug> --file <path>` records the review model's five levels under the same session-self-answer refusal `cairn report` already applies); `decide`/`escalate` refusing a missing, stale or wrong-draft-digest measurement and naming it on the record they write; and the one real wake change this redesign needs -- `developer: absent` exiting 4, not sitting at an unanswerable Waiting, when the open escalation is the narrow floor's.

**Architecture:** This plan adds no new files; every task modifies a file plan 15 (or an earlier plan) already owns. `lib/evaluate.mjs` gains `currentMeasurement`, `renderMeasureBrief` and `completeReviewMeasurement`, and `measure()` itself gains a `session`/`harness`/`env` option so the intent it writes (Task 1) can carry who ran it and, for the review source, what harness/model/transport `cairn measure --brief` detected -- the two facts `completeReviewMeasurement` needs to refuse a self-answer and a harness mismatch, exactly the way `lib/review.mjs`'s `report()` already refuses on `review.payload.session` and the brief's own recorded launch instruction. `lib/escalate.mjs`'s `decideConsequential` and a new `escalateConsequential` both consume a current measurement rather than triggering one; `cairn measure` is the only place a call happens. `lib/wake.mjs` changes only its existing `waiting` predicate.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md`, revised 2026-09-19: section 2 (the exit-code table's row 4; Verdict), section 4 (the `escalation` row's unchanged `evaluation` field; the ADR `decision` schema's unchanged `evaluation` field, both now pointing at `measurement`-kind records per plan 15's spec note, repeated below), section 5 (the paragraph after the action table: "A Consequential decision carries one more requirement this table does not list as a row"; Waiting and liveness; precedence), section 8 (Escalation), section 9 ("Where a harness reports session identity, the report refuses the session that wrote the review" -- the pattern this plan's `--file` refusal copies), section 10 (Two sources; the review source's paragraph), section 13 decisions 10, 22, 53, 54, 56.

**Spec note on section 4:** the record table's `measurement` row (commits 0be0c314, 3be9d80a; see plan 15's own note) is the current, fixed text. The `escalation` and ADR `decision` schemas' `evaluation: nullable(ref)` field names are untouched by that fix and stay as section 4 shows them: a nullable log SHA, now naming a `measurement`-kind record. This plan does not rename either field.

**Depends on:** plan 15 (`measure()`, `finalizeMeasurement`, `floorReasons`, `authorityProjection`, `POLICY`, `parseScoreAnswers`, `computeVeto`/`computeComposite`/`computeSuggested`, `buildScoreRequest`, `requestDigest`, `policyDigest`, `normalizeDraft`/`draftDigest` re-exported from `lib/escalate.mjs`). Also consumes plan 06 (`lib/adr.mjs`'s `decide`, unchanged), plan 09 (`lib/escalate.mjs`'s `openRange`, `checkConcerns`, `writeEscalation`, `decisionFields`, `parseEscalateArgs`), plan 10 (`lib/review.mjs`'s `detectHarness`, `sessionIdentity`, the `project`/exclusion-manifest machinery is *not* reused here -- the measurement brief carries only `M(D)`, already egress-checked by plan 15, never a full workspace projection), plan 08 (`lib/wake.mjs`'s predicate list and `render`/`cmdWake`).

## Global Constraints

See `docs/plans/overview.md` and plan 15's own Global Constraints (still binding: no policy prose in state, the floor and veto fail closed, tests inject `transport`, no test opens a socket). Specific to this plan, quoted from the spec:

- "A Consequential decision carries one more requirement this table does not list as a row, because wake never queues it as a next action the way it queues `declare` or `run`: before the agent writes the decision, `cairn measure` runs on the exact draft and writes a current measurement record ... `cairn decide --consequential` refuses a draft whose measurement is missing, stale, or built from a different draft digest." (section 5)
- "Waiting for a Consequential decision arises only two ways: the narrow floor in section 10 sends it to the developer before any call is made, or the agent, having read the measurement, chooses to escalate anyway. A measurement whose suggestion is `agent` is information, not consent; the agent may still escalate past it toward the developer, but nothing routes a floor-caught or vetoed draft to the agent." (section 5)
- "`cairn escalate` and `cairn decide --consequential` accept the same canonical draft. Only a Consequential draft is measured; every other level uses the kernel level directly. `cairn measure` (section 5) runs first ... Otherwise the agent reads the measurement, including its advisory `suggested: agent | developer`, and decides, except at the narrow floor or a veto, or when the agent itself chooses to escalate anyway; no other level is measured." (section 8, Escalation)
- "`review`: otherwise, the agent starts the harness's configured review model, the adversary model named in `settings.harness` for the running harness, exactly as `cairn brief` starts the adversary: through the harness, with none of the agent's own conversation context, answering the same five dimensions in the same shape as `jev` would. The launch instruction and the resolved model are recorded the way a report already records them." (section 10, Two sources)
- "Where a harness reports session identity, the report refuses the session that wrote the review." (section 9, Model identity and limits of proof)
- "`developer: absent` ... does not change any of this; it only removes the developer as a destination once the floor or a veto names one (section 5)." (section 10)
- "`developer: absent` is what an autonomous benchmark runs with ... When the floor names the developer and `developer: absent`: the run records the floor decision as an escalation on the log exactly as it would with a developer present; wake prints that escalation's five fields exactly as Waiting always prints them; and the run then exits 4, instead of sitting at Waiting for an answer that cannot come. Exit 4 is distinct from wake's exit 3 for a non-verdict state ... a floor hit in absent mode is a real Waiting verdict, just one this run cannot resolve, so it stops there rather than looping on wake." (section 5, Waiting and liveness)
- Exit-code table row: "`developer: absent` and the narrow evaluator floor (section 10) names the developer for a Consequential decision" -> exit 4, "Yes; a real Waiting verdict this run cannot answer, so it stops there (section 5)." (section 2)
- "Wake writes nothing and exits 0 with a verdict, or 3 with one line naming the command or skill that continues" -- unchanged by this plan except for the one new exit-4 case, which is still a verdict, not a non-verdict line (section 2).

---

## File structure

```
lib/records.mjs      (modify) evaluation-intent gains `session` and `launch`
lib/evaluate.mjs      (modify) measure()'s intentBase carries session/launch; currentMeasurement(),
                       renderMeasureBrief(), completeReviewMeasurement()
lib/escalate.mjs      (modify) decideConsequential requires+names a composite-outcome measurement;
                       new escalateConsequential requires+names any current measurement
lib/cli.mjs           (modify) `measure` command; `decide --consequential` and `escalate --consequential`
                       route through the two functions above
lib/wake.mjs          (modify) the `waiting` predicate: exit 4 for a floor-originated escalation
                       under developer: absent
tests/evaluate.test.mjs, tests/escalate.test.mjs, tests/cli.test.mjs, tests/wake.test.mjs   extended
```

---

### Task 1: `evaluation-intent` carries `session` and `launch`; `measure()` records them

**Files:**
- Modify: `lib/records.mjs`, `lib/evaluate.mjs`
- Test: `tests/records.test.mjs`, `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `detectHarness(settings, {harness, env}) -> {name, model, transport, boundary}` from `lib/review.mjs` (plan 10, unchanged); `sessionIdentity(env) -> string | null` from `lib/review.mjs` (plan 10, unchanged).
- Produces: `SCHEMAS['evaluation-intent']` (extended: `session: nullable(str)`, `launch: nullable(obj({harness: str, model: nullable(str), transport: nullable(oneOf('local','remote')), boundary: oneOf('enforced','unenforced')}))`), `measure(cwd, draft, {transport, session, harness, env} = {})` (extended signature; every branch's intent now carries `session`, and the review branch's intent also carries `launch`).

`session` is recorded on every intent, not only the review source's, for the same reason `lib/review.mjs`'s `review()` records a session unconditionally (plan 10): a uniform field is simpler to query than one that only sometimes exists, and a `jev` measurement's session is still useful provenance even though nothing currently refuses on it. `launch` is `null` outside the review source.

- [ ] **Step 1: Write the failing tests**

```js
// tests/records.test.mjs (add to the measurement-family describe block from plan 15)
test('evaluation-intent carries session and, for review, launch', () => {
  const payload = { draft_digest: DIGEST, snapshot: SHA, log_head: SHA, adr_digest: DIGEST, settings_digest: DIGEST,
    policy_digest: DIGEST, source: 'review', request_digest: DIGEST, session: 'sess-1',
    launch: { harness: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', boundary: 'unenforced' } };
  assert.deepEqual(roundTrip('evaluation-intent', 'demo', payload).payload, payload);
  assert.deepEqual(roundTrip('evaluation-intent', 'demo', { ...payload, launch: null }).payload.launch, null);
});
```

```js
// tests/evaluate.test.mjs
describe('measure() records session and launch on the intent', () => {
  test('jev: session is recorded, launch is null', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, draft(), { transport: transport([scoreBody()]), session: 'sess-agent' });
    const intent = (await readLog(cwd)).findLast((x) => x.kind === 'evaluation-intent');
    assert.equal(intent.payload.session, 'sess-agent'); assert.equal(intent.payload.launch, null);
  });
  test('review: launch is the detected harness', async () => {
    const cwd = await repoWithCommitment(false);
    await measure(cwd, draft(), { session: 'sess-agent', env: { CAIRN_HARNESS: 'claude_code' } });
    const intent = (await readLog(cwd)).findLast((x) => x.kind === 'evaluation-intent');
    assert.equal(intent.payload.session, 'sess-agent');
    assert.deepEqual(intent.payload.launch, { harness: 'claude_code', model: null, transport: null, boundary: 'unenforced' });
  });
  test('a floor hit still records session', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, { ...draft(), named_paths: ['migrations/1.sql'] }, { session: 'sess-agent' });
    const intent = (await readLog(cwd)).findLast((x) => x.kind === 'evaluation-intent');
    assert.equal(intent.payload.session, 'sess-agent'); assert.equal(intent.payload.launch, null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/records.test.mjs tests/evaluate.test.mjs`
Expected: FAIL -- `evaluation-intent` has no `session`/`launch` fields yet.

- [ ] **Step 3: Implement**

```js
// lib/records.mjs -- replace the 'evaluation-intent' row (source stays non-nullable, plan 15 Task 2;
// this task only adds session and launch)
'evaluation-intent': { draft_digest: digest, snapshot: ws, log_head: ref, adr_digest: digest, settings_digest: digest,
  policy_digest: digest, source: oneOf('jev', 'review'), request_digest: nullable(digest),
  session: nullable(str), launch: nullable(obj({ harness: str, model: nullable(str), transport: nullable(oneOf('local', 'remote')), boundary: oneOf('enforced', 'unenforced') })) },
```

```js
// lib/evaluate.mjs -- measure()'s signature and intentBase construction
import { detectHarness } from './review.mjs';

export async function measure(cwd, draft, { transport = post, session = null, harness, env } = {}) {
  await recoverMeasurement(cwd);
  const D = normalizeDraft(draft);
  const { settings, digest: settingsDigest } = await loadSettings(cwd);
  const source = settings.typesafeai.enabled ? 'jev' : 'review';   // settled before the floor, plan 15 Task 9
  const id = await captureIdentity(cwd, D, settingsDigest);
  const f = await kernelFacts(cwd, D); f.ws = id.ws;
  const slug = f.slug ?? D.commitment;
  const floor = floorReasons(f);
  const intentBase = { draft_digest: id.draft_digest, snapshot: id.ws, log_head: id.log_head, adr_digest: id.adr_digest,
    settings_digest: id.settings_digest, policy_digest: policyDigest(settings), session };

  if (floor.length) {
    const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, { ...intentBase, source, request_digest: null, launch: null });
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
  const launch = !unavailable && source === 'review' ? detectHarness(settings, { harness, env }) : null;
  const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, { ...intentBase,
    source, request_digest: unavailable ? null : requestDigest(request), launch });
  if (unavailable) return finalizeMeasurement(cwd, slug, intentSha, { draftDigestValue: id.draft_digest, source, outcome: 'unavailable', reason: `unavailable ${unavailable}` });
  if (source === 'review') return { pending: 'review', intentSha, slug, state, request, n, launch };

  // ... the jev call, unchanged from plan 15 Task 9 ...
}
```

The jev-call body (crash handling, model-mismatch check, `parseScoreAnswers`, `finalizeMeasurement`) is unchanged from plan 15's Task 9; only the function signature and the intent payload construction above change. The pending-review return now also carries `state` (the same `M(D)` object `measureState` built two lines above), so Task 5's `renderMeasureBrief` can render the exact state a `jev` call would have received, with no second computation. `recoverMeasurement` (plan 15) needs no change: it reads `intent.payload.source`/`.request_digest`, never `.session`/`.launch`, and the `'measurement'` record it appends carries no session/launch fields to preserve.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/records.test.mjs tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/records.mjs lib/evaluate.mjs tests/records.test.mjs tests/evaluate.test.mjs
git commit -m "Record the session and, for the review source, the detected launch on every measurement intent"
```

---

### Task 2: `currentMeasurement`: missing, stale, or a different draft digest

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `readLog`, `range` from `lib/records.mjs` (already imported).
- Produces: `class MeasurementError extends Error`, `currentMeasurement(cwd, D) -> measurementRecord` (throws `MeasurementError` when missing, stale, or drawn from a different draft digest).

A measurement is current when: it is a `measurement` record in the open commitment range whose `draft_digest` equals `draftDigest(D)`; its named `intent` exists; and nothing besides that intent's own call and measurement records has been appended to the log since the intent (anything else -- another decision, an answer, a receipt, a fix -- means the repository moved on since the draft was measured, and the measurement is stale). The latest matching, non-stale measurement wins when more than one exists (a re-run after a stale one).

- [ ] **Step 1: Write the failing tests**

```js
import { currentMeasurement, MeasurementError } from '../lib/evaluate.mjs';
import { appendRecord } from '../lib/records.mjs';

describe('currentMeasurement', () => {
  test('missing: no measurement for this draft at all', async () => {
    const cwd = await repoWithCommitment();
    await assert.rejects(currentMeasurement(cwd, normalizeDraft(draft())), MeasurementError);
  });
  test('a fresh measurement for the exact draft is current', async () => {
    const cwd = await repoWithCommitment();
    const r = await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    const m = await currentMeasurement(cwd, normalizeDraft(draft()));
    assert.equal(m.sha, r.measurementSha);
  });
  test('a different draft digest (even a one-word change) is not found', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    await assert.rejects(currentMeasurement(cwd, normalizeDraft({ ...draft(), because: 'a different reason' })), MeasurementError);
  });
  test('stale: anything else appended to the log after the intent invalidates it', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    await appendRecord(cwd, 'item', 'auth-tokens', { kind: 'backlog', slug: 'idea-1', source: 'AUTH-003', body: 'an idea' });
    await assert.rejects(currentMeasurement(cwd, normalizeDraft(draft())), /stale/);
  });
  test('re-measuring after a stale hit produces a new current one', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    await appendRecord(cwd, 'item', 'auth-tokens', { kind: 'backlog', slug: 'idea-1', source: 'AUTH-003', body: 'an idea' });
    const r2 = await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    const m = await currentMeasurement(cwd, normalizeDraft(draft()));
    assert.equal(m.sha, r2.measurementSha);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `currentMeasurement` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
export class MeasurementError extends Error {}

function familyIsOnlyThingAfter(log, intentSha, measurementRec) {
  const idx = log.findIndex((x) => x.sha === intentSha);
  if (idx < 0) return false;
  const after = log.slice(idx + 1).map((x) => x.sha);
  const family = [measurementRec.payload.call, measurementRec.sha].filter(Boolean);
  return after.length === family.length && after.every((sha, i) => sha === family[i]);
}

export async function currentMeasurement(cwd, D) {
  const log = await readLog(cwd);
  const r = range(log);
  const scope = r.start ? r.records : log;
  const dd = draftDigest(D);
  const candidates = scope.filter((x) => x.kind === 'measurement' && x.payload.draft_digest === dd);
  for (const m of [...candidates].reverse()) {
    if (familyIsOnlyThingAfter(log, m.payload.intent, m)) return m;
  }
  if (candidates.length) throw new MeasurementError('cairn: the measurement for this draft is stale; run cairn measure again');
  throw new MeasurementError('cairn: no measurement for this exact draft; run cairn measure first');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Find the current measurement for a draft, refusing a missing, wrong-digest or stale one"
```

---

### Task 3: `decideConsequential` requires and names a composite-outcome measurement

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `currentMeasurement`, `MeasurementError` from `lib/evaluate.mjs` (Task 2); `decide` from `lib/adr.mjs` (plan 06, unchanged).
- Produces: `decideConsequential(cwd, draft) -> id` (modified: requires a current, `outcome: 'composite'` measurement; the ADR decision line's `evaluation` field names it).

Only `outcome: 'composite'` permits `cairn decide --consequential`: `floor`, `veto`, `unavailable` and `indeterminate` all mean code, not the agent's judgment, decided the draft is the developer's -- exactly the floor-and-veto carve-out the Global Constraints quote from section 5 ("nothing routes a floor-caught or vetoed draft to the agent"). `suggested` itself is never checked here: the agent may `decide` on a `suggested: developer` composite measurement too (advisory, not a route), and may `escalate --consequential` (Task 4) on a `suggested: agent` one (the agent's own choice past the suggestion).

- [ ] **Step 1: Write the failing tests**

```js
import { decideConsequential } from '../lib/escalate.mjs';
import { readAdr } from '../lib/adr.mjs';
import { measure } from '../lib/evaluate.mjs';

describe('decideConsequential requires a measurement', () => {
  test('refuses with no measurement at all', async () => {
    const cwd = await repoWithCommitment();
    await assert.rejects(decideConsequential(cwd, draft()), /no measurement/);
  });
  test('names the measurement on the ADR line; suggested is not checked', async () => {
    const cwd = await repoWithCommitment();
    const body = scoreBody({ evidence: { type: 'score', score: 4, confidence: 0.9, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 } } }); // pushes composite high -> suggested developer
    const r = await measure(cwd, draft(), { transport: transport([body]) });
    assert.equal(r.suggested, 'developer');
    const id = await decideConsequential(cwd, draft());
    const line = (await readAdr(cwd)).findLast((l) => l.kind === 'decision');
    assert.equal(line.id, id); assert.equal(line.evaluation, r.measurementSha); assert.equal(line.by, 'agent');
  });
  test('refuses a floor-outcome or vetoed measurement: decide is not the floor-caught path', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, { ...draft(), named_paths: ['migrations/1.sql'] });
    await assert.rejects(decideConsequential(cwd, { ...draft(), named_paths: ['migrations/1.sql'] }), /routes to the developer|floor/);
    const cwd2 = await repoWithCommitment();
    const vetoBody = scoreBody({ contract: { type: 'score', score: 3.5, confidence: 0.9, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0.5, 4: 0.5 } } });
    await measure(cwd2, draft(), { transport: transport([vetoBody]) });
    await assert.rejects(decideConsequential(cwd2, draft()), /routes to the developer|veto/);
  });
  test('refuses a stale measurement, exactly as currentMeasurement does', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    await escalate(cwd, { commitment: 'auth-tokens', concerns: ['AUTH-003'], question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i', options: [], named_paths: [], cited_decisions: [] });
    await assert.rejects(decideConsequential(cwd, draft()), /stale/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL -- `decideConsequential` currently writes a decision line with `evaluation: d.evaluation ?? null` from a caller-supplied field, never consulting `currentMeasurement`.

- [ ] **Step 3: Implement**

```js
// lib/escalate.mjs -- replace decideConsequential
import { currentMeasurement } from './evaluate.mjs';

export async function decideConsequential(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  const m = await currentMeasurement(cwd, d);
  if (m.payload.outcome !== 'composite') throw new DraftError(`cairn: measurement ${m.sha} routes to the developer (${m.payload.outcome}); cairn escalate --consequential instead of deciding`);
  return decide(cwd, { ...decisionFields(d), by: 'agent', evaluation: m.sha }, 'decide');
}
```

The draft's own optional `evaluation` field (still accepted by `validateDraft`/`draftDigest` for backward-compatible fixture construction, plan 09) is no longer read here: `currentMeasurement` is the only source of truth for which measurement a decision names, so a caller cannot forge or skip it by passing a different SHA on the draft object.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Require a current, composite-outcome measurement before a Consequential decision, and name it on the ADR line"
```

---

### Task 4: `escalateConsequential`; wiring `cairn decide --consequential` and `cairn escalate --consequential`

**Files:**
- Modify: `lib/escalate.mjs`, `lib/cli.mjs`
- Test: `tests/escalate.test.mjs`, `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `currentMeasurement` (Task 2), `writeEscalation` (already private to `lib/escalate.mjs`; exported here for `escalateConsequential`'s own use, matching how `escalate()` already calls it).
- Produces: `escalateConsequential(cwd, draft) -> sha` (new), `COMMANDS.decide.run` and `COMMANDS.escalate.run` (both modified).

Correction to plan on record: `cairn decide --consequential` is not, today, wired to `lib/escalate.mjs`'s `decideConsequential`. The existing `decideCommand` (`lib/cli.mjs`) already uses `--consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body <t>` for a *different* flow -- the spec-phase deference decision the skills already call (`skills/new-project/SKILL.md` and its siblings: "A ruling instead of a confirmation is a deference decision"), written with `lib/adr.mjs`'s bare `decide()` before any commitment is even open, so it has no requirement concerns, no options and nothing to measure. `decideConsequential` (`lib/escalate.mjs`) is the *other* flow: the work-loop draft, with `--commitment`/`--concern`/`--question`/`--recommendation`/etc., the one section 10 measures. Both are legitimately "a Consequential decision" and both keep the same `cairn decide --consequential` verb (mandatory `--consequential` stays a confirmation flag, not a mode switch, exactly as it is today); `decideCommand` now dispatches on which flag set is present -- `--title` for the old spec-phase shape, `--commitment` for the new draft shape -- rather than trying to merge two structurally different inputs into one parser. This task adds that dispatch; it does not touch the spec-phase shape's own behavior.

`cairn escalate` without `--consequential` is unaffected: it still calls the plain `escalate()` (no measurement, any level -- scope rulings, disputes, cycle escalations, the fourth-attempt rule). `cairn escalate --consequential` is new (no existing flag to collide with) and is the only path that consumes a measurement and is the only path a floor-caught or vetoed draft, or an agent's own choice to escalate past a `suggested: agent` composite, can take -- exactly what makes Waiting "arise only two ways" true in code, not merely in prose.

- [ ] **Step 1: Write the failing tests**

```js
import { escalateConsequential } from '../lib/escalate.mjs';

describe('escalateConsequential', () => {
  test('names the current measurement on the escalation, regardless of outcome', async () => {
    const cwd = await repoWithCommitment();
    const r = await measure(cwd, { ...draft(), named_paths: ['migrations/1.sql'] });
    const sha = await escalateConsequential(cwd, { ...draft(), named_paths: ['migrations/1.sql'] });
    const esc = (await readLog(cwd)).find((x) => x.sha === sha);
    assert.equal(esc.kind, 'escalation'); assert.equal(esc.payload.evaluation, r.measurementSha);
  });
  test('the agent may escalate past a suggested: agent composite measurement (its own choice)', async () => {
    const cwd = await repoWithCommitment();
    const r = await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    assert.equal(r.suggested, 'agent');
    const sha = await escalateConsequential(cwd, draft());
    assert.equal((await readLog(cwd)).find((x) => x.sha === sha).payload.evaluation, r.measurementSha);
  });
  test('refuses with no current measurement, exactly like decideConsequential', async () => {
    const cwd = await repoWithCommitment();
    await assert.rejects(escalateConsequential(cwd, draft()), /no measurement/);
  });
  test('the plain escalate() (used by dispute, cycle escalations, scope rulings) is unaffected: no measurement required', async () => {
    const cwd = await repoWithCommitment();
    const sha = await escalate(cwd, { commitment: 'auth-tokens', concerns: ['AUTH-003'], question: 'q', recommendation: 'r',
      because: 'b', if_wrong: 'w', instead: 'i', options: [], named_paths: [], cited_decisions: [] });
    assert.match(sha, /^[0-9a-f]{40}$/);
  });
});
```

```js
// tests/cli.test.mjs -- uses the file's own run(argv, cwd, extra) helper (already defined at the
// top of this file, plan 03/09: `let out='', err=''; const code = await main(argv, {cwd, stdout:
// {write:(s)=>{out+=s;}}, stderr:{write:(s)=>{err+=s;}}, ...extra}); return {code, out, err};`) and
// its own draftArgs(D) helper, added here since no existing helper turns a draft object into argv
// (parseEscalateArgs goes the other way).
function draftArgs(d) {
  const argv = ['--commitment', d.commitment];
  for (const c of d.concerns) argv.push('--concern', c);
  argv.push('--question', d.question, '--recommendation', d.recommendation, '--because', d.because, '--if-wrong', d.if_wrong, '--instead', d.instead);
  for (const o of d.options) argv.push('--option', o);
  for (const p of d.named_paths) argv.push('--path', p);
  for (const c of d.cited_decisions) argv.push('--decision', c);
  return argv;
}

describe('escalate --consequential and decide --consequential (CLI dispatch)', () => {
  test('escalate --consequential routes through escalateConsequential', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    const r = await run(['escalate', '--consequential', ...draftArgs(draft())], cwd);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /cairn: escalate/);
  });
  test('plain escalate (no --consequential) needs no measurement', async () => {
    const cwd = await repoWithCommitment();
    const r = await run(['escalate', ...draftArgs(draft())], cwd);
    assert.equal(r.code, 0, r.err);
  });
  test('decide --consequential --commitment ... routes through decideConsequential', async () => {
    const cwd = await repoWithCommitment();
    await measure(cwd, draft(), { transport: transport([scoreBody()]) });
    const r = await run(['decide', '--consequential', ...draftArgs(draft())], cwd);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /cairn: decide/);
  });
  test('decide --consequential --title ... (the spec-phase deference shape) is unaffected', async () => {
    const cwd = await repoWithCommitment();
    const r = await run(['decide', '--consequential', '--title', 't', '--rests-on', 'AUTH-003', '--wrong-if', 'w', '--body', 'b'], cwd);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /^decide /);
  });
  test('decide --consequential with neither --title nor --commitment refuses', async () => {
    const cwd = await repoWithCommitment();
    const r = await run(['decide', '--consequential'], cwd);
    assert.equal(r.code, 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/escalate.test.mjs tests/cli.test.mjs`
Expected: FAIL, `escalateConsequential` is not exported, `cairn escalate --consequential` is not recognized (it is parsed as an ordinary, unrecognized escalate flag today, since `parseEscalateArgs` refuses any flag not in its known set), and `cairn decide --consequential --commitment ...` is refused ("decide needs --title, --rests-on, --wrong-if and --body").

- [ ] **Step 3: Implement**

```js
// lib/escalate.mjs -- append, near decideConsequential
export async function escalateConsequential(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  const m = await currentMeasurement(cwd, d);
  return writeEscalation(cwd, d.commitment, { ...d, evaluation: m.sha });
}
```

```js
// lib/cli.mjs -- escalateCommand grows a --consequential branch; the old evaluator-route plumbing
// (escalateWithRoute, splitTransportFlag's use here, --transport-module) is removed: cairn measure
// (Task 5) is now the only place a transport is ever invoked, so escalate itself never needs one.
async function escalateCommand(argv, { cwd, stdout }) {
  const consequential = argv.includes('--consequential');
  const rest = argv.filter((a) => a !== '--consequential');
  const draft = parseEscalateArgs(rest);
  if (consequential) {
    const { escalateConsequential } = await import('./escalate.mjs');
    const sha = await escalateConsequential(cwd, draft);
    stdout.write(`cairn: escalate ${draft.commitment} ${sha}\n`);
    return 0;
  }
  const { escalate } = await import('./escalate.mjs');
  const sha = await escalate(cwd, draft);
  stdout.write(`cairn: escalate ${draft.commitment} ${sha}\n`);
  return 0;
}
```

```js
// lib/cli.mjs -- decideCommand dispatches on which flag set is present: --title is the existing
// spec-phase deference shape (bare decide(), unchanged); --commitment is the new work-loop draft
// shape (decideConsequential, Task 3). Neither present is a refusal, same as today's message style.
async function decideCommand(argv, { cwd, stdout }) {
  if (!argv.includes('--consequential')) throw new Refusal('decide needs --consequential (a Blocking decision is an escalation, not this command)');
  if (argv.includes('--commitment')) {
    const { decideConsequential } = await import('./escalate.mjs');
    const { parseEscalateArgs } = await import('./escalate.mjs');
    const draft = parseEscalateArgs(argv.filter((a) => a !== '--consequential'));
    const id = await decideConsequential(cwd, draft);
    stdout.write(`cairn: decide ${draft.commitment} ${id}\n`);
    return 0;
  }
  const title = flagValue(argv, '--title');
  const restsOnRaw = flagValue(argv, '--rests-on');
  const wrongIf = flagValue(argv, '--wrong-if');
  const body = flagValue(argv, '--body');
  if (!title || !restsOnRaw || !wrongIf || !body) throw new Refusal('decide needs --title, --rests-on, --wrong-if and --body (or the work-loop draft shape: --commitment, --concern, --question, --recommendation, --because, --if-wrong, --instead)');
  const rests_on = restsOnRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const id = await decide(cwd, { title, rests_on, wrong_if: wrongIf, body });
  stdout.write(`decide ${id}\n`);
}
```

Update `COMMANDS.decide.usage` to `'decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body <t> (a spec-phase deference decision) | decide --consequential --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <p>...] [--decision <id>...] (a measured work-loop decision)'` and `COMMANDS.escalate.usage` to `'escalate [--consequential] --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <p>...] [--decision <id>...]'` (the old `--transport-module (test only)` flag is gone from `escalate`'s own surface; plan 18's fixtures inject a transport into `cairn measure` instead, per Task 5).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/escalate.test.mjs tests/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs lib/cli.mjs tests/escalate.test.mjs tests/cli.test.mjs
git commit -m "Wire escalate --consequential and decide --consequential --commitment to the measured work-loop draft, leaving the spec-phase deference shape and plain escalate unmeasured"
```

---

### Task 5: `cairn measure`: the jev path and the review source's `--brief`

**Files:**
- Modify: `lib/evaluate.mjs`, `lib/cli.mjs`
- Test: `tests/evaluate.test.mjs`, `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `measure` (Task 1), `detectHarness` from `lib/review.mjs`.
- Produces: `renderMeasureBrief({state, n, launch}) -> text`, `COMMANDS.measure` (new: `{usage, run}`).

`renderMeasureBrief` mirrors `lib/review.mjs`'s `renderBrief`: it shows the fresh reviewer exactly `M(D)` (the same closed state a `jev` call would receive -- section 10 requires both sources answer identically), the five Score questions with their criteria, and the boundary/output instructions. It carries no projection directory: `M(D)` is already the egress-checked, closed state `measureState` (plan 15) built, not a workspace snapshot, so there is nothing further to materialize or exclude.

- [ ] **Step 1: Write the failing tests**

```js
import { renderMeasureBrief } from '../lib/evaluate.mjs';

describe('the measure brief and the CLI', () => {
  test('renderMeasureBrief shows the five questions and M(D), never raw code paths outside option.files', () => {
    const state = { five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} };
    const text = renderMeasureBrief({ state, n: 0, launch: { name: 'claude_code', model: null, transport: null, boundary: 'unenforced' } });
    for (const d of ['evidence', 'reach', 'contract', 'surface', 'ambiguity']) assert.match(text, new RegExp(d));
    assert.match(text, /write its five Score answers/);
    assert.match(text, /cairn measure .* --file/);
  });
  test('cairn measure (jev source) completes synchronously and prints the outcome', async () => {
    const cwd = await repoWithCommitment();   // typesafeai.enabled: true
    const r = await runCli(cwd, ['measure', '--transport-module', fakeTransportPath(scoreBody()), ...draftFlags(draft())]);
    assert.equal(r.code, 0); assert.match(r.stdout, /cairn: measure auth-tokens .* composite/);
  });
  test('cairn measure --brief (review source) writes the intent and prints a launch block', async () => {
    const cwd = await repoWithCommitment(false);   // typesafeai.enabled: false
    const r = await runCli(cwd, ['measure', '--brief', ...draftFlags(draft())], { env: { CAIRN_HARNESS: 'claude_code' } });
    assert.equal(r.code, 0); assert.match(r.stdout, /start:.*fresh reviewer/); assert.match(r.stdout, /cairn measure auth-tokens .* --file/);
  });
  test('cairn measure without --brief on a review-source project refuses', async () => {
    const cwd = await repoWithCommitment(false);
    const r = await runCli(cwd, ['measure', ...draftFlags(draft())], { env: { CAIRN_HARNESS: 'claude_code' } });
    assert.equal(r.code, 1); assert.match(r.stderr, /--brief/);
  });
  test('cairn measure --brief on a jev-source project refuses: there is nothing to brief', async () => {
    const cwd = await repoWithCommitment();
    const r = await runCli(cwd, ['measure', '--brief', '--transport-module', fakeTransportPath(scoreBody()), ...draftFlags(draft())]);
    assert.equal(r.code, 1); assert.match(r.stderr, /--brief/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs tests/cli.test.mjs`
Expected: FAIL, `renderMeasureBrief` is not exported and `cairn measure` is `unknown command measure`.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
export function renderMeasureBrief({ state, n, launch }) {
  const L = [`# Measurement brief`, '', '## The draft', JSON.stringify(state.five, null, 2), '',
    `## The recommended option (draft.options[${n}])`, state.option.text, '', 'Touched files:',
    ...state.option.files.map((f) => `- ${f.path}`), state.option.diff ? '\nDiff:\n' + state.option.diff : '', '',
    '## Contract', JSON.stringify(state.contract, null, 2), '', '## Facts', JSON.stringify(state.facts, null, 2), '',
    '## Score five dimensions, 0 to 4 each', ''];
  for (const d of POLICY.DIMENSIONS) {
    L.push(`### ${d}`);
    POLICY.LEVELS[d].forEach((text, i) => L.push(`${i}: ${text}`));
    L.push('');
  }
  L.push('## Boundary', `Harness ${launch.name}, model ${launch.model ?? 'any'}, transport ${launch.transport ?? 'any'}.`,
    `Boundary: ${launch.boundary}.`, '', '## Your work',
    'You have none of the drafting agent\'s conversation context. Score each of the five dimensions above from the state given, 0 to 4, with a confidence in [0,1] and a probability distribution over the five levels summing to 1.',
    'write its five Score answers as JSON: {"model": "<your model id>", "session": "<your session id>", "transport": "local"|"remote", "usage": {"input_tokens": N, "output_tokens": N}, "answers": {"evidence": {"type":"score","score":N,"confidence":N,"probabilities":{"0":N,...,"4":N}}, "reach": {...}, "contract": {...}, "surface": {...}, "ambiguity": {...}}}',
    'to a file, then run: cairn measure <slug> --file <path>', '');
  return L.join('\n');
}
```

```js
// lib/cli.mjs
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
function splitFlag(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return { rest: argv, present: false, value: undefined };
  const takesValue = name === '--transport-module' || name === '--file' || name === '--harness';
  return { rest: takesValue ? [...argv.slice(0, i), ...argv.slice(i + 2)] : [...argv.slice(0, i), ...argv.slice(i + 1)], present: true, value: takesValue ? argv[i + 1] : true };
}
async function measureCommand(argv, { cwd, stdout, stderr, env }) {
  let rest = argv;
  const file = splitFlag(rest, '--file'); rest = file.rest;
  if (rest[0] && !rest[0].startsWith('--')) {
    // cairn measure <slug> --file <path>: complete a pending review measurement (Task 6)
    const [slug] = rest;
    if (!file.present) { stderr.write('cairn: measure <slug> --file <path> completes a pending review measurement\n'); return 1; }
    const { completeReviewMeasurement } = await import('./evaluate.mjs');
    const body = JSON.parse(await readFile(file.value, 'utf8'));
    const r = await completeReviewMeasurement(cwd, slug, body, { env: env ?? process.env });
    stdout.write(`cairn: measure ${slug} ${r.measurementSha} ${r.outcome}${r.suggested ? ' suggested:' + r.suggested : ''}\n`);
    return 0;
  }
  const brief = splitFlag(rest, '--brief'); rest = brief.rest;
  const tm = splitFlag(rest, '--transport-module'); rest = tm.rest;
  const draft = parseEscalateArgs(rest);
  const transport = tm.value ? (await import(pathToFileURL(resolvePath(tm.value)).href)).default : undefined;
  const { measure } = await import('./evaluate.mjs');
  const r = await measure(cwd, draft, { transport, session: process.env.CAIRN_SESSION ?? null, env: env ?? process.env });
  if (r.pending === 'review') {
    if (!brief.present) { stderr.write('cairn: measure: this project\'s review source needs --brief to print the launch block\n'); return 1; }
    const { renderMeasureBrief } = await import('./evaluate.mjs');
    const text = renderMeasureBrief({ state: r.state, n: r.n, launch: r.launch });
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const briefPath = join(cwd, '.cairn/output', `measure-${r.slug}-${r.intentSha.slice(0, 7)}.md`);
    await mkdir(join(cwd, '.cairn/output'), { recursive: true });
    await writeFile(briefPath, text);
    stdout.write(`cairn: measure ${draft.commitment} ${r.intentSha} pending review\nbrief: ${briefPath}\n${text}\n`);
    return 0;
  }
  if (brief.present) { stderr.write('cairn: measure: --brief is only for the review source; this project\'s typesafeai.enabled is true\n'); return 1; }
  stdout.write(`cairn: measure ${draft.commitment} ${r.measurementSha} ${r.outcome}${r.suggested ? ' suggested:' + r.suggested : ''}\n`);
  return 0;
}
```

The pending-review brief text is written to `.cairn/output/measure-<slug>-<intent sha prefix>.md`, mirroring `brief()`'s own `.cairn/output/brief-<digest>.md`, and its path is printed in the launch block, so a harness that needs a file path (not stdin) can read it.

Update `COMMANDS`:

```js
measure: { usage: 'measure [--brief] --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <p>...] [--decision <id>...] [--transport-module <path> (test only)] | measure <slug> --file <path>', run: measureCommand },
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs tests/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs lib/cli.mjs tests/evaluate.test.mjs tests/cli.test.mjs
git commit -m "Add cairn measure: synchronous for jev, a launch block like cairn brief for the review source"
```

---

### Task 6: `cairn measure <slug> --file <path>`: the review source's self-answer refusal

**Files:**
- Modify: `lib/evaluate.mjs` (the `measureCommand` wiring from Task 5 already calls this)
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Produces: `completeReviewMeasurement(cwd, slug, body, {env} = {}) -> {measurementSha, outcome, suggested, veto, composite}`.

`body` is the JSON the fresh reviewer wrote: `{model, session, transport, usage, answers: {<the five dimensions>}}`. The refusal mirrors `lib/review.mjs`'s `report()` exactly: `body.session === intent.payload.session` (the session that ran `cairn measure --brief`) is refused, matching "the report refuses the session that wrote the review" (section 9); a `body.model`/`body.transport` that disagrees with the intent's recorded `launch` (when the launch pinned one) is refused, matching `report()`'s own model/transport cross-check against the brief record.

- [ ] **Step 1: Write the failing tests**

```js
import { completeReviewMeasurement } from '../lib/evaluate.mjs';

const reviewBody = (over = {}) => ({ model: 'claude-fable-5-1', session: 'sess-reviewer', transport: 'remote',
  usage: { input_tokens: 5, output_tokens: 1 },
  answers: { evidence: { type: 'score', score: 3, confidence: 0.7, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.6, 4: 0.3 } },
    reach: { type: 'score', score: 0.5, confidence: 0.6, probabilities: { 0: 0.6, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0 } },
    contract: { type: 'score', score: 0.1, confidence: 0.9, probabilities: { 0: 0.9, 1: 0.1, 2: 0, 3: 0, 4: 0 } },
    surface: { type: 'score', score: 0, confidence: 0.8, probabilities: { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0 } },
    ambiguity: { type: 'score', score: 1, confidence: 0.5, probabilities: { 0: 0.3, 1: 0.4, 2: 0.2, 3: 0.1, 4: 0 } }, ...over } });

describe('completeReviewMeasurement', () => {
  test('records the composite from the five levels, exactly like the jev path', async () => {
    const cwd = await repoWithCommitment(false);
    const r = await measure(cwd, draft(), { session: 'sess-agent', env: { CAIRN_HARNESS: 'claude_code' } });
    const c = await completeReviewMeasurement(cwd, r.slug, reviewBody());
    assert.equal(c.outcome, 'composite'); assert.ok(typeof c.composite === 'number');
    const call = (await readLog(cwd)).findLast((x) => x.kind === 'evaluation-call');
    assert.equal(call.payload.source, 'review'); assert.equal(call.payload.session, 'sess-reviewer'); assert.equal(call.payload.model, 'claude-fable-5-1');
  });
  test('refuses the session that started the brief', async () => {
    const cwd = await repoWithCommitment(false);
    const r = await measure(cwd, draft(), { session: 'sess-agent', env: { CAIRN_HARNESS: 'claude_code' } });
    await assert.rejects(completeReviewMeasurement(cwd, r.slug, reviewBody({ session: 'sess-agent' })), /session/);
  });
  test('refuses a model or transport that disagrees with the launch, when one was pinned', async () => {
    const cwd = await repoWithCommitment(false, { harness: { claude_code: { adversary_model: 'claude-fable-5-1', adversary_transport: 'remote' } } });
    const r = await measure(cwd, draft(), { session: 'sess-agent', env: { CAIRN_HARNESS: 'claude_code' } });
    await assert.rejects(completeReviewMeasurement(cwd, r.slug, reviewBody({ model: 'some-other-model' })), /model/);
  });
  test('a null-pinned launch (harness entry null or absent) accepts any model', async () => {
    const cwd = await repoWithCommitment(false);
    const r = await measure(cwd, draft(), { session: 'sess-agent', env: { CAIRN_HARNESS: 'claude_code' } });
    const c = await completeReviewMeasurement(cwd, r.slug, reviewBody({ model: 'anything' }));
    assert.equal(c.outcome, 'composite');
  });
  test('an invalid answer set is unavailable invalid, same as the jev path', async () => {
    const cwd = await repoWithCommitment(false);
    const r = await measure(cwd, draft(), { session: 'sess-agent', env: { CAIRN_HARNESS: 'claude_code' } });
    const bad = reviewBody(); delete bad.answers.surface;
    const c = await completeReviewMeasurement(cwd, r.slug, bad);
    assert.equal(c.outcome, 'unavailable'); assert.equal(c.suggested, null);
  });
  test('refuses when there is no pending review intent for the slug', async () => {
    const cwd = await repoWithCommitment(false);
    await assert.rejects(completeReviewMeasurement(cwd, 'auth-tokens', reviewBody()), /no pending/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `completeReviewMeasurement` is not exported.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (append)
export async function completeReviewMeasurement(cwd, slug, body, opts = {}) {
  const log = await readLog(cwd);
  const r = range(log);
  const scope = r.start ? r.records : log;
  const intent = scope.findLast((x) => x.kind === 'evaluation-intent' && x.target === slug && x.payload.source === 'review'
    && !scope.some((m) => m.kind === 'measurement' && m.payload.intent === x.sha));
  if (!intent) throw new MeasurementError(`cairn: no pending review measurement for ${slug}`);
  const launch = intent.payload.launch;
  if (launch.model !== null && body.model !== launch.model) throw new MeasurementError(`cairn: measure: model ${body.model} does not match the launch instruction ${launch.model}`);
  if (launch.transport !== null && body.transport !== launch.transport) throw new MeasurementError(`cairn: measure: transport ${body.transport} does not match the launch instruction ${launch.transport}`);
  if (intent.payload.session !== null && body.session === intent.payload.session) throw new MeasurementError(`cairn: measure: session ${body.session} started the brief`);
  const { settings } = await loadSettings(cwd);
  const request = { model: body.model, questions: Object.fromEntries(POLICY.DIMENSIONS.map((d) => [d, {}])) };
  const parsed = parseScoreAnswers(request, JSON.stringify(body));
  const raw = b64url(Buffer.from(JSON.stringify(body), 'utf8'));
  if (parsed.invalid) {
    const callSha = await appendCall(cwd, slug, intent.sha, { source: 'review', request_digest: intent.payload.request_digest, outcome: 'response', model: body.model, transport: body.transport, session: body.session, raw });
    return finalizeMeasurement(cwd, slug, intent.sha, { call: callSha, draftDigestValue: intent.payload.draft_digest, source: 'review', model: body.model, outcome: 'unavailable', reason: `unavailable invalid: ${parsed.invalid}` });
  }
  const answers = POLICY.DIMENSIONS.map((d) => ({ id: d, value: { score: parsed.levels[d], confidence: parsed.confidences[d], probabilities: null } }));
  const callSha = await appendCall(cwd, slug, intent.sha, { source: 'review', request_digest: intent.payload.request_digest, outcome: 'response', model: body.model, transport: body.transport, session: body.session, raw, answers, usage: parsed.usage });
  return finalizeMeasurement(cwd, slug, intent.sha, { call: callSha, draftDigestValue: intent.payload.draft_digest, source: 'review', model: body.model,
    levels: parsed.levels, confidences: parsed.confidences, settings, outcome: 'composite' });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Complete a review-source measurement from a file, refusing the brief's own session, model or transport mismatch"
```

---

### Task 7: Wake: `developer: absent` exits 4 for a floor-originated escalation

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

**Interfaces:**
- Consumes: `st.log`, `st.settings` (already on `readState`'s returned state).
- Produces: the `waiting` predicate (modified: returns `{..., exit: 4}` when `st.settings.developer === 'absent'` and the open escalation names a `floor`-outcome measurement).

No new action row is added to wake's precedence table. Section 5's own paragraph says the measure step and the Consequential-decision requirement it carries are deliberately not queued as a wake action ("wake never queues it as a next action the way it queues `declare` or `run`"); this task changes only what wake already does with an *existing* unanswered escalation, which is unaffected by that carve-out -- an escalation, once written, is exactly the same kind of record whether it came from the floor, a veto, the agent's own choice, or an unrelated scope/dispute/cycle escalation, and `waiting` already handles all of those uniformly except for this one new exit code.

- [ ] **Step 1: Write the failing tests**

```js
describe('developer: absent exits 4 on a floor escalation', () => {
  test('a floor escalation under developer: absent is Waiting with exit 4', async () => {
    const l = await loopRepo({ settings: { developer: 'absent' } });
    await l.add('measurement', l.slug, { intent: SHA, call: null, draft_digest: DIGEST, source: null, model: null, levels: [], composite: null, veto: null, suggested: null, outcome: 'floor', reason: 'floor:data' });
    const mSha = (await l.log()).at(-1).sha;
    await l.escalate(mSha /* as evaluation, via a small add() below */);
    // ... construct the escalation with evaluation: mSha directly via l.add('escalation', ...) since loopRepo's own
    // escalate() helper (tests/helpers/loop.mjs) needs a small extension to accept an evaluation sha; see the
    // fixture-update note below.
    const w = await wake(l.cwd);
    assert.equal(w.verdict, 'Waiting'); assert.equal(w.exit, 4);
  });
  test('a floor escalation with developer: present is ordinary Waiting, exit 0', async () => {
    const l = await loopRepo({ settings: { developer: 'present' } });
    // ... same construction ...
    const w = await wake(l.cwd);
    assert.equal(w.verdict, 'Waiting'); assert.equal(w.exit, undefined);
  });
  test('a non-floor escalation (a plain dispute) under developer: absent is ordinary Waiting, exit 0', async () => {
    const l = await loopRepo({ settings: { developer: 'absent' } });
    await l.escalate(['cycle']);
    const w = await wake(l.cwd);
    assert.equal(w.verdict, 'Waiting'); assert.equal(w.exit, undefined);
  });
  test('cmdWake exits 4 and prints the five fields, not a bare line', async () => {
    const l = await loopRepo({ settings: { developer: 'absent' } });
    // ... construct the floor escalation ...
    const r = l.runWake();   // spawnSync, tests/helpers/loop.mjs
    assert.equal(r.status, 4);
    assert.match(r.stdout, /verdict: Waiting/); assert.match(r.stdout, /question:/);
  });
});
```

`tests/helpers/loop.mjs`'s `escalate` step currently writes `evaluation: null` unconditionally (`escalate: (concerns, s = slug) => add('escalation', s, { ..., evaluation: null })`); extend it to accept an optional evaluation sha, `escalate: (concerns, s = slug, evaluation = null) => add('escalation', s, { ..., evaluation })`, so this task's fixtures can name a measurement without a third helper.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL -- the `waiting` predicate never sets `exit`, and `tests/helpers/loop.mjs`'s `escalate` cannot name an evaluation sha yet.

- [ ] **Step 3: Implement**

```js
// tests/helpers/loop.mjs -- extend the escalate step
escalate: (concerns, s = slug, evaluation = null) => add('escalation', s, { slug: s, question: 'Q?', recommendation: 'R', because: 'B', if_wrong: 'W', instead: 'I', concerns, evaluation }),
```

```js
// lib/wake.mjs -- replace the 'waiting' predicate
function isFloorEscalation(log, esc) {
  if (!esc.payload.evaluation) return false;
  const m = log.find((x) => x.sha === esc.payload.evaluation && x.kind === 'measurement');
  return !!m && m.payload.outcome === 'floor';
}
define('waiting', (st) => {
  const o = openEscalations(st.log)[0];
  if (!o) return null;
  if (o.lastAsk && !o.replied) return unmet('reply', o.e.payload.slug, `the developer asked: ${o.lastAsk.payload.text}`);
  const { slug, question, recommendation, because, if_wrong, instead } = o.e.payload;
  const base = { verdict: 'Waiting', party: 'developer', reason: `escalation ${o.e.sha.slice(0, 7)} awaits an answer`,
    escalation: { sha: o.e.sha, slug, question, recommendation, because, if_wrong, instead }, predicate: PREDICATES.waiting };
  if (st.settings && st.settings.developer === 'absent' && isFloorEscalation(st.log, o.e)) return { ...base, exit: 4 };
  return base;
});
```

`verdictOf`'s existing dispatch (`if (unmet) return unmet.exit ? unmet : { predicate: PREDICATES[...], ...unmet };`) already returns an object carrying `.exit` as-is when present, unchanged since `recover`/`supersession` already rely on that same branch; `base` already carries `predicate`, so the exit-4 object is complete without further merging. `cmdWake` needs one addition:

```js
// lib/wake.mjs -- cmdWake
export async function cmdWake(cwd) {
  const v = await wake(cwd);
  process.stdout.write(render(v));
  return v.exit === 3 ? 3 : v.exit === 4 ? 4 : 0;
}
```

`render(v)` needs no change: its `v.exit === 3` branch returns early only for that exact value, and the exit-4 object still carries `verdict: 'Waiting'`, so it falls through to the existing Waiting-rendering branch and prints the same five fields Waiting always prints, exactly as the spec requires.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS. Then run the whole suite: `node --test tests/*.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs tests/helpers/loop.mjs
git commit -m "Exit 4 from wake when developer: absent and the open escalation is the evaluator floor's"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| cairn decide --consequential refuses a draft whose measurement is missing, stale, or built from a different draft digest (5) | 2, 3 |
| Wake never queues the measure step as an action row (5) -- no new wake predicate is added for it | design note, Task 7 |
| Waiting for a Consequential decision arises only two ways: the floor, or the agent's own choice to escalate (5) | 3, 4 |
| A measurement whose suggestion is agent is information, not consent; the agent may still escalate past it (5, 10) | 4 |
| Nothing routes a floor-caught or vetoed draft to the agent (5) | 3 |
| Only a Consequential draft is measured; every other level uses the kernel level directly; cairn measure runs first, then the agent decides except at the floor, a veto, or its own choice (8) | 3, 4, 5 |
| The review source starts the harness's configured review model exactly as cairn brief starts the adversary, through the harness, with none of the agent's own context, answering the same five dimensions in the same shape; the launch instruction and resolved model are recorded the way a report already records them (10) | 1, 5, 6 |
| Where a harness reports session identity, the report/measurement refuses the session that wrote it (9, applied here) | 6 |
| developer: absent removes the developer as a destination only once the floor or a veto names one (10) | 7 |
| developer: absent + the floor: the run records the escalation exactly as with a developer present, wake prints the five fields exactly as Waiting always prints them, and exits 4 instead of sitting at Waiting (5) | 7 |
| Exit 4 is a real Waiting verdict this run cannot answer, distinct from exit 3's non-verdict state (2, 5) | 7 |

Left to other plans:

- The agent-facing guidance on when to run `cairn measure`, how to read the five levels and the suggestion, when to escalate anyway, and what belongs in `--because`: plan 17 (the working agreement template and the skills).
- `docs/manual.md`'s command reference and record reference tables, `README.md`, `CHANGELOG.md`: plan 17.
- The benchmark that exercises `cairn measure` end to end over the 24-scenario ledger project through the real CLI, and its offline scoring test: plan 18.
- A veto's own falsifier ("an agent decision on a draft carrying a veto", section 10) is enforced by Task 3's `outcome !== 'composite'` refusal; this plan does not separately re-derive the veto at decide time, since `finalizeMeasurement` (plan 15) already turned a fired veto into `outcome: 'veto'` at measurement time and that outcome is what Task 3 reads.
- `cairn calibrate`'s CLI wiring is unchanged by this plan (plan 15, Task 10); nothing here alters how a calibration label reaches the log.
