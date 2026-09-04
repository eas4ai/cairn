# Store facts, derive status

Level: Consequential
Decided by: agent
Rests on: LOOP-028, LOOP-001
Would be wrong if: deriving a status on every wake proves too slow or
too ambiguous to be practical, which would argue for one cached status
with a single writer rather than for stored status in general

## Decision

No artifact records a status that other facts on disk determine. A
requirement is met when its mechanisms have current passing evidence. A
commitment is complete when every requirement in it is met and no
decision for it is unrealized. An escalation is open when its file has no
answer. A decision is unrealized when it names no commit.

The independent review named the failure: stored status fields become
competing truths. The first commitment already had one. Its file said
Status: current while the roadmap said Current: the-record-and-the-wake.
Two files, one fact, and nothing keeping them equal. The Status line is
gone; the roadmap's Current: line is the single designation, and it is a
designation rather than a status because nothing else on disk determines
it.

## Realized by

- 69ee718  Second independent review, reconciled against current
