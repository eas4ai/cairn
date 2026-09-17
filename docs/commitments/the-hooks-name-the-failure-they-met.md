# The hooks name the failure they met

Slug: the-hooks-name-the-failure-they-met
Requirements: PKG-041
Inherits: every PKG requirement
Promoted from: the-hooks-hang-at-a-root-toplevel-hide-a-failed-spawn-and-misname-a-vanished-cwd
Status: Agreed 2026-09-17 by promotion promote-the-hooks-name-the-failure-they-met

## Goal

When a hook fails, the developer reads the real cause: a vanished
working directory is named as one, and a hook entry whose shared hook
cannot start says so instead of exiting quietly.

Promoted from the backlog on 2026-09-17 by the decision named above,
from the kernel review the developer requested. Consequential: it
changes what a hook prints on failure.

## Deliverables

- bin/hook.mjs: the working directory from standard input is checked
  before git is spawned in it, and a missing one is the error line;
  the walk from the working directory to the Git toplevel ends at the
  toplevel or at the filesystem root by construction.
- bin/hooks/stop.mjs and bin/hooks/session-start.mjs: when spawnSync
  reports an error, one line on standard error names it, and the exit
  is 0.
- tests/hooks.test.mjs: a cwd on standard input that was removed
  yields exit 0 and one stderr line naming the directory, not git.
- tests/plugin.test.mjs: each Muse entry copied beside no hook.mjs
  prints one stderr line naming the missing file and exits 0.

## Tests

- a vanished cwd is named as the failure, and git is not blamed
  (PKG-041)
- a Muse entry whose shared hook is missing prints one line and exits
  0 (PKG-041)

## Done when

- PKG-041 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
