# Decisions and the record

Status: Agreed 2026-09-04
Prefix: DEC

Normative.

## Why the scale exists

Escalating a decision moves it from the party with the context to the
party without it. The agent wrote the code; the developer did not.
Escalation is therefore not automatically the safe choice, and the scale
exists to keep the decision with whoever can make it well.

## The scale

The agent takes the first level that fits.

| Level | Test | Action |
|---|---|---|
| Routine | The specification, the conventions, or common practice determines it. | Decide. No record. |
| Judged | A real alternative exists, reversal is cheap, and it is inside the commitment. | Decide. Write the record. |
| Consequential | Reversal is expensive, or it crosses the project boundary. | Decide. Write the record. Add to the review queue. |
| Blocking | It changes what gets built, needs a fact only the developer holds, is irreversible and externally visible, or the agent has no recommendation. | Stop. Escalate. |

[DEC-001] The agent MUST assign a level to every decision that has an
alternative.
Falsifier: a decision record exists with no level.

[DEC-002] The agent MUST stop for the developer only at Blocking.
Falsifier: the agent stops for a decision it had a recommendation for,
that was cheap to reverse, and that was inside the commitment.

[DEC-003] The agent MUST write a decision record at Judged and above.
Falsifier: a decision with a real alternative and a reversal cost appears
only in the code.

[DEC-004] The agent MUST add a Consequential decision to the review
queue and MUST NOT wait for the developer to read it.
Falsifier: the loop pauses for a decision it classified Consequential.

[DEC-016] When three consecutive attempts at a requirement produce no
new passing evidence, the agent MUST classify the next decision about
it Blocking.
Falsifier: a requirement's evidence history shows four or more
consecutive failing records with no escalation between them.
Status: Draft

Repair is bounded or it is a spin. This trigger was agreed in the
design conversation and never reached the specification; Proof-or-Stop
names the failure as its scenario B10, repeated retry with no progress.
On confirmation, "not converging" joins the Blocking row of the scale.

## The review queue

The queue exists so that a Consequential decision reaches the developer
without stopping the agent.

[DEC-013] The review queue MUST be durable on disk.
Falsifier: a Consequential decision is surfaced only in a session
transcript.

[DEC-014] A decision MUST stay in the review queue until the developer
marks it reviewed.
Falsifier: a decision leaves the queue without the developer acting on
it.

[DEC-015] The agent MUST NOT wait on the review queue.
Falsifier: the loop stops because the queue is not empty.

## The record

[DEC-005] A decision record MUST name what it rests on, who decided it,
its level, and what would make it wrong.
Falsifier: a decision record exists with no invalidation condition.

[DEC-006] A decision record MUST point at the commits that realized it,
by identifier and by subject line.
Falsifier: a decision record names a commit by identifier alone and the
identifier no longer resolves.

The commit identifier moves under rebase and amend. The subject line is
what makes a dead pointer recoverable, and what makes the record
readable without running git.

[DEC-007] A decision record with no commits MUST be treated as a
decision made and not yet built.
Falsifier: the agent reports a commitment as complete while a decision
record for it names no commit.

## Supersession

[DEC-008] A decision record that supersedes another MUST name its
predecessor.
Falsifier: two decision records contradict each other and neither names
the other.

[DEC-009] A decision record that supersedes another MUST classify why
the earlier decision failed, as one of: the stated condition occurred;
an unforeseen condition occurred; it was wrong when it was made; its
premise was false.
Falsifier: a supersession records that a decision changed and not why.

Only the last three teach anything. The first means the record worked as
designed.

[DEC-010] The agent MUST NOT delete a reversal.
Falsifier: a decision record's history shows a decision changing with no
record of the earlier one.

## The experience log

The records accumulate into a measurement of judgment, not just a list of
changes.

[DEC-011] The agent MUST record who decided each reversed decision.
Falsifier: the reversal rate cannot be computed separately for decisions
the agent made and decisions the developer made.

[DEC-012] A decision record in a domain that carries prior reversals
MUST state what the reversal history changed about its level.
Falsifier: a decision record exists in a domain with prior reversals and
does not refer to them.

The rule binds where records already exist. Requiring a Routine decision
to record that it consulted the history would make Routine decisions
produce records, which is the cost this level exists to avoid.

The threshold between deciding and escalating is then empirical, per
project and per domain, rather than fixed by this specification.
