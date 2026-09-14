commitment: check-runs-only-what-is-stale
commit: a81b6e44b75da19e4ac51b187e2e63261eca86e1
examined:
  - LOOP-094 against runChecks, check, main's dispatch, the help text, and tests/check-stale.test.mjs; the selector run on this repository with every record fresh.
findings:
  - resolved: The refusal test for --stale with a requirement identifier passed before the kernel knew the option, because an unknown option was already a usage error naming it; the test is kept as a guard, and the three behavioral tests are the ones that failed red.

## Commitment review at a81b6e4, 2026-09-14

The second commitment promoted under LOOP-087, at Consequential, so
its decision sits in the review queue beside the two from the
continuation commitment. LOOP-094 carries the promotion marker and its
decision record names the backlog item.

Failure demonstration: with the tests written and the kernel unchanged,
tests/check-stale.test.mjs ran 1 passing and 3 failing; the passing one
is the refusal case recorded above. With the selector built, the full
suite is 376 passing, both lints clean, the kernel at 1322 of 1500
lines. The selector reuses assess and context, wake's own assessment,
so the set it runs is the set wake would name run for; a fresh failure
and an unverified result are skipped with implement named, which is
what wake names for them. The dedupe is the existing run set: a
mechanism shared by two stale requirements ran once and both records
name the same output file.

Observed on this repository, every record fresh, run during this
review with no code changed:

    nothing stale: every requirement with a mechanism has current evidence or waits on implementation (LOOP-094)
    Resolvable: reconcile review check-runs-only-what-is-stale at a81b6e44b75da19e4ac51b187e2e63261eca86e1
      .cairn/in-progress names an unfinished action; finish or abandon it, then remove the record

Nothing ran and no record was written. Attacked: --stale against a
damaged history, which assess reports as repair and the selector
skips, leaving wake to name the repair; --stale under an unresolved
scope breach, which runChecks refuses before selection as it does for
any check; the help text, which the help suite reads for the command
word. Limit recorded: the selector assesses every requirement of the
commitment on each call, the same cost as one wake.

Self-audit against the production rules: the change is one selection
block, one dispatch line, and the help text, inside the promoted item's
text; every check reported here ran and passed. No open finding.
