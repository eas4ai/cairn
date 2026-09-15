# The hooks run the linked kernel and the gates read record fields

Level: Consequential
Decided by: agent
Rests on: PKG-019 PKG-021 PKG-022 LOOP-114 LOOP-115 LOOP-116 LOOP-117 LOOP-089 LOOP-088 LOOP-035 PKG-003
Would be wrong if: a consumer keeps two checkouts on purpose and wants the hook to judge with its own, or a promotion record written before the Promotes line is the current commitment's and cannot be re-recorded
History: Five reversals in this domain; the one about hooks (cairn-installs-by-one-link-script-with-no-plugin-and-no-hook, superseded on the developer's ruling) settled that hooks ship; this decision changes which kernel a hook runs, not whether it runs. Consequential: it changes install behavior consumers see and adds a decision-record line.

## Decision

The 2026-09-15 audit found that bin/hook.mjs builds the kernel path from URL.pathname, so a checkout path with a space links a dangling command and the stop hook silently stops blocking; that the hook always runs its own checkout's kernel while the agent runs the cairn on the path, so two checkouts disagree forever on the kernel digest; that a non-object stdin or a file at HOME/.local/bin throws a stack trace; that the LOOP-089/090 gate and the LOOP-088 promotion check are satisfied by the slug or item appearing as a substring in any escalation or decision text; that the activation commit of a promoted commitment is outside the LOOP-089 comparison; and that breaches() exempts every path under docs/ where LOOP-035 says records. Decisions, on the developer's direction of 2026-09-15 and the plan's recommendation R5: the hooks resolve their own path with fileURLToPath and run the kernel that HOME/.local/bin/cairn resolves to when that link exists, so hook and agent share one referee (LOOP-096), replacing a dangling link and reporting a link to another checkout; on any error a hook exits 0 with one line on stderr. The LOOP-090 escalation is recognized by a Concerns line naming every changed requirement, LOOP-036 standing for the working agreement; the promotion record is recognized by a Promotes: header line, which cairn decide writes from --promotes (a record line, named here for PKG-003); the LOOP-089 comparison reads the tree before the activation commit; the footprint exempts only Cairn's records under docs/, the working agreement and its include, .gitignore, and .cairn/. In this repository docs/manual.md, docs/walkthrough.md, and docs/audit/ are declared by pkg-lint, so no breach appears here; a consumer whose docs/ holds deliverables gains the check.

## Realized by

- 439ab0e61b9ced61bed15ade00ed82d58a5b9e31 The hooks and gates judge by records
