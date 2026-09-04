# Realized-by stays empty rather than gaining a recorded-by field

Level: Judged
Decided by: agent
Rests on: DEC-007, and PKG-003's rule that a concept must name the
failure that forced it
Would be wrong if: readers need to find the commit that recorded a
decision more often than git log can answer it

## Decision

A decision that has been recorded but not built carries an empty
realized-by list. No second field.

The independent review found three records pointing at the
specification commit as their realization. That commit recorded them;
nothing built them. Pointing at it made the empty-list-means-unbuilt
reading in DEC-007 unreliable from the first day.

The review offered two repairs: leave the list empty, or add a
recorded-by field. The field is a concept, and the failure it would
answer is already answered by git: the commit that added the record
file is the commit that recorded it. The list is emptied instead.

## Realized by

- ad05249  Independent review (Astra): seven findings, all accepted
