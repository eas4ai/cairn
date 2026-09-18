DECISION

Question:   For the next review round, which this gate requires whatever we decide: should I keep fixing every finding it returns, or fix only a silent loss and record the rest as accepted limits so 0.7.0 ships?
Recommend:  Fix only a silent loss, where a real finding disappears from the gate with nothing named, and record any blocked or wording finding as an accepted limit in the review and in next-iteration, then reach Done and cut 0.7.0.
Because:    Twenty-seven rounds are carried. Rounds 23 to 27 each found a silent loss, so the rounds are not wasted, but roughly half of each round's findings are created by the previous round's fix, and there is no downward trend: 92 report findings, 150 review entries. A silent loss breaks the promise that Cairn names what it refuses, so it must be fixed. A blocked or wording finding costs the developer a message, not a lost defect, and it can be recorded honestly and read by the next reviewer. The structural end to the whole class is already captured for the next spec phase: Cairn writing and reading its own records instead of parsing prose another agent wrote.
If wrong:   If I keep fixing everything, the loop may run for several more rounds at roughly forty minutes each, and each fix can create the next round's finding. If I stop at silent losses only, 0.7.0 ships with named limits: a report can be refused for an honest section title, and a finding written as prose under an unrelated heading is read as a note, both already recorded.
Instead:    Say instead keep fixing everything and I will run each round to exhaustion, or instead stop now and I will raise the remaining findings as limits at the next round's report without fixing any of them.

Reply: ok | instead | ask. If this isn't clear, ask me to explain it another way before you decide.

Concerns: LOOP-020
Raised: 2026-09-18T00:21:25.116Z
Raised after: LOOP-020=124
