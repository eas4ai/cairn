# Run receipts live under the runs directory beside their output

Level: Consequential
Decided by: agent
Rests on: PKG-003, LOOP-097, LOOP-098, LOOP-041, LOOP-075
Would be wrong if: a consumer's tooling reads .cairn/evidence/<REQ>/ directly for new evidence, or a run receipt's supporting files land elsewhere than beside it
History: LOOP and PKG carry reversals recorded elsewhere; none concern evidence layout. Consequential because every consumer's evidence gains the directory and every reader of receipts changes; it adds no command and no new record kind beyond the run receipt the specification names.

## Decision

A check writes one receipt per mechanism run under .cairn/evidence/runs/, named by the receipt filename format, with its output, standard error, and inputs detail files beside it under the same stem. The receipt carries the run's facts once and a results: list with one line per requirement the mechanism speaks for. A receipt written per requirement before this rule stays under .cairn/evidence/<REQ>/ unchanged and remains part of that requirement's history (LOOP-025); history() reads both and sorts by the requirement's sequence (LOOP-098). Nothing migrates. A kernel from before this rule cannot see run receipts, so the upgrade happens at Done (LOOP-096).

## Realized by

- 3c96bcf1d0d07b0cbde4562a1b3891732949ad6b One receipt per run
