# Record-writing commands refuse to run outside a Cairn repository

Surfaced from: LOOP-046
Captured: 2026-09-15T14:29:30.334Z

The audit's A11: decide, escalate, answer, backlog, supersede and reversals skip the repository checks that wake and check perform. In an empty directory, decide exits 3 with a raw ENOENT for docs/decisions/, and backlog creates .cairn/backlog/ there and exits 0. They should refuse with the same message as wake and check, naming the root option, unless the command is help.
