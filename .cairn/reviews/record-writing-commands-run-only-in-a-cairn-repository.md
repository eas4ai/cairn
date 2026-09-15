commitment: record-writing-commands-run-only-in-a-cairn-repository
commit: 3bb1072
examined:
  - The dispatch in main: the repository checks now precede every command but help and lint; the decide tests moved onto a Cairn repository fixture, one of them removing .cairn/queue first to keep its case.
  - tests/robustness.test.mjs LOOP-118 case, red before the change and green after, over six commands in an empty directory.
findings: []

## Commitment review at 3bb1072, 2026-09-15

LOOP-118 and LOOP-046 have current passing evidence; the suite is 423
passing, both lints clean, the kernel at 1472 of 1500 lines.

Attacked: lint stays usable anywhere, as PKG-028 needs; help returns
before the checks. A consumer who ran cairn backlog before writing a
roadmap now gets the same message as wake, naming the root option,
instead of a stray directory. The Git message names every command but
help and lint. The decide tests lost their minimal fixture, which is
what the falsifier forbids. No open finding.
