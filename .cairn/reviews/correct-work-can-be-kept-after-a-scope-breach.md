commitment: correct-work-can-be-kept-after-a-scope-breach
commit: aa89f224282ba1110c6ce61b4326c63ec8e24343
examined:
  - LOOP-035, LOOP-083, scope-recovery tests, and the scope snapshot, declaration, and acknowledgment readers.
findings:
  - resolved: Aligned the keep option; help tests and fresh full-suite/package evidence pass.
  - resolved: Added explicit retention with exact history and tree bounds, fresh evidence/review, and stable retained candidates.

## Mechanism review

Inspected the existing implementation and tests before changing runtime code.
Current declarations cover historical paths within the current agreement.
Restoration acknowledgment alone compares every accepted path with activation.
It therefore cannot keep correct work still outside that footprint.
The revised LOOP-035 digest is sha256:ae47c483f002f00bdc035e4001f9d799bd702aed08c9e38e6ac77082be162b23.
The existing mechanism must be extended; copying the digest is not proof.

The new disposable-repository test file ran against the unchanged runtime:
10 tests, 2 passes, 8 failures. Missing-declaration correction passes without
a revert. Retention cases fail because --keep is unsupported. The old
restoration and ordinary-answer guards must remain intact. Corrected-case
verification is outstanding as a separate implementation action.


## Implementation verification

The initial implementation passed the full suite: 345 tests, zero failures.
The expanded targeted run passed 50 tests covering restoration, retention,
and candidate stability, including 13 retention cases. A retained file
changed before or during execution, even with skip-worktree hiding it from
Git status, cannot produce a receipt. Unknown scope modes are rejected even
when the recorded digest matches; existing restoration snapshots retain
their original meaning. The evidence and review test starts at Done, keeps
correct work, proves both old artifacts become insufficient, then reaches
Done only after a fresh check and review.

The first candidate comparison used hashes from two different identity
formats and rejected clean retained files. Tests caught this; the comparison
now uses the existing committed Git identity consistently. Kept paths join
the candidate's stability validation only, not the declared footprint.

Ripwire edit-check reports no incompatible callers for scopeApprovals.
Quality-delta initially found added complexity in assess; extracting the
retention reasons removed that regression. Its remaining major findings
are change-frequency warnings; wakeVerdict has one additional simple guard.
The static test-gate does not model the subprocess CLI tests and reports
uncovered documentation sections. Neither static command is claimed clean.
The actual executable regression suites passed. Committed evidence and a
final review remain required.


## Review of the committed repair

The committed node-test output records 348 tests, 348 passes, and zero
failures. The package and specification receipts also pass. Examined the
committed runtime and documentation diff against LOOP-035 and LOOP-083
through LOOP-085, including the new declarations and decision record.

Attacked the approval boundary: a kept snapshot is explicitly distinguished
from legacy restoration and unknown modes fail validation. Only committed,
closed ok records with matching snapshot digests and commitment activations
apply. Tree comparisons include additions, deletions, modes, symlinks, and
literal path names. Later own commits remain breaches even after reverting
to the approved tree, and imported changes cannot silently replace retained
content. Ordinary answers, uncommitted answers, and ask/explanation turns
keep their existing behavior. The developer still owns the scope judgment;
the record does not authenticate an identity or assess correctness.

Attacked freshness and execution: the receipt's commit must contain the
applicable retention record; review has the same additional condition.
The result remains failed when its mechanism fails. Retained paths enter
candidate validation but not the declared footprint, so approval cannot
silently authorize future edits. Dirty retained files, including files
hidden by skip-worktree, prevent evidence before or during execution.

Two deliberate mutations ran in a disposable copy containing the runtime
and its spec module. Removing the later-commit guard caused the revert test
to fail because scope was wrongly cleared. Removing retention freshness
caused the old-evidence test to fail because wake skipped the required run.
The unchanged copy passed both tests. An initial incomplete copy omitted
the runtime's spec module; those setup failures were discarded and do not
count as failure demonstrations. No repository source changed during review.

The sole review finding is an extra indentation level on the parser option
line. It will be corrected separately and verified before completion.
The production-rule self-audit otherwise finds the repair bounded, readable,
backward compatible, and supported by failing and corrected examples.
Static churn warnings remain documented rather than misrepresented as clean.
Native macOS and Windows have not been run. Production has not been updated.


## Final review after the formatting correction

Reviewed the final source diff: only the parser option indentation changed.
Both help tests passed. Fresh committed node-test output again records
348 tests, 348 passes, and zero failures; fresh package evidence passes.
Specification evidence remains current. The earlier runtime review and
mutation demonstrations still apply to the unchanged behavior.

All findings are resolved. The final self-audit is satisfied for this
Cairn development repair: scoped implementation, durable decisions and
evidence, exact approval bounds, preserved failure behavior, meaningful
verification, updated user instructions, and honest static-tool limits.
No source changed during this review. Production remains unchanged.
