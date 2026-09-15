# Promote the record-writing commands' repository check

Level: Judged
Decided by: agent
Promotes: record-writing-commands-refuse-to-run-outside-a-cairn-repository
Rests on: LOOP-118 LOOP-046 LOOP-087 LOOP-088
Would be wrong if: a developer relies on cairn backlog or cairn decide writing records into a directory that is not yet a Cairn repository, for example before the first roadmap exists
History: Five reversals in this domain; none about the commands' preconditions. Judged: one guard in main, cheap to revert.

## Decision

Promotes .cairn/backlog/record-writing-commands-refuse-to-run-outside-a-cairn-repository.md, captured 2026-09-15 from the audit's A11 under LOOP-046. Drafted requirement, LOOP-118: the loop refuses a record-writing command outside a Cairn repository with the message wake and check give. Falsifier: cairn decide, escalate, answer, backlog, supersede, or reversals in a directory with no docs/spec/roadmap.md or no Git working tree writes a file or exits with a raw error. Mechanism: node-test through tests/robustness.test.mjs. The help and lint commands keep working anywhere, since they read no records.

## Realized by

- 097daa3b9fa0d699f436dc7e50ee19b80291ae2b Record-writing commands run only in a Cairn repository
