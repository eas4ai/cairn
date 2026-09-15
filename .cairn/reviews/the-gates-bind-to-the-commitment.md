commitment: the-gates-bind-to-the-commitment
commit: 783f1f2
examined:
  - mechanism review, LOOP-090 revised: tests/continuation.test.mjs "the LOOP-090 gate reads the Concerns line" (LOOP-114) and "an escalation raised before the promoted commitment began does not silence the LOOP-090 gate" observe the revised falsifier: the violating example is an escalation naming R-001 raised under an earlier commitment, and the corrected case is one raised inside; both ran red on the old kernel at c356a46 and green after. No mismatch.
  - mechanism review, LOOP-092 revised: tests/continuation.test.mjs "a capture from one of the commitment's own requirements needs Outside because", "the LOOP-090 route needs one escalation" (LOOP-119) and "an escalation raised before the commitment began does not silence the capture gate" observe the revised falsifier for the file-naming and the Concerns-naming escalation, inside and before the commitment. No mismatch.
  - LOOP-120: the activation's parent read from the log's %P, so a merge activation uses its first parent; a root activation keeps the old start; captures and escalations in the activation commit now count as the commitment's own.
  - LOOP-121: the Agreed set at activation is compared by identifier, so a demoted or deleted requirement is named even when its spec file moved; a demoted requirement the commitment itself lists is caught earlier by LOOP-029, which also stops the loop.
  - LOOP-122: include files are found by blob id for LF, CRLF and no-newline content under sha1 and sha256; a BOM, trailing text, or a symlink is not an include file and is then an ordinary path; a tab in a root filename would truncate the parsed name, which no repository here has.
  - LOOP-123: two promotion records for one item pass when either stands; a reversal record carries no Promotes line, so it cannot satisfy the check by itself.
  - the restore route of a scope escalation: changedScope compares the snapshot's activation commit with HEAD, so a path the activation commit itself added reads as restored while it is still in the tree; with LOOP-120 the footprint now sees that path, and the restore check must compare against the tree before activation.
findings:
  - resolved: a breaching path added by the activation commit passed the restore check of a scope escalation unchanged; changedScope now diffs from the activation commit's parent (ac1bad8), the refusal says "the tree before activation commit", and a test in tests/continuation.test.mjs raises the scope escalation with the stray path present (refused) and after its removal (accepted), red on the old kernel. The working agreement's sentence "restore the breaching paths to the commitment activation tree" is corrected under commitment 5 (D-list).

## Mechanism reviews at 46deeeb, 2026-09-15

Recorded before any code change in this commitment. The two
falsifiers now say what the kernel checked since c356a46; the tests
named above are the observation, and each was red before that commit.

## Commitment review at dfd021a, 2026-09-15

LOOP-120 through LOOP-123 and the revised LOOP-090 and LOOP-092 have
current passing evidence; 430 tests pass, both lints clean, the
kernel at 1489 of 1500 lines. Each new test was run against the
kernel before the change and failed there.

Attacked as listed under examined. One finding: the scope
escalation's restore check still measures from the activation commit,
which LOOP-120 moved inside the footprint. Recorded as open, to be
resolved as its own work.

## Review at 790f738, 2026-09-15

Resolved as its own work; 431 tests pass, both lints clean, the
kernel at 1491 of 1500 lines. No open finding.

Refreshed at 783f1f2: the plan table and this record changed; no code changed.
