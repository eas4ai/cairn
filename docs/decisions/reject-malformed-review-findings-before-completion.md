# Reject malformed review findings before completion

Level: Judged
Decided by: agent
Rests on: LOOP-020 LOOP-033 LOOP-071 LOOP-086
Would be wrong if: Unknown findings disappear, valid open findings stop blocking, or empty and resolved findings prevent completion.
History: Earlier completion repairs preserve fail-closed evidence and review gates. This bounded validation repair remains Judged within the developer-requested scope; no free-form Status field becomes a new completion protocol.

## Decision

Validate the parsed findings collection in reviewOf. Permit an empty list and nonempty open: or resolved: entries. Return a repair verdict naming the review and invalid entry before completion freshness can declare it clean. Preserve the existing metadata-section parser and ordinary open-finding resolution behavior.

## Realized by

(none yet: recorded, not built)
