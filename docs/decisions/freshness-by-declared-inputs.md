# Freshness by declared inputs, not computed closures

Level: Consequential
Decided by: agent
Rests on: LOOP-006, LOOP-023, LOOP-024; a global commit identifier
invalidates evidence even when its inputs are unchanged
Would be wrong if: agents routinely under-declare inputs, so that
evidence stays current across changes that should have invalidated it

## Decision

The agent declares the paths each mechanism reads. Evidence records a
digest of those inputs and of the mechanism. Evidence is stale when the
digest changes, and only then.

Freshness by global commit invalidates every record after an unrelated
change. Declared inputs restrict invalidation to the files a mechanism
reads. Computing those inputs would require dependency analysis and
adapters; a declaration needs only a list of paths.

The risk named above is real and it is the cheaper risk: an
under-declared input is a mistake the agent can find and fix, while a
computed closure is a subsystem.

## Realized by

- ad05249  Independent review (Astra): seven findings, all accepted
