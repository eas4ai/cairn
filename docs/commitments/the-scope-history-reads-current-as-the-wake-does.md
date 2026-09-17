# The scope history reads Current as the wake does

Slug: the-scope-history-reads-current-as-the-wake-does
Requirements: LOOP-134
Inherits: every PKG requirement
Promoted from: the-scope-history-reads-the-roadmap-s-current-line-with-a-different-grammar-than-the-wake
Status: Agreed 2026-09-17 by promotion promote-the-scope-history-reads-current-as-the-wake-does

## Goal

The footprint starts where the commitment really began: the walk
through roadmap history reads Current: with the same grammar the wake
uses, so a fenced example never moves the start.

Promoted from the backlog on 2026-09-17 by the decision named above,
from the kernel review the developer requested. Consequential: it
moves where every scope judgment begins.

## Deliverables

- bin/cairn.mjs: one reader for the roadmap's Current: line, used by
  currentCommitment and scopeHistory alike; it strips fences, and for
  a historical revision it answers whether any Current: line outside
  fences names the slug.
- tests/records.test.mjs: a roadmap revision with a fenced Current:
  example below the real line, followed by a commit that touches an
  undeclared path, is named as a scope breach; and a historical
  revision carrying two Current: lines, one naming the commitment,
  does not end the walk.

## Tests

- a fenced example below the real line does not move the footprint's
  start (LOOP-134)
- two Current: lines in history, one naming the commitment, keep the
  walk going (LOOP-134)

## Done when

- LOOP-134 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
