# A git that cannot start is a refusal, never a verdict

Slug: a-git-that-cannot-start-is-a-refusal-never-a-verdict
Requirements: LOOP-137
Inherits: every PKG requirement
Promoted from: a-git-that-fails-to-spawn-is-read-as-a-git-that-said-no
Status: Agreed 2026-09-17 by promotion promote-a-git-that-cannot-start-is-a-refusal-never-a-verdict

## Goal

When git cannot be started, every command says so in one line and
stops; nothing it prints can be mistaken for a verdict, and nothing
is recorded.

Promoted from the backlog on 2026-09-17 by the decision named above.
Consequential: it changes what every command does when git cannot
start.

## Deliverables

- bin/cairn.mjs: one git spawn helper, used by every git call in the
  kernel; when spawnSync reports an error it throws "cannot run git:
  <cause>", which the entry point already prints as one line with
  exit 3. Callers that handled the error themselves keep working.
- tests/robustness.test.mjs: with a PATH whose git is a file that is
  not executable and no other git, wake and check each exit 3 with
  one stderr line naming git and the cause, print no verdict, and
  leave .cairn/evidence and docs/decisions unchanged.

## Tests

- wake with a git that cannot start is one line and exit 3 (LOOP-137)
- check with a git that cannot start records nothing (LOOP-137)

## Done when

- LOOP-137 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
