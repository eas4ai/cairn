# A receipt names its commit in full

Slug: a-receipt-names-its-commit-in-full
Requirements: LOOP-136
Inherits: every PKG requirement
Promoted from: receipts-record-an-abbreviated-commit-id
Status: Agreed 2026-09-17 by promotion promote-a-receipt-names-its-commit-in-full

## Goal

A receipt's commit field stays resolvable for the life of the
repository: it carries the full identifier, and older receipts with
the short form are still read.

Promoted from the backlog on 2026-09-17 by the decision named above,
from the kernel review the developer requested. Consequential: it
changes what every receipt carries.

## Deliverables

- bin/cairn.mjs check(): the receipt's commit field is the full
  identifier of HEAD at the run; the short form the wake and review
  use to name commits in messages and to compare against agent-written
  records is unchanged.
- tests: after a check, the receipt's commit field is forty hex
  characters equal to git rev-parse HEAD; a receipt rewritten with the
  seven-character form is still read by the wake, and its requirement
  text at that commit is still found.

## Tests

- a fresh receipt carries the full commit identifier (LOOP-136)
- an older receipt with the abbreviated identifier is still read
  (LOOP-136)

## Done when

- LOOP-136 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
