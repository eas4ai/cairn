# This repository declares and lints what it reads

Slug: this-repository-declares-and-lints-what-it-reads
Requirements: SPEC-028, SPEC-029, PKG-023, PKG-024, PKG-025, PKG-026, PKG-027, DEC-014, LOOP-013, LOOP-014
Inherits: every PKG requirement
Status: Agreed 2026-09-15

## Goal

The two lints check what their requirements name, this repository's
three declarations list what their commands read, and the suite says
which requirement each test observes.

## Authorization and scope

Requested by the developer on 2026-09-15 after the audit. Findings
closed: B1, B2, C17, D1, D2, D3, E1, E2, E3 (the PKG-006 half), E4.

## Deliverables

- scripts/spec-lint.mjs: the path scan runs over stripped text; drive
  paths and file URLs are flagged; skill slash names come from the
  checkout's skills/ directory; a mention leaves a placeholder word for
  the actor check.
- scripts/pkg-lint.mjs: PKG-003 reads commands from `--help`; PKG-008
  skips .cairn/; PKG-006 matches per paragraph.
- .cairn/mechanisms: node-test declares docs/manual.md and its own
  declaration; spec-lint declares docs/decisions/.
- tests: the two repository-level lint tests leave; tests/coverage.test.mjs
  fails on an unnamed requirement or an undeclared read; the DEC-014
  test runs the kernel on a real fixture; the LOOP-013 and LOOP-014
  labels are swapped back; 36 tests carry the identifiers they observe.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
