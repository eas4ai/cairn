commitment: the-stop-hook-holds-without-trapping
commit: d4234665
examined:
  - re-examined at d4234665: release 0.6.0 cut by scripts/release.mjs as one commit tagged v0.6.0, setting the version in package.json and the four plugin manifests; every mechanism re-run on the version files and pass
  - re-examined at 3c87581c: the only declared input that changed is CHANGELOG.md, which adds the 0.6.0 entry describing this commitment and the autonomy specification; no code changed, every mechanism re-run and pass
  - completion review at 9e0ab9a7: every requirement passes on fresh evidence and the full suite passes at 494. Each of the five new or reversed tests failed on the hook and kernel at 0213b26 and passes now.
  - this morning's trap, rerun on this repository: the production command on PATH is cairn 0.5.0 at ~/workspace2/cairn, and its own wake here says "run PKG-018, the kernel changed", the staleness the old hook refused every stop on. The new hook with that command first on PATH judges with this checkout's bin/cairn.mjs, whose digest the receipts carry, and gives the checkout's real verdict. The probe's refusal count was removed afterwards.
  - a project below the Git toplevel, on a scratch repository: the count is written to the outer Git directory, no .git appears in the project, stops one to three are refused, and the fourth goes through with the systemMessage and a stop record under the project's .cairn/stops/.
  - cheating, attacked: deleting the count file or touching a file resets the count, which only brings more refusals; idling three times gets the stop, but the harness shows the developer the message and the next wake demands an explanation before any other work; deleting an unexplained record before the next wake hides it from the wake, but not from the message the developer already saw. The valve is visible, not preventable, as the review before agreement said.
  - two sessions stopping at the same moment can overwrite each other's count; a lost count restarts at one, which refuses more, never less.
  - the fingerprint runs git diff HEAD on every refused stop; a very large uncommitted diff makes each refusal slower, not wrong.
  - limits: Codex's handling of systemMessage is not verified; the stop record and the next wake hold either way. The explain verdict comes after a live check lock and before an in-progress record, so a stop taken mid-action is explained first and then reconciled.
  - the package: bin/ is 1631 lines against the 1900 ceiling; pkg-lint and spec-lint clean; the manual's stop hook paragraph and the working agreement's explain move say what the code does.
  - mechanism review of node-test for PKG-018 as revised: tests/hooks.test.mjs line 33 passes stop_hook_active false and expects a block, which the revision keeps; line 192 passes stop_hook_active true and expects the stop to be let through, which the revision now forbids. The test observes the behavior the requirement was revised to remove.
  - mechanism review of node-test for PKG-021 and PKG-033 as revised: the hook tests cover a link to another checkout and a wrapper on PATH, which the revisions keep when no receipt names another kernel. No test writes receipts with one kernel and runs the hook with a different kernel on PATH, so the evidence rule is unobserved, and the hook does not implement it.
  - PKG-043, PKG-044 and LOOP-139 are new; no test observes them and nothing implements them.
findings:
  - resolved: tests/hooks.test.mjs asserts that stop_hook_active true lets a Resolvable stop through, which PKG-018 as revised forbids; the test must assert the block. Resolved: the give-way branch is removed from bin/hook.mjs; the test now passes stop_hook_active true and asserts the block (48c2e010)
  - resolved: no test observes PKG-033's evidence rule, receipts written by the project's bin/cairn.mjs judged with that kernel rather than a different one on PATH, and the hook does not implement it. Resolved: the hook reads the latest receipt's kernel_digest and judges with the first of the PATH command, the link, the project's bin/cairn.mjs and its own kernel whose digest matches, falling back to the usual order; the test writes receipts with a project kernel of a different digest and asserts the hook's verdict is that kernel's, with no kernel-changed staleness (48c2e010)
  - resolved: no test observes PKG-043's valve, PKG-044's refusal text, or LOOP-139's explain verdict, and none is implemented. Resolved: the hook counts refusals per session_id in the Git directory against the verdict and a fingerprint of HEAD, the diff and the untracked files; the fourth unchanged stop returns a systemMessage and writes .cairn/stops/<time>.md; the refusal names cairn escalate; the wake names explain for an unexplained or uncommitted record right after the check lock; tests cover the valve, the message, the record, resets by an edit and by a commit, separate sessions, and each explain state (48c2e010)

## Mechanism review at 0213b266, 2026-09-17

The revisions reverse one behavior the tests pin and add three the
tests do not reach. All three findings are resolved as one
implementation action after this record, each new test red on the code
at this commit and green after.

## Commitment review at 9e0ab9a7, 2026-09-17

The hook now refuses only what the agent can act on, and the test of
that was this repository itself: the kernel mismatch that produced a
dozen empty refusals today no longer produces one. The valve is the
part the developer asked to be cheat-proof, and it is not: an idle
agent can still stop. What changed is that it cannot stop quietly. The
message reaches the developer at the moment it happens, and the next
session starts by explaining it in the history.

No open finding.
