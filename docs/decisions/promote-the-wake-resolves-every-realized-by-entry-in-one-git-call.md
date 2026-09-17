# Promote the wake resolves every Realized-by entry in one git call

Level: Consequential
Decided by: agent
Promotes: every-wake-spawns-one-git-process-per-realized-by-entry
Rests on: DEC-023 DEC-006 DEC-021 LOOP-113 LOOP-087 LOOP-088
Would be wrong if: git cat-file --batch-check resolves an abbreviated or peeled object name differently from rev-parse --verify on some Git version in use; then a record judged built today would read as unbuilt after the change
History: Five reversals in the decision domain; none about how entries are resolved. Consequential: it changes how every wake reads every decision record, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/every-wake-spawns-one-git-process-per-realized-by-entry.md, captured 2026-09-17 from the kernel review's finding 9. Drafted requirement, DEC-023: the wake resolves the Realized by entries of every decision record through one git invocation per wake, not one per entry. Falsifier: with git wrapped to log its invocations, a wake over twenty built records invokes git once per entry to resolve them. Mechanism: node-test through the decide or wake tests with a logging git on PATH. Chosen last because it is cost, not correctness: about seventy spawns per wake today, growing with every decision, and the stop hook runs wake at every stop.

## Realized by

- efe6b3e8c87e22ce1398b8b6dd3e19a2c6800cb3 The wake resolves every Realized-by entry through one git cat-file batch (DEC-023)
