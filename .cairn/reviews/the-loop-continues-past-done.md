commitment: the-loop-continues-past-done
commit: 21fe98947f8247539ae50f22a7931429e5f299bb
examined:
  - node-test against the revised LOOP-029: tests/scope.test.mjs, the kernel's requirementSet and currentCommitment, and a throwaway fixture carrying a promotion marker.
findings:
  - open: LOOP-029's first clause has no test and no kernel check; a requirement marked Agreed by promotion of a decision that does not exist is accepted by wake.

## LOOP-029 mechanism review, 2026-09-14

Revised text: a backlog item needs a recorded promotion decision, and a
next-iteration item needs the developer's confirmation. Falsifier: a
commitment includes a requirement that neither covers.

node-test speaks for LOOP-029 through the suite's exit code. The one
test naming it, in tests/scope.test.mjs, covers the second clause: a
commitment naming R-003 while R-003 is not Agreed produces the repair
verdict. Observed again in the fixture: Status: Draft on R-003 gives
Resolvable: repair docs/commitments/first.md.

The first clause has no test. Safe violating example: R-003 marked
Status: Agreed 2026-09-14 by promotion no-such-decision, and the
commitment carrying Promoted from: some-item. Observed: wake proceeds
to Resolvable: run R-001, identical to the developer-confirmed control.
The kernel's Status regex reads the first word and ignores the marker,
so the suite passes while the falsifier state stands. That mismatch is
the open finding above. The corrected case cannot be shown until the
kernel reads the marker, which is LOOP-088's implementation; that
action follows this review and takes the fixture above as its test.
No code changed during this review.
