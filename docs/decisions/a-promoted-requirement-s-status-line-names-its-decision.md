# A promoted requirement's Status line names its decision

Level: Consequential
Decided by: agent
Rests on: LOOP-088, SPEC-002, LOOP-029
Would be wrong if: the marker is written with no decision record behind it and wake or the spec lint accept it, or the developer cannot list every agent-agreed requirement with one search
History: No reversal is recorded in the agreement domain. Consequential because it changes how an Agreed Status line is read in every consumer, and because a wrong reading would let an unrecorded promotion pass as the developer's confirmation.

## Decision

A requirement the agent promotes from the backlog is Agreed by the promotion decision, not by the developer. The Status line says so: Status: Agreed <date> by promotion <decision slug>. The kernel refuses a commitment naming a requirement whose marker resolves to no record under docs/decisions/, and refuses a commitment whose Promoted from: item no decision record names (LOOP-088). The spec lint reports an unresolved marker. Grepping for by promotion lists every requirement the developer never read, which is the audit the developer asked for. A requirement marked Agreed without the marker still claims the developer's confirmation; no mechanism observes that claim, as before.

## Realized by

(none yet: recorded, not built)
