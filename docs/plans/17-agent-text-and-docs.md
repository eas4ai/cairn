# Agent Text and Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every piece of agent-facing and human-facing text into agreement with plans 15 and 16's composite gut-check design: the working agreement's measure-step bullet, the three work-loop skills' hand-off to it, `README.md`'s one-paragraph description, `docs/manual.md`'s evaluator section and its command and record reference tables, `CHANGELOG.md`'s evaluator bullet, and the cutover checklist and cut list. Hooks are unchanged (they print the wake verdict, nothing more, and this redesign changes what wake prints only in the one exit-4 case plan 16 already built) and are out of scope here.

**Architecture and a note on this plan's own shape:** this plan touches no `lib/` code. One of its tasks (the working agreement template) has real automated test coverage today (`tests/skills.test.mjs` greps the template for required phrases) and follows the same test-first shape every other plan uses. The rest -- `README.md`, `docs/manual.md`, `docs/walkthrough.md`, `CHANGELOG.md`, `docs/cutover/checklist.md`, `docs/cutover/cut-list.md` -- have no automated content test anywhere in this codebase today (confirmed: no plan from 01 through 14 adds one, and `tests/release.test.mjs` checks `CHANGELOG.md`'s heading shape, never its prose). This plan does not invent test infrastructure these files have never had; each such task instead gives the exact current passage, the exact replacement, and a real, run-it-yourself verification command (`grep`) proving the stale text is gone and the new text is present. That is this plan's own version of "write the check, then satisfy it" for prose that this repository has never unit-tested.

**Tech Stack:** Markdown only. `node --test` for the one task with real test coverage.

**Spec:** `docs/spec/cairn-v2.md`, revised 2026-09-19, section 10 (all, for accurate agent-facing description), section 13 decisions 53, 54, 55, 56 (the developer's stated reasons, quoted directly into the docs where a reader would want to know why). This plan does not change requirements or record shapes; it restates what plans 15 and 16 already built, so it names no new falsifier of its own.

**Depends on:** plans 15 and 16 (every command, flag and behavior this plan describes must already exist in those plans' implementations before this plan's prose can honestly claim it). Consumes plan 13 (`skills/new-project/templates/AGENTS.md`, the three work-loop skills, `tests/skills.test.mjs`) and plan 13's own release script (`CHANGELOG.md`'s heading shape, unaffected).

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec and from the developer's own words that section 13 already records:

- "the goddamn evaluator was to reduce ritual assent" (decision 54).
- "The reason I wanted this design was to be able to use Cairn in an autonomous benchmark" (section 10, quoting the developer, decision 53).
- "The evaluator is a measurement the agent takes of that draft to check its own judgment before it decides. It is not a second decision-maker, an advisor the agent must obey, or a review queue: the agent still decides." (section 10)
- "The suggestion is advisory, not a route: only the floor above and a veto force the developer. In every other case the agent decides ... and the agent may still escalate toward the developer at its own judgment after reading the measurement, whatever the suggestion says." (section 10)
- "There is no `mode` field: the composite only ever produces an advisory suggestion (section 10), never a live/shadow authority switch." (section 2)
- "Calibration tunes `weights`, `agent_ceiling` and `confidence_floors`; it does not gate whether the agent may decide, because gating live routing behind a calibration pass is what produced zero agent routing under the superseded design." (section 10)
- Shipped text is ASCII. No AI attribution anywhere in commits, docs or output (`docs/plans/overview.md`'s own Global Constraints, unchanged).

---

## File structure

```
skills/new-project/templates/AGENTS.md   the measure-step bullet
tests/skills.test.mjs                    extended assertions on the template
skills/new-project/SKILL.md              (verified, not edited; see Task 2)
skills/existing-project/SKILL.md         (verified, not edited; see Task 2)
skills/next-feature/SKILL.md             (verified, not edited; see Task 2)
README.md                                the evaluator paragraph
docs/manual.md                           the evaluator section, command reference, record reference
CHANGELOG.md                             the evaluator bullet, in the still-open 2.0.0 entry
docs/cutover/checklist.md                a Before-step verifying the new settings shape
docs/cutover/cut-list.md                 the AUTO row's reason, extended one clause
docs/walkthrough.md                      (verified, not edited; see Task 6)
```

---

### Task 1: The working agreement's measure-step bullet

**Files:**
- Modify: `skills/new-project/templates/AGENTS.md`
- Modify: `tests/skills.test.mjs`

**Interfaces:**
- Consumes: nothing new; the template already lists a move for every wake action and the "Decide by level" sentence (line 38 today) is the exact spot the measure step belongs, since it already distinguishes Routine/Judged/Consequential/Blocking.
- Produces: an `AGENTS.md` template whose Consequential sentence covers the measure step, reading the suggestion, and escalating past it; `tests/skills.test.mjs` gains the assertions proving so.

Today's line 38 reads: "Out of scope is captured, never built: `cairn item --backlog`, `--next-feature`, or `--defect --from <REQ>`. A defect against this commitment's requirement is worked here, not captured. Decide by level: Routine and Judged leave no record; Consequential is `cairn decide --consequential` and continues; Blocking is `cairn escalate` and stops." The Consequential clause is now incomplete: it names the command but not the measurement step in front of it, and it does not say what "the agent's own choice to escalate anyway" looks like in practice. Split it into its own paragraph so the out-of-scope sentence keeps its own place.

- [ ] **Step 1: Write the failing tests**

```js
// tests/skills.test.mjs (existing describe block: "the AGENTS.md template states a move for
// every verdict and action"; add these assertions to that same test, or a new one beside it)
test("the AGENTS.md template covers the measure step for a Consequential decision", () => {
  const t = readFileSync(join(ROOT, "skills/new-project/templates/AGENTS.md"), "utf8");
  assert.ok(t.includes("`cairn measure`"), "names the command");
  assert.ok(/suggested/.test(t), "mentions reading the suggestion");
  assert.ok(t.includes("`cairn decide --consequential"), "still names the decide command");
  assert.ok(t.includes("`cairn escalate --consequential"), "names the new escalate flag");
  assert.ok(/advi[cs]/.test(t) || /information, not consent/.test(t), "says the suggestion is advice, not a route");
  for (const gone of ["shadow", "route mode", "capture the recommended option"]) assert.ok(!t.includes(gone), gone);
  assert.ok(!/[^\x00-\x7f]/.test(t));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/skills.test.mjs`
Expected: FAIL -- the template names neither `cairn measure` nor `suggested` nor `escalate --consequential` today.

- [ ] **Step 3: Write the replacement passage**

Replace the single sentence "Decide by level: Routine and Judged leave no record; Consequential is `cairn decide --consequential` and continues; Blocking is `cairn escalate` and stops." with:

```markdown
Decide by level: Routine and Judged leave no record; Blocking is `cairn escalate` and stops.

A Consequential decision -- one with real options and a recommendation, tied to this commitment's requirements -- takes one more step first: `cairn measure` with the same fields `cairn decide`/`cairn escalate` would take (`--commitment`, `--concern`, `--question`, `--recommendation`, `--because`, `--if-wrong`, `--instead`, `--option`, `--path`, `--decision`). It prints five scored dimensions (evidence, reach, contract fit, new surface, ambiguity), a composite, and `suggested: agent` or `suggested: developer`. The suggestion is information, not consent: read it and the five numbers, then either `cairn decide --consequential --commitment ...` (the same flags, continuing) or `cairn escalate --consequential --commitment ...` (the same flags, stopping) -- your own judgment, whatever the suggestion says. Two things bypass your judgment entirely and are always `cairn escalate --consequential`: the measurement's own floor (a draft that would change an Agreed requirement's text or falsifier, the working agreement, or data that cannot be regenerated) and its veto (an option that reaches too far, changes the contract, or opens too much new surface) -- `cairn decide --consequential` refuses either one and names the measurement that caught it. Put your real evidence in `--because`: a command, a file, quoted output, or the failing test and the falsifier it maps to raise the evidence score and lower the composite.
```

This is one continuous paragraph in the actual file (wrapped to the template's existing line width); it is shown here with its sentences separated by blank context only for readability in this plan. `cairn decide --consequential --title ...` (the spec-phase deference ruling, used only during the spec-phase tail before any commitment is open) is untouched -- it lives earlier in this same template, in the `agreed` step's own sentence, which this task does not edit.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/skills.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/new-project/templates/AGENTS.md tests/skills.test.mjs
git commit -m "Add the measure step to the working agreement's Consequential-decision guidance"
```

---

### Task 2: The three work-loop skills: verified, not edited

**Files:**
- Read only: `skills/new-project/SKILL.md`, `skills/existing-project/SKILL.md`, `skills/next-feature/SKILL.md`, `skills/install-cairn/SKILL.md`

**Interfaces:** none; this task changes no file.

**Finding, recorded here rather than assumed:** all three work-loop skills (`new-project`, `existing-project`, `next-feature`) cover only the spec-phase tail -- initializing, writing the keystone/glossary/domains/roadmap, the four developer gates, lint, and the one `cairn decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body "<the developer's words>"` sentence for a deference ruling made *before* any commitment is open. Every one of them ends with "Run `cairn wake`; it names the first work-loop action ... Hand over to AGENTS.md." None of the four topics this iteration adds -- the measure step, reading the measurement, when to escalate, evidence in `--because` -- belongs to the spec-phase tail: they are work-loop behavior, and the work loop is `AGENTS.md`'s job by these skills' own design, not theirs. `grep -in "typesafeai\|evaluat\|shadow\|route mode" skills/*/SKILL.md` returns nothing today, confirming none of them carries stale evaluator text either. `install-cairn/SKILL.md` (global install, links the binary, registers hooks) never mentions decisions of any kind. This task's own verification is exactly that command, run for real:

- [ ] **Step 1: Run the verification**

Run: `grep -in "typesafeai\|evaluat\|shadow\|route mode\|--rests-on\|--consequential" skills/new-project/SKILL.md skills/existing-project/SKILL.md skills/next-feature/SKILL.md skills/install-cairn/SKILL.md`
Expected: the only matches are each skill's existing `--rests-on`/`--consequential` line for the spec-phase deference ruling (unchanged, correct, out of this plan's scope); no `typesafeai`, `evaluat`, `shadow` or `route mode` matches anywhere.

- [ ] **Step 2: Nothing to commit**

No file changed. Record the finding in this plan's own commit for Task 1 is not appropriate (Task 1 touches a different file); if this repository's convention requires a commit per task regardless, an empty verification note is out of place as a commit -- skip committing for this task and move directly to Task 3. (If a future spec revision gives these skills their own work-loop content, that is a new task in a later plan, not a retrofit here.)

---

### Task 3: `README.md`'s evaluator paragraph

**Files:**
- Modify: `README.md`

**Interfaces:** none; prose only.

- [ ] **Step 1: The exact current passage**

```
Cairn does not call an AI model or run the agent for you. Turning on the
optional evaluator lets a model help decide whether one narrow kind of
choice can stay the agent's to make; it never grants the agent authority
by itself, and it is off by default. You use your usual coding agent, and
the agent follows the project's working agreement.
```

- [ ] **Step 2: The replacement**

```
Cairn does not call an AI model or run the agent for you on its own. At
one narrow kind of decision -- a Consequential choice -- the agent takes
one measurement of its own draft before deciding: five scored dimensions
and a composite, computed in code from the model's answers, never a
verdict by itself. Only a fixed code floor and the measurement's own veto
ever force that decision to you instead of the agent; every other case is
the agent's judgment, informed by the reading. You use your usual coding
agent, and the agent follows the project's working agreement.
```

- [ ] **Step 3: Verify**

Run: `grep -n "optional evaluator lets a model help decide whether one narrow" README.md`
Expected: no match (the old sentence is gone).
Run: `grep -n "Consequential choice -- the agent takes" README.md`
Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Describe the evaluator as the agent's own measurement, not an optional model that decides for it"
```

---

### Task 4: `docs/manual.md`: the evaluator section, command reference, record reference

**Files:**
- Modify: `docs/manual.md`

**Interfaces:** none; prose only. This task's replacement text is long enough to split into three steps, one per passage, still inside one task since all three read from the same underlying redesign and belong in one commit.

- [ ] **Step 1: The evaluator section -- exact current text (heading "## The optional evaluator")**

```
## The optional evaluator

A project may turn on a model that helps decide whether a Consequential
draft can stay the agent's decision, instead of always going to you. It is
off by default (`typesafeai.enabled: false` in `.cairn/settings.json`) and,
even on, starts in shadow mode: you still decide everything, and Cairn
only records what the model would have chosen, so you can judge it before
trusting it.

Deterministic code owns every authority boundary; the model answers only
narrow yes/no and multiple-choice questions after code has already ruled
out protected paths, oversize requests, and a handful of other
disqualifying conditions. A qualifying answer only ever vetoes agent
authority or recommends a capture; it can never grant authority code has
not already allowed.

```sh
cairn calibrate
```

reports whether enough developer-labelled shadow evaluations exist, and
how many were wrong, against the project's configured bound. Only a
passing, policy-matched calibration lets `mode: route` actually route a
Consequential draft to the agent instead of you; changing the policy (the
model, a threshold, the request shape) resets calibration. Only
`bin/typesafeai.mjs` performs the network call, reading `TYPESAFEAI_API_KEY`
from the environment; it never stores the key.
```

Replace it, heading included, with:

```
## The evaluator: the agent's gut check

At a Consequential decision, the agent drafts its choice, then measures it
before deciding: `cairn measure` scores five things about the draft --
how much evidence backs it, how far the recommended option reaches, how
well it fits the cited requirement's contract, how much new surface it
adds, and how ambiguous the question is -- each 0 to 4, with a confidence.
Code, not the model, turns those five numbers into a composite and a
`suggested: agent | developer` reading; the suggestion is advice, not a
route. The agent reads it and decides, except in two cases code always
catches on its own: a draft that would change an Agreed requirement's text
or falsifier, the working agreement, or data that cannot be regenerated
(the floor), or a draft the measurement itself flags as too consequential
(the veto: a wide-reaching, contract-changing, or new-surface option).
Either one sends the draft to you, and `cairn decide --consequential`
refuses it. In every other case the agent may still choose
`cairn escalate --consequential` past a `suggested: agent` reading, at its
own judgment.

Turning on `typesafeai.enabled` in `.cairn/settings.json` picks the
measurement's source: `jev` (`bin/typesafeai.mjs`, reading
`TYPESAFEAI_API_KEY` from the environment and never storing it) when
enabled, or, when it is not, the harness's own configured review model,
started the same way `cairn brief` starts the adversary -- with none of the
agent's own conversation context. Either way, every Consequential draft is
measured; there is no off switch and no shadow mode, because a shadow
default that never let a draft reach the agent was tried and measured at
zero agent routing out of twelve expected cases
(`.superpowers/bench/results.md`).

```sh
cairn calibrate
```

reports how many developer-labelled, `suggested: agent` measurements exist
and how many you later called wrong, against a fixed 95% one-sided bound.
It tunes `weights`, `agent_ceiling` and `confidence_floors` in
`.cairn/settings.json`; it does not gate whether the agent may decide --
that gate was tried too, and it produced the same zero-routing result. A
project with `developer: absent` (an autonomous benchmark configuration)
has no one to answer an escalation the floor raises; wake prints it
exactly as it always prints Waiting and exits 4 instead of sitting there.
```

- [ ] **Step 2: The command reference table -- three row changes**

Current rows:

```
| `decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body <t>` | Record a Consequential decision; the agent continues. |
...
| `escalate --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <p>...] [--decision <id>...]` | Raise a Blocking decision; the agent stops. |
| `calibrate` | Check the evaluator's shadow-mode accuracy against the configured bound. |
```

Replace with:

```
| `decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body <t>` | Record a spec-phase deference ruling, before any commitment is open. |
| `decide --consequential --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [...]` | Record a measured work-loop Consequential decision; the agent continues. Refused without a current `composite`-outcome measurement. |
...
| `measure --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <p>...] [--decision <id>...] [--brief]` \| `measure <slug> --file <path>` | Take one measurement of a Consequential draft before `decide` or `escalate`; `--brief` prints a launch block for the review source, `--file` completes it. |
| `escalate [--consequential] --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [...]` | Raise a decision; without `--consequential`, a Blocking one (the agent stops). With `--consequential`, the Consequential draft's own measurement forced it here, or the agent chose to. |
| `calibrate` | Report how many labelled, suggested-agent measurements exist and how many were wrong, against the fixed bound; tunes the composite, never gates it. |
```

- [ ] **Step 3: The record reference table -- two row changes**

Current rows:

```
| `evaluation-intent` / `evaluation-call` / `evaluation` | The evaluator's fixed request, each attempted call, and the final route. | Escalation, capture, queue, calibration. |
| `calibration` | Policy digest, sample, false-downgrade count, bound, pass/fail. | Route-mode validation. |
```

Replace with:

```
| `evaluation-intent` / `evaluation-call` / `measurement` | The evaluator's fixed request, the one attempted call, and the five scored dimensions, composite, veto and suggestion. | Escalation, decide, queue, calibration. |
| `calibration` | Policy digest, sample, false-downgrade count, bound, pass/fail. | Tuning `weights`, `agent_ceiling` and `confidence_floors`; never a gate. |
```

Also update the "Get unstuck" table's `Waiting` row, appending one sentence for the one behavior change wake itself has: current text `| `Waiting` | An escalation needs your answer. |` becomes `| `Waiting` | An escalation needs your answer. With `developer: absent`, the one the evaluator floor raised has no one to answer it; wake exits 4 instead of sitting there. |`.

- [ ] **Step 4: Verify**

Run: `grep -n "starts in shadow mode\|mode: route\|Route-mode validation\|shadow-mode accuracy\|policy-matched calibration" docs/manual.md`
Expected: no matches (the stale phrases are gone; the new text's own "no ... shadow mode" negation is a different phrase and is expected to remain).
Run: `grep -n "gut check\|suggested: agent\|developer: absent" docs/manual.md`
Expected: at least the three new passages above.

- [ ] **Step 5: Commit**

```bash
git add docs/manual.md
git commit -m "Rewrite the manual's evaluator section and its command/record reference rows for the composite gut-check design"
```

---

### Task 5: `CHANGELOG.md`'s evaluator bullet

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:** none; prose only. This edits inside the still-open `## 2.0.0 - 2026-09-19` entry (v2 has not released; there is one entry to revise, not a new dated one to append, consistent with `docs/releasing.md`'s versioning rule that a changelog entry describes what a release ships, not a development timeline).

- [ ] **Step 1: The exact current bullet**

```
- **The evaluator is optional and off by default.** A project may turn
  on `typesafeai` in `.cairn/settings.json` to let a model help decide
  whether a Consequential choice can stay the agent's decision. It
  starts in shadow mode, where the developer still decides and Cairn
  only records what the model would have chosen; it can move to route
  mode only after a passing, policy-matched calibration. With the
  evaluator off, nothing changes: every Consequential decision is the
  agent's to record and continue, and every Blocking decision is an
  escalation, exactly as before.
```

- [ ] **Step 2: The replacement**

```
- **The evaluator is the agent's gut check at a Consequential decision.**
  `cairn measure` scores a draft on five dimensions -- evidence, reach,
  contract fit, new surface, ambiguity -- from `jev`
  (`typesafeai.enabled: true`) or, otherwise, the harness's own review
  model started with none of the agent's context. Code computes a
  composite and an advisory `suggested: agent | developer` from the five
  numbers; the agent decides either way, except at a fixed code floor
  (an Agreed requirement, the working agreement, or unrecoverable data)
  or the measurement's own veto, which always go to the developer. There
  is no shadow mode and no off switch: every Consequential draft is
  measured, because a shadow default that never let a draft reach the
  agent was tried and measured at zero agent routing out of twelve
  expected cases.
```

- [ ] **Step 3: Verify**

Run: `grep -n "shadow mode, where the developer still decides" CHANGELOG.md`
Expected: no match.
Run: `grep -n "gut check at a Consequential decision" CHANGELOG.md`
Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "Rewrite the CHANGELOG's evaluator bullet for the composite gut-check design"
```

---

### Task 6: The cutover checklist, the cut list, and the walkthrough (verified)

**Files:**
- Modify: `docs/cutover/checklist.md`, `docs/cutover/cut-list.md`
- Read only: `docs/walkthrough.md`

**Interfaces:** none; prose only.

`docs/walkthrough.md`'s worked example never reaches a Consequential decision through `cairn decide --consequential`/`cairn escalate` at all -- its one Consequential moment is `cairn promote`, a structurally different command (`lib/commitment.mjs`'s `promote()`, one of the four multi-store transactional commands alongside `start`/`supersede`/`authorize`) that is not measured by plans 15 or 16 and is unaffected by this iteration (its own draft shape is an item SHA, not the five-narrative-field draft `cairn measure` scores). `grep -in "typesafeai\|evaluat\|shadow\|cairn decide\|cairn escalate" docs/walkthrough.md` confirms this: the one match is the closing "This is a Consequential decision, recorded and queued for your review, not an escalation" sentence describing `cairn promote` itself, still accurate. **No edit to `docs/walkthrough.md`.**

`docs/cutover/checklist.md` and `docs/cutover/cut-list.md` do not mention `typesafeai`, the seven old thresholds, `mode`, `shadow` or `route mode` anywhere today (confirmed: `grep -inE "sufficient_threshold|outside_threshold|contradicts_ceiling|reversible_floor|observed_floor|route_confidence|max_false_downgrade|typesafeai\.mode|shadow" docs/cutover/*.md` returns nothing), so there is no stale text to fix. Both still benefit from one addition each: the checklist gains a settings-shape verification step (the kind of check a developer running cutover would actually want, now that the shape changed twice within v2's own development, once for this iteration), and the cut list's `AUTO` row (which already says "section 10's evaluator is a different contract", from when v2 was first speced against 1.x's `autonomy.md`/Jev-mode family) gains a clause naming that the contract changed again, within v2, by decisions 53-56.

- [ ] **Step 1: The checklist addition**

Add one item to the "Before" list, after the existing `docs/cutover/cut-list.md is committed and every row read` item:

```markdown
- [ ] `.cairn/settings.json`'s `typesafeai` block has `weights`, `agent_ceiling`
      and `confidence_floors`, not the seven old thresholds or a `mode` field;
      settings gains `developer: present` or `absent`. `cairn wake` above
      already proves settings load cleanly, but this is the one thing this
      checklist's own "Before" pass calls out by name, since the shape changed
      twice within v2's own development and a stale `.cairn/settings.json`
      carried over from an earlier v2 checkout would otherwise only surface as
      an opaque `settings refused` message deep in some other step.
```

- [ ] **Step 2: The cut-list addition**

Current `AUTO` row: `| AUTO | autonomy.md | 18 | removed | the autonomy and former Jev modes were Agreed but never built (section 12); section 10's evaluator is a different contract |`

Replace with: `| AUTO | autonomy.md | 18 | removed | the autonomy and former Jev modes were Agreed but never built (section 12); section 10's evaluator is a different contract, and that contract itself was revised within v2 (decisions 53-56 supersede 18, 26, 27, 51: a composite measurement the agent reads and decides on, not a gate cascade or a shadow default) |`

- [ ] **Step 3: Verify**

Run: `grep -n "decisions 53-56 supersede" docs/cutover/cut-list.md`
Expected: one match.
Run: `grep -c "confidence_floors" docs/cutover/checklist.md` and `grep -c "developer: present" docs/cutover/checklist.md`
Expected: one match each (the addition wraps across lines, so a single-line multi-term grep is not used here).
Run: `grep -in "typesafeai\|evaluat\|shadow\|cairn decide\|cairn escalate" docs/walkthrough.md`
Expected: unchanged from before this task (the one `cairn promote` sentence only).

- [ ] **Step 4: Commit**

```bash
git add docs/cutover/checklist.md docs/cutover/cut-list.md
git commit -m "Note the composite evaluator revision in the cutover checklist and cut list; the walkthrough needs no change"
```

---

## Spec coverage

This plan restates plans 15 and 16's already-covered spec text for human and agent readers; it introduces no new requirement or falsifier. The table below maps each doc-facing claim to the task that makes it, so a reviewer can check every sentence this plan asserts is actually true of the code plans 15-16 built.

| Claim this plan makes | Backed by (plan, task) | This plan's task |
|---|---|---|
| `cairn measure` scores five dimensions, 0-4, with a confidence | 15 Tasks 6-7 | 1, 3, 4, 5 |
| Code computes the composite and the advisory `suggested` | 15 Task 8 | 1, 3, 4, 5 |
| The floor and the veto are the only forced routes; the suggestion is not | 15 Task 4, Task 9; 16 Tasks 3-4 | 1, 3, 4, 5 |
| The agent may escalate past `suggested: agent` at its own judgment | 16 Task 4 | 1, 3, 4, 5 |
| `typesafeai.enabled` picks `jev` or the harness review model; either way every draft is measured, no off switch, no shadow | 15 Task 9; 16 Tasks 1, 5, 6 | 1, 3, 4, 5 |
| `cairn calibrate` tunes, never gates; labelled suggested-agent cases, the fixed bound | 15 Task 10 | 4, 5 |
| `developer: absent` and the floor: wake exits 4, printing Waiting's five fields | 16 Task 7 | 4 |
| `cairn decide --consequential --commitment ...` is refused without a current, composite-outcome measurement | 16 Tasks 3-4 | 1, 4 |
| `cairn decide --consequential --title ...` (spec-phase deference) is unaffected | 16 Task 4 (the flag-dispatch fix) | 1, 2, 4 |
| `.superpowers/bench/results.md`: zero of twelve agent-expected drafts routed under the superseded shadow design | (evidence document, not code) | 3, 4, 5 |

Left to other plans:

- Any code, record shape, or CLI flag this plan describes: already built by plans 15 and 16; this plan only describes it.
- Hooks (`hooks/session-start.sh`, `hooks/turn.sh`, `hooks/stop.sh`): unchanged, out of scope, per this plan's own Architecture note.
- The benchmark harness and its own README-equivalent (`tests/bench/`'s own documentation, if any): plan 18.
- A future skill or template change if a later spec revision gives the work-loop skills their own Consequential-decision content: not this iteration (Task 2's finding).
