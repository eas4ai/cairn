commitment: defects-are-fixed-without-a-promotion
commit: 7f92e0cc
examined:
  - LOOP-087 as revised and LOOP-140: tests/defect.test.mjs failed on the kernel before the build and passes now. --defect is refused without --from, with a requirement that is not Agreed, and with --next-iteration, and writes Defect: yes. At complete, an unfixed defect is named fix before a promotable item; a Fixed by: whose commit has no passing evidence after it, or whose commit changes an Agreed requirement, does not count, each with its own reason; a real fix checked and reviewed lets the promotion through, and the defect item is never a promotion candidate.
  - precedence, attacked: a fix commit that changes a requirement inside the commitment is caught earlier by the mechanism review the wake names first (LOOP-059); the Agreed-text rule matters for a requirement outside the commitment, which the test uses.
  - a defect captured from the commitment's own requirement still passes the capture gate only with an Outside because: line (LOOP-092); a defect in current work is fixed as current work, not captured.
  - the weak point the review before agreement named: whether the requirement's text already forbids the defect is the agent's judgment. A Fixed by: that changes no Agreed text but adds new behavior would count; the review of the commitment is where it is read.
  - the kernel resolves the fix commit and compares requirement digests at it and its parent, two readings of docs/spec at two commits per defect item, only while defect items exist.
  - the package: bin/ is 1667 lines against the 1900 ceiling; the full suite passes at 501; pkg-lint and spec-lint clean.
findings: []

## Commitment review at 7f92e0cc, 2026-09-17

A defect now costs a failing test, a fix, a check and a review. The
guard that keeps it from becoming a back door for new contract is the
Agreed-text comparison, and the part no guard can reach, whether the
fix is really a fix, stays with the review.

No open finding.
