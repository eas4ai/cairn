# The contract says what the kernel does

Slug: the-contract-says-what-the-kernel-does
Requirements: DEC-016, LOOP-026, PKG-004, SPEC-002, LOOP-101, LOOP-028, LOOP-036
Inherits: every PKG requirement
Status: Agreed 2026-09-15

## Goal

The audit of 2026-09-15 found contract text that contradicts the
kernel or other requirements, a working agreement that gives a move
for nine of the fourteen actions wake prints, and a derivable status
the kernel writes. This commitment makes the text say what the kernel
does and the agreement say what the agent does on every action.

## Authorization and scope

The developer ruled on 2026-09-15 that these are defects in the
contract, not next-iteration items, and directed that they be fixed
without further rulings. That ruling is the confirmation LOOP-029 and
SPEC-002 require; the decision record
audit-found-contract-defects-are-repaired-on-the-developer-s-direction
names it. Findings closed: C2, C3, C8, C11, C15, A10, D4 (by the
SPEC-013 rationale), and the working-agreement halves of B10 and
C11.

## Deliverables

- docs/spec: DEC-016's falsifier counts attempts; LOOP-026 bounds the
  developer-facing block; PKG-004 names the kernel under bin/;
  SPEC-002 names the deference route and its marker; SPEC-013's
  rationale says how conversation requirements are observed; LOOP-101
  is new; the six requirements agreed on 2026-09-14 carry
  `by deference <decision>`; the LOOP-026 template drops "(n of m)".
- bin/spec.mjs and bin/cairn.mjs: the marker `by deference <slug>` is
  read like `by promotion <slug>` and must resolve to a decision
  record; escalate no longer writes `Status: open`.
- scripts/spec-lint.mjs: the marker check covers both kinds.
- AGENTS.md and the template: a move for run, implement, declare,
  review mechanism, review, resolve, build, repair, commit, reconcile,
  scope, escalate, present, reply, and promote; the mechanism
  declaration and review record formats beside the in-progress
  record; `--level Blocking`; `--outside`; the wider in-progress
  action list; the scope-breach paragraph under the agent's section.
  CLAUDE.md becomes a pure include.
- tests: a LOOP-101 test that reads the action verbs from the kernel
  source and finds each in the template; deference-marker tests for
  the kernel and the lint; an escalate test that no Status: line is
  written; the skills proxies for the new agreement text.

## Tests

- every action verb the kernel can print has a move in the working
  agreement (LOOP-101)
- a `by deference` marker resolving to a decision is Agreed; one that
  does not resolve is a repair, in the kernel and in the lint
  (SPEC-002)
- a raised escalation carries no Status: line, and an old record
  carrying one still parses (LOOP-028)
- the agreement names both record formats, `--level Blocking`, and
  `--outside` (LOOP-036)

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
