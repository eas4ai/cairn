# check --stale runs a fourth attempt past the three-attempt gate

Surfaced from: LOOP-094
Changes: LOOP-094
Promoted to: untracked-files-reports-stops-and-stale-checks (2026-09-17, specified in the next-iteration phase on the developer's approval)
Moved: 2026-09-17 from the backlog under the-scope-history-reads-current-as-the-wake-does; check has no attempt gate at all, and refusing a fourth attempt under --stale would skip a mechanism whose evidence is stale, which LOOP-094's falsifier names as a violation, so LOOP-094 needs a clause for DEC-016 before the kernel can honor it
Outside because: found by the kernel review the developer requested on 2026-09-17 after this commitment reached Done; every mechanism of the commitment passes, the case lies outside its falsifiers, and the developer directed that review findings enter the backlog
Captured: 2026-09-17T11:59:28.978Z

bin/cairn.mjs line 1062 adds a mechanism to the run set whenever its evidence is stale. Wake at line 904 names escalate before run when a requirement has three failed attempts at distinct digests and no escalation since (DEC-016). After a kernel upgrade or an input edit, check --stale runs the mechanism and records a fourth attempt at a new digest, bypassing the escalation. LOOP-094 promises --stale runs only what wake would name run for. Found by the kernel review of 2026-09-17, finding 1.
