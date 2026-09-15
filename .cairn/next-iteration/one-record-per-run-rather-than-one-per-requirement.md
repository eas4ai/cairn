# One record per run rather than one per requirement

Surfaced from: LOOP-041
Changes: LOOP-041
Promoted to: one-receipt-per-run (2026-09-14, on the developer's ok to escalation loop-091-3 and confirmation by exception)
Moved: 2026-09-14 from the backlog under the-loop-continues-past-done; it changes the evidence record format
Captured: 2026-09-11T22:35:08.220Z

Every check writes one evidence record per requirement the mechanism speaks for, so a check on this repository writes 146 files and two days of the loop wrote 4,502. Packed size is under 3 MB and wake reads it in a third of a second, so this is a git log and review cost, not a performance one. The shape to move to if it ever matters: one record per run naming the mechanism, the receipt, and the output file once, with the per-requirement results as lines inside it; history() would read runs and select the requirement's line. A record format change, so it needs its own decision; it does not reverse retain-command-output-and-evidence-history, which is about keeping history at all.
