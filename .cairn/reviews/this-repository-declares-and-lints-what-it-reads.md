commitment: this-repository-declares-and-lints-what-it-reads
commit: 7e6ce63
examined:
  - The build: scripts/spec-lint.mjs (the path scan, the placeholder in strip, the skills allow-list), scripts/pkg-lint.mjs (PKG-003 from help, the shipped-text filter, the paragraph match), the three declarations, tests/coverage.test.mjs, the DEC-014 fixture, the label edits across eleven test files, and the two removed repository-level lint tests.
  - The seven new tests red at 925a220 and green after the implementation; the two SPEC-019 tests that the first SPEC-028 text broke and the revision restored.
findings: []

## Commitment review at 7e6ce63, 2026-09-15

Every requirement has current passing evidence: SPEC-028, SPEC-029,
PKG-023 through PKG-027, DEC-014, LOOP-013, LOOP-014, and the
inherited package set. The suite is 416 passing, both lints clean,
the kernel unchanged at 1463 of 1500 lines.

Safe violating examples: the seven new tests failed at 925a220, each on
the fault it names; the coverage test named the 36 unlabeled
requirements and three undeclared reads in its own message before
the labels and declarations changed.

Attacked:

- The first SPEC-028 text excluded every backticked and quoted token
  from the path scan. Two existing SPEC-019 and SPEC-024 tests failed
  on it, because a host path the software needs is written in
  backticks and must be a finding until declared. The text was revised
  the same day to the false positive the audit found, a regex literal,
  with the reason recorded beside it; the falsifier did not change.
- PKG-025 reads identifiers from test titles. A test that observes a
  requirement without naming it in its title is invisible to it, and a
  title that names a requirement it does not observe passes it; the
  labels were assigned by reading each test's assertions against the
  audit's coverage table, and the review of each later commitment is
  where a wrong label surfaces.
- PKG-026 reads three call shapes: a URL built from import.meta.url
  and the skills tests' flat, raw, and here helpers. A test that reads
  the repository another way escapes it; the suite has no other shape
  today.
- node-test now declares its own declaration file, which the coverage
  test reads. Editing the declaration therefore stales node-test's
  evidence, which is right: the declaration's requirement list is what
  the coverage test checks.
- The package lint's PKG-003 spawns the kernel's help; in a consumer
  package with no bin/cairn.mjs the header scan alone applies, as
  before. The lint's own fixture kernel prints a Commands section.
- The ASCII scan no longer reads .cairn/. A consumer's record with a
  non-ASCII byte ships in that consumer's tree, not in Cairn's
  package; PKG-008 is about what Cairn ships.
- Two tests that linted this repository from inside the suite are
  gone. The spec-lint and pkg-lint mechanisms prove the same facts
  with their own receipts, and the tests were the reason node-test
  read every tracked file undeclared.

Self-audit against the production rules: the deliverables the
commitment lists, one same-day revision recorded in place; every check
reported here ran and passed. No open finding.

Correction, 2026-09-15, after the second audit (E1): the sentence
"the suite has no other shape today" was false. The scan matched
three read shapes; template-string URLs, relative imports, and
cpSync of the kernel directory were not matched, though all fell
under declared inputs. The scan is broadened under
lints-and-tests-observe-what-they-name.
