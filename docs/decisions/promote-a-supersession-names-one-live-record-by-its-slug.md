# Promote a supersession names one live record by its slug

Level: Consequential
Decided by: agent
Promotes: decide-supersedes-validates-neither-the-slug-nor-a-prior-supersession
Rests on: DEC-022 DEC-008 DEC-010 LOOP-087 LOOP-088
Would be wrong if: a project keeps decision records under another directory or with names outside the slug alphabet and reverses them with --supersedes; then the slug check refuses records the loop itself never wrote
History: Five reversals in the decision domain; none about how a reversal names its target. Consequential: it changes what supersede accepts, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/decide-supersedes-validates-neither-the-slug-nor-a-prior-supersession.md, captured 2026-09-17 from the kernel review's finding 5. Drafted requirement, DEC-022: a supersession names its target by a record slug, lowercase letters, digits and hyphens, that exists under docs/decisions/, and the loop refuses a target that already carries a Superseded by: line, writing nothing. Falsifier: --supersedes ../x reads or rewrites a file outside docs/decisions/, or a second supersession of one record appends a second Superseded by: line. Mechanism: node-test through the decide tests. Chosen fifth because the raw argument reaches the filesystem and a second stamp rewrites the reversal chain DEC-010 says is never lost.

## Realized by

- 56b80db128818ca90c7c6f7a689f0dbb6333bb71 A supersession names one live record by its slug; a second stamp is refused (DEC-022)
