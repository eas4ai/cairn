# One receipt per run

Slug: one-receipt-per-run
Requirements: LOOP-097, LOOP-098, LOOP-040, LOOP-041, LOOP-070, LOOP-075
Inherits: every PKG requirement
Status: Agreed 2026-09-14

## Goal

A check writes one receipt per mechanism run instead of one per
requirement, every requirement's history still reads in execution
order across old and new receipts, and nothing already recorded moves
or changes.

## Authorization and scope

The developer answered ok to escalation loop-091-3 on 2026-09-14, which
recommended this item. Item:
.cairn/next-iteration/one-record-per-run-rather-than-one-per-requirement.md.
The change is inside the kernel's receipt writer and reader, the
helpers and tests that read receipts, and the documentation of where
evidence lives. Legacy receipts and their directories are untouched.

## Decisions to record

- `.cairn/evidence/runs/` holds run receipts and their files. PKG-003:
  a directory under .cairn/. Consequential: every consumer's evidence
  gains it and every reader of receipts changes.
- The result line format: `REQ: result source requirement_digest
  sequence history_digest`. Judged.

## Deliverables

- bin/cairn.mjs: recordEvidence writes one receipt under
  .cairn/evidence/runs/ with the shared fields once, a `results:` list
  with one line per requirement, and its output, stderr, and inputs
  detail files beside it; history() reads a requirement's legacy
  directory and every run receipt naming it, maps each result line to
  the same entry shape, validates it with the existing receipt checks,
  and sorts by sequence; historyDigest and the order rules are
  unchanged; check prints one recorded line per requirement naming the
  run receipt; wake's evidence pointers name the run receipt.
- tests/helpers.mjs: records(root, req) returns the receipt paths of a
  requirement's history in order, legacy and run alike; the tests that
  read receipts use it.
- docs/manual.md "Where to find the output" and "Know where the records
  live": the runs directory; the README's evidence sentence.

## Tests

- a check with a mechanism speaking for two requirements writes exactly
  one receipt under runs/, two result lines, one output path; each
  requirement's history has one entry (LOOP-097)
- a hand-written legacy per-requirement receipt with a fail and a later
  passing check give a history of two entries in sequence order, and
  wake reads the pass as latest; the legacy file is unchanged
  (LOOP-098, LOOP-025)
- editing or removing a run receipt makes the latest result stale under
  the existing order rules, and a supporting file beside run receipts
  is ignored (LOOP-070, LOOP-075)
- the existing suites that read receipts pass through the helper
  unchanged in meaning

## Verification

Reproduce the cost: count the files one check writes at the commit
before the change and after it on this repository. Run the full suite,
both lints, full committed mechanisms, and review before Done.

## Done when

- Every requirement listed above has current passing evidence from
  node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, specify, or Done.
