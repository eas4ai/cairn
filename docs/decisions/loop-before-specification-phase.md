# Build the loop before porting the specification phase

Level: Consequential
Decided by: agent
Rests on: the developer's ruling that the missing Phase B is Cairn's
centre of gravity
Would be wrong if: Cairn's own specification proves too small or too
unusual to exercise the loop honestly

## Decision

The roadmap builds the loop first and ports the specification phase last.

Cairn bootstraps on itself: its own specification is the input to its own
loop, which resolves the ordering problem of needing a specification
before a loop can run against one.

The specification phase already works. The developer's evidence is that
the pre-engine package was working fairly well, and that its defects were
over-asking and the absence of anything after Stage 6. Over-asking is a
repair to existing rules. The absence of a loop is the whole product.

## Realized by

- 6093095  Draft specification: four domains, 48 requirements with falsifiers
