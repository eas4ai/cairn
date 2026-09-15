# Two mechanisms may prove one requirement, and each must pass

Level: Consequential
Decided by: agent
Rests on: LOOP-056 LOOP-099 LOOP-100 DEC-016 DEC-017 LOOP-094 LOOP-097
Would be wrong if: a consumer's two declarations for one requirement turn out to be a mistake more often than a design, in which case the refusal returns as a warning that names both and the second declaration is ignored until the agent confirms it
History: Five reversals in this domain, none about mechanisms or evidence assessment; the two on 2026-09-14 were about what the loop does at Done. This decision changes what a declaration means to every consumer, which is the project boundary, so it is Consequential and waits in the queue; the history does not raise it to Blocking, because the developer moved the item to next-iteration and then deferred to the agent's recommendation for it.

## Decision

The kernel mapped each requirement to one mechanism, last-wins, and LOOP-056 made the second declaration a refusal by name; the adopter's route was one mechanism that runs both commands. The second adoption had a targeted twenty-run test and a whole-binary ten-run mechanism that both legitimately proved one requirement and had to give it to one. Decision: a requirement may have several mechanisms, and it is met only when each has current passing evidence. The kernel keeps a list of mechanisms per requirement and assesses one standing per mechanism, each with its own latest record, freshness, failing streak, and review of revised text; the wake reads the flattened standings in its existing priority order, so every reason line names the mechanism it acted on as it already does. A requirement with one mechanism keeps its whole history whatever mechanism names its records carry, which leaves every existing consumer's behavior unchanged; with several, each mechanism's history is the records that name it, and every receipt already names its mechanism (LOOP-034, LOOP-097). A check that names a requirement runs every mechanism that speaks for it (LOOP-099); --stale runs the mechanism whose own evidence for the requirement is missing or stale (LOOP-094). Attempts count within one mechanism's records (LOOP-100), so the other mechanism's passes never reset the count and DEC-016 still stops a spin. The requirement-level execution order and prior-history digest of LOOP-070 are unchanged: sequences are allocated per requirement across all of its receipts. No command, record kind, or directory enters Cairn (PKG-003). Alternative: keep the refusal and document the one-mechanism-runs-both route; rejected because it collapses two independent pieces of evidence into one exit code and hides which command failed. Decided by the agent on the developer's advance deference of 2026-09-14 to the agent's recommendation for the remaining commitments.

## Realized by

(none yet: recorded, not built)
