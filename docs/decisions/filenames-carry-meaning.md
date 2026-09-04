# Filenames carry meaning, not sequence

Level: Judged
Decided by: agent
Rests on: the developer's ruling that iterations/00x was problematic
Would be wrong if: a reader needs the file listing itself to tell them
what order to read the specs in

## Decision

Spec files are named for what they contain. No numeric prefixes. Order
lives in roadmap.md and in the keystone's spec map.

The developer identified that "iteration" named two different things and
that a number tells a reader nothing until they open the file. The same
argument applies to `00-overview.md` and `NN-domain.md`, so the rule is
applied everywhere rather than only where it was noticed.

Requirement identifiers keep their numbers. An identifier is a stable
reference, not a name a reader navigates by.

## Realized by

- 6093095  Draft specification: four domains, 48 requirements with falsifiers
