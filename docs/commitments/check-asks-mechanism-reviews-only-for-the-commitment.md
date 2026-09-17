# Check asks mechanism reviews only for the commitment

Slug: check-asks-mechanism-reviews-only-for-the-commitment
Requirements: LOOP-059
Inherits: every PKG requirement
Status: Agreed 2026-09-17

## Goal

A requirement revised outside the current commitment no longer stops
check; its mechanism review waits for the commitment that includes it.

Specified on 2026-09-17 in the next-iteration phase, one of five fixes
the developer confirmed after asking what made Cairn a frustration.

## Deliverables

- bin/cairn.mjs, check: the revision gate applies to requirements of
  the current commitment and its inherited requirements only
  (LOOP-059).

## Tests

- check runs a mechanism when a requirement outside the commitment was
  revised, and still refuses when one inside was (LOOP-059)
- the wake names the mechanism review once a commitment includes the
  revised requirement (LOOP-059)

## Done when

- LOOP-059 has current passing evidence from node-test, recorded
  by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
