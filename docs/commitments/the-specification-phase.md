# The specification phase

Slug: the-specification-phase
Requirements: SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006,
SPEC-007, SPEC-008, SPEC-009, SPEC-010, SPEC-011, SPEC-012, SPEC-013,
SPEC-014, SPEC-015, SPEC-016, SPEC-017
Inherits: every PKG requirement

## Goal

The human and the agent build the specification together, and the
agent stops asking questions it can answer.

Delivers the /new-project and /existing-project skills with the rules
below, and one mechanism: a spec lint for
PKG-007 and PKG-010 that also verifies every Agreed requirement carries
a falsifier and every falsifier names an observable state.

## Skill behavior

The skills use a staged confirm-back structure, distinguish Observed
from Agreed (SPEC-016, SPEC-017), ask for falsifiers at every agreement
point, and use the glossary's vocabulary (SPEC-010).

The four rules:

- Resolve ambiguity from the spec, the conventions, or common practice,
  and state the reading in the artifact (SPEC-005, SPEC-006, SPEC-007).
  Asking is for a preference, a priority, or a fact outside the
  repository.
- Falsifiers are proposed for a whole domain and confirmed by
  exception (SPEC-004).
- Depth is inferred, not asked (SPEC-008); domains are derived, not
  imposed (SPEC-009).
- The phase ends at the keystone, the glossary, and the first
  commitment (SPEC-011); later commitments are specified during the
  loop (SPEC-012).

The skills also require a review of the draft before agreement,
recording what it attacked (SPEC-014, SPEC-015). A requirement is not
Agreed until a mechanism that could observe its falsifier can be named
(SPEC-013).

## The spec lint

    .cairn/mechanisms/spec-lint

A mechanism, not kernel. Reads docs/spec/*.md and fails on: a normative
sentence with two obligations (PKG-007); an obligation with no actor
(PKG-010); an Agreed requirement with no Falsifier line (SPEC-002); a
domain spec declaring a prefix with no requirement under it (SPEC-001).
It stays a mechanism so its size does not count against the kernel.

## Tests

- the spec lint on this repository's own specs passes; on a fixture
  with a two-obligation sentence, a missing actor, an Agreed requirement
  with no falsifier, and an empty domain spec, it names each (PKG-007,
  PKG-010, SPEC-001, SPEC-002)
- a fixture skill transcript in which the agent asks a question the
  spec answers is caught by a review checklist item, not by code; the
  falsifier for SPEC-005 is observed by reading, and the review record
  says so (SPEC-014, SPEC-015)
- the skill's agreement step presents a domain's falsifiers as one set
  (SPEC-004): a fixture spec with five requirements yields one
  confirmation prompt, not five

## Done when

- Every requirement above has a mechanism and current passing evidence,
  or, for the conversational requirements, a review record naming what
  was read and what would have falsified it.
- A review record at the current commit with no open finding.
- `cairn wake` says Done.
