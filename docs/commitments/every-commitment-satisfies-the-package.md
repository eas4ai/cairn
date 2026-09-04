# Every commitment satisfies the package

Slug: every-commitment-satisfies-the-package
Requirements: PKG-001, PKG-002, PKG-003, PKG-004, PKG-005, PKG-006,
PKG-007, PKG-008, PKG-009, PKG-010, PKG-011, PKG-012, PKG-013
Inherits: every PKG requirement

## Goal

Done means the package holds too.

PKG-011 says every commitment must satisfy every PKG requirement, and
the roadmap says PKG is inherited rather than assigned. But wake and
check read only a commitment's own Requirements line, so no mechanism
spoke for PKG at Done time, and five commitments reported Done with the
package unchecked. Promoted from the backlog on the developer's word.

Delivers three things.

- The fold: wake and check treat every Agreed PKG requirement as part
  of every commitment. A PKG requirement with no mechanism is declared
  like any other; one with failing evidence blocks Done like any other.
- `scripts/pkg-lint.mjs`: a mechanism, not kernel, for the PKG
  requirements a program can observe. One run, one exit code, findings
  named by requirement.
- PKG-003 revised so a concept is a command, a record kind, or a
  directory under .cairn/, each of which a program can find and check
  against the decision records.

## What pkg-lint observes

    PKG-001  package.json has no dependencies; no Dockerfile, compose file,
             or service manifest is tracked
    PKG-002  .gitignore excludes nothing under .cairn/ except evidence/
    PKG-003  every command in the kernel's usage text, every record kind a
             commitment's Formats section names, and every directory under
             .cairn/ appears in some decision record
    PKG-004  the kernel's line count is under 1500
    PKG-006  no skill instructs a step by naming one vendor's product
    PKG-008  every tracked text file is ASCII
    PKG-009  the kernel imports nothing from tests/
    PKG-012  the kernel makes no network call and names no model vendor
    PKG-013  no spec, commitment, skill, or decision names a later version,
             a phase, or a postponement for work the spec includes

PKG-005 is observed by node-test, which runs the kernel on a clean
checkout. PKG-007 and PKG-010 are observed by spec-lint. PKG-011 is
observed by node-test: wake refuses Done while a PKG requirement lacks
current passing evidence.

## Tests

- a fixture spec with an Agreed PKG requirement and a commitment that
  does not name it: after the commitment's own requirements pass, wake
  says declare the PKG requirement; with a mechanism, run; with failing
  evidence, implement; Done only when it passes (PKG-011)
- pkg-lint on fixtures realizing each falsifier above names the
  requirement; on this repository it passes

## Done when

- Every PKG requirement has a mechanism and current passing evidence.
- A review record at the current commit with no open finding.
- `cairn wake` says Done, with the package in the set it checked.
