# A result line carries the requirement's own order

Level: Judged
Decided by: agent
Rests on: LOOP-097, LOOP-070
Would be wrong if: a result line cannot carry a field the order rules need, or a token with whitespace breaks the split
History: No reversal concerns the receipt format. Judged: one line grammar, cheap to widen, inside the commitment.

## Decision

Each results: entry is one line of six whitespace-separated tokens: the requirement identifier, the result (pass, fail, or unverified), the source (line, exit, or none), the requirement digest, the requirement's sequence, and the digest of that requirement's prior receipts. The sequence and history digest are per requirement, so LOOP-070 holds per requirement exactly as it did with one receipt per requirement. None of the six tokens can contain whitespace.

## Realized by

(none yet: recorded, not built)
