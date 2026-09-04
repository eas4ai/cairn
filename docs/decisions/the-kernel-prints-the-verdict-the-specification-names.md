# The kernel prints the verdict the specification names

Level: Judged
Decided by: agent
Rests on: LOOP-004, LOOP-005, DEC-003
Would be wrong if: the developer supersedes the verdict table in loop.md so that the verdict at which the agent acts is named Resolve, in which case the kernel follows the table again
History: LOOP's one reversal was a plan amended to fit the code; this record does the opposite, the code amended to fit the specification, and stays Judged because reversing it is one word in one file

## Decision

loop.md names the verdict at which the agent acts, unattended, Resolvable: in the verdict table and in the text of LOOP-005. The kernel prints Resolve, and so do its tests and the scope plan that quotes its output. The word was chosen while the kernel was written and recorded nowhere, which is the state DEC-003 forbids: a decision with an alternative that appears only in the code.

The specification is cement, so the code follows it. The kernel prints Resolvable, the tests assert on Resolvable, and the plan that quotes the output is corrected. The alternative, superseding the agreed table to fit code that drifted from it, is the pattern the LOOP reversal warns against: when the code and the contract disagree, fix the code, not the contract.

## Realized by

(none yet: recorded, not built)
