# Record integrity

Slug: record-integrity
Requirements: DEC-020, DEC-021, DEC-011, DEC-007, DEC-005
Inherits: every PKG requirement
Status: Agreed 2026-09-16 by deference record-integrity-on-the-developer-s-direction

## Goal

A decision record says who decided it in a word the report can count,
and never says it was not built above the commits that built it.

## Authorization and scope

Requested by the developer on 2026-09-16 in writing, recorded in
docs/decisions/record-integrity-on-the-developer-s-direction.md. An
audit of three downstream projects found both defects: reactive-tui
carries seven spellings of three deciders, so the `by decider:` tally
fragments; suprnova-directory-starter carries three records whose
`(none yet: recorded, not built)` line sits directly above their
realizing entries, and the wake accepts them.

## Deliverables

- `cairn decide --decided-by` accepts `developer`, `agent`, or `joint`,
  case-insensitively, and stores the value lowercase; any other value is
  a usage error naming the three, and nothing is written (DEC-020).
- `cairn reversals` normalizes case and surrounding whitespace before it
  tallies, and counts a value outside the vocabulary as
  `unrecognized: <value>` rather than dropping or guessing it (DEC-020,
  DEC-011).
- The wake names a decision record as a repair when its `Realized by`
  section holds both the placeholder and a resolving commit entry,
  saying which file and to remove the placeholder line (DEC-021). A
  section holding the placeholder alone is unchanged, and the
  shallow-repository repair keeps precedence.
- No existing record is rewritten by any of this.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
