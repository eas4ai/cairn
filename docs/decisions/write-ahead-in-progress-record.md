# A write-ahead record for the action in progress

Level: Consequential
Decided by: agent
Rests on: LOOP-022, LOOP-027, LOOP-003
Would be wrong if: agents routinely forget to write or clear the record,
so that a stale in-progress file blocks every wake until a human removes
it

## Decision

Before any action that changes code, the agent records the action, its
target, and the base commit. Reconciling that record is the first wake
step, ahead of presenting an escalation.

The previous rule told the wake to treat uncommitted changes as work on
"the most recent unrealized decision or unmet requirement." That is a
guess, and a wrong guess duplicates or contradicts finished work, which
is the exact failure LOOP-003 forbids. The independent review proposed
the write-ahead entry. It is four fields in one file, it makes the first
wake step deterministic, and it lets two memoryless agents derive the
same first action from the same checkout, which the first commitment
names as the primary test of the system.

It goes ahead of the escalation step because the escalation file itself
might be the artifact an interruption left half-written.

## Realized by

- 69ee718  Second independent review, reconciled against current
