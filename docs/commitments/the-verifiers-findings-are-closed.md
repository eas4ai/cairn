# The verifiers' findings are closed

Slug: the-verifiers-findings-are-closed
Requirements: LOOP-104, LOOP-126, LOOP-132, LOOP-105, LOOP-063, PKG-004, PKG-022, PKG-026, PKG-028, PKG-034, PKG-019, PKG-033, PKG-036
Inherits: every PKG requirement
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

## Goal

Every defect the two independent verifications of the second
remediation reproduced is repaired, and the documents that overstated
what the remediation built say what it built.

## Authorization and scope

Requested by the developer on 2026-09-15 after the second audit,
recorded in docs/decisions/the-second-audit-is-remediated-on-the-
developer-s-direction.md; plan docs/audit/2026-09-15-remediation-
plan-2.md, commitment 6. Findings closed: the A14 residue (a fenced
Current: example after the real line selects the commitment), the A4
residue (an input spelled `..` from a nested project is not refused,
and the check's message names the path from the Git toplevel), the
A10 residue (a --root that is not a directory is blamed on the
checker), the C5 residue (a link to a directory named cairn.mjs is
kept and the hook judges silently with its own kernel), the PKG-004
count (one line high per file), the PKG-022 falsifier's unreachable
case, the PKG-026 rationale's false claim, the D6 residue (three
verdict words missing from the manual's table), and the plan's
Result rows E1 and F1, which said closed where the fixes are partial.

## Deliverables

- The roadmap's Current: line is read outside fences (LOOP-104).
- A declared input is resolved against the project root before the
  evidence test (LOOP-126, LOOP-105); an uncommitted declared input
  is named relative to the project root (LOOP-132, LOOP-063).
- `cairn lint` names a --root that is not a directory (PKG-028).
- The session-start hook replaces a link whose target is not a
  regular file (PKG-034); the PKG-022 falsifier names a reachable
  case.
- The package lint counts lines as wc -l does (PKG-004); the PKG-026
  rationale says what the coverage scan sees.
- The manual's Get unstuck table names record, declare and resolve;
  the plan's Result table says partial where it is.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
