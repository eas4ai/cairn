# The documents say what the code does

Slug: the-documents-say-what-the-code-does
Requirements: LOOP-088, LOOP-105, LOOP-108, PKG-022, LOOP-118, PKG-028, SPEC-029, LOOP-026, LOOP-036, LOOP-101, SPEC-002, PKG-030, PKG-031, LOOP-115, LOOP-013
Inherits: every PKG requirement
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

## Goal

Every statement in the contract, the working agreement, and the human
documents matches the kernel, and every requirement agreed under a
recorded ruling carries the marker that says so.

## Authorization and scope

Requested by the developer on 2026-09-15 after the second audit,
recorded in docs/decisions/the-second-audit-is-remediated-on-the-
developer-s-direction.md; plan docs/audit/2026-09-15-remediation-
plan-2.md, commitment 5. Findings closed: B6, B9, D1, D3 to D7, D9,
D10 (text), D11, D12 (walkthrough), E4, E5, and the scope sentence
commitment 1's review found.

## Deliverables

- LOOP-088 at Consequential, enforced by decide --promotes and by the
  LOOP-088 check; LOOP-105, LOOP-108 and PKG-022 one obligation per
  sentence; LOOP-118, PKG-028, SPEC-029 and LOOP-026 falsifiers say
  what the kernel checks.
- The 25 requirements still carrying a bare 2026-09-15 stamp carry
  `by deference audit-found-contract-defects-are-repaired-on-the-
  developer-s-direction`; overview.md and the next-iteration skill
  name the marker.
- The working agreement and its template: promotions at
  Consequential; the record removed before an escalation; `cwd:` in
  the declaration format; restoration to the tree before activation.
- The manual, README, walkthrough, install skill, glossary, roadmap
  and LOOP-067 rationale corrected as the audit lists; the first
  audit's counts corrected.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
