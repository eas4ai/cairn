# Roadmap

Status: Agreed 2026-09-04. Not normative.

Order lives here. Filenames carry meaning, never sequence.

Current: the-record-and-the-wake

LOOP-020, review before completion, and every PKG requirement apply to
every commitment rather than to one.

Cairn bootstraps on itself: its own specification is the input to its
own loop, so the loop is built before the specification phase is ported.

## 1. The record and the wake

The state on disk, and the ability to reconstruct a position from it.

Delivers: `cairn wake` and `cairn decide`. A roadmap, a current
commitment, and decision records that an agent with no memory can read
to learn what is done, what is in progress, and what remains. Covers
LOOP-001 through LOOP-003, LOOP-018, LOOP-019, LOOP-021, LOOP-022,
LOOP-027, LOOP-028, DEC-001 through DEC-007, and DEC-013 through
DEC-015.

This is first because nothing else works without knowing where state
lives, and because resumability is the constraint that shapes every
later decision.

## 2. Evidence and freshness

Mechanisms, their results, and whether a result still describes the code.

Delivers: `cairn check`. Verdicts classified by who acts next, and
stale evidence that the agent resolves without asking. Covers LOOP-004
through LOOP-008, LOOP-017, and LOOP-023 through LOOP-025.

## 3. Escalation

The format, the format check, and the queue.

Delivers: `cairn answer`. One escalation at a time, durable on disk,
resolvable by an agent that did not raise it. Covers LOOP-009 through
LOOP-014 and LOOP-026.

## 4. Scope and the backlog

Delivers: out-of-commitment work captured rather than implemented or
discarded, and promoted only by the developer. Covers LOOP-015,
LOOP-016, and LOOP-029.

## 5. Supersession and the experience log

Delivers: reversals classified by cause, reversal rate by decider, and
every new decision in a reversed domain accounting for that history in
its level. Covers DEC-008 through DEC-012.

The threshold moves by the agent's recorded judgment, per decision, with
the history in front of it. That is the whole mechanism. A formula that
moves the threshold from a rate is not in the specification; if a
failure ever forces one, it enters the way every concept does, through
PKG-003.

## 6. The specification phase

Ported from Same Page with the four repairs: ambiguity resolved and
recorded rather than asked, falsifiers confirmed by exception, depth
inferred, and the phase ending at the first commitment. Covers SPEC-001
through SPEC-012.

Last because the specification phase already works. It needs its
over-asking removed, not a redesign.
