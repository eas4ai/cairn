# Unpushed commits carry no AI attribution when forbidden

Slug: unpushed-commits-carry-no-ai-attribution-when-forbidden
Requirements: PKG-045
Inherits: every PKG requirement
Status: Agreed 2026-09-17

## Goal

A project that forbids AI attribution learns of an attribution line
before the commit leaves the machine: the wake names rewording it, and
the release script refuses it.

Specified on 2026-09-17 in the next-iteration phase, one of five fixes
the developer confirmed after asking what made Cairn a frustration.

## Deliverables

- bin/cairn.mjs: read .cairn/policy; list commits on no remote-
  tracking branch; name `reword <sha>` for one whose message carries
  an AI attribution line, after a live check lock and a stop record
  (PKG-045).
- scripts/release.mjs: refuse such a commit.
- .cairn/policy in this repository: attribution: forbidden.

## Tests

- with the policy, an unpushed commit with Co-Authored-By: Claude is
  named reword; pushed, or without the policy, it is not (PKG-045)
- the release script refuses an unpushed attributed commit (PKG-045)

## Done when

- PKG-045 has current passing evidence from node-test, recorded
  by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.

## Review before agreement

Attacked the five specified together (PKG-045, LOOP-059, PKG-040,
LOOP-141, LOOP-087, LOOP-140, LOOP-020):

- PKG-045 against LOOP-035: rewording an unpushed commit rewrites the
  loop's own history; the footprint is read from first-parent history
  at wake, so the reworded commits are judged as they now stand.
- PKG-045's patterns: a commit that quotes an attribution line in its
  body to describe this very rule matches; the pattern reads trailer
  lines at the start of a line, and this repository's commits that
  describe it do so in prose.
- LOOP-059 against LOOP-058: evidence recorded before the review is
  still recorded; the wake refuses to count it while the reviewed
  digest is missing, so nothing stale reaches Done.
- PKG-040 against LOOP-022: an uncommitted changelog at release is a
  declared input change without a record; the release script is the
  action, and it commits the change in one step.
- LOOP-141 against LOOP-058: a document a test reads still makes that
  test's evidence stale; only the review's freshness changes, and a
  document is listed only by a declaration the developer can read.
- LOOP-140 against LOOP-029 and LOOP-089: a fix adds a test and code
  under an existing requirement, enters no commitment and changes no
  Agreed text; a fix that must change Agreed text does not count.
- LOOP-140's weak point: whether the requirement's text already
  forbids the defect is the agent's judgment, read in the review.
- LOOP-020 against itself: the kernel cannot tell an independent
  reviewer from the builder writing a second file. The report is
  structural evidence, and the working agreement names how to start
  the reviewer.
