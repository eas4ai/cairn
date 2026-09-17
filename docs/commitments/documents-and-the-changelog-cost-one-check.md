# Documents and the changelog cost one check

Slug: documents-and-the-changelog-cost-one-check
Requirements: PKG-040, LOOP-141
Inherits: every PKG requirement
Status: Agreed 2026-09-17

## Goal

A release costs one check and one review, and a documentation-only
change does not reopen a review.

Specified on 2026-09-17 in the next-iteration phase, one of five fixes
the developer confirmed after asking what made Cairn a frustration.

## Deliverables

- scripts/release.mjs: an uncommitted CHANGELOG.md is allowed and
  committed in the release commit (PKG-040).
- bin/cairn.mjs: a declaration's documents: list; review freshness
  ignores changes limited to listed documents (LOOP-141).
- .cairn/mechanisms: README.md, CHANGELOG.md, docs/manual.md and
  docs/walkthrough.md listed as documents where declared.
- docs/releasing.md: the entry is written, not committed, before the
  script runs.

## Tests

- a release with an uncommitted changelog entry commits it with the
  version files; any other dirty file is refused (PKG-040)
- a change only to a listed document leaves the review current and the
  evidence stale; a change to another input makes the review stale
  (LOOP-141)

## Done when

- PKG-040, LOOP-141 have current passing evidence from node-test, recorded
  by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
