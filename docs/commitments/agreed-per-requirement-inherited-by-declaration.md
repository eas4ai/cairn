# Agreed per requirement, inherited by declaration

Slug: agreed-per-requirement-inherited-by-declaration
Requirements: LOOP-024, LOOP-032, SPEC-018, SPEC-019, PKG-015, LOOP-057, SPEC-002, SPEC-016, PKG-011
Inherits: every PKG requirement

## Goal

The grain the skills promise is the grain the kernel reads, and what
every commitment inherits is written in the specification and not in
the kernel.

Drafted 2026-09-05. Items 8, 9, and 15 of docs/issues-from-the-poc.md.
The developer ruled on 2026-09-05 that a requirement is Agreed per
requirement, with a Status: line on the block overriding the file's.

## Decisions to record

- A requirement's status is its own line when present and its file's
  otherwise. Consequential: it changes how every Agreed file in every
  consumer is read, though no existing block carries a line and so no
  reading changes today.
- Inheritance is declared by `Scope: every commitment` in the spec
  file. Consequential: it moves a rule out of the kernel into Cairn's
  own package.md, which gains the line.

## Deliverables

- agreedRequirements(): for each `[ID]` block, a `Status:` line inside
  the block decides; the file's line decides when the block has none.
- fold(): the requirements of every Agreed spec file carrying
  `Scope: every commitment` are folded; the literal PKG- test is gone.
  docs/spec/package.md carries the line.
- spec-lint: a block-level Status: is read the same way for SPEC-002;
  a path beginning with `/` or `~` in docs/spec is a SPEC-019 finding.
- new-project and existing-project: agreement is recorded on the
  requirement, with the date, and a file's Status: line is the
  default for blocks without one; every cited path is relative to the
  repository root.
- The keystone's "Status of this specification" says the grain.
- The working agreement states the route for a failing inherited
  requirement once: its mechanism's inputs are in every footprint,
  so it is repaired under the current commitment; a fix outside them
  is an incomplete declaration, so declare and then fix; a failure
  no repository change can address is an escalation (DEC-019). The
  second adoption escalated only to get this ruling; with it written,
  that shape does not reach the developer again (LOOP-057).

## Tests

- a Draft block inside an Agreed file is not Agreed; wake says repair
  the commitment that names it (SPEC-018)
- an Agreed block inside a Draft file is Agreed (SPEC-018)
- a consumer PKG-001 is not folded without the Scope line; a file with
  the line is folded whatever its prefix (PKG-015, PKG-011)
- spec-lint reports an absolute path in docs/spec (SPEC-019)
- the working agreement states the inherited-requirement route (the
  static proxy, LOOP-057)
- the skills say per-requirement agreement and relative paths (the
  static proxy in the skills suite)

## Done when

- Every requirement listed above has current passing evidence from
  node-test or spec-lint, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done.

## Finding from the final review

The combined review of commitments 11-14 found that wildcard inputs
match tracked files through ls-files but match no historical paths through
ls-tree. Complete the two-view input rule by applying Git pathspec matching
to historical selection as well, retaining the same digest and batch read.
