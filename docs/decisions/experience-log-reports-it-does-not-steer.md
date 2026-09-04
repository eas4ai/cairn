# The experience log reports; it does not steer

Level: Consequential
Decided by: agent
Rests on: DEC-012, PKG-003
Would be wrong if: reversal rate by decider turns out to predict future
decision quality well enough that leaving it out of the level assignment
costs more escalations than it saves

## Decision

Reversals are permanent, classified, and reported by decider. The level
threshold is not changed automatically from that data.

The independent review listed what automatic tuning needs first: enough
decisions, honestly recorded reversals, consistently classified domains,
a demonstrated correlation with future quality, and a defensible policy
for moving the threshold. None of those exist before the loop has run.

DEC-012 as written already fits: it requires the agent to consult the
history and state what it did with it, which is reporting. The roadmap
said "the level threshold tuned from history," which is control, and it
was out of step with the requirement it summarized. The roadmap now
matches the spec. Adaptive escalation can enter later by naming the
observed failure that forces it, which is the same door every concept
uses.

## Realized by

- 69ee718  Second independent review, reconciled against current
