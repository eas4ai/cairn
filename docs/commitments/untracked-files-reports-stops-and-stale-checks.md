# Untracked files, reports, stops and stale checks

Slug: untracked-files-reports-stops-and-stale-checks
Requirements: LOOP-110, LOOP-094, PKG-018, LOOP-138
Inherits: every PKG requirement
Specified from:
  - an-added-report-is-not-a-change-under-way-its-items-go-to-the-backlog-or-next-iteration
  - check-stale-runs-a-fourth-attempt-past-the-three-attempt-gate
  - the-stop-hook-blocks-forever-when-the-harness-does-not-cap-consecutive-blocks
  - untracked-images-are-not-a-change-under-way
Status: Agreed 2026-09-17

## Goal

The loop stops holding the agent to work that is not its own. A file
nobody added to Git is not a change under way; a report becomes
backlog items; a stop refused once is let go; and check --stale never
records a fourth attempt past the escalation the wake demands.

Specified on 2026-09-17 in the next-iteration phase from the four
waiting items, after the developer approved the restated changes. The
two items about untracked images and added reports are one change to
LOOP-110 plus the working agreement's sentence, LOOP-138.

## Deliverables

- bin/cairn.mjs, the wake: the record verdict counts only tracked
  declared inputs with uncommitted changes; an untracked file is not
  named (LOOP-110).
- bin/cairn.mjs, check: the refusal for an uncommitted declared input
  names both ways out for an untracked file, commit it or add it to
  .gitignore; the refusal itself is unchanged (LOOP-030).
- bin/cairn.mjs, check --stale: a mechanism that speaks for a
  requirement with three attempts and no escalation since is skipped,
  with a line naming that requirement and DEC-016 (LOOP-094).
- bin/hook.mjs, stop: when standard input carries stop_hook_active
  true, the hook prints the verdict and returns no block decision
  (PKG-018).
- skills/new-project/templates/AGENTS.md and AGENTS.md: the report
  sentence (LOOP-138).
- docs/manual.md: the stop hook paragraph and the record action say
  the same.

## Tests

- an untracked file under a declared input leaves the wake at its
  next action, and a modified tracked input still names record
  (LOOP-110)
- check with an untracked file under a declared input refuses, naming
  .gitignore (LOOP-030)
- check --stale skips a mechanism whose requirement has three attempts
  and no escalation, names it, and records nothing (LOOP-094)
- the stop hook given stop_hook_active true prints the verdict and
  returns no block decision (PKG-018)
- the template carries the report sentence (LOOP-138)

## Decisions to record

None beyond this phase: every choice above was restated to the
developer and approved.

## Review before agreement

Attacked the four texts against the requirements that stand:

- LOOP-110 against LOOP-022. An agent whose only change is a new,
  untracked source file is doing work under way, and the wake no
  longer names the record for it, so a stop is allowed. Accepted:
  LOOP-022 still binds the agent, check refuses evidence beside the
  file (LOOP-030), and the first `git add` makes the file tracked and
  the record due again.
- LOOP-110 against LOOP-030. Considered dropping untracked files from
  check as well; rejected, because the inputs digest covers tracked
  files and `node --test tests/*.test.mjs` would run an untracked test,
  so evidence would describe a state no commit holds.
- LOOP-094 against LOOP-040. Skipping the whole mechanism leaves a
  second, gate-free requirement stale; the wake names the escalation
  before any run, so the agent is sent to escalate either way, and
  the falsifier states the skip for exactly that case.
- LOOP-094 against DEC-019. Three runs at one digest are not attempts
  and are not gated; only DEC-016's count holds a mechanism back.
- PKG-018 against the working agreement's "Do not stop while the
  verdict is Resolvable". The hook is the harness's enforcement, the
  agreement the agent's duty; giving way after one refusal changes the
  first and not the second, and the verdict is printed either way.
- PKG-018 against PKG-022 and PKG-036: the new branch prints and exits
  0, and a kernel with no verdict still never blocks.
- The falsifiers: each names an input the mechanism can build, a
  tracked or untracked file, a stop_hook_active flag, a three-attempt
  history, a template string. LOOP-138 is a static proxy, as LOOP-096
  is; what the agent does with a report is not observable by a test.

## Done when

- LOOP-110, LOOP-094, PKG-018 and LOOP-138 have current passing
  evidence from node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
