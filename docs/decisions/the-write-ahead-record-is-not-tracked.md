# The write-ahead record is not tracked

Level: Consequential
Decided by: agent
Rests on: PKG-002, LOOP-021, LOOP-027
Would be wrong if: two agents share one working tree, or a handoff between machines needs the receiving agent to inherit an unfinished action, in which case the record must be tracked and PKG-002 read the other way
History: the PKG reversal was a deferral framing; this record defers nothing, and is Consequential rather than Judged because it settles what a cemented requirement covers

## Decision

An over-broad git add committed .cairn/in-progress during the sweep. Removing the file then crashed the package lint, which read every tracked path and found one that no longer existed. Two defects, one root: the record was never meant to be in the repository.

PKG-002 says Cairn stores its state as files in the repository, and that a fresh clone must contain everything except what a mechanism can rebuild. The write-ahead record is neither. It is not state and it cannot be rebuilt: it is a claim that this working tree has an unfinished action. A fresh clone has no unfinished action, so a clone that inherits one is blocked by a stranger's interruption with nothing on disk explaining why.

So the record is gitignored, PKG-002's mechanism allows exactly it and evidence, and the lint now reports a tracked in-progress record as a finding. The lint also tolerates a tracked path missing from the working tree, because a deletion before its commit is ordinary work and a mechanism that crashes reports nothing.

Reversing this is one line in .gitignore.

## Realized by

(none yet: recorded, not built)
