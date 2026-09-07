# Preserve unrelated-change freshness alongside record and retention checks

Level: Judged
Decided by: agent
Supersedes: freshness-by-declared-inputs
Cause: an unforeseen condition occurred
Rests on: LOOP-024 LOOP-058 LOOP-065 LOOP-070 LOOP-084 LOOP-085
Would be wrong if: Unrelated changes invalidate evidence, or the wording suppresses required agreement, integrity, or retention checks.
History: The original decision correctly rejected invalidation on every HEAD change, but its only-then wording predates explicit agreement, output, history, and retention conditions. Later completion reversals reinforce preserving all required checks. This Judged clarification documents existing behavior and does not change the runtime or widen a footprint.

## Decision

Keep declared-input identity as the boundary for ordinary file-change invalidation. Refine the original only-digest-changes claim: agreement, mechanism declaration, receipt history, captured output, and applicable retention approval and retained candidates also determine whether evidence can be used. These record and approval checks do not extend the declared footprint. Preserve the original decision text as history and link this clarification through supersession.

## Realized by

- 5e1a7f280b14589d081891f42e54c7aa0b912c2d Record freshness clarification and mechanism review
