# Defects are fixed without a promotion

Slug: defects-are-fixed-without-a-promotion
Requirements: LOOP-087, LOOP-140
Inherits: every PKG requirement
Status: Agreed 2026-09-17

## Goal

A defect that an Agreed requirement already forbids is captured as a
defect item and fixed with a failing test, a fix, a check and a review,
without a promotion decision, a new requirement, a commitment file or a
roadmap section.

Specified on 2026-09-17 in the next-iteration phase, one of five fixes
the developer confirmed after asking what made Cairn a frustration.

## Deliverables

- bin/cairn.mjs, backlog: --defect requires --from naming an Agreed
  requirement and writes Defect: yes (LOOP-140).
- bin/cairn.mjs, wake: at complete, an unfixed defect item is named
  `fix <item>` before promote; a Fixed by: line counts only when that
  commit changes no Agreed requirement and the named requirement
  passes at or after it (LOOP-087, LOOP-140).

## Tests

- an unfixed defect item is named fix before a promotable item, and
  Done waits for it (LOOP-087, LOOP-140)
- Fixed by: counts only with passing evidence at or after the commit
  and no Agreed requirement changed by it (LOOP-140)
- --defect without --from or naming a requirement that is not Agreed
  is refused (LOOP-140)

## Done when

- LOOP-087, LOOP-140 have current passing evidence from node-test, recorded
  by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
