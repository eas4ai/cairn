# Roadmap

Status: Agreed 2026-09-04. Not normative.

Order lives here. Filenames carry meaning, never sequence.

Current: every-commitment-satisfies-the-package

LOOP-020, review before completion, and every PKG requirement apply to
every commitment rather than to one.

Cairn bootstraps on itself: its own specification is the input to its
own loop, so the loop is built before the specification phase is ported.

Every commitment must be able to reach Done under LOOP-017 with only
what it and its predecessors deliver. The first draft split evidence
from the wake and left the first commitment unable to finish; see
docs/decisions/check-belongs-to-the-first-commitment.md.

## 1. The record, the wake, and the check

The loop's happy path, end to end: know where you are, decide and
record, run mechanisms against a committed tree, record evidence with
receipts, review, and report Done only when LOOP-017 holds.

Delivers: `cairn wake`, `cairn decide`, `cairn check`. Covers LOOP-001
through LOOP-008, LOOP-017 through LOOP-025, LOOP-027, LOOP-028,
LOOP-030 through LOOP-034, DEC-001 through DEC-007, and DEC-013 through
DEC-016.

First because nothing else works without it, and because a commitment
that can complete itself is the proof that the loop exists.

## 2. Escalation

Delivers: `cairn escalate` and `cairn answer`. One escalation at a time,
format-checked, durable on disk, resolvable by an agent that did not
raise it, and never able to suppress a Blocking decision. Covers
LOOP-009 through LOOP-014 and LOOP-026.

## 3. Scope and the backlog

Delivers: `cairn backlog`, and the footprint check in `check` and
`wake`. Out-of-commitment work captured rather than implemented or
discarded, promoted only by the developer, and a commit outside the
commitment's declared footprint made visible. Covers LOOP-015,
LOOP-016, LOOP-029, and LOOP-035.

## 4. Supersession and the experience log

Delivers: `cairn supersede` and `cairn reversals`. Reversals classified
by cause and never deleted, reversal rate by decider, and every new
decision in a reversed domain accounting for that history. Covers
DEC-008 through DEC-012.

The threshold moves by the agent's recorded judgment, per decision, with
the history in front of it. A formula that moves it from a rate is not
in the specification.

## 5. The specification phase

Ported from Same Page with the four repairs: ambiguity resolved and
recorded rather than asked, falsifiers confirmed by exception, depth
inferred, and the phase ending at the first commitment. Delivers the
skills, and a spec-lint mechanism for PKG-007 and PKG-010. Covers
SPEC-001 through SPEC-017.

Last because the specification phase already works. It needs its
over-asking removed, not a redesign.

## 6. Every commitment satisfies the package

Promoted from the backlog on the developer's word, 2026-09-04.

Delivers: the PKG requirements folded into every commitment's set, so
Done means the package holds too (PKG-011); `scripts/pkg-lint.mjs`, a
mechanism for the PKG requirements a program can observe; and PKG-003
revised to name what a concept is, so it can be observed at all. Covers
PKG-001 through PKG-013.
