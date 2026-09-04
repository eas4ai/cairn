# Cairn -- keystone specification

Status: Draft
Prefixes: SPEC (specification phase), LOOP (the autonomous loop),
DEC (decisions and the record), PKG (the package itself)

Nothing here is Agreed until the developer confirms it and its
falsifier. A requirement without a confirmed falsifier is a draft.

## What Cairn is

Cairn is a cooperative workflow for agent-led software development. It
has two phases with opposite human-involvement profiles.

The specification phase produces an agreement. The human and the agent
build the specification together, and the human is necessary: the
confirm-back conversation is the mechanism, not an approval step
attached to it.

The loop executes against that agreement. The agent works alone,
resumes across sessions without memory, records every decision it
makes, and stops only for a blocker the human must actually resolve.

A cairn is a marker left by someone who was here before, for someone who
arrives with no memory of them. Every artifact this workflow writes
serves that purpose.

## Vocabulary

**Falsifier.** The observable state that would prove a requirement is
not met. Agreed by both parties when the requirement is agreed.

**Commitment.** One unit of scope, named for its goal. The loop runs
against exactly one commitment at a time.

**Roadmap.** The ordered sequence of commitments. Order lives in the
roadmap, never in a filename.

**Backlog.** Ideas captured but not promoted into a commitment.

**Escalation.** A decision the loop parks because only the human can
make it. Durable, and the loop's resume point.

**Decision record.** The durable record of a decision the agent made,
what it rests on, and what would make it wrong.

## Specification phase

[SPEC-001] The agent MUST NOT record a requirement as Agreed before the
developer confirms its falsifier.
Falsifier: a requirement carries an Agreed marker and no confirmed
falsifier.

[SPEC-002] When the agent meets an ambiguity it can resolve from the
specification, the conventions, or common practice, the agent MUST
resolve it and record the reading, and MUST NOT ask the developer.
Falsifier: the agent asks the developer a question whose answer its own
recorded reasoning already determined.

[SPEC-003] The agent MUST propose the falsifiers for a domain as one
set and MUST ask the developer to correct only the wrong ones.
Falsifier: the agent asks the developer to approve falsifiers one at a
time.

[SPEC-004] The agent MUST infer documentation depth from the project and
MUST NOT ask the developer to choose it before the project's shape is
known.
Falsifier: the agent asks how much documentation is warranted before any
domain is specified.

[SPEC-005] When a term means different things to the developer and the
agent, the agent MUST add the term to the glossary at the first
occurrence.
Falsifier: a term appears with two meanings across the specification and
the glossary does not define it.

## The loop

[LOOP-001] The loop MUST write every piece of its state to disk, and
MUST NOT hold state that exists only in the agent's context.
Falsifier: an agent that resumes with no memory of the previous session
cannot determine what is done, what is in progress, and what remains.

[LOOP-002] On wake, the agent MUST reconstruct its position from disk
before it acts.
Falsifier: the agent begins work without reading the roadmap, the
current commitment, and the decision record.

[LOOP-003] The loop MUST stop for the developer only when the decision
is Blocking, and MUST continue for every other level.
Falsifier: the loop stops for a decision the agent had a recommendation
for, that was reversible, and that was inside the commitment.

[LOOP-004] The loop MUST classify every verdict by who must act next.
Falsifier: a verdict that only the agent can resolve is presented to the
developer.

[LOOP-005] The agent MUST record whether the evidence for a requirement
still holds at the current state of the code.
Falsifier: the loop reports a requirement as met using evidence produced
before a change to the code that requirement governs.

[LOOP-006] Stale evidence MUST be work the agent does unattended.
Falsifier: the developer is asked to act on a verdict whose only cause
is that evidence was produced at an earlier commit.

[LOOP-007] An escalation MUST be durable on disk and MUST carry the
question, the recommendation, the cost of being wrong, and one
alternative.
Falsifier: an escalation exists only in a session transcript, or omits
the recommendation.

[LOOP-008] The agent MUST present one escalation at a time.
Falsifier: the developer receives two open escalations in one message.

[LOOP-009] An escalation that fails the format check MUST return to the
agent and MUST NOT reach the developer.
Falsifier: the developer receives an escalation longer than the format
permits.

## Decisions and the record

[DEC-001] The agent MUST write a decision record for every decision it
makes that is not routine.
Falsifier: a decision with a real alternative and a reversal cost
appears only in the code.

[DEC-002] A decision record MUST name what it rests on, who decided it,
and what would make it wrong.
Falsifier: a decision record exists with no invalidation condition.

[DEC-003] A decision record MUST point at the commits that implemented
it, by identifier and by subject.
Falsifier: a decision record names a commit by identifier alone, and the
identifier no longer resolves.

[DEC-004] A decision record that supersedes another MUST name its
predecessor and MUST classify why the earlier decision failed.
Falsifier: two decision records contradict each other and neither names
the other.

[DEC-005] The agent MUST NOT delete a reversal.
Falsifier: a decision record's history shows a decision changing with no
record of the earlier one.

## The package

[PKG-001] Cairn MUST run with no infrastructure the developer must
provision.
Falsifier: a documented step tells the developer to install or run a
database, a service, or a daemon.

[PKG-002] A new concept MUST NOT enter Cairn without a named failure
that forced it.
Falsifier: a concept exists in the specification and no decision record
names the failure it answers.
