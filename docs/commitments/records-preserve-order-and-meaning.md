# Records preserve order and meaning

Slug: records-preserve-order-and-meaning
Requirements: LOOP-070, LOOP-071, LOOP-072, LOOP-073, LOOP-074, LOOP-075

## Goal

Remediate the six finding groups from the repeated audit and give the
completed changes another adversarial review. Authorized by the developer:
"I think we can remediate here and then give it another once over after".

## Deliverables

- Persistent receipt execution order and detection of changed prior history.
- Header-only decision/review metadata and unquoted realization entries.
- Escalation serialization that cannot manufacture a developer answer.
- Git-clean conversion support with raw execution identity preserved.
- Historical specification paths read without display quoting.
- Receipt recognition and actionable malformed-receipt recovery.
- Regression tests, upgrade guidance, and an adversarial review of the repairs.

No new public command, database, service, or deployment is needed.

## Verification

First reproduce each defect with a failing integration test in a real Git
repository, then demonstrate the corrected outcome. Include backward and equal
clocks, imported and legacy receipts, quoted decision/review examples, malformed
Blocking concerns, CRLF and hidden input changes, non-ASCII specification names,
supporting evidence files, and malformed receipt recovery. Keep the existing
suite and package/specification mechanisms passing. After implementation,
inspect and probe what these tests could miss, record the review before fixing
any finding, and run Cairn's committed evidence checks before Done.
