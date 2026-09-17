# A supersession names one live record by its slug

Slug: a-supersession-names-one-live-record-by-its-slug
Requirements: DEC-022
Inherits: every PKG requirement
Promoted from: decide-supersedes-validates-neither-the-slug-nor-a-prior-supersession
Status: Agreed 2026-09-17 by promotion promote-a-supersession-names-one-live-record-by-its-slug

## Goal

A reversal can only point at a decision record, by its slug, and only
at one that has not already been reversed; the raw argument never
reaches the filesystem, and the reversal chain keeps one link per
record.

Promoted from the backlog on 2026-09-17 by the decision named above,
from the kernel review the developer requested. Consequential: it
changes what supersede accepts.

## Deliverables

- bin/cairn.mjs decide(): --supersedes must match the slug pattern
  answer already enforces, or the command is a usage error naming the
  rule; a target whose record already carries a Superseded by: line is
  a usage error naming the record that superseded it; in both cases
  nothing is written.
- tests/supersede.test.mjs: a --supersedes argument with a path
  separator or an uppercase letter is refused before any file is
  read, a file outside docs/decisions/ is untouched; a second
  supersession of the same record is refused, the old record keeps
  its one Superseded by: line, and no new record is written.

## Tests

- a --supersedes argument outside the slug alphabet is refused and
  touches nothing (DEC-022)
- a record already superseded cannot be superseded again (DEC-022)

## Done when

- DEC-022 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
