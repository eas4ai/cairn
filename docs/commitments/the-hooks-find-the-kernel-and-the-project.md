# The hooks find the kernel and the project

Slug: the-hooks-find-the-kernel-and-the-project
Requirements: PKG-033, PKG-034, PKG-035, PKG-036, PKG-018, PKG-019, PKG-021, PKG-022, PKG-004
Inherits: every PKG requirement
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

## Goal

The hooks judge with the command the agent runs, wherever it is, for
the project the session is in, and say so in one line when they
cannot.

## Authorization and scope

Requested by the developer on 2026-09-15 after the second audit,
recorded in docs/decisions/the-second-audit-is-remediated-on-the-
developer-s-direction.md; plan docs/audit/2026-09-15-remediation-
plan-2.md, commitment 3. Findings closed: C1 to C6. The ceiling
revision (PKG-004) is recorded by the-complexity-ceiling-is-1600-lines.

## Deliverables

- bin/hook.mjs: the kernel is the cairn on PATH, else the link's
  target, else its own; the link is replaced only when its target does
  not exist; the project is the nearest roadmap at or above cwd inside
  the working tree; the link block and the verdict are separate, so a
  failed link never skips the verdict; a kernel that prints no verdict
  is one stderr line and the stop is allowed; a missing git is one
  stderr line.
- tests/hooks.test.mjs: PATH excludes the machine's cairn; one test per
  new requirement and for the two repairs, each red on the old hook.
- scripts/pkg-lint.mjs: the ceiling reads 1600.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
