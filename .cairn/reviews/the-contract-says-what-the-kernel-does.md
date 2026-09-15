commitment: the-contract-says-what-the-kernel-does
commit: e82c583
examined:
  - node-test against the revised DEC-016 and LOOP-026, pkg-lint against the revised PKG-004, and spec-lint against the revised SPEC-002, each read beside the tests or lint code that speaks for it.
findings: []

## Mechanism reviews, 2026-09-15

DEC-016, node-test. Revised falsifier: a fourth attempt, as DEC-017
and DEC-018 count attempts, with no escalation raised since the
third. The tests that speak for the attempt count
(tests/check.test.mjs, tests/freshness-sequences.test.mjs,
tests/two-mechanisms.test.mjs) build histories of distinct inputs
digests after a baseline and assert escalate after the third, which
is the state one attempt before the falsifier. The first text counted
failing records, which those tests never asserted; the revision names
what they observe. No mismatch.

LOOP-026, node-test. Revised text: the developer-facing block is
exactly the six fields in order, one line each; the record lines
after it are not part of the block. tests/escalate.test.mjs asserts
the six labels in order and one line each, refuses a multi-line field,
and, since this commitment, asserts that no Status: line follows. The
record lines the kernel writes after the blank line (Concerns, Raised,
Raised after, Scope, Malformed) sit outside the block the revised
falsifier bounds. No mismatch.

PKG-004, pkg-lint. Revised text: the files under bin/ under 1500
lines. scripts/pkg-lint.mjs counts exactly the tracked bin/*.mjs files
(1405 today), which the first text did not say and which the lint
could never fail on for the lint scripts. The lint now matches the
text. No mismatch.

SPEC-002, spec-lint. Revised text: Agreed needs the developer's
confirmation, a promotion decision, or a recorded deference; the
marker by deference resolves like by promotion. The lint reports an
Agreed block without a Falsifier: line and, since this commitment,
resolves both marker kinds to a decision record (LOOP-088, SPEC-002).
Safe violating example: at 9028454 the deference test in
tests/continuation.test.mjs failed on the old parser, which read no
deference marker and so refused nothing; at 74c15a1 it passes, and the
lint run inside that test reports clean on a resolving marker.

Two more safe violating examples from the same commit pair: the
LOOP-101 test failed at 9028454 because the agreement wrapped
"implement <REQ>" across a line and named no move for it in one
token, and the LOOP-028 test failed because escalate still wrote
Status: open; both pass at 74c15a1. One trap found by the loop
itself: the revised SPEC-002 falsifier wrapped onto a line beginning
with "Status:", which the parser took as the block's status; repaired
at e82c583 by reading the last Status: line of a block, with a test. No
code changed during these reviews.
