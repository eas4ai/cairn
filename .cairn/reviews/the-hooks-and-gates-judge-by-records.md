commitment: the-hooks-and-gates-judge-by-records
commit: 667f0b3
examined:
  - The build at 439ab0e: bin/hook.mjs whole, promotedContractVerdict, the Promotes check and decide --promotes, breaches' record set, the wake promote reason, the working agreement's promote paragraph, and the test files touched.
  - tests/hooks.test.mjs, tests/continuation.test.mjs, tests/scope.test.mjs against PKG-021, PKG-022, LOOP-114 through LOOP-117, PKG-019, LOOP-089, LOOP-088; nine tests red at ff24659 and green at 439ab0e.
findings: []

## Commitment review at 667f0b3, 2026-09-15

Every requirement has current passing evidence: PKG-021, PKG-022,
LOOP-114 through LOOP-117, PKG-019, LOOP-089, LOOP-088, and the
inherited package set. The suite is 410 passing, both lints clean,
the kernel at 1463 of 1500 lines.

Safe violating examples: the nine new tests failed at the agreement
commit on the old hook and kernel, each on the fault it names, and
pass at 439ab0e.

Attacked:

- The hook now runs whatever cairn.mjs the command link resolves to.
  A link that points at a file named cairn.mjs which is not a Cairn
  kernel would be run; the link is the user's, the install skill
  writes it, and a wrong target fails wake with exit 3, which the stop
  hook treats as no block. The tests for the two-checkout case ran
  the hook from this checkout against a link to an altered copy and
  saw the copy's verdict.
- The hook tests' helper now gives every call a scratch HOME. Before
  that, the suite's stop-hook test silently used the developer's real
  link, which points at the production checkout; under PKG-021 that
  kernel would have judged, and did, until the helper changed. The
  real link was never written to.
- A root activation commit has no parent; the LOOP-089 comparison
  then reads the activation commit itself, as before, and the
  activation's own rewrite is invisible there. Every fixture in the
  suite activates at the root commit, which is why the change first
  broke them; the LOOP-116 test activates at a second commit.
- The Concerns gate treats a change to the working agreement as
  LOOP-036 on the Concerns line; an escalation naming R-001 alone does
  not silence a change to both. A promotion record from before this
  rule names its item in prose only; the check reads only the current
  commitment's record, and every current-style promotion goes through
  decide --promotes, which the agreement now names.
- The footprint's record set is a fixed list. A consumer with a recon
  report elsewhere than docs/recon.md, or a spec directory elsewhere
  than docs/spec, is not this kernel's shape anyway. Three tests that
  used docs/note.md as an undeclared, breach-free path now use
  docs/recon.md, and the scope test asserts the breach for docs/notes.md.
- The session-start message for a link to another checkout avoids the
  word "linked", which the existing test forbids outside a Cairn
  repository.

Self-audit against the production rules: the deliverables the
commitment lists, nine tests added, four adjusted with the reason
recorded here; every check reported here ran and passed. No open
finding.
