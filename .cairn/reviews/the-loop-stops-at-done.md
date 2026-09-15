commitment: the-loop-stops-at-done
commit: b5a80290fe343de9cca5fdca36be41dc6813a849
examined:
  - The build at b5a8029: the wake ending, tests/continuation.test.mjs and tests/skills.test.mjs, the working agreement and its template, the README and manual passages, the superseding decision, and the two record moves.
  - node-test against the revised LOOP-091: the two LOOP-091 tests in tests/continuation.test.mjs, the wake ending in bin/cairn.mjs, and a green fixture with one waiting next-iteration item.
findings:
  - resolved: The wake ending and its two tests implemented the reversed rule; the ending now reports Done with the waiting count, the escalate and specify branches are gone, and the replacement test ran red on the old ending and green on this one.

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

## Commitment review at b5a8029, 2026-09-14

Every requirement has current passing evidence: the revised LOOP-091,
LOOP-087, and the inherited package set. The suite is 381 passing,
both lints clean, the kernel at 1397 of 1500 lines, nine lines lighter
than before the branches left.

Failure demonstration: with the replacement test written and the old
ending in place, tests/continuation.test.mjs ran 7 passing and 1
failing, the failing one being Done with waiting items; on the new
ending all pass. The promotion test in the same file still names
promote for an unpromoted backlog item, so LOOP-087 is untouched. The
skills suite reads the new Done bullet and the absence of the escalate
next-iteration move from the template, byte-identical to AGENTS.md.

Attacked: the answered escalations loop-091 through loop-091-4, which
stay closed on disk and are read by nothing now, so a consumer that
recorded such an answer under the first text keeps it as history and
gets Done; the LOOP-090 route, which still escalates when a promoted
item turns out to need a contract change, since that escalation
concerns the commitment and not a next-iteration choice; the LOOP-092
gate and the LOOP-093 format check, which read next-iteration files
and are unchanged; and the two record moves, which the gate accepted
because SPEC-012 is not in this commitment's set.

Records: the moot decline item is removed with its reason in the
commit that removed it, and the next-iteration skill request is back
to waiting with a Changes: line, its absorbed stamp of the same day
withdrawn because the escalation it named no longer exists.

Self-audit against the production rules: one branch removed, one test
replaced, the documentation the commitment lists, and a ruling
recorded as a supersession by the developer; every check reported here
ran and passed. No open finding.
