commitment: one-receipt-per-run
commit: 098c34d3e2e1e68dbab2d00b0a72eb2eca0c22a4
examined:
  - The build at 098c34d: runReceipts and its cache, history, recordEvidence, the run directory in runMechanism, tests/helpers.mjs records and entry, every test that reads or edits receipts, the manual, and this repository's first run receipts.
findings:
  - resolved: The loop had no answer form by which the developer declines every remaining next-iteration item, so wake would escalate forever once the last item is refused; captured to next-iteration under LOOP-091 during this review, outside this commitment.

## Commitment review at 098c34d, 2026-09-14

Every requirement has current passing evidence: LOOP-097, LOOP-098,
LOOP-040, LOOP-041, LOOP-070, LOOP-075, and the inherited package set.
The suite is 382 passing, both lints clean, the kernel at 1406 of 1500
lines.

Failure demonstration, the cost the commitment names. At the commit
before this change, the three checks on this repository committed 145,
12, and 11 files: one receipt per requirement plus the run's three
files. After it, each check committed 4 files: the run receipt, its
output, its standard error, and its inputs detail. The runs directory
now holds 3 run receipts, the first on this repository.

Reading across both shapes: tests/execution-order.test.mjs rewrites a
run receipt into legacy per-requirement receipts by hand and shows
wake naming one ordered check with the legacy files unchanged; a fail
in a legacy receipt followed by a run keeps its order; an edited or
removed run receipt stales both requirements it names under the
existing chain rule; a malformed result line, a wrong token count, a
supporting file, and a receipt-shaped directory under runs/ are named
as repairs or ignored as LOOP-075 requires. tests/check.test.mjs shows
one receipt under runs/ shared by two requirements, and
tests/output.test.mjs shows one output file per run with both
requirements pointing at it.

Attacked: the read cache, which is per process and cleared after each
write, so a check running several mechanisms sees its own earlier
receipts; an unreadable run receipt, which enters every requirement's
history as one repair naming the file, so one fix clears all; the
receipt name, which shares the run's stem and would collide only when
one process wrote two runs in one millisecond; the test helper, which
is a second reader of the format and could drift from the kernel's,
recorded as a limit; the freshness explanation, which reads the same
inputs_detail field from the run receipt; and the old kernel, which
cannot see run receipts, which is why the upgrade happens at Done
(LOOP-096).

Self-audit against the production rules: one reader, one writer, one
directory, the helper, and the tests the commitment lists; every check
reported here ran and passed; the one finding is outside this
commitment and captured, not deferred. No open finding.
