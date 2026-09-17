# An answer shaped as the developer's waits for the agent's reply

Slug: an-answer-shaped-as-the-developer-s-waits-for-the-agent-s-reply
Requirements: LOOP-135
Inherits: every PKG requirement
Promoted from: answer-during-the-agent-s-turn-stores-any-caller-s-text-as-the-agent-s-reply
Status: Agreed 2026-09-17 by promotion promote-an-answer-shaped-as-the-developer-s-waits-for-the-agent-s-reply

## Goal

The escalation conversation never records one party's words as the
other's: while the agent owes a reply, a developer-shaped answer is
refused by name instead of stored as the reply.

Promoted from the backlog on 2026-09-17 by the decision named above,
from the kernel review the developer requested. Consequential: it
changes what the answer command accepts.

## Deliverables

- bin/cairn.mjs answer(): during the agent's turn, a reply matching
  `ok`, `instead <text>` or `ask <text>` is a usage error that says the
  escalation waits for the agent's reply and that the developer's
  answer follows it; the file is unchanged. Other replies are written
  as before.
- tests/escalate.test.mjs: after `ask A`, `answer <slug> ask B` exits
  nonzero, names the agent's turn, leaves the file unchanged and the
  wake still names reply; a plain explanation is then accepted and the
  turn returns to the developer.

## Tests

- a developer-shaped answer during the agent's turn is refused and
  writes nothing (LOOP-135)
- the agent's explanation is still accepted afterwards (LOOP-135)

## Done when

- LOOP-135 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
