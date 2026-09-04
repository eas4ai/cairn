# No document tells an agent how to run the loop

Surfaced from: LOOP-002
Promoted to: the-working-agreement (2026-09-04, on the developer's word)
Captured: 2026-09-04T21:57:33.266Z

Both skills end with "the loop takes over: cairn wake names the next action," and the kernel names one action per wake. Nothing an agent reads in a consumer repository says what to do with a verdict: act on Resolvable and wake again, stop and present on Escalate, stop on Done; write the in-progress record before changing code (LOOP-022); record a decision at Judged and above; run check only against a committed tree. The in-progress record's format lives only in Cairn's own commitment plan. So an agent that has never read Cairn's repository stops after its first action, which is the failure Cairn exists to remove.

The vendor-neutral home is a file the agent reads at wake, such as an AGENTS.md the specification phase scaffolds beside the spec set, or a loop skill installed with the other two. A harness hook that runs wake when the agent tries to stop is a second concept, vendor-specific, and would need its own record under PKG-003 and PKG-006. Promotion is the developer's.
