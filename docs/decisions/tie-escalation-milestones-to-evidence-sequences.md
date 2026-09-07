# Tie escalation milestones to evidence sequences

Level: Judged
Decided by: agent
Rests on: LOOP-070 LOOP-051 DEC-016 DEC-019
Would be wrong if: An earlier escalation suppresses new failing attempts after a clock adjustment, or an answer remains fresh after a later check.
History: The record-integrity review reproduced a timestamp comparison left behind by the new receipt ordering. Preserve legacy records, but use explicit sequence milestones for new escalation transitions.

## Decision

Record the current sequence of each concerned requirement when raising an escalation and when recording a developer answer. Compare these milestones with sequenced evidence when deciding whether an escalation covers attempts or an answer is still fresh. Retain timestamp fallback only for comparisons with legacy unsequenced receipts; a missing milestone cannot establish ordering against newer sequenced evidence. No old record is rewritten. A fresh escalation or answer establishes its milestone through the existing commands.

## Realized by

(none yet: recorded, not built)
