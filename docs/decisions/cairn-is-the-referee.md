# Cairn is the referee, not the agent

Level: Consequential
Decided by: agent
Rests on: PKG-004, PKG-005, PKG-006, which together make an orchestrator
impossible to build inside Cairn
Would be wrong if: the developer intends Cairn to drive the coding agent
itself, in which case the line ceiling, the no-dependency rule, and the
vendor-neutrality rule all have to go

## Decision

Cairn reads and validates the state on disk, runs mechanisms, decides
freshness, names the next legal action, and formats decisions and
escalations. An agent from any vendor does the work. Cairn never calls a
model and never manages an agent's execution (PKG-012).

The independent review raised this as its first question, and correctly:
the overview described a workflow in which an agent works, while the
package required a self-contained node program with no vendor-specific
dependency. Those are only consistent if Cairn is the referee.

The reading is derivable from constraints the developer has already
agreed to, so it is decided here rather than escalated. It is surfaced
as the one decision in the review worth the developer's eyes, because if
it is wrong, everything downstream is wrong.

## Realized by

- ad05249  Independent review (Astra): seven findings, all accepted
