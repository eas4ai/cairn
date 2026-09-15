commitment: the-hooks-find-the-kernel-and-the-project
commit: 98d655c
examined:
  - mechanism review, PKG-004 revised to 1600: scripts/pkg-lint.mjs counts the lines of bin/*.mjs and reports when the count exceeds 1600, the number the revised falsifier names; the violating example (a count above the ceiling) was observed by the second audit's enforcement pass at 1500 and only the number changed. The lint counts .mjs files where the falsifier says "the files under bin/"; commitment 4 aligns the lint to the falsifier (audit-2 D10). No mismatch for the files bin/ holds today, all .mjs.
findings: []

## Mechanism review at 98d655c, 2026-09-15

Recorded before any code change in this commitment.
