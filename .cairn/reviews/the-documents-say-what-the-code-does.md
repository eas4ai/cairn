commitment: the-documents-say-what-the-code-does
commit: 078c8b2
examined:
  - mechanism review, LOOP-088 revised to Consequential: the continuation tests record promotions at Judged (the LOOP-115 test and the decided helper), and neither decide --promotes nor the LOOP-088 check reads the level. Mismatch, recorded as the open finding below and fixed as this commitment's own work.
  - mechanism review, LOOP-105 split: tests/robustness.test.mjs observes the three faults and that each refusal names its fault. No mismatch.
  - mechanism review, LOOP-108 split: tests/robustness.test.mjs and tests/records.test.mjs observe the three fields and that the repair names the missing one. No mismatch.
  - mechanism review, PKG-022 split: tests/hooks.test.mjs observes exit 0 and one stderr line for a bad input, a file at the link's directory, a link that cannot be created, a missing git, and a kernel with no verdict. No mismatch.
  - mechanism review, LOOP-118 reworded: tests/robustness.test.mjs runs reversals among the refused commands, which only reads. No mismatch.
  - mechanism review, PKG-028 falsifier: tests/lint-command.test.mjs observes the command running through a link and exit 3 with one line when it cannot run. No mismatch.
  - mechanism review, SPEC-029 falsifier: tests/spec-lint.test.mjs observes drive paths and file URLs in raw lines. No mismatch.
  - mechanism review, LOOP-026 falsifier: tests/escalate.test.mjs observes the block order without --level Blocking, and the LOOP-013 test observes delivery with it. No mismatch.
findings:
  - open: promotions are recorded at Judged by decide --promotes and accepted at any level by the LOOP-088 check, while LOOP-088 now requires Consequential so the record reaches the review queue.

## Mechanism reviews at 078c8b2, 2026-09-15

Recorded before any code change in this commitment.
