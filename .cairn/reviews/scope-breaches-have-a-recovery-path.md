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
