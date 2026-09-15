# The gates bind to the commitment

Slug: the-gates-bind-to-the-commitment
Requirements: LOOP-120, LOOP-121, LOOP-122, LOOP-123, LOOP-090, LOOP-092, LOOP-089, LOOP-088, LOOP-117
Inherits: every PKG requirement
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

## Goal

The scope footprint and the contract gate see the whole commitment:
the activation commit, requirements demoted or removed, the
agreement's include files, and a reversed promotion.

## Authorization and scope

Requested by the developer on 2026-09-15 after the second audit,
recorded in docs/decisions/the-second-audit-is-remediated-on-the-
developer-s-direction.md; plan docs/audit/2026-09-15-remediation-
plan-2.md, commitment 1. Findings closed: B1, B2, B3 (kernel), B4,
D2.

## Deliverables

- bin/cairn.mjs: the footprint starts at the activation commit's
  parent; the contract gate compares the Agreed set at activation
  and names a demoted or removed requirement; include files are the
  root files whose content is `@AGENTS.md`, exempt from the footprint
  and compared by the gate under LOOP-036; a superseded promotion
  record no longer satisfies LOOP-088 and the repair says so.
- tests/continuation.test.mjs and tests/scope.test.mjs: one test per
  new requirement, red on the old kernel.
- LOOP-090 and LOOP-092 falsifiers revised to the Concerns reading;
  mechanism reviews recorded here.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
