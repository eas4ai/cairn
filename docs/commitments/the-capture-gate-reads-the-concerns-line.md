# The capture gate reads the Concerns line

Slug: the-capture-gate-reads-the-concerns-line
Requirements: LOOP-119, LOOP-092, LOOP-114
Promoted from: the-capture-gate-accepts-the-escalation-that-names-the-changed-requirement
Inherits: every PKG requirement
Status: Agreed 2026-09-15

## Goal

The LOOP-090 route raises one escalation, whose Concerns line names
the changed requirement, and that escalation satisfies both the
contract gate (LOOP-114) and the capture gate for the moved item.

## Deliverables

- bin/cairn.mjs: captureVerdict accepts, for a next-iteration item,
  an escalation whose Concerns line names the requirement the item's
  Changes: line names.
- tests/continuation.test.mjs: the LOOP-090 route end to end with one
  escalation.

## Done when

- LOOP-119, LOOP-092 and LOOP-114 have current passing evidence from
  node-test.
- A review record at the current commit with no open finding.
