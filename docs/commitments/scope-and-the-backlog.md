# Scope and the backlog

Slug: scope-and-the-backlog
Requirements: LOOP-015, LOOP-016, LOOP-029, LOOP-035
Inherits: every PKG requirement

## Goal

Work outside the commitment is captured, never implemented, never lost,
and promoted only by the developer. A commit that reaches outside the
commitment's footprint is visible.

Delivers `cairn backlog`, and a footprint check inside `check` and
`wake`.

## Where things live

    .cairn/backlog/<slug>.md    one file per captured item; committed

## Behavior

backlog:

- Takes --title and --body, and optionally the requirement or
  commitment the idea surfaced from. Writes the file. Never deletes one
  (LOOP-016).

The footprint (LOOP-035):

- The commitment's footprint is the union of the declared inputs of
  every mechanism that speaks for one of its requirements, plus .cairn/
  and docs/. Nothing new is declared; it is derived.
- check, before running anything, compares the files changed by commits
  since the commitment began (the first commit after Current: named it)
  against the footprint. A file outside it is reported as Resolve: scope <path>, either
  declare it as an input of the mechanism that should cover it, or
  write it to the backlog and revert it.
- wake reports the same, ahead of running mechanisms, because a
  footprint breach is scope creep until it is explained.

Promotion (LOOP-029):

- There is no command. A backlog item becomes a requirement when the
  developer writes it into a spec with a confirmed falsifier, and
  enters a commitment when the developer names it there. wake checks
  that every requirement a commitment names exists in the spec set as
  Agreed; one that does not is Resolve: repair the commitment.

## Formats

A backlog item, .cairn/backlog/<slug>.md:

    # <title>

    Surfaced from: <REQ-ID or commitment slug>
    Captured: <iso timestamp>

    <body>

## Tests

- backlog writes the file; a second backlog with the same title is
  refused rather than overwritten (LOOP-016)
- a commit changing a file inside the footprint: check runs; a commit
  changing a file outside it: check reports the path and does not run
  (LOOP-035)
- a file under .cairn/ or docs/ is never a breach
- declaring the path as an input clears the breach; so does reverting
  the change and writing a backlog item
- a commitment naming a requirement that is not Agreed in the spec set:
  wake says repair the commitment (LOOP-029)

## Done when

- Every requirement above has a mechanism and current passing evidence.
- A review record at the current commit with no open finding.
- `cairn wake` says Done.
