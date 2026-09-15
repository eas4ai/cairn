# The kernel digest covers the two files that decide and write

Level: Judged
Decided by: agent
Rests on: LOOP-023, LOOP-095, PKG-004
Would be wrong if: a file outside bin/cairn.mjs and bin/spec.mjs changes a verdict or a record's content, in which case it joins the digest
History: LOOP carries no reversal in the freshness domain. Judged: one definition, cheap to widen, inside the commitment.

## Decision

The kernel digest written into every evidence record is the SHA-256 of bin/cairn.mjs and bin/spec.mjs, joined by one newline, computed when the kernel starts. Those two files decide verdicts and write records. bin/hook.mjs is excluded: it runs the kernel and writes no record, so a change to it cannot make a record wrong. A record with no kernel digest, which is every record written before this rule, or with another kernel's digest, is stale with the reason "the kernel changed" (LOOP-095).

## Realized by

(none yet: recorded, not built)
