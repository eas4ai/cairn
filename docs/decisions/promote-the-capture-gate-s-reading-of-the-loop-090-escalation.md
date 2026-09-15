# Promote the capture gate's reading of the LOOP-090 escalation

Level: Judged
Decided by: agent
Promotes: the-capture-gate-accepts-the-escalation-that-names-the-changed-requirement
Rests on: LOOP-119 LOOP-092 LOOP-114 LOOP-087 LOOP-088
Would be wrong if: an old answered escalation about the same requirement silences a capture that deserved its own escalation
History: Five reversals in this domain; none about the capture gate. Judged: one condition in captureVerdict, cheap to revert.

## Decision

Promotes .cairn/backlog/the-capture-gate-accepts-the-escalation-that-names-the-changed-requirement.md, captured 2026-09-15 from the audit's B10 under LOOP-092. Drafted requirement, LOOP-119: when a next-iteration item's Changes: line names a requirement of the current commitment, the loop accepts an escalation whose Concerns line names that requirement as the escalation LOOP-092 requires. Falsifier: a next-iteration item moved under LOOP-090, with the one escalation LOOP-114 asks for and no Outside because: line, is named by wake as a capture to escalate. Mechanism: node-test through tests/continuation.test.mjs. Only a next-iteration item is covered this way; a backlog capture still needs its Outside because: line or an escalation naming its path, since it names no changed requirement.

## Realized by

- 52d0176c61daf8f6cce4a76098bcb50d219d19d0 The capture gate reads the Concerns line
