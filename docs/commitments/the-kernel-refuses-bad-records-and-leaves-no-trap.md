# The kernel refuses bad records and leaves no trap

Slug: the-kernel-refuses-bad-records-and-leaves-no-trap
Requirements: LOOP-102, LOOP-103, LOOP-104, LOOP-105, LOOP-106, LOOP-107, LOOP-108, LOOP-109, LOOP-110, LOOP-111, LOOP-112, LOOP-113, LOOP-101
Inherits: every PKG requirement
Status: Agreed 2026-09-15

## Goal

Every record the audit found to crash the kernel becomes a named
repair; the three states the loop could not leave are closed; the
review and decision fields the gates never read are read; the
write-ahead record is asked for; and file modes, subdirectory roots,
and shallow clones are handled.

## Authorization and scope

Requested by the developer on 2026-09-15 after the audit, applying
the plan's recommendation R1. Findings closed: A2, A3, A4, A6, A9,
A12, A13, A14, A15, B4, B5, B8, B11, B14, B15, B16, B17, F2. The
working agreement gains the `record <path>` move so LOOP-101 holds
for the new action; that is the only agreement change.

## Deliverables

- bin/cairn.mjs: list-form Requirements and Specified from; record
  directories read by kind; a duplicate Current: line; declaration
  refusals for a repeated identifier, an input under .cairn/evidence/,
  and a missing cwd; declare ahead of the regression and three-fails
  branches for a requirement with no mechanism; unreadable records as
  repair verdicts; reviewOf requires commit, examined, and findings;
  decision headers and Supersedes targets validated on read; the
  record action; index modes under core.filemode false; git object
  hashing from a subdirectory root; shallow and ambiguous Realized by
  identifiers named as such; spawn failures recorded as exit -1; the
  --stale summary counts repairs; wake from a subdirectory names the
  root option.
- AGENTS.md and the template: the `record <path>` move.
- tests/robustness.test.mjs: one test per requirement, each with the
  failing shape and the accepted shape.
- tests/wake.test.mjs: the decision fixture carries every header
  field.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
