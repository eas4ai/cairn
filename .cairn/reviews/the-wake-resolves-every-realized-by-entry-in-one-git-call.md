commitment: the-wake-resolves-every-realized-by-entry-in-one-git-call
commit: 4984c46d
examined:
  - re-examined at 4984c46d after the resolution: the only declared inputs that changed are one line in resolveCommits and the new ambiguity test; the seven-character collision case names the LOOP-113 repair, the twenty-record case still logs one batch call, and every other verdict is unchanged.
  - the failure demonstration before the fix: with the test in place and the kernel at efe6b3e's parent, a wake over twenty built records logged twenty rev-parse --verify calls through a git wrapper on PATH; with the change it logs none and exactly one cat-file --batch-check, and names the same action, run R-001. Full suite 483.
  - the verdicts the batch feeds, against their tests: built (DEC-006), the placeholder above a resolving entry (DEC-021), the shallow clone (LOOP-113) and the unbuilt record all pass unchanged; the batch dedups identifiers and answers one line per input in order, which is how the result is mapped.
  - ambiguity, probed on a scratch repository with two blobs sharing a four-character prefix: git cat-file --batch-check prints "<prefix>^{commit} missing" on standard output and "short object ID <prefix> is ambiguous" on standard error, where rev-parse --verify printed the ambiguity on standard error too. The rewrite reads the batch's standard output only, so an ambiguous entry now reads as missing and the wake names build instead of the LOOP-113 repair "lengthen it". No test covered ambiguity before this commitment, which is why the suite stayed green. Finding, below.
  - the check under this commitment: node-test failed once at dc8fd74 in an unrelated agreement test on a kernel command's exit status, the third one-off of the day; the file passes five times in a row and the rerun at 22e4e56 passes. Captured to the backlog as a-git-that-fails-to-spawn-is-read-as-a-git-that-said-no, since a transient spawn failure is the one explanation that fits all three.
  - the package: every mechanism re-run after the kernel change, every requirement pass; bin/ is 1587 lines against the 1600 ceiling, thirteen to spare, which the next kernel change must budget for.
findings:
  - resolved: an ambiguous Realized by identifier now reads as missing, because the batch reports ambiguity on standard error and the rewrite reads only standard output; the wake names build where LOOP-113 requires the repair "lengthen it", and no test holds the case. Resolved: resolveCommits collects the identifiers git names in "short object ID <id> is ambiguous" on standard error and marks them ambiguous ahead of the stdout line; a test builds two blobs sharing seven hex characters and asserts the "lengthen it" repair (4984c46d)

## Commitment review at 22e4e56, 2026-09-17

The seventh and last promotion out of the kernel review. The batch
does what the finding asked, and the probe that matters was the one
the old code answered through a different channel. A rewrite that
preserves every tested verdict and drops the one untested verdict is
exactly the shape a review exists to catch; the fix is to read the
channel the batch actually uses and to pin the case with a test.

Resolved after the record: ambiguity is read where git reports it, and the
case is pinned by a test. No open finding.
