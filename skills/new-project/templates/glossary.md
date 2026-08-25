# Glossary

Canonical language for this project. Definitions are written in this
project's sense; when a term here conflicts with a model's prior, this file
wins. Entries are revised in place as understanding deepens -- never left
stale. A term enters only after both parties have confirmed the meaning.

Entry format: bold term, tight one-or-two-sentence definition of what the
term IS, then an Avoid line listing rejected synonyms.

## Working vocabulary

**Done**:
Implemented and verified. Code without its verification is not done.
_Avoid_: mostly done, done pending tests

**Complete**:
Nothing agreed remains. Work is complete or it is not.
_Avoid_: essentially complete, complete except

**Defer**:
A developer verdict that moves agreed work out of scope. Models surface;
only the developer defers.
_Avoid_: out of scope (as a model verdict), later, phase 2

**MVP**:
Not used in this methodology. The spec is the scope; there is no smaller
version of done.
_Avoid_: slim version, first cut, v1 scope

**Refactor**:
A behavior-preserving change. If behavior changes, it is a feature or a fix.
_Avoid_: rewrite (unless it truly is one), cleanup (when behavior changes)

**Spec**:
The agreed contract for a domain. Normative, not advisory.
_Avoid_: notes, suggestions

**Iteration**:
The current scope contract (iterations/NNN.md): what ships now, what
explicitly does not.
_Avoid_: sprint, phase

**Drift**:
Any divergence between an artifact and reality -- in code, specs, or
vocabulary.
_Avoid_: slippage, staleness

**Observed**:
Spec text drafted from reading the code: what the system does, cited,
not yet confirmed by the developer as what it should do. Not contract.
_Avoid_: documented (says nothing about confirmation), as designed

**Agreed**:
Spec text the developer has confirmed describes both what the system does
and what it should do. Only Agreed sections enter an iteration contract.
_Avoid_: approved (implies a process this methodology does not have),
final

## Project terms

Added during Stage 1 of /new-project and whenever a new term earns its
place. Group under subheadings when natural clusters emerge.

## Relationships

How the project's terms compose (added as project terms accumulate).

## Flagged ambiguities

Terms that collided and how they were resolved. Worked example from the
methodology's own history:

- **UX specification** -- collided between visual design language and
  interaction design; resolved: how the user interacts with the software
  (flows, surfaces, journeys). _Avoid_: UI design, design language
