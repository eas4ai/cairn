# An answered next-iteration escalation chooses by its text

Superseded by: the-loop-stops-at-done-and-never-chooses-a-next-iteration-item

Level: Judged
Decided by: agent
Rests on: LOOP-091, LOOP-014
Would be wrong if: an ok answer names no waiting item because the recommendation did not spell its slug, and wake escalates again
History: LOOP carries no reversal in the escalation domain. Judged: one matching rule, cheap to change, inside the commitment.

## Decision

After a next-iteration escalation is answered, wake names specify for the chosen item. On ok the chosen item is the first waiting next-iteration slug the Recommend line contains; on instead it is the first waiting slug the answer contains. A next-iteration item carrying a Promoted to: line is not waiting, so a specified item is not chosen twice. When no waiting slug matches, wake names the escalation again, which tells the agent to spell the slug.

## Realized by

- 8596e21a4c40843fdbcf3d7fb8c3463b3864d9b8 Hooks keep the agent in the loop
