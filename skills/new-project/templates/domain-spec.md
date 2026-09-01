# Project Name -- NN Domain Name

Status: Normative design specification
Prefix: DOM
Last revised: date of last edit

<!-- One bounded subsystem per numbered spec; features live inside their
domain. Health rules: a spec that outgrows a single coherent read means
the domain should split; a feature spanning domains is spec'd in its
primary domain and cross-referenced from the other, with ux.md holding
the map; small projects use fewer numbers, same shape. The Prefix line
names this spec's requirement-identifier prefix; the overview's spec
map lists every prefix. -->

## Scope

What this domain owns, in one paragraph. Names the neighboring specs this
one depends on or feeds.

## Capabilities

The domain's features. For each: a heading, identified requirements in
Same Page Technical English -- one obligation per sentence, exactly one
of "MUST", "MUST NOT", or "MAY", the actor named, the condition first --
and acceptance criteria as a checkable list. Functional requirements
live here, attached to the feature they verify. Run the language check
after writing or revising this section.

### Feature name

[DOM-001]
When the trigger condition occurs, the component MUST produce the
agreed observable response.

[DOM-002]
The component MUST NOT act outside its declared capability.

Acceptance criteria:
- When the trigger condition occurs, the component produces the agreed
  observable response within the agreed bound.

UX flow (defers to ux.md for how this fits the whole):
1. User action -> system response, through the happy path.
2. Error paths and states for this feature.

## Acceptance criteria

Domain-level criteria: the conditions under which this whole spec is
satisfied, beyond any single feature.

## Decisions and revisions

Append-only, newest first.

- date -- Decision. Context in one line; alternatives rejected and why.
