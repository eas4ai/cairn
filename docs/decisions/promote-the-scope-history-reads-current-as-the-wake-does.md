# Promote the scope history reads Current as the wake does

Level: Consequential
Decided by: agent
Promotes: the-scope-history-reads-the-roadmap-s-current-line-with-a-different-grammar-than-the-wake
Rests on: LOOP-134 LOOP-104 LOOP-035 LOOP-087 LOOP-088
Would be wrong if: a project's earlier roadmap revisions carry a fenced Current: example that was meant to be read as the real line; then reading it as an example would start the footprint earlier than intended and name breaches the developer never saw as breaches
History: Five reversals in the decision domain; none about the footprint's start. Consequential: it moves where every scope judgment begins, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/the-scope-history-reads-the-roadmap-s-current-line-with-a-different-grammar-than-the-wake.md, captured 2026-09-17 from the kernel review's finding 2. Drafted requirement, LOOP-134: the loop reads the Current: line of a historical roadmap as it reads the line at HEAD, outside fenced examples; when a historical revision carries more than one Current: line outside fences, the commit counts as activating the commitment when any of them names it. Falsifier: a fenced Current: example below the real line in an earlier roadmap revision moves the footprint's start, so a commit inside the commitment is not checked for scope. Mechanism: node-test through tests/records.test.mjs. Chosen second because a footprint that starts late hides scope breaches and promoted contract changes, the two things the loop exists to catch, and LOOP-104 already permits the fenced example that triggers it.

## Realized by

- 60e1ee96d231105bf97bf3936924392b60d510ca The footprint's walk reads Current: through one fence-stripping reader shared with the wake (LOOP-134)
