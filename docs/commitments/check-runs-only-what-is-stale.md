# Check runs only what is stale

Slug: check-runs-only-what-is-stale
Requirements: LOOP-094
Inherits: every PKG requirement
Promoted from: run-only-stale-mechanisms-without-a-requirement-lookup
Status: Agreed 2026-09-14 by promotion promote-the-stale-only-check-selector

## Goal

An agent refreshes stale evidence with one command and no requirement
lookup: `cairn check --stale` runs exactly the mechanisms wake would
name run for, once each, and skips fresh failures and unverified
results with the reason.

Promoted from the backlog on 2026-09-14 by the decision named above.
Consequential: it adds an option to the command surface every consumer
sees, and is queued for the developer's review.

## Deliverables

- bin/cairn.mjs: `check --stale` assesses the current commitment's
  requirements with the same assessment wake uses; selects those with
  no evidence or stale evidence and a mechanism; runs each selected
  mechanism once; prints one skipped line per requirement whose latest
  evidence is a fresh failure or unverified, naming implement as the
  action; with nothing selected, prints that nothing is stale and
  returns the wake verdict. --stale with requirement identifiers is a
  usage error. The help text names the option.
- tests/check-stale.test.mjs: the cases below.

## Tests

- after a green check, --stale runs nothing and says so; after one
  mechanism's input changes, --stale runs only that mechanism and the
  other requirement gains no record (LOOP-094)
- a mechanism speaking for two stale requirements runs once, and both
  gain a record (LOOP-094, LOOP-040)
- a fresh failure is skipped with implement named; an unverified
  result is skipped the same way (LOOP-094)
- --stale with a requirement identifier is refused (LOOP-094)

## Done when

- LOOP-094 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
