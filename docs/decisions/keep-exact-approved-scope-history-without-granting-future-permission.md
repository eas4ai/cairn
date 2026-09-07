# Keep exact approved scope history without granting future permission

Level: Judged
Decided by: agent
Rests on: LOOP-035 LOOP-083 LOOP-084 LOOP-085
Would be wrong if: Approval hides later work, changes restoration semantics, or allows old evidence or review to complete retained work.
History: The restored-history repair handled accidental work only. The developer identified correct work in the wrong window as the missing case. Earlier reversals around completion reinforce preserving evidence and review; this additive repair is Judged within the explicitly authorized commitment.

## Decision

Extend cairn escalate --scope with --keep. Store an explicit keep mode in the existing Scope snapshot and bind ok to its digest. Compare retained paths with the recorded through commit while restored snapshots still compare with activation. Keep later own commits and other activations blocked. Treat approved scope records as additional freshness conditions for evidence and review, without broadening mechanism inputs. An exact retention approval is the correction of scope for that historical incident; missing declarations remain the remedy for dependencies within the agreement.

## Realized by

(none yet: recorded, not built)
