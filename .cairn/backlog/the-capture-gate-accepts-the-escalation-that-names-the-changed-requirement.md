# The capture gate accepts the escalation that names the changed requirement

Surfaced from: LOOP-092
Promoted to: the-capture-gate-reads-the-concerns-line
Captured: 2026-09-15T14:29:30.355Z

The audit's B10, its capture half: when a promoted commitment moves its item to next-iteration under LOOP-090 and raises the one escalation LOOP-114 asks for, captureVerdict still fires for the moved file unless the escalation's text happens to contain the file's path. The gate should also accept an escalation whose Concerns line names the requirement the item's Changes: line names, so the LOOP-090 route needs exactly one escalation.
