# Cairn ships a next-iteration skill for the phase between loops

Level: Consequential
Decided by: agent
Rests on: SPEC-012 SPEC-026 SPEC-027 LOOP-091 PKG-003
Would be wrong if: the phase between loops turns out to need the codebase read before it can draft, in which case the recon stage of existing-project returns as a stage of this skill
History: Five reversals in this domain, two of them on 2026-09-14 about what happens at Done: the loop was first told to ask which next-iteration item comes next, then told never to choose one. Both reversed decisions made the loop do at Done what the developer does. This decision adds no move at Done for the loop; it ships the phase the developer opens. Consequential rather than Judged because it is a shipped skill consumers install, and because the two same-day reversals say the developer wants to read what happens at Done.

## Decision

The loop stops at Done and the developer opens the next specification phase (LOOP-091). The two shipped phases are new-project, which designs software that does not exist, and existing-project, which adopts a codebase: it reads manifests, entry points, data, tests, and history before asking anything, writes a cited recon report, and verifies the whole spec set against the code. A project already under Cairn has an Agreed specification; the next commitment starts from that, and the codebase is read only where an item's blast radius touches it. Running existing-project for a next iteration repeated the adoption twice (2026-09-07 and 2026-09-14). Decision: ship a third skill, next-iteration, that opens the phase between loops. It starts from the specification and the waiting items, restates each change, revises the named requirement in place with a Revised note, drafts new requirements with falsifiers as one set, reviews before agreement, ends by naming the next commitment, and stamps each item it carries. Record kinds it names (PKG-003): the commitment file's Specified from: line, which names a next-iteration item the way Promoted from: names a backlog item, and which the kernel reads to require the item's Promoted to: stamp (SPEC-027). Alternative: keep existing-project as the route and add a shortcut to its Stage 0; rejected because that skill's rules 9 to 11 and its stages are about deriving Observed text from code, which this phase does not do. Decided by the agent on the developer's advance deference of 2026-09-14 to the agent's recommendation for the remaining commitments; the review before agreement changed the SPEC-012 draft to name both routes to a later commitment, promotion and the phase, which the developer reads in the queue.

## Realized by

- 1f3d96263086bf40cb32d2cded9126175b8ed87b The next iteration starts from the specification
