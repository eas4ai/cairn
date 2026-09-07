commitment: correct-work-can-be-kept-after-a-scope-breach
commit: 811b13a
examined:
  - LOOP-035, LOOP-083, scope-recovery tests, and the scope snapshot, declaration, and acknowledgment readers.
findings:
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
