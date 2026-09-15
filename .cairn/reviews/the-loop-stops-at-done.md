commitment: the-loop-stops-at-done
commit: 4c5b01b007e2ba4f8642ef210c0993388fe799dc
examined:
  - node-test against the revised LOOP-091: the two LOOP-091 tests in tests/continuation.test.mjs, the wake ending in bin/cairn.mjs, and a green fixture with one waiting next-iteration item.
findings:
  - open: The wake ending and its two tests implement the reversed rule; a complete commitment with an empty backlog and a waiting next-iteration item gets escalate next-iteration, and an answered escalation gets specify, where the revised text requires Done.

## LOOP-091 mechanism review, 2026-09-14

Revised text: with the commitment complete and the backlog holding
nothing to promote, the loop reports Done whatever next-iteration
holds, and never names a next-iteration item as an action. Falsifier:
wake names an escalation or a specification for a next-iteration item
instead of Done.

node-test speaks for LOOP-091 through two tests written today for the
first text: one expects escalate next-iteration and Escalate after the
escalation is raised, the other expects specify after ok and instead.
Both pass against the current kernel and both assert the falsifier
state of the revised requirement. Safe violating example:

    green fixture with one waiting item; wake: Resolvable: escalate next-iteration

That is the falsifier state, and the suite passes in it. Mismatch
recorded as the open finding. The kernel ending, the two tests, the
working agreement, and the documentation change under this
commitment. No code changed during this review.
