# A consumer's agent runs the checker through cairn lint and the documents say what the code does

Level: Consequential
Decided by: agent
Rests on: PKG-028 PKG-029 PKG-030 PKG-031 PKG-032 PKG-003 PKG-013 PKG-014 LOOP-087
Would be wrong if: a consumer wants the checker without the cairn command on the path, or a harness invokes skills by a name the README does not show
History: Five reversals in this domain; the two about the install (the link script, then the hooks) settled that the checkout on the path is the install. This decision adds one command that runs a script from that checkout. Consequential: a new command consumers see, named here for PKG-003.

## Decision

The 2026-09-15 audit found that the specification skills tell a consumer's agent to run node scripts/spec-lint.mjs, a path that exists only in Cairn's checkout; that the README tells the user to ask for the three phase skills in prose while their disable-model-invocation frontmatter keeps them out of the model's own list, so in Claude Code the prose request finds nothing; that the README states no minimum Node or Git version and no platform; that the deferral scan skips the README, the manual, and the walkthrough; and fourteen stale or contradicting sentences across the spec prose, the roadmap, the glossary, the keystone, the manual, the walkthrough, and the recon report. Decisions, on the developer's direction of 2026-09-15 and the plan's recommendation R4: a cairn lint [DIR] command that runs the shipped checker from the checkout the command resolves to, three lines of kernel, so the skills say cairn lint docs/spec and it works on every machine with the command on the path; the three phase skills keep disable-model-invocation, since the developer opens a phase, and the README and manual show them invoked by name as the agent application invokes a skill; the README states Node 18, Git 2.5, Linux and macOS; the package lint scans the three human documents for deferral language; the walkthrough commits evidence in its blocks and its test asserts a clean tree; the stale sentences are corrected in place and the roadmap gets a top note with pointers where a later section revised an earlier one; docs/spec/draft.md, which holds nothing, is retired.

## Realized by

(none yet: recorded, not built)
