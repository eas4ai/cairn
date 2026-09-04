# Import mechanisms from Harness-of-Harness, not its architecture

Level: Consequential
Decided by: agent
Rests on: PKG-003, PKG-012, and the Verus lesson recorded in the design
record
Would be wrong if: one of the three Draft requirements cannot be
confirmed with a falsifier a mechanism can observe, in which case it
leaves rather than being kept as guidance

## Decision

Three mechanisms from arXiv 2609.01481 enter as Draft requirements,
each with the failure the paper documents. Nothing else from the paper
enters.

The paper is a harness-of-harness: it invokes a Planner, a Developer,
and a QA Tester as three separate runs of a coding harness, with a
Runtime that enforces what each may read and write. That is an
orchestrator. Cairn is the referee that makes an external agent's work
durable, and PKG-012 forbids it from managing an agent's execution.
Importing the three-role structure would be the Verus mistake again:
adopting the shape of a system whose engine Cairn does not have.

What transfers is what the paper measured. Its three ablations map onto
what cairn wake already does by deriving the next action from evidence
on disk. Its freeze-the-candidate rule, its regression-first planning
policy, and its read-only QA role each name a failure Cairn's loop would
otherwise reproduce, and each can be stated as a requirement with an
observable falsifier. Those three entered. The rest, including the
role separation, the progressive-disclosure index, and the at-most-three-
priorities heuristic, either is already derivable from Cairn's state or
is a decision the developer makes at specification time.

The paper's own QA Tester is the role Cairn assigns to the mechanism:
acceptance comes from observing a frozen candidate, not from the
implementer's claim. LOOP-032's prose now says so.

## Realized by

- d4720c3  Three Draft requirements from Harness-of-Harness (arXiv 2609.01481)
