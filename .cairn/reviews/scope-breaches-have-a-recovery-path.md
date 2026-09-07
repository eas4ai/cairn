commitment: scope-breaches-have-a-recovery-path
commit: 13b22d59b8b65db467a94054963af23d1a6d0d8a
examined:
  - LOOP-035 against scope.test.mjs, breaches, wakeVerdict, wake, and runChecks.
findings:
  - resolved: Added and verified scope-specific restoration, bootstrap declaration, and complete diagnostic coverage.
  - resolved: Aligned the scope escalation help and verified its rendered output and both help tests.

## Mechanism review before implementation

No code changed during this review. The existing scope tests establish that
undeclared commits block checks, declarations cover earlier changes, record
files are exempt, and a revert alone retains the incident. They do not prove
the revised resolution contract. Disposable Git probes confirmed that an
empty footprint reports scope src/exit instead of declaration, two breaches
report only first.txt, and the scope-specific escalation flag is rejected.
These are safe violating examples of the missing repair. Corrected-case
verification remains required as a separate implementation action.

The node-test declaration already includes every runtime, test, and template
input involved. Add tests for the new behavior and preserve the old guard
cases. The displayed LOOP-035 digest identifies this examined text; the
review records the mismatch rather than claiming the old mechanism proves it.

## Implementation verification before committed evidence

The failing cases ran first against the prior CLI in disposable repositories.
The expanded baseline run contained 19 cases: 18 failed for the missing
bootstrap, diagnostic, annotation, and scope-specific behavior; ordinary ok
preserved the guard and passed. Subsequent cases cover inherited mechanisms,
Blocking escalation preservation, and restoration after an imported change.
The complete edited suite now passes 335 tests with zero failures.

The first implementation used the existing abbreviated headSha helper for a
snapshot that requires a full commit identifier. The new acknowledgment test
caught the missing approval stamp; snapshots now use the full first-parent
commit. An existing assertion searched for the word recorded anywhere in
output, which also appears in the new instructions. It now matches the actual
evidence-record line; the new tests also verify receipt counts directly.

The mechanism footprint already covers all changed files. Runtime and template
instructions, the manual, and CLI help describe the same bounded restoration
acknowledgment. Muse's three production reports are preserved with their capture
metadata in development, with honest requirement origins and the named
LOOP-048 through LOOP-051 predecessor. Their production originals remain intact.

Ripwire found complexity growth in answer and escalate; separating request
validation and scope record formatting removed those increases. Its remaining
quality-delta findings are eight short-horizon churn warnings, not a passing
quality-delta exit. The test gate names the new scope test and documentation
sections; the full suite covers the executable callers and walkthrough.
Edit-check confirms breaches retains its signature. Its answer warning binds a
test helper of the same name to the runtime function; main still passes three
arguments, and the test helper has its own default argument. This is a graph
name collision, not a broken runtime call.

Committed evidence and the final review remain outstanding.

## Review of the committed repair

Examined the committed runtime diff, requirement definitions, manual and working
agreement changes, test receipts, and captured output. The committed node-test
run has 335 passes and zero failures; package and specification receipts pass.
The runtime remains within its limit at 1195 lines.

Attacked bootstrap scope loss: an inherited mechanism still supplies a
footprint, and first declaration checks earlier changes. The explicit unrelated
check case establishes the adoption report's missing behavior. Attacked output
completeness and path injection: wake/check share one verdict, use sorted paths,
and escape control characters, including Unicode separators.

Attacked acknowledgment scope: only committed closed ok records with matching
snapshot digests can apply. Commitment activation and first-parent membership
bind the window; later own commits still count, and tree differences include
content, mode, kind, additions, and deletions. An imported change that leaves an
acknowledged path unrestored reopens the incident. Ordinary ok, instead, ask,
uncommitted answers, damaged fields, malformed snapshots, and another activation
cannot grant the exception. Reading committed answers also keeps their meaning
stable while the check validates HEAD before and after execution.

A disposable copy was changed to ignore later commits when applying an
acknowledgment. The later-edit-and-revert test failed because it expected a
scope refusal. Restoring that copy made the same test pass. No development code
changed during the demonstration. This proves the guard test rejects an
incorrectly broad acknowledgment rather than merely accepting the good case.

No runtime defect was established in this review. One help-layout finding above
must be resolved as a separate action. The adjacent milestone assignment also
has an extra indentation level; align it in that formatting correction.
Native macOS and Windows were not run. This review does not make Cairn an
identity or security boundary: developer authorship remains the existing
working agreement, and a committed record is not cryptographic authentication.

The production-rule self-audit covered scope, readability, boundary validation,
error handling, durable answer commitment, history retention, compatibility,
execution stability, test soundness, and documentation. No source code changed
while this review was performed. Production has not been updated by this repair.

## Final review after the help correction

The only subsequent source change aligns the help entry and its adjacent
assignment indentation. The rendered help was inspected, both help tests pass,
and fresh committed node-test evidence again records 335 tests, 335 passes,
and zero failures. Fresh package evidence passes; specification evidence
remains current. Reviewed the formatting diff without changing code and found
no remaining issue. The earlier runtime review and failure demonstration apply
to this unchanged behavior. All review findings are resolved.

The self-audit is satisfied for this development repair. Static quality-delta
still reports the previously documented change-frequency warnings; it is not
represented as a clean static gate. The three Muse reports are now tracked in
development with their original capture times and corrected origins. Their
untracked production originals are preserved; no production release was made.
