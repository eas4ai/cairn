# The loop stops at Done and never chooses a next-iteration item

Level: Judged
Decided by: developer
Supersedes: an-answered-next-iteration-escalation-chooses-by-its-text
Cause: the premise was false
Rests on: LOOP-091, LOOP-087, LOOP-029
Would be wrong if: the developer asks the loop to pull the next contract change on its own, in which case LOOP-091 is revised again with a rule for how it chooses
History: LOOP-091 now carries one reversal, this one, made by the developer on the day the first text was agreed: the premise that the loop should ask which next-iteration item comes next was false. Judged: the record names the ruling and the code that follows it; the ruling itself is the developer's.

## Decision

Next-iteration is the next feature specification. When the commitment is complete and the backlog holds nothing to promote, wake reports Done and says how many items wait, as information. It raises no escalation to choose among them and names no specification after an answer. A waiting item starts a new loop the way a new project or a new feature does: the developer opens a specification phase with the project skills, and that phase ends by naming the next commitment. The escalate next-iteration and specify branches leave the wake ending; the two tests that asserted them are replaced by one that asserts Done with waiting items.

## Realized by

- 50672fd6496c8b43dde26f40545738f4a23c0692 The loop stops at Done
