commitment: the-scope-history-reads-current-as-the-wake-does
commit: fb5b4e8
examined:
  - the failure demonstration before the fix: with the new test in place and the kernel restored to 60e1ee9's parent, the walk stopped at the fenced revision and wake named run R-001 with the stray file unreported; with the change, wake names scope stray.txt in both shapes, and the full suite passes at 476.
  - the reader, probed directly on roadmap shapes: a fenced example above or below the real line, a tilde fence, padding around the slug, CRLF line ends, all yield the one real line; an indented Current: is not a field line, as before; an unclosed fence swallows everything after it, which at HEAD is the same "no Current: line" repair as before and in history ends the walk at a revision the wake of that day would have refused too.
  - what the wake still reads: the count of Current: lines now comes from the shared reader and the slug still comes from fields() over the fence-stripped text, so a prose line wrapped directly under Current: without a blank line reads as it did before; the only behavior that changed is the walk.
  - the walk against this repository's own history: wake at fb5b4e8 reaches this commitment's own review action with no scope verdict, so the activation commit is found where the roadmap moved Current: and every commit since is inside the footprint.
  - two Current: lines in history: counted as inside when either names the slug; the wake at that revision would have named a repair, and the agent's next commit removed the extra line, so counting the commit as inside keeps the footprint whole rather than cutting it at the repair.
  - the package: every mechanism re-run after the kernel change, every requirement pass; bin/ is 1562 lines against the 1600 ceiling.
findings: []

## Commitment review at fb5b4e8, 2026-09-17

The second promotion out of the kernel review. One reader now decides
what a Current: line is, and the walk asks it the only question it
needs: does any line outside fences name the slug. The wake's stricter
question, is there exactly one, stays at HEAD where a repair can act
on it. Attacked on the shapes above without changing code.

No open finding.
