# The release script reads a version field in any JSON spacing

Slug: the-release-script-reads-a-version-field-in-any-json-spacing
Requirements: PKG-042
Inherits: every PKG requirement
Promoted from: the-release-script-cannot-read-a-compact-json-version-field
Status: Agreed 2026-09-17 by promotion promote-the-release-script-reads-a-version-field-in-any-json-spacing

## Goal

A release can be cut when a version file is written compact: the
script finds the version field however the file spaces it, and writes
the new version without reformatting the file.

Promoted from the backlog on 2026-09-17 by the decision named above,
when release 0.4.0 was refused. Consequential: it changes what a
release writes.

## Deliverables

- scripts/release.mjs: each version file's version field is matched as
  `"version"`, any whitespace, a colon, any whitespace, and the quoted
  current version; the exactly-once check counts those matches; the
  write replaces only the quoted version inside the match.
- tests/release.test.mjs: the fixture writes one manifest compact; a
  release sets its version and leaves the rest of each version file
  byte for byte, and the refusal for a disagreeing file still fires.

## Tests

- a compact version file is released, and nothing else in any version
  file changes (PKG-042)

## Done when

- PKG-042 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
