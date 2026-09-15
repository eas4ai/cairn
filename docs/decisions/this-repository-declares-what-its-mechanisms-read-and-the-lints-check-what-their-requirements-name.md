# This repository declares what its mechanisms read and the lints check what their requirements name

Level: Judged
Decided by: agent
Rests on: SPEC-028 SPEC-029 PKG-023 PKG-024 PKG-025 PKG-026 PKG-027 LOOP-006 DEC-014 SPEC-019 PKG-003 PKG-006 PKG-008 PKG-010
Would be wrong if: narrowing the package lint's ASCII scan to shipped files lets a non-ASCII record ship in a consumer's tree, or a test-title convention proves too coarse to say what a test observes
History: Five reversals in this domain; none about the lints or this repository's own declarations. Judged: every change is a declaration correction, a lint case, or a test label, and a revert undoes it.

## Decision

The 2026-09-15 audit found that node-test's declaration omits files its tests read (docs/manual.md through the skills proxy, and every tracked file through the two tests that lint this repository from the suite), that pkg-lint reads .cairn/ for PKG-008 without declaring it and spec-lint reads docs/decisions/ without declaring it, that spec-lint's path scan flags backticked regex literals and misses C: and file:// forms, that pkg-lint's PKG-003 reads header comments where the falsifier names the help text and its PKG-006 regex misses a wrapped step, that 36 of the requirements the declaration speaks for are named in no test title, that the DEC-014 test never runs the kernel, and that two escalation tests carry each other's labels. On the developer's direction of 2026-09-15: the two repository-level lint tests leave the suite, since the spec-lint and pkg-lint mechanisms already prove those results; node-test declares docs/manual.md and its own declaration, which the new coverage test reads; spec-lint declares docs/decisions/; pkg-lint's ASCII scan covers shipped files only, so its declaration matches what it reads; the lint fixes above; a coverage test that fails when a declared requirement is named by no test title or a test reads an undeclared path; the tests relabeled to the requirements they observe; the DEC-014 test built on a real fixture.

## Realized by

(none yet: recorded, not built)
