# An attempt is a failing check at inputs the previous failing check did not see

Level: Judged
Decided by: agent
Rests on: DEC-016, DEC-017, DEC-018
Would be wrong if: a repair that changes no declared input can still change the outcome, which would mean the inputs declaration was incomplete and LOOP-006 governs it
History: the DEC reversal was about the experience log steering and does not bear on attempt counting; this stays Judged because DEC-016 already says attempts and the kernel's reading was the defect

## Decision

The kernel counted the last three records failing, whatever changed between them. Three checks at one commit escalated; the adoption skill's baseline check was attempt one of three on a live project, and a Judged decision reached the developer as Blocking after two real attempts. An attempt is now one distinct inputs digest among the failing records of a streak, where the inputs are the mechanism's declared inputs as the record carries them, a streak runs back from the latest record to the last pass or to the first record, an unverified record neither ends the streak nor counts, a return to a digest already in the streak counts once, and the first record in a requirement's history is the baseline, whose digest is never an attempt. A pass resets the count. A change outside the declared inputs, to documentation or to another mechanism's files, changes no digest and is no attempt. The counter therefore cannot see a failure whose cause is outside the repository, host cache state on the second adoption; that is DEC-019's, an escalation, and the wake says so when it sees three runs at one digest with no attempt since. An escalation concerns every identifier its Concerns line names, not one. Three attempts by that count is the DEC-016 trigger. Runs at one commit are one attempt however many there are.

## Realized by

- 974e093  The verdict is per requirement
