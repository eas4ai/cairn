# The loop

Status: Draft
Prefix: LOOP

Normative.

## State

The loop's defining constraint. An agent that wakes with no memory must
be able to reach the same place the previous agent left.

[LOOP-001] The loop MUST write every piece of its state to disk, and
MUST NOT hold state that exists only in an agent's context.
Falsifier: an agent that resumes with no memory of the previous session
cannot determine what is done, what is in progress, and what remains.

[LOOP-002] On wake, the agent MUST reconstruct its position from disk
before it acts.
Falsifier: the agent begins work without reading the roadmap, the current
commitment, and the decision records.

[LOOP-003] The loop MUST reach the same position when it is stopped at
any point and restarted.
Falsifier: stopping the loop and restarting it produces work that
duplicates or contradicts work already done.

## Verdicts

Verdicts classify by who must act next, not by how certain the agent is.

| Verdict | Meaning | Who acts |
|---|---|---|
| Proceed | The requirement is met. | The agent, silently. |
| Resolvable | Evidence is missing or no longer describes the code. | The agent, unattended. |
| Escalate | Only the developer can settle it. | The developer. |
| Done | Every requirement in the commitment is met. | The agent stops. |

[LOOP-004] The loop MUST classify every verdict by who must act next.
Falsifier: a verdict that only the agent can resolve is presented to the
developer.

[LOOP-005] The loop MUST treat evidence that no longer describes the
code as Resolvable.
Falsifier: the developer is asked to act on a verdict whose only cause is
that evidence was produced before a later change.

The failure this prevents: a system that reports almost everything as
insufficient after every commit trains the developer to stop reading it.

## Freshness

[LOOP-006] The agent MUST record the state of the code that each piece
of evidence was produced against.
Falsifier: evidence exists with no record of the code it describes.

[LOOP-007] The agent MUST NOT report a requirement as met using evidence
produced before a change to the code that requirement governs.
Falsifier: a requirement reports as met, and the mechanism that checked
it has not run since the code changed.

[LOOP-008] The agent MUST re-run a mechanism whose evidence is stale
without asking the developer.
Falsifier: the loop stops and reports stale evidence to the developer.

## Escalation

[LOOP-009] An escalation MUST be durable on disk.
Falsifier: an escalation exists only in a session transcript.

[LOOP-010] An escalation MUST carry the question, the agent's
recommendation, the cost of being wrong, and one alternative.
Falsifier: an escalation reaches the developer with no recommendation.

[LOOP-011] The agent MUST present one escalation at a time.
Falsifier: the developer receives two open escalations in one message.

[LOOP-012] An escalation that does not meet the format MUST return to
the agent for rewriting.
Falsifier: the developer receives an escalation longer than the format
permits.

[LOOP-013] The agent MUST deliver a Blocking escalation to the developer
even when it cannot be stated in the format.
Falsifier: a decision the agent classified Blocking is decided by the
agent because the escalation failed the format check.

The format check governs how an escalation is written, never whether the
developer sees it. A gate protecting the developer's attention must not
be able to override the developer's authority.

[LOOP-014] The agent MUST resume from an escalation using the record and
the developer's answer, and MUST NOT require the session that raised it.
Falsifier: an escalation cannot be resolved by an agent that did not
raise it.

## Scope

[LOOP-015] The agent MUST write work that falls outside the current
commitment to the backlog and MUST NOT implement it.
Falsifier: the loop implements something no commitment includes.

[LOOP-016] The agent MUST NOT discard work it declined to implement.
Falsifier: the agent identifies out-of-scope work and no artifact
records it.

## Commitments

[LOOP-018] A commitment MUST name the requirements it includes.
Falsifier: a commitment exists and the set of requirements it covers
cannot be determined from it.

[LOOP-019] The agent MUST work against exactly one commitment at a time.
Falsifier: the loop produces work for a commitment other than the current
one.

## Completion

[LOOP-017] The loop MUST report a commitment complete only when every
Agreed requirement in it has current evidence that it is met.
Falsifier: a commitment reports complete while one of its requirements
has no evidence, or has evidence that predates a later change.
