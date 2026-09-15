commitment: the-gates-bind-to-the-commitment
commit: 46deeeb
examined:
  - mechanism review, LOOP-090 revised: tests/continuation.test.mjs "the LOOP-090 gate reads the Concerns line" (LOOP-114) and "an escalation raised before the promoted commitment began does not silence the LOOP-090 gate" observe the revised falsifier: the violating example is an escalation naming R-001 raised under an earlier commitment, and the corrected case is one raised inside; both ran red on the old kernel at c356a46 and green after. No mismatch.
  - mechanism review, LOOP-092 revised: tests/continuation.test.mjs "a capture from one of the commitment's own requirements needs Outside because", "the LOOP-090 route needs one escalation" (LOOP-119) and "an escalation raised before the commitment began does not silence the capture gate" observe the revised falsifier for the file-naming and the Concerns-naming escalation, inside and before the commitment. No mismatch.
findings: []

## Mechanism reviews at 46deeeb, 2026-09-15

Recorded before any code change in this commitment. The two
falsifiers now say what the kernel checked since c356a46; the tests
named above are the observation, and each was red before that commit.
