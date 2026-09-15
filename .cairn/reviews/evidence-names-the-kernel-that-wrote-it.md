commitment: evidence-names-the-kernel-that-wrote-it
commit: b83db9d6da88af56dc8bc0944b6c07f33fcc698f
examined:
  - node-test against the revised LOOP-023: the tests that name it, recordEvidence in bin/cairn.mjs, and a fresh fixture record's digest fields.
findings:
  - open: LOOP-023's kernel clause has no test and no writer; a fresh evidence record carries inputs_digest and mechanism_digest and no kernel digest, and the suite passes.

## LOOP-023 mechanism review, 2026-09-14

Revised text adds the kernel to the digests evidence records. Falsifier:
evidence with no digest, or a digest that omits the mechanism or the
kernel.

node-test speaks for LOOP-023 through tests that read a record's
inputs_digest and mechanism_digest fields. Safe violating example, a
fresh fixture record written by the current kernel:

    fields: requirement_digest, history_digest, inputs_digest, mechanism_digest, output_digest, stderr_digest
    kernel_digest present: false

The record omits the kernel, which is the falsifier state, and the
suite passes in it. Mismatch recorded as the open finding; the writer,
the stale reason, and the tests follow under this commitment. No code
changed during this review.

## LOOP-024 mechanism review, 2026-09-14

Revised text adds the kernel that wrote the record to the freshness
requirements the unrelated-change rule must not suppress. Falsifier: a
file change makes evidence stale while the requirement, falsifier,
mechanism, inputs, receipt history, output, kernel, and retention are
unchanged.

node-test speaks for LOOP-024 through the linked-input test in
tests/check.test.mjs and the historical-selection tests in
tests/recovery.test.mjs, which hold the first arm: an unrelated change
does not stale evidence, and a link or a wildcard digests the same in
both views. Those arms are unchanged by the revision and their tests
stand. The kernel arm has no test and no comparison in assess. Safe
violating example, a green fixture whose records name no kernel:

    records name no kernel; wake: Done: first (exit 0)

A record written under any kernel, or under none, is current, which is
the falsifier state for LOOP-095 and the omission LOOP-024 now names.
Covered by the open finding above; the comparison and its tests follow
under this commitment. No code changed during this review.
