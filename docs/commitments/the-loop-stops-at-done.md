# The loop stops at Done

Slug: the-loop-stops-at-done
Requirements: LOOP-091, LOOP-087
Inherits: every PKG requirement
Status: Agreed 2026-09-14

## Goal

Done is the end of the loop's authority. With the backlog empty and the
review clean, wake reports Done and the agent stops, whatever waits in
next-iteration. The developer opens the next feature specification.

## Authorization and scope

The developer ruled on 2026-09-14 that next-iteration items are the
next feature specification and are never worked by the loop. This
reverses the second half of the first LOOP-091 and the answered-
escalation path built under hooks-keep-the-agent-in-the-loop. Backlog
promotion at Done (LOOP-087) is unchanged and is named here only
because the wake ending that carries it is the code that changes.

## Decisions to record

- Supersede an-answered-next-iteration-escalation-chooses-by-its-text
  with cause "the premise was false": the loop was never to choose a
  next-iteration item. Judged.

## Deliverables

- bin/cairn.mjs: the wake ending returns Done when the backlog holds no
  unpromoted item, with the count of waiting next-iteration items in
  the reason as information; the escalate next-iteration and specify
  branches are removed.
- AGENTS.md and the template: the Done bullet reads "Done: the
  commitment is complete and the backlog holds nothing to promote.
  Report it, and stop. Next-iteration is the developer's to open."; the
  escalate next-iteration paragraph is removed; the developer's last
  paragraph says a next-iteration item starts a new loop: the developer
  runs new-project or existing-project as for a new project or a new
  feature, and that phase ends by naming the next commitment.
- README and manual: the "asks you once" sentences say instead that
  next-iteration is the input to the next feature specification, which
  the developer opens with the project skills.
- .cairn/next-iteration/a-declined-next-iteration-item-has-no-resting-place.md
  is removed as moot, with the reason in the commit.
- .cairn/backlog/prepare-a-next-iteration-without-repeating-project-adoption.md
  loses its absorbed stamp, which named the escalation, and moves under
  next-iteration with Changes: SPEC-012: it asks for a documented step
  that turns waiting items into a specification phase without
  repeating adoption, which is the developer's to specify.
- tests/continuation.test.mjs: the LOOP-091 tests assert Done with
  waiting items and no escalate or specify action; the skills suite
  reads the new Done bullet.

## Tests

- a complete commitment with an empty backlog and waiting next-iteration
  items reports Done, names no escalation and no specify, and mentions
  the count (LOOP-091)
- a complete commitment with an unpromoted backlog item still names
  promote (LOOP-087)
- the working agreement and the template carry the new Done bullet and
  no escalate next-iteration move (LOOP-091, LOOP-036)

## Done when

- Every requirement listed above has current passing evidence from
  node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done, with two next-iteration items waiting.
