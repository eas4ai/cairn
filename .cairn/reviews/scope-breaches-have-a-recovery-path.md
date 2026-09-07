commitment: scope-breaches-have-a-recovery-path
commit: a13efa9515596bcf4ca1043244f3e75cedd77bcf
examined:
  - LOOP-035 against scope.test.mjs, breaches, wakeVerdict, wake, and runChecks.
findings:
  - open: Existing tests do not cover scope-specific restoration acknowledgment, bootstrap declaration priority, or complete path diagnostics.

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
