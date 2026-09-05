# Keep escalation turns in the same record

Level: Judged
Decided by: agent
Rests on: LOOP-048, LOOP-049, LOOP-050, LOOP-051, LOOP-014
Would be wrong if: A question can authorize implementation or a later reply erases an earlier turn
History: The earlier reversal requires each commitment to finish using its own deliverables. This conversation change is complete within commitment 13 and does not rely on the later agreement parser; Judged remains appropriate.

## Decision

Keep Answer and Reply turns in order in the same file. The developer uses ok, instead followed by text, or ask followed by text. While an ask awaits the agent, answer accepts the agent explanation as plain text and appends Reply. The next answer belongs to the developer again. Only ok and instead close the escalation. Validate one-line turns and never overwrite a closed answer. Wake presents the open turn before implementation, and carries a newer closed answer when naming a concerned requirement.

## Realized by

- d219628 Keep escalation questions open until the developer decides
