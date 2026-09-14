# Promote the stale-only check selector

Level: Consequential
Decided by: agent
Rests on: LOOP-023, LOOP-024, LOOP-040, LOOP-087, LOOP-088
Would be wrong if: check --stale runs a mechanism whose requirements all have current evidence, skips one whose requirement wake would name run, or an adopter needs it to rerun fresh failures
History: LOOP carries no reversal in the freshness domain that this option touches. Consequential because it adds an option to the command surface every consumer sees; the level is not raised further because the option adds no record kind and changes no existing behavior.

## Decision

Promotes .cairn/backlog/run-only-stale-mechanisms-without-a-requirement-lookup.md, captured 2026-09-05 from LOOP-023 as the second adoption's request. Drafted requirement, LOOP-094: when check is invoked with --stale, the loop runs each mechanism that speaks for a requirement of the current commitment whose evidence is missing or stale, runs no other mechanism, and runs each selected mechanism once. Falsifier: check --stale runs a mechanism none of whose requirements has missing or stale evidence, runs one mechanism twice, or skips a mechanism for a requirement whose evidence is missing or stale. The participation rule the item asked for: a fresh failure and an unverified result are implement actions in wake's own logic, not stale, so --stale skips them and names implement; LOOP-040 still records every requirement a run speaks for. Mechanism: node-test through tests/check-stale.test.mjs. The last backlog candidate; next-iteration holds four contract changes for the developer.

## Realized by

(none yet: recorded, not built)
