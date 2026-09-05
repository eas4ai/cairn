# Cairn -- keystone

Status: Agreed 2026-09-04

This file says what Cairn is and where each part is specified. It holds
no requirements of its own. Each domain spec owns its prefix.

## What Cairn is

Cairn is a cooperative workflow for agent-led software development. It
has two phases with opposite human-involvement profiles.

The **specification phase** produces an agreement. The human and the
agent build the specification together, and the human is necessary here:
the confirm-back conversation is the mechanism, not an approval step
attached to one.

The **loop** executes against that agreement. The agent works alone,
resumes across sessions with no memory of earlier ones, records every
decision it makes above the routine, and stops only for a blocker the
human must resolve.

A cairn is a marker left by someone who was here before, for someone who
arrives with no memory of them. Every artifact this workflow writes
serves that purpose.

## What Cairn is not

Cairn is not the coding agent, and it does not drive one. An agent from
any vendor performs the work. Cairn is the referee that makes that
agent's work durable and resumable: it reads and validates the state on
disk, runs mechanisms, decides freshness, names the next legal action,
and formats decisions and escalations.

That boundary is what keeps Cairn a cairn. An orchestrator that drove
models would need APIs, adapters, retries, credentials, and
harness-specific behavior, which is the road back to an engine.

## The problem Cairn solves

Belief that an implementation matches its specification currently lives
inside an agent session and dies with that session. The next session
rediscovers the relationship between requirement, implementation, and
evidence, or proceeds without it.

Cairn makes that belief durable, so the agent can keep working instead of
stopping to re-establish it.

## Spec map

| File | Prefix | Owns |
|---|---|---|
| glossary.md | -- | Vocabulary. When a term here conflicts with a prior, this wins. |
| specification.md | SPEC | The specification phase: staging, confirm-back, falsifiers, depth. |
| loop.md | LOOP | The loop: on-disk state, wake, verdicts, escalation, freshness. |
| decisions.md | DEC | The decision scale, decision records, supersession, the experience log. |
| package.md | PKG | Distribution, the no-infrastructure rule, the complexity budget. |
| roadmap.md | -- | The ordered commitments. Not normative. |

## Status of this specification

Agreement belongs to each requirement. Its own `Status: Agreed <date>`
line overrides the file header; the header is only a default for blocks
without their own status. Put a block's Status line in the same paragraph
as its requirement and falsifier. An unconfirmed block in an Agreed file
carries `Status: Draft` or `Status: Observed` explicitly. A file with
`Scope: every commitment` in its header contributes its Agreed blocks to
every commitment, regardless of its requirement prefix.

Agreed 2026-09-04. The developer reviewed every requirement and its
falsifier by exception, after one self-review and two independent
reviews, and corrected none. Seven requirements drawn from two papers
later that day were presented the same way and confirmed the same way. A later requirement is Draft until the
developer confirms it and its falsifier; the loop MUST NOT treat a Draft
requirement as contract.

LOOP-036 was drafted from the backlog on 2026-09-04, presented with its
falsifier, and confirmed the same way. PKG-014 was drafted the same day
on the developer's instruction to fix the remaining backlog items, its
falsifier open to correction by exception.
