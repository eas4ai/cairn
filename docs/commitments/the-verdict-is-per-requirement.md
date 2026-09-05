# The verdict is per requirement

Slug: the-verdict-is-per-requirement
Requirements: LOOP-037, LOOP-038, LOOP-039, LOOP-040, LOOP-052, LOOP-053, DEC-017, DEC-018, DEC-019, LOOP-034, DEC-016
Inherits: every PKG requirement

## Goal

A requirement's evidence says what happened to that requirement, and
an attempt is an attempt.

Drafted 2026-09-05 from the first two adoptions. The first collapsed
thirteen distinct mechanisms into one aggregate because the kernel
gave a mechanism one result; its thirteen records carry one output
digest and cannot say which requirement moved. The second reached the
developer with a Judged decision marked Blocking because a baseline
check and two repairs counted as three attempts. Both are in
[the original PoC report](https://github.com/eas4ai/cairn/blob/a161d4907afa23e5c89ceca8ff00ee45e54130f6/docs/issues-from-the-poc.md), items 1, 2, and 19.

## Decisions to record

Before code changes, the agent records with `cairn decide`:

- Result lines change what an evidence record means: a record is now
  a mechanism's statement about one requirement, or the exit code's
  where the mechanism made none. Consequential, because every
  consumer's evidence is read by the new rule.
- An attempt is defined by inputs, not by runs, and the first record
  is a baseline. Judged; DEC-016 already says attempts.

## Deliverables

The kernel, in check() and assess():

- check() scans standard output for lines matching
  `^cairn: ([A-Z]+-\d+): (pass|fail)$` and keeps those whose identifier the
  mechanism speaks for. The five cases, each named in the receipt's
  `source:` field:
  - reported: the requirement's record takes the line's result
    (`source: line`);
  - duplicate or conflicting: two lines for one requirement are one
    statement, and a fail on either is a fail;
  - unknown: a line for a requirement the mechanism does not speak
    for is ignored and named on standard output;
  - missing, when the mechanism reported nothing: every requirement
    takes the exit code (`source: exit`), which is what every
    mechanism did before this commitment and is the transition for
    existing mechanisms, whose output earns nothing new;
  - missing, when the mechanism reported something: the requirement
    is recorded `result: unverified` (`source: none`). An aborted run
    keeps the passes it reported and neither passes nor fails what it
    never reached. Unverified is not a pass, so the wake names the
    requirement; it is not a fail, so it is not an attempt.
- `cairn check REQ ...` selects which mechanisms run. Every mechanism
  that runs writes a record for every requirement it speaks for.
- assess() counts attempts as DEC-017 and DEC-018 define them. The
  inputs are the mechanism's declared-input digest as the record
  carries it. The streak runs back from the latest record to the last
  pass, or to the first record; a pass resets the count; an
  unverified record neither ends the streak nor counts. Each distinct
  digest among the streak's failing records is one attempt, so a
  rerun at the same inputs, a documentation change, or a return to a
  digest already in the streak adds nothing. The first record is the
  baseline; its digest is never an attempt. threeFails is three
  attempts by that count, and escalatedSince is measured from the
  third-most-recent attempt's first record.
- assess() reads an escalation's Concerns line as a list of
  identifiers, separated by commas or spaces, and an escalation
  concerns a requirement when the list holds it (LOOP-053).
- wake(): when the last three failing records of a streak share one
  inputs digest and no escalation concerning the requirement was
  raised since the first of them, the implement verdict's reason
  says so and names DEC-019. The verdict does not change: the counter
  cannot tell an identical rerun from a cause outside the repository,
  and the agent can. The reason also carries the record's exit code,
  so an unverified result after an abort shows the abort.
- The working agreement says: a failure no change inside the
  footprint can address is an escalation, not an attempt.
- The working agreement, in both copies, follows "Three attempts at
  a requirement without new passing evidence" with the definition:
  one distinct digest of the mechanism's declared inputs among the
  failing checks since the last pass, reruns and documentation
  changes and returns adding nothing, the first check the baseline.

The mechanism declaration format does not change. An aggregate that
prints no result line behaves exactly as today. This repository's
node-test can print one line per requirement it speaks for from the
test names, which is the first consumer of the rule and the place the
review examines it.

## Tests

- a mechanism printing `R-002: pass` and exiting 1 records R-002 pass
  from the line and R-001 unverified, each with its source, and wake
  names R-001 (LOOP-037, LOOP-052)
- a mechanism printing no line records every requirement from the
  exit code; a test name containing the form is not a line (LOOP-039)
- two lines for one requirement, pass and fail: the record says fail
- an unverified record is not an attempt; a return to an earlier
  failed digest counts once; a return to the baseline's digest never
  (DEC-017, DEC-018)
- three runs at one digest: the verdict stays implement and names
  DEC-019; an answered escalation whose Concerns list holds the
  requirement among others clears it (DEC-019, LOOP-053)
- the unverified reason carries the exit code (LOOP-052)
- a line for a requirement the mechanism does not speak for writes no
  record and is named on standard output (LOOP-038)
- `cairn check R-001` with a mechanism speaking for R-001 and R-002
  writes a record for both (LOOP-040)
- three checks at one commit are one attempt; wake says implement, not
  escalate (DEC-017)
- a baseline, then two failing checks at two commits: wake says
  implement; a third failing commit: wake says escalate (DEC-018,
  DEC-016)
- the working agreement's attempt sentence, in both copies, names the
  definition (LOOP-036)

## Done when

- Every requirement listed above has current passing evidence from
  node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding, which examined the first adoption's live-acceptance
  mechanism against the new rule.
- `cairn wake` says Done.
