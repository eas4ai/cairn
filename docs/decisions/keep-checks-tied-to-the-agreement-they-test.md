# Keep checks tied to the agreement they test

Level: Judged
Decided by: agent
Rests on: LOOP-058 LOOP-059 LOOP-060 SPEC-020 SPEC-021 SPEC-022 SPEC-023 PKG-016
Would be wrong if: A requirement revision can reuse an unchecked mechanism, or the workflow requires a second evidence system.
History: Existing reversals show that added bookkeeping can obscure the work. This decision uses existing declarations and review files and stays Judged within the developer-approved scope.

## Decision

Bind each receipt to the requirement and falsifier paragraphs. Recover the same identity from the recorded commit for old receipts, and refuse to infer it if unavailable. A changed identity makes wake request mechanism review; check requires an exact ID and digest in the existing mechanism declaration reviewed list before writing revised evidence. Record the reasoning in the existing commitment review. Compare the commitment requirements at the review commit too. Keep input hashing unchanged and remove Git output limits, refusing failed blob reads. Extend the project spec lint for unique IDs and local-prefix references; keep examples excluded. Add short skill guidance and one worked human guide. No new command or directory is required.

## Realized by

- bd4d0db Keep evidence tied to requirements and declare individual reporting
