# The wake resolves every Realized-by entry in one git call

Slug: the-wake-resolves-every-realized-by-entry-in-one-git-call
Requirements: DEC-023
Inherits: every PKG requirement
Promoted from: every-wake-spawns-one-git-process-per-realized-by-entry
Status: Agreed 2026-09-17 by promotion promote-the-wake-resolves-every-realized-by-entry-in-one-git-call

## Goal

A wake's cost does not grow by one process per decision ever
recorded: every Realized by entry is resolved in one git call, with
the same verdicts as before for built, unbuilt, shallow and ambiguous.

Promoted from the backlog on 2026-09-17 by the decision named above,
from the kernel review the developer requested. Consequential: it
changes how every wake reads every decision record.

## Deliverables

- bin/cairn.mjs decisionVerdict(): records are parsed first, their
  entry identifiers gathered, and one git cat-file --batch-check
  resolves them all, one output line per input in order; the records
  are then judged in file order exactly as before, with built read
  from the batch, ambiguous from the batch's own word, and the
  shallow-clone repair unchanged.
- tests/wake.test.mjs: with a git wrapper on PATH that logs every
  invocation, a wake over twenty built records logs no rev-parse
  --verify and exactly one cat-file --batch-check, and names the same
  action as before.

## Tests

- twenty built records cost one git call to resolve, not twenty
  (DEC-023)
- the existing DEC-006, DEC-021 and LOOP-113 verdicts are unchanged
  (their tests)

## Done when

- DEC-023 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
