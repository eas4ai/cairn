# A commitment is done by its own deliverables

Superseded by: check-belongs-to-the-first-commitment

Level: Judged
Decided by: agent
Rests on: LOOP-019, the commitment's done-when
Would be wrong if: a commitment can be shown complete without any mechanism having run, which would mean the primary test is not strong enough on its own

## Decision

The first commitment's done-when required current passing evidence for every requirement. Recording evidence is cairn check, which the second commitment delivers. So the first could not finish without the second, and LOOP-019 forbids starting the second before the first is done. The done-when was asking a commitment to prove itself with a tool it does not have.

Amended: the-record-and-the-wake is done when its mechanism is declared, its suite passes, and the primary test holds: two agents given only the repository state the same position and next action. Evidence-based completion (LOOP-017) begins with the commitment that builds the tool that records evidence.

The referee found this itself. Its first wake on this repository said run LOOP-001, no evidence, which is the correct next action and points at the next commitment's work.

## Realized by

- ccc24c8  The first commitment is done by its own deliverables
