# Project Name -- NN Domain Name

Status: Normative design specification
Last revised: date of last edit

<!-- One bounded subsystem per numbered spec; features live inside their
domain. Health rules: a spec that outgrows a single coherent read means
the domain should split; a feature spanning domains is spec'd in its
primary domain and cross-referenced from the other, with ux.md holding
the map; small projects use fewer numbers, same shape. -->

## Scope

What this domain owns, in one paragraph. Names the neighboring specs this
one depends on or feeds.

## Capabilities

The domain's features. For each: a heading, a short normative statement of
behavior, and acceptance criteria as a checkable list. Functional
requirements live here, attached to the feature they verify.

### Feature name

What the feature shall do, in two or three sentences.

Acceptance criteria:
- Condition that can be checked true or false.

UX flow (defers to ux.md for how this fits the whole):
1. User action -> system response, through the happy path.
2. Error paths and states for this feature.

## Acceptance criteria

Domain-level criteria: the conditions under which this whole spec is
satisfied, beyond any single feature.

## Decisions and revisions

Append-only, newest first.

- date -- Decision. Context in one line; alternatives rejected and why.
