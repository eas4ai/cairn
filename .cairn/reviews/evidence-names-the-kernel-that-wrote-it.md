commitment: evidence-names-the-kernel-that-wrote-it
commit: f0d149292baf6960c4570a308ebcd0fcc3aa98ad
examined:
  - The build at f0d1492: KERNEL_DIGEST, recordEvidence, the stale reason in assess, tests/evidence-integrity.test.mjs, the working agreement sentence and its proxy, the README and manual passages, and this repository's own re-run under the new kernel.
  - node-test against the revised LOOP-023: the tests that name it, recordEvidence in bin/cairn.mjs, and a fresh fixture record's digest fields.
findings:
  - resolved: LOOP-023's kernel clause had no test and no writer; every record now carries kernel_digest, a record from another kernel or from none is stale with the kernel named, and the three tests ran red on the old kernel and green on this one.

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

## Commitment review at f0d1492, 2026-09-14

Every requirement has current passing evidence: the revised LOOP-023 and
LOOP-024, LOOP-095, LOOP-096, and the inherited package set. The suite
is 383 passing, both lints clean, the kernel at 1374 of 1500 lines.

Failure demonstration: with the three evidence tests written and the
kernel unchanged, tests/evidence-integrity.test.mjs ran 9 passing and 3
failing; on the new kernel all pass. A record from another kernel and a
record with the field removed each make wake name run R-001 with the
reason the kernel changed, and a new check restores Done.

Observed on this repository, no code changed during this review. After
the kernel change, wake named every mechanism stale in turn, node-test
with "the mechanism changed and the kernel changed and a declared input
changed", pkg-lint with "the kernel changed and a declared input
changed", and spec-lint with "the kernel changed" alone; each re-ran
once and every requirement passed. A fresh record:

    20260915T011707752Z: kernel_digest sha256:f0c3866c2d08...

Attacked: the digest's scope, which the Judged record fixes at the two
files that decide and write, so a hook edit does not stale evidence;
the history chain, which the LOOP-065 tests already show tolerates a
field edited in the latest record until a new record supersedes it;
reviews, which stay unstamped by design and whose freshness follows the
declared inputs; the working agreement sentence, read by the skills
suite and byte-identical in the template. Limit recorded: a consumer
that vendors the kernel gets a digest that names its copy, which the
item wanted, but nothing yet prints the running digest for a human; a
future need can add it to help output.

Self-audit against the production rules: one constant, one field, one
comparison, one sentence, and the documentation the commitment lists,
with every check reported here run and passed. No open finding.
