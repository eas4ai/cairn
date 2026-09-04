# cairn check belongs to the first commitment

Level: Consequential
Decided by: agent
Supersedes: a-commitment-is-done-by-its-own-deliverables
Cause: it was wrong when it was made
Rests on: LOOP-017, LOOP-019, LOOP-028
Would be wrong if: a first commitment carrying thirty-five
requirements proves too large to review honestly in one pass, in which
case the split should be along a line where both halves can still
reach Done

## Decision

The first commitment delivers wake, decide, and check. Its done-when is
LOOP-017: every requirement has current passing evidence, recorded by
check, with a clean review at the current commit.

The superseded record amended the first commitment's done-when so that
it could finish without evidence, because check had been placed in the
second commitment. That created two truths: the commitment file said
done, and LOOP-017 said not done. LOOP-028 forbids exactly that, and
the referee itself kept reporting the honest one -- run LOOP-001, no
evidence -- while the commitment file claimed otherwise.

The error was the split, not the done-when. Recording evidence is not
separable from the wake: a loop that can name the next action but can
never say Done has not been built yet. So check moves into the first
commitment, the done-when goes back to LOOP-017, and the roadmap gains
the rule that every commitment must be able to reach Done with only
what it and its predecessors deliver.

The reasoning pattern to avoid: when a plan cannot finish, fix the
plan, not the definition of finished.

## Realized by

- eadefb9  The spec is cement; the plans are steel
