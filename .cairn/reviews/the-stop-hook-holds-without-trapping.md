commitment: the-stop-hook-holds-without-trapping
commit: 0213b266
examined:
  - mechanism review of node-test for PKG-018 as revised: tests/hooks.test.mjs line 33 passes stop_hook_active false and expects a block, which the revision keeps; line 192 passes stop_hook_active true and expects the stop to be let through, which the revision now forbids. The test observes the behavior the requirement was revised to remove.
  - mechanism review of node-test for PKG-021 and PKG-033 as revised: the hook tests cover a link to another checkout and a wrapper on PATH, which the revisions keep when no receipt names another kernel. No test writes receipts with one kernel and runs the hook with a different kernel on PATH, so the evidence rule is unobserved, and the hook does not implement it.
  - PKG-043, PKG-044 and LOOP-139 are new; no test observes them and nothing implements them.
findings:
  - open: tests/hooks.test.mjs asserts that stop_hook_active true lets a Resolvable stop through, which PKG-018 as revised forbids; the test must assert the block
  - open: no test observes PKG-033's evidence rule, receipts written by the project's bin/cairn.mjs judged with that kernel rather than a different one on PATH, and the hook does not implement it
  - open: no test observes PKG-043's valve, PKG-044's refusal text, or LOOP-139's explain verdict, and none is implemented

## Mechanism review at 0213b266, 2026-09-17

The revisions reverse one behavior the tests pin and add three the
tests do not reach. All three findings are resolved as one
implementation action after this record, each new test red on the code
at this commit and green after.
