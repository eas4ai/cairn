# Glossary

Canonical language for this project. Definitions are written in this
project's sense; when a term here conflicts with a model's prior, this file
wins. The Working vocabulary section is the standard dictionary shipped by
Same Page: identical in every project by default, and agreed to by the
developer at Stage 1. A project changes a standard entry only by a
recorded ruling, and the language check reports any change without one.
Project entries below it are revised in place as understanding deepens --
never left stale. A term enters only after both parties have confirmed
the meaning.

Entry format: bold term, tight one-or-two-sentence definition of what the
term IS, then an Avoid line listing rejected synonyms. An Avoid term with
a parenthetical qualifier is banned only under that condition; an
unqualified Avoid term is banned outright in normative text and the
language check enforces it. A ruling on a standard entry is one more line
inside that entry, date then reason, for example
"_Ruling_: 2026-09-01 -- verification here means the developer ran it".

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
_Avoid_: notes (as a name for a spec), suggestions (as a name for a spec)

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
final (as a section status)

**Requirement**:
A single identified normative statement. One sentence, one obligation,
one identifier.
_Avoid_: rule (reserved for language rules), constraint (unless it is
one), feature (a feature contains requirements)

**State**:
The stored condition of a thing at a moment, enumerable and testable.
_Avoid_: status (when state is meant)

**Status**:
A reported summary of state for a reader. A status is derived; a state
is stored.
_Avoid_: state (when status is meant)

**Capability**:
Something the system can do, spec'd as a set of requirements under a
domain.
_Avoid_: functionality, feature set

**Dependency**:
A thing that must exist or hold before another thing works, named
explicitly.
_Avoid_: prerequisite, assumption (an assumption is unverified)

**Interface**:
The agreed surface between two components: operations, inputs,
outputs, errors.
_Avoid_: API (when the surface is not an API), contract (reserved for
iteration contracts)

**Defect**:
A violation of an Agreed requirement, recorded in
defects/<slug>.md.
_Avoid_: bug (colloquial), issue (tracker artifact)

**Verify**:
To confirm by executing a check -- a test, a lint, a measurement.
Reading is review, not verification.
_Avoid_: validate (unless input validation), check (as a verb for
reading)

**Reject**:
To refuse an input or request with an observable error result. Silent
dropping is not rejection.
_Avoid_: ignore (when rejection is meant), discard (when rejection is
meant)

**Falsifier**:
The observable state that would violate a requirement, named by the
model and confirmed by the developer at the moment the requirement
becomes Agreed. A requirement without a confirmed falsifier has been
written but not understood.
_Avoid_: failure case, negative test (a test is one way to address a
falsifier, not the falsifier itself)

**Evidence map**:
The committed claim register (`conformance.md`) tying each Agreed
requirement identifier to its coverage, the method that produced its
evidence, and the cited evidence.
_Avoid_: conformance map

**Coverage**:
Whether cited evidence addresses a requirement's falsifier: Covered,
Asserted, or Uncovered. Coverage never names the mechanism.
_Avoid_: status (when coverage is meant)

**Method**:
The mechanism that produced a piece of evidence: formal, model,
property, integration, test, static, inspected, or manual. The list
is not a rank.
_Avoid_: evidence level, confidence

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
