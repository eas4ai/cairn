# Validate the wake and read commit inputs in one batch

Level: Judged
Decided by: agent
Rests on: LOOP-044 LOOP-045 LOOP-046 LOOP-047 LOOP-054 LOOP-055 LOOP-056 LOOP-024 DEC-006
Would be wrong if: A malformed declaration runs, a dead agent-owned action is deleted, or a changed input keeps a current digest.
History: The earlier loop reversals favor direct repository facts. This change adds validation and batching without adding a new command, evidence type, or inferred scope.

## Decision

Validate each input pathspec against tracked paths and refuse duplicate owners before running or digesting. Missing indexed files are uncommitted changes. Git is required. Find the continuous tenure of the exact Current line on the first-parent history and collect every non-merge diff on that line, retaining changes even when reverted. Read committed blobs through one binary cat-file batch and verify headers and sizes; preserve the digest format and symlink identity. A kernel-owned run record identifies the supervising Cairn PID with owner: kernel; only that record can be removed when its PID is dead. Agent records remain reconcilable. Realized-by entries require a resolving commit and its subject.

## Realized by

- 58ca132 Validate inputs and recover interrupted runs with accurate Git history
