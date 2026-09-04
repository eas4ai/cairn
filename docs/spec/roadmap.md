# Roadmap

Status: Draft. Not normative.

Order lives here. Filenames carry meaning, never sequence.

Cairn bootstraps on itself: its own specification is the input to its
own loop, so the loop is built before the specification phase is ported.

## 1. The record and the wake

The state on disk, and the ability to reconstruct a position from it.

Delivers: a roadmap, a current commitment, and decision records that an
agent with no memory can read to learn what is done, what is in
progress, and what remains. Covers LOOP-001, LOOP-002, LOOP-003, and
DEC-001 through DEC-007.

This is first because nothing else works without knowing where state
lives, and because resumability is the constraint that shapes every
later decision.

## 2. Evidence and freshness

Mechanisms, their results, and whether a result still describes the code.

Delivers: verdicts classified by who acts next, and stale evidence that
the agent resolves without asking. Covers LOOP-004 through LOOP-008 and
LOOP-016.

## 3. Escalation

The format, the format check, and the queue.

Delivers: one escalation at a time, durable on disk, resolvable by an
agent that did not raise it. Covers LOOP-009 through LOOP-013.

## 4. Scope and the backlog

Delivers: out-of-commitment work captured rather than implemented or
discarded. Covers LOOP-014 and LOOP-015.

## 5. Supersession and the experience log

Delivers: reversals classified by cause, reversal rate by decider, and
the level threshold tuned from history. Covers DEC-008 through DEC-012.

## 6. The specification phase

Ported from Same Page with the four repairs: ambiguity resolved and
recorded rather than asked, falsifiers confirmed by exception, depth
inferred, and the phase ending at the first commitment. Covers SPEC-001
through SPEC-012.

Last because the specification phase already works. It needs its
over-asking removed, not a redesign.
