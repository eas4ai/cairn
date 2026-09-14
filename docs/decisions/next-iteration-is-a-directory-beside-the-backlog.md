# Next-iteration is a directory beside the backlog

Level: Consequential
Decided by: agent
Rests on: PKG-003, LOOP-029, LOOP-091, LOOP-093
Would be wrong if: a consumer's agent cannot tell which bucket an idea belongs to from the sort test, or next-iteration fills with in-scope work the agent could not finish despite LOOP-092
History: PKG carries a reversal from a deferral framing. This record adds a directory whose purpose is the opposite of deferral: a specification-changing idea is absent until the developer brings it in, and LOOP-092 forbids parking committed work there. Consequential for the directory every consumer gains; the reversal history raises it no further because the record names the failure that forced it.

## Decision

The backlog held two kinds of idea beside each other: bounded ones the loop may promote on its own, and ones that would change an Agreed requirement, its falsifier, or the working agreement, which only the developer may bring in. Nothing on disk said which was which, so an agent either stopped for every item or promoted a contract change as if it were bounded. Two directories make the sort a fact the wake can read: .cairn/backlog/ for ideas inside the specification, promoted at Done by a recorded decision (LOOP-087, LOOP-088); .cairn/next-iteration/ for ideas that change the contract, each naming what it would change on a Changes: line (LOOP-093), asked for once with a recommendation when the backlog is empty (LOOP-091). The developer moves a file to correct the sort. Neither directory is deferral: work the commitment includes is finished or escalated (LOOP-092, PKG-013).

## Realized by

(none yet: recorded, not built)
