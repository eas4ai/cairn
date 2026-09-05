# A result line is a mechanism's statement about one requirement

Level: Consequential
Decided by: agent
Rests on: LOOP-034, LOOP-037, LOOP-038, LOOP-039, LOOP-040
Would be wrong if: a mechanism that prints a result line by accident, in ordinary output, changes a record; the form is anchored to the whole line and to identifiers the mechanism speaks for, and a record carries which rule wrote it, so an accident is visible in the receipt
History: the LOOP reversal moved check into the first commitment so it could finish, and the DEC reversal was about the experience log steering; neither bears on what a record means, and this stays Consequential on its own weight

## Decision

An evidence record was the exit code of a command, fanned to every requirement the mechanism claimed. It is now the mechanism's own statement about one requirement when the mechanism makes one, as a line cairn: REQ-ID: pass or cairn: REQ-ID: fail on its standard output, the marker being what keeps a suite's own output from reading as a verdict, and the exit code's statement when it makes none. A line for a requirement the mechanism does not speak for is ignored and named. Two lines for one requirement are one statement, and a fail on either is a fail. A mechanism that prints no line is read by its exit code for every requirement, which is what every mechanism was before this record and is the transition: an existing mechanism's output earns nothing new. A mechanism that prints a line for one requirement and none for another leaves the other unverified, a result of its own, so a run that aborted after the host checks keeps the host passes and neither passes nor fails the assertions it never reached; unverified is not an attempt. The record says which rule wrote it in a source: field, so a receipt can be checked against the output that produced it. A targeted check selects which mechanisms run and records every requirement each of them speaks for, because the run is real evidence for all of them. The first adoption collapsed thirteen mechanisms into one aggregate to fit a kernel that gave a mechanism one result, and the second discarded twelve real results by naming one requirement. Consequential because every consumer's evidence is read by the new rule, and because it edits what a cemented requirement, LOOP-034, means by result.

## Realized by

- 974e093  The verdict is per requirement
