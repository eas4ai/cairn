# The hooks and gates judge by records

Slug: the-hooks-and-gates-judge-by-records
Requirements: PKG-021, PKG-022, LOOP-114, LOOP-115, LOOP-116, LOOP-117, PKG-019, LOOP-089, LOOP-088
Inherits: every PKG requirement
Status: Agreed 2026-09-15

## Goal

The hooks find the kernel wherever the checkout lives, run the kernel
the command link resolves to so hook and agent share one referee, and
never break a session on an error. The gates that guard a promoted
commitment read the record fields that name what they guard, and the
footprint exempts Cairn's records rather than all of docs/.

## Authorization and scope

Requested by the developer on 2026-09-15 after the audit, applying
the plan's recommendation R5. Findings closed: A1, A5, A7, A8, B3,
B9 (by the reason text), B13, B17 (cwd type), D5.

## Deliverables

- bin/hook.mjs: fileURLToPath; the kernel the link resolves to; a
  dangling link replaced and reported; a link to another checkout
  reported at session start; every error path exits 0 with one line
  on stderr.
- bin/cairn.mjs: the LOOP-090 escalation recognized by its Concerns
  line; `decide --promotes` and the Promotes header; the LOOP-088
  check reads it; the LOOP-089 comparison against the parent of the
  activation commit; breaches() exempts docs/spec, docs/commitments,
  docs/decisions, docs/recon.md, AGENTS.md, CLAUDE.md, .gitignore, and
  .cairn/ only; the LOOP-090 reason says to name the changed
  requirements in --concerns so the answer reaches the agent.
- tests: hooks.test.mjs cases for a spaced checkout path, a link to a
  second kernel copy, a dangling link, a bad stdin type, and a file
  at the link's directory; continuation tests for the Concerns gate,
  the Promotes line, and the activation commit; a scope test for a
  docs/ file outside the records; helpers use fileURLToPath.
- skills/new-project and the working agreement's promote paragraph
  name `--promotes`.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
