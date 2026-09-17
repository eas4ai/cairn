# Promote a git that cannot start is a refusal, never a verdict

Level: Consequential
Decided by: agent
Promotes: a-git-that-fails-to-spawn-is-read-as-a-git-that-said-no
Rests on: LOOP-137 LOOP-046 PKG-022 LOOP-087 LOOP-088
Would be wrong if: a harness expects the kernel to answer Resolvable or Done even when git cannot be started, for example to keep a stop hook from blocking; then a refusal exit changes what the hook sees, though the hook already treats a kernel with no verdict as a one-line complaint that never blocks (PKG-036)
History: Five reversals in the decision domain; none about the kernel's own failures. Consequential: it changes what every command does when git cannot start, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/a-git-that-fails-to-spawn-is-read-as-a-git-that-said-no.md, captured 2026-09-17 during the kernel review commitments. Drafted requirement, LOOP-137: when git cannot be started, the loop refuses with one line naming the cause and a nonzero exit, and records no verdict, evidence or record. Falsifier: with a git on PATH that cannot be executed, wake prints a verdict or a stack trace, or check records a receipt. Mechanism: node-test through the robustness tests with a PATH whose git is not executable. Chosen because three one-off test failures on 2026-09-17 each fit a transient spawn failure, and today such a failure is either a wrong verdict or a stack trace, so nothing in the output says what happened.

## Realized by

(none yet: recorded, not built)
