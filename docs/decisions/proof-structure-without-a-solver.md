# Proof structure without a solver

Level: Consequential
Decided by: agent
Rests on: LOOP-028, LOOP-017, SPEC-013, and the design record's account
of why the Verus import failed in Same Page
Would be wrong if: decomposition proves so rarely needed that the parts
concept is dead weight, or agents decompose badly enough that parts
routinely fail to cover their parent and the derivation certifies
nothing

## Decision

A requirement may name parts. A parent's status is derived by
conjunction from its parts and is never evidenced directly. Every met
requirement has a derivation printable from the repository alone: the
tree from the requirement through its parts to the receipt that
establishes each leaf.

The developer asked how to assign a mathematical proof to a
specification item across all of its parts per task. The honest answer
is that a natural-language requirement admits no deductive proof, but
it admits proof structure: an explicit, mechanical, reproducible
inference from leaves to root. The derivation is that structure. It is
sound relative to the agreed decomposition, which is the same boundary
every falsifier already has.

Where a project can write a formal proof for a leaf, the verifier is a
mechanism and the proof enters through its receipt. This is the correct
relationship to Verus: not its vocabulary, its output, as one more leaf.
Same Page borrowed the words; Cairn admits the thing.

The failure this answers is partial coverage reported as full, which
Proof-or-Stop measured as the dominant green-but-wrong case. LOOP-003
is the example already in this specification.

## Realized by

- cb23027  Parts and derivation: proof structure without a solver (Draft)
