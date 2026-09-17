# Reviews carry an independent report

Slug: reviews-carry-an-independent-report
Requirements: LOOP-020
Inherits: every PKG requirement
Status: Agreed 2026-09-17

## Goal

No commitment is Done on the builder's review alone: an independent
report, written by a reviewer without the build's context, sits beside
the review, and every finding it raises is carried.

Specified on 2026-09-17 in the next-iteration phase, one of five fixes
the developer confirmed after asking what made Cairn a frustration.

## Deliverables

- bin/cairn.mjs, wake: Done requires
  .cairn/reviews/<slug>.independent.md whose commit: matches the
  review's and whose findings each appear in the review as open or
  resolved (LOOP-020).
- The working agreement's paragraph on starting the reviewer.

## Tests

- no independent report, one at another commit, or a finding not
  carried keeps the wake from Done (LOOP-020)
- a report whose findings are all carried lets Done through (LOOP-020)

## Done when

- LOOP-020 has current passing evidence from node-test, recorded
  by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
