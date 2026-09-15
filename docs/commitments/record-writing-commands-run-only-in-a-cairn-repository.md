# Record-writing commands run only in a Cairn repository

Slug: record-writing-commands-run-only-in-a-cairn-repository
Requirements: LOOP-118, LOOP-046
Promoted from: record-writing-commands-refuse-to-run-outside-a-cairn-repository
Inherits: every PKG requirement
Status: Agreed 2026-09-15

## Goal

Every command that writes a record checks the repository the way wake
and check do, so a mistyped directory gets the same message instead of
a raw error or a stray file.

## Deliverables

- bin/cairn.mjs: the roadmap and Git checks run before every command
  except help and lint.
- tests/robustness.test.mjs: each record-writing command in an empty
  directory exits 3 with the repository message and writes nothing;
  tests/decide.test.mjs builds its fixture on a Cairn repository.

## Done when

- LOOP-118 and LOOP-046 have current passing evidence from node-test.
- A review record at the current commit with no open finding.
