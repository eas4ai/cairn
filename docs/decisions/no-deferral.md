# No deferral

Level: Consequential
Decided by: developer
Rests on: PKG-013
Would be wrong if: a genuinely staged rollout of one feature across
commitments reads as deferral under the falsifier, in which case the
falsifier needs to distinguish sequencing from postponement

## Decision

Nothing in the specification is deferred, optional, or version-gated.
The specification is the scope. A concept is in it and built, or absent
until a named failure brings it in through PKG-003.

The developer's ruling, in the developer's words: version-one designs
are tech debt and half-finished work. The second independent review
proposed a minimum first release with a list of omissions, and one
decision record absorbed that framing. This record makes the rule
checkable so a reviewer's framing cannot do that again.

Sequencing is not deferral. The roadmap orders commitments; every one of
them is built.

## Realized by

- 2c5cf9e  No deferral: PKG-013, and the first supersession
