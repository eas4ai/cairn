# The working agreement is one file the agent reads at wake

Level: Judged
Decided by: developer
Rests on: LOOP-036, DEC-014, LOOP-002, PKG-006
Would be wrong if: a harness cannot be pointed at a root-level instructions file by name or by a one-line include, so the agent's moves must live somewhere else; or the developer's review of a queued decision needs more than a commit's authorship to be trusted
History: LOOP's and DEC's reversals were a plan and a rule the code drifted from; this record names a file both skills write and one test compares byte for byte with the shipped template, so the drift it risks is caught by a mechanism, and it stays Judged

## Decision

Both skills ended with "the loop takes over," and nothing an agent read in a consumer repository said what to do with a verdict, so it stopped after its first action. The developer promoted the backlog item and folded in the review queue's undocumented exit, because the developer's moves belong in the same file as the agent's.

The working agreement is AGENTS.md at the repository root: the cross-vendor name for the file an agent reads first, so no vendor is named (PKG-006). A harness that reads a differently named file gets a one-line file of that name that includes it. The template ships beside /new-project and is copied verbatim, and Cairn's own AGENTS.md is that template byte for byte, so the loop that builds Cairn runs by the file Cairn ships.

The developer reviews a queued decision by reading its record and removing the queue entry in a commit. The commit's author and date are the mark. This stores no status (LOOP-028) and adds no command (PKG-003); the alternative, a reviewed command, would have needed its own record and a failure this convention does not answer.

## Realized by

(none yet: recorded, not built)
