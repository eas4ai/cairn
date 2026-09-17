commitment: a-receipt-names-its-commit-in-full
commit: 615c5c2
examined:
  - the failure demonstration before the fix: with the test in place and the kernel at 6e50d5b's parent, the receipt's commit field was seven characters and the equality with git rev-parse HEAD failed; with the change it is forty characters equal to HEAD, a copy rewritten to the seven-character form is still read by the wake with no "unavailable" or mechanism-review verdict, and the full suite passes at 482. The kernel's own newest receipt at 615c5c2 carries 8d29d307828749eb46aeed7cf0b03382ca11d2f4.
  - where the full identifier is taken: inside candidate(), in the same snapshot as the short head the stability check compares before and after the run, so the receipt names the HEAD the run was validated against and not a later one.
  - what still uses the short form on purpose: headSha feeds the candidate's before-and-after comparison, the review's LOOP-032 message and the in-progress reconciliation, all of which compare against or print for agent-written records that carry seven characters; none of them compares a receipt's commit with a short id, so nothing in the wake changed. Realized-by entries accept seven to sixty-four hex characters as before.
  - readers of the receipt's commit: pastRequirements, retentionReasons and inputsDigestAt pass it to git, which resolves either form while it is unique; the test's rewritten receipt exercises that path.
  - one iteration of the LOOP-065 tests failed once during this build, in its shared setup, with wake exiting 1 where 0 was expected, on a fixture the change does not touch; the same file passed three consecutive runs and the full suite passed, so it is recorded as observed once and not reproduced, beside the one-time "candidate changed" refusal under the previous commitment.
  - the documents: the manual describes the receipt's fields by name, not by width, and the walkthrough shows none; nothing to change.
  - the package: every mechanism re-run after the kernel change, every requirement pass; bin/ is 1576 lines against the 1600 ceiling.
findings: []

## Commitment review at 615c5c2, 2026-09-17

The sixth promotion out of the kernel review. One field widened at the
one place it is written, with the short form kept everywhere it is
compared against records people write by hand. The defect this
removes ripens with age, so the value of the change is not visible
today; the test that pins it is what makes the promise checkable.

No open finding.
