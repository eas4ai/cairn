# Iteration NNN

Status: Scope contract
Agreed: date both parties confirmed this contract

## In

The domain specs, or sections within them, that ship in this iteration.
One line each: spec reference -> what "shipped" means for it. Worked
example:

- 01-domain.md DOM-001 through DOM-002 -> implemented and verified

## Out

Explicitly not in this iteration. Naming exclusions is what makes the In
list a contract. Ideas that arrive mid-iteration land in iterations/next/
via /next-iteration, never here. Worked example:

- DOM caching beyond the agreed lease duration

## Definition of done

Checkable conditions for closing this iteration: which acceptance criteria
from which specs, which verification commands green, what documentation
current. Worked example:

- Acceptance criteria for DOM-001 through DOM-002 pass.
- The language check reports zero findings for the spec set.
- The evidence map rows for DOM-001 through DOM-002 cite evidence.
