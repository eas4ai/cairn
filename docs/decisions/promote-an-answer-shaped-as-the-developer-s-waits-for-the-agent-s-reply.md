# Promote an answer shaped as the developer's waits for the agent's reply

Level: Consequential
Decided by: agent
Promotes: answer-during-the-agent-s-turn-stores-any-caller-s-text-as-the-agent-s-reply
Rests on: LOOP-135 LOOP-048 LOOP-049 LOOP-050 LOOP-087 LOOP-088
Would be wrong if: an agent's explanation to an ask legitimately begins with the word ok, instead or ask followed by text; then the refusal would block a genuine reply until it is reworded
History: Five reversals in the decision domain; none about the escalation conversation. Consequential: it changes what the answer command accepts, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/answer-during-the-agent-s-turn-stores-any-caller-s-text-as-the-agent-s-reply.md, captured 2026-09-17 from the kernel review's finding 3. Drafted requirement, LOOP-135: while an escalation waits for the agent's reply to an ask, the loop refuses an answer shaped as the developer's (ok, instead, or ask followed by text), names whose turn it is, and writes nothing. Falsifier: during the agent's turn, cairn answer <slug> ask B writes a Reply: line, or the turn returns to the developer. Mechanism: node-test through tests/escalate.test.mjs. Chosen third because the trap is silent: the developer's refinement is presented back as the agent's explanation and the first ask is never answered.

## Realized by

(none yet: recorded, not built)
