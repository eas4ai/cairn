# The loop's receipts outnumber its code by four to one

Changes: LOOP-023
Outside because: the receipts are what LOOP-023 and LOOP-110 require of this commitment, so changing their number is a contract change and the developer's; this commitment keeps paying them and reports the cost
Captured: 2026-09-18T07:25:05.099Z

One commitment produced 248 commits, of which 39 touch bin/ or tests/ and about 150 are receipts the agreement requires: commit before each check, commit the evidence after it, record the review, explain each allowed stop. That is roughly six commits per review round, and a commitment with many rounds buries its own code in them. The developer said so on 2026-09-18: 248 commits for one commitment reads as damage even when nothing is damaged. Options for the next specification: batch a check's evidence with the change it verifies rather than committing them separately; let one commit carry several checks; keep stop records out of the loop's own history, in the Git directory beside the refusal counter; or write receipts to a branch the release never carries. Any of these changes LOOP-023 and LOOP-110, which is why it waits here. The counter-argument to record is that each receipt is what lets a reader audit a gate decision afterwards, and squashing them is unsafe because review records and receipts name commit hashes.
