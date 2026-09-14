# The skill matches the lint on MAY

Slug: the-skill-matches-the-lint-on-may
Requirements: SPEC-025
Inherits: every PKG requirement
Promoted from: the-spec-lint-demands-a-falsifier-on-a-may-that-the-skill-says-carries-none
Status: Agreed 2026-09-14 by promotion promote-the-may-falsifier-mismatch-the-skill-matches-the-lint

## Goal

The two texts that govern falsifiers agree: every Agreed requirement
carries a Falsifier: line, a MAY included, and the new-project skill
says so instead of exempting permission-only MAYs.

Promoted from the backlog on 2026-09-14 by the decision named above,
the first promotion under LOOP-087. Judged: a text consistency fix
inside the specification.

## Deliverables

- skills/new-project/SKILL.md: the requirements rule says every
  requirement carries a Falsifier: line; for a permission, the
  falsifier is the state in which the permission is withheld; a MAY
  with no observable falsifier is not recorded, and the limit it
  implies is written as its own MUST or MUST NOT.
- tests/skills.test.mjs: the old exemption is gone and the new rule is
  present (the static proxy).
- tests/spec-lint.test.mjs: an Agreed block whose only keyword is MAY
  and that carries no Falsifier: line is a SPEC-002 finding.

## Tests

- the skill no longer says a permission-only MAY carries none, and says
  every requirement carries a Falsifier: line (SPEC-025)
- spec-lint reports an Agreed MAY block without a falsifier (SPEC-025)

## Done when

- SPEC-025 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
