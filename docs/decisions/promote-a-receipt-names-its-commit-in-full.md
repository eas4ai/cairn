# Promote a receipt names its commit in full

Level: Consequential
Decided by: agent
Promotes: receipts-record-an-abbreviated-commit-id
Rests on: LOOP-136 LOOP-024 LOOP-023 LOOP-087 LOOP-088
Would be wrong if: a downstream tool parses the receipt's commit field expecting seven characters; then a full identifier breaks its display, though every Git command accepts both
History: Five reversals in the decision domain; none about receipt fields. Consequential: it changes what every receipt carries, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/receipts-record-an-abbreviated-commit-id.md, captured 2026-09-17 from the kernel review's finding 6. Drafted requirement, LOOP-136: an evidence receipt records the full identifier of the commit it was written against, and every reader accepts the abbreviated identifier an older receipt carries. Falsifier: a receipt written by check carries fewer than forty hex characters in its commit field; or a reader refuses an older receipt whose abbreviated identifier still resolves. Mechanism: node-test through the evidence tests. Chosen sixth because the defect ripens with age: an abbreviated identifier is unique only on the day it is written, and the wake's questions about old receipts, the requirement text then and the retention then, all pass it to git.

## Realized by

(none yet: recorded, not built)
