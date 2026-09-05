# The wake names an action or refuses

Slug: the-wake-names-an-action-or-refuses
Requirements: LOOP-044, LOOP-045, LOOP-046, LOOP-047, LOOP-054, LOOP-055, LOOP-056, LOOP-024, LOOP-027, LOOP-032, LOOP-035, DEC-006
Inherits: every PKG requirement

## Goal

Given only the repository, the wake prints a verdict or a refusal, and
never a stack trace, a silent hole, or a breach the loop did not make.

Drafted 2026-09-05. Items 4, 5, 10, 11, 12, 14, 17, and 18 of
[the original PoC report](https://github.com/eas4ai/cairn/blob/a161d4907afa23e5c89ceca8ff00ee45e54130f6/docs/issues-from-the-poc.md), each reproduced against the kernel in a
temp repository.

## Decisions to record

- The footprint is the loop's own commits: the non-merge commits on
  the first-parent line since the commit that wrote the exact Current:
  line. A merge is not a breach; the change it brings to a declared
  input stales evidence, which is the check that governs it. Judged.
- A declared input that matches nothing is a malformed mechanism and
  is repaired, not run. Judged.
- Two mechanisms for one requirement is a malformed declaration,
  refused by name; a requirement two commands prove is one mechanism
  that runs both. Recording both and requiring both to pass is in the
  backlog with the second adoption's case. Judged.
- The kernel's own run-mechanism record carries the process id, and
  a wake that finds the process dead removes the record itself: no
  evidence was written, so nothing is lost, and the record is the
  kernel's, not the agent's. An agent's own record is never removed
  by the wake. Judged.

## Deliverables

- inputFiles() and inputsDigest(): a declared input that `git ls-files`
  returns nothing for makes wake and check say
  `Resolvable: repair .cairn/mechanisms/<name>` naming the input.
- blob(): a path in the index and absent from the tree is uncommitted
  change; wake says `Resolvable: commit <path>` as check does.
- main(): wake and check refuse with exit 3 when `git rev-parse`
  fails, the way a missing roadmap is refused.
- breaches(): the commit that began the commitment is found by reading
  the roadmap's Current: line at each commit that touched it, newest
  first, until it stops equalling the slug; the changed set is the
  union over `git log --first-parent --no-merges began..HEAD` of each
  commit's diff against its parent.
- inputsDigestAt(): one `git cat-file --batch` fed the ls-tree output,
  in place of one `git show` per file. The digest is unchanged.
- unrealizedDecisions(): a realized-by line is a commit identifier
  followed by a subject; an identifier alone is unrealized, and the
  verdict says the subject is missing.
- wake(): when the in-progress record's base is behind HEAD and the
  tree is clean, the verdict says the action appears committed and
  the record can be removed.
- The working agreement says to merge with a merge commit, never a
  fast-forward, so a stranger's commits stay off the loop's line.
- mechanisms(): a requirement named by two declarations makes wake
  and check say `Resolvable: repair .cairn/mechanisms/<second>`,
  naming both and the requirement.
- check(): the run-mechanism record carries `pid: <n>`. wake(): a
  run-mechanism record whose process is not alive (`process.kill(pid,
  0)` throws) is removed and the wake continues; one whose process is
  alive is reconciled as today, with the pid in the reason.

## Tests

- an input matching nothing: wake and check say repair, naming it
  (LOOP-044)
- a declared input deleted without git rm: wake says commit, exit 1
  (LOOP-045)
- no .git: wake and check exit 3 (LOOP-046)
- a Current: slug that is a prefix of an earlier slug begins the
  footprint at its own commit (LOOP-035)
- a file changed only on a merged branch is not a breach; the same
  file changed by a commit on the line is (LOOP-047, LOOP-035)
- a review over 1500 declared files: the digest at the commit equals
  the digest in the tree, and wake completes in under one second
  (LOOP-024, LOOP-032)
- a realized-by line with an identifier alone is unrealized (DEC-006)
- a stale in-progress record with base behind a clean HEAD is named as
  committed (LOOP-027)
- two declarations for one requirement: wake and check refuse,
  naming both (LOOP-056)
- a run-mechanism record naming a dead process is removed by wake and
  the wake continues; one naming a live process is reconciled with
  the pid named; an implement record is never removed (LOOP-054,
  LOOP-055, LOOP-027)

## Done when

- Every requirement listed above has current passing evidence from
  node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done.
