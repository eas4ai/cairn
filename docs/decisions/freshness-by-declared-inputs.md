# Freshness by declared inputs, not computed closures

Level: Consequential
Decided by: agent
Rests on: LOOP-006, LOOP-023, LOOP-024; the measured Same Page outcome
of 177 of 178 obligations stale after one commit
Would be wrong if: agents routinely under-declare inputs, so that
evidence stays current across changes that should have invalidated it

## Decision

The agent declares the paths each mechanism reads. Evidence records a
digest of those inputs and of the mechanism. Evidence is stale when the
digest changes, and only then.

Freshness by global commit reproduces the Same Page failure exactly.
The independent review proposed the smallest fix: declared inputs. It
offered "declares or computes." This record takes declares only.
Computing inputs is where Same Page's adapter registry, closures, and
narrowing acts came from, and that apparatus is the thing being left
behind. A declaration is a list of paths; computing is an engine.

The risk named above is real and it is the cheaper risk: an
under-declared input is a mistake the agent can find and fix, while a
computed closure is a subsystem.

## Realized by

- ad05249  Independent review (Astra): seven findings, all accepted
