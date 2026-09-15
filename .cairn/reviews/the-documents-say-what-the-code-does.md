commitment: the-documents-say-what-the-code-does
commit: 42a91f3
examined:
  - mechanism review, LOOP-088 revised to Consequential: the continuation tests record promotions at Judged (the LOOP-115 test and the decided helper), and neither decide --promotes nor the LOOP-088 check reads the level. Mismatch, recorded as the open finding below and fixed as this commitment's own work.
  - mechanism review, LOOP-105 split: tests/robustness.test.mjs observes the three faults and that each refusal names its fault. No mismatch.
  - mechanism review, LOOP-108 split: tests/robustness.test.mjs and tests/records.test.mjs observe the three fields and that the repair names the missing one. No mismatch.
  - mechanism review, PKG-022 split: tests/hooks.test.mjs observes exit 0 and one stderr line for a bad input, a file at the link's directory, a link that cannot be created, a missing git, and a kernel with no verdict. No mismatch.
  - mechanism review, LOOP-118 reworded: tests/robustness.test.mjs runs reversals among the refused commands, which only reads. No mismatch.
  - mechanism review, PKG-028 falsifier: tests/lint-command.test.mjs observes the command running through a link and exit 3 with one line when it cannot run. No mismatch.
  - mechanism review, SPEC-029 falsifier: tests/spec-lint.test.mjs observes drive paths and file URLs in raw lines. No mismatch.
  - mechanism review, LOOP-026 falsifier: tests/escalate.test.mjs observes the block order without --level Blocking, and the LOOP-013 test observes delivery with it. No mismatch.
  - the 25 stamps change no requirement digest, since the digest excludes the Status line; no evidence went stale from them, and the spec lint resolves each marker to the first remediation's decision record.
  - the working agreement and its template are byte-identical after four edits, and every phrase the skills tests pin is still present; the LOOP-101 test still finds a move for every kernel verb.
  - the two Judged promotion records of 2026-09-15 stay as history; their commitments are Done and not current, so the LOOP-088 check never reads them.
  - the human documents were changed where the audit cited a line, and nowhere else; the first audit's two counts now match the repository.
findings:
  - resolved: decide --promotes refuses a level other than Consequential, the LOOP-088 check names a promotion recorded at another level as the repair, and the fixtures record promotions at Consequential with their queue entry (ed6531b); two tests are red on the old kernel.

## Mechanism reviews at 078c8b2, 2026-09-15

Recorded before any code change in this commitment.

## Commitment review at 42a91f3, 2026-09-15

LOOP-088, LOOP-105, LOOP-108, PKG-022, LOOP-118, PKG-028, SPEC-029,
LOOP-026 and the rest have current passing evidence; 452 tests pass,
both lints clean, the kernel at 1509 of 1600 lines. Attacked as
listed under examined. No open finding.
