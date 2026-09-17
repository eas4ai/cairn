# Promote the hooks name the failure they met

Level: Consequential
Decided by: agent
Promotes: the-hooks-hang-at-a-root-toplevel-hide-a-failed-spawn-and-misname-a-vanished-cwd
Rests on: PKG-041 PKG-022 PKG-018 PKG-035 LOOP-087 LOOP-088
Would be wrong if: a harness never sends a working directory that has vanished and never ships a hook entry without its shared hook; then the two lines are dead weight in a kernel with a line ceiling
History: Five reversals in the decision domain; none about the hooks. Consequential: it changes what a hook prints on failure, which the harness shows the developer, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/the-hooks-hang-at-a-root-toplevel-hide-a-failed-spawn-and-misname-a-vanished-cwd.md, captured 2026-09-17 from the kernel review's findings 7, 8 and 10. Drafted requirement, PKG-041: a hook names the failure it met; when the working directory on standard input does not exist, the line says so and names it; when a hook entry file cannot start the shared hook, the entry prints one line on standard error naming the cause and exits 0. Falsifier: with a cwd on standard input that no longer exists, the hook's line says git cannot run; or a hook entry whose shared hook file is missing prints nothing or exits nonzero. Mechanism: node-test through tests/hooks.test.mjs and tests/plugin.test.mjs. The walk that never ends when the Git toplevel is the filesystem root is repaired in the same work as a hang that PKG-022 already forbids; a repository at / cannot be built in a test, so the walk is made to end by construction and the review says why the demonstration is impractical. Chosen fourth because the hooks are what every installed project meets first, and a silent exit 0 lets a Resolvable stop through.

## Realized by

(none yet: recorded, not built)
