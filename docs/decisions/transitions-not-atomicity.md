# Named transitions rather than promised atomicity

Level: Consequential
Decided by: agent
Rests on: LOOP-003, LOOP-021, LOOP-022
Would be wrong if: an interruption between two named transitions leaves
a state the wake cannot read, which would mean the transition list is
incomplete rather than the approach wrong

## Decision

LOOP-003 promises recovery after any persisted transition, not at any
point. The transitions are named: a decision recorded, code committed,
evidence recorded, an escalation written, an escalation answered. Each is
on disk before the next action begins.

The independent review showed that "stopped at any point" was stronger
than files and git can deliver, and offered atomic writes or a narrower
promise. Atomic multi-file transitions over a working tree would be a
subsystem. Naming the transitions costs nothing and makes the promise
honest: the wake reads whatever the interruption left, and LOOP-022 says
what it does with uncommitted changes.

## Realized by

- ad05249  Independent review (Astra): seven findings, all accepted
