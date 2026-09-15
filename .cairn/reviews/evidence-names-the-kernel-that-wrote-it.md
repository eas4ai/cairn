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
