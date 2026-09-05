# The output is evidence

Slug: the-output-is-evidence
Requirements: LOOP-041, LOOP-042, LOOP-043, LOOP-025, LOOP-031, PKG-002
Inherits: every PKG requirement

## Goal

A failure can be read where it was recorded, and the record survives
the checkout that wrote it.

Drafted 2026-09-05. Both adopting agents reported that a failed
mechanism had to be reproduced by hand to be read, because the record
keeps a digest of output it discarded. The same capture killed a
mechanism at one megabyte of output and recorded the kill as a fail.
The evidence directory is ignored, so a second worktree begins with no
history and the rules that read history read nothing. Items 3, 6, and
13 of [the original PoC report](https://github.com/eas4ai/cairn/blob/a161d4907afa23e5c89ceca8ff00ee45e54130f6/docs/issues-from-the-poc.md).

## Decisions to record

- The output file: `.cairn/evidence/<REQ>/<stamp>.out` holds the
  combined output the record's output_digest was computed over. One
  run that speaks for several requirements writes the output once
  under the first requirement and the other records name that path in
  an `output:` field. A new file kind under .cairn/, so PKG-003 asks
  for the record. Consequential.
- Evidence is tracked. Reverses the .gitignore line and the package
  lint's allowance for it; the write-ahead record stays ignored, and
  the decision that says why is not superseded, because it covers the
  in-progress record and not evidence. Consequential, because it
  reads PKG-002's "rebuild by running a mechanism" as covering a pass
  and not a history.

## Deliverables

- check() streams the command's stdout and stderr to the output file
  as they arrive, with no maxBuffer, and digests the file after the
  command exits. The record's output_digest is the digest of that
  file. A command that exits by signal records `exit: signal <name>`
  and result fail in legacy mode; explicit per-requirement reporting
  retains LOOP-061 for omitted results. A companion .err log preserves
  stderr without buffering it; receipts name it in stderr_output.
- Every record carries `output: <path relative to root>`.
- .gitignore drops `.cairn/evidence/`; the package lint reports an
  ignored evidence directory as a PKG-002 finding rather than
  allowing it; `.cairn/in-progress` stays ignored.
- The working agreement says evidence is committed with the change it
  describes, or in the commit that follows a check.
- breaches() counts the working agreement and the ignore file as
  Cairn's own records, beside .cairn/ and docs/: this commitment has
  every adopter edit .gitignore mid-commitment, and the second
  adoption found the working agreement outside its footprint.
- Both skills say, where they describe a mechanism: a mechanism that
  repeats a command makes each repetition's result findable in its
  output, so the one failure in ten can be read in the record.

## Tests

- a mechanism writing three megabytes to stdout records pass with an
  output file of that size and a digest equal to the file's
  (LOOP-041, LOOP-042)
- every record names an output file that exists and whose digest
  matches (LOOP-041)
- a run for two requirements writes one output file, named by both
  records (LOOP-041)
- the package lint reports `.cairn/evidence/` in .gitignore (PKG-002)
- this repository's evidence is tracked: `git ls-files .cairn/evidence`
  is not empty (LOOP-043)
- a commit that edits .gitignore or AGENTS.md alone is not a breach
  (LOOP-035)
- the skills say repetition-visible output (the static proxy)

## Done when

- Every requirement listed above has current passing evidence from
  node-test or pkg-lint, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done.
