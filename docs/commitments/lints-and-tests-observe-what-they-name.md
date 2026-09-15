# Lints and tests observe what they name

Slug: lints-and-tests-observe-what-they-name
Requirements: SPEC-028, SPEC-029, PKG-025, PKG-026, PKG-027, PKG-006, PKG-013, PKG-002, PKG-004, PKG-024, PKG-028, SPEC-019, LOOP-004, LOOP-001, LOOP-003, LOOP-021, LOOP-025, DEC-002, LOOP-026, LOOP-098, LOOP-019
Inherits: every PKG requirement
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

## Goal

Each lint catches the violations its requirement names, the coverage
test sees every read the suite makes, every test title names what its
body observes, and the two lint declarations say what they read.

## Authorization and scope

Requested by the developer on 2026-09-15 after the second audit,
recorded in docs/decisions/the-second-audit-is-remediated-on-the-
developer-s-direction.md; plan docs/audit/2026-09-15-remediation-
plan-2.md, commitment 4. Findings closed: B7, B8, D13, E1, E2, E3, F1
to F6, D10 (the PKG-004 count).

## Deliverables

- scripts/spec-lint.mjs: the regex set `^ $ * | ? \ [ ] ( ) { } +`;
  drive paths with either slash and `file:/`.
- scripts/pkg-lint.mjs: a vendor-naming step matched across wrapped
  list items; the verbs launch, start, press, click, select, install
  and paste, in either order with the product; the phrases future
  version, not yet supported, coming soon, next release and later
  milestone; the ignore probe with .out and .err names; every file
  under bin/ counted.
- tests/coverage.test.mjs: every `../` literal and relative import;
  the root listing removed.
- fourteen test titles retitled or their bodies strengthened to
  observe the falsifier they name; the branches the audit listed
  covered by the tests of commitments 1 to 3, except the 7-hex
  collision, verified by hand.
- .cairn/mechanisms/spec-lint declares skills/; PKG-024 and PKG-028
  rationale record the reads the footprint cannot express.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
