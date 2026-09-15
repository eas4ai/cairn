commitment: the-hooks-find-the-kernel-and-the-project
commit: 9d5fd0a
examined:
  - mechanism review, PKG-004 revised to 1600: scripts/pkg-lint.mjs counts the lines of bin/*.mjs and reports when the count exceeds 1600, the number the revised falsifier names; the violating example (a count above the ceiling) was observed by the second audit's enforcement pass at 1500 and only the number changed. The lint counts .mjs files where the falsifier says "the files under bin/"; commitment 4 aligns the lint to the falsifier (audit-2 D10). No mismatch for the files bin/ holds today, all .mjs.
  - PKG-033: the PATH scan reads the hook's own environment, so a harness that runs hooks with a reduced PATH falls back to the link's target and then to this checkout, and the session-start line says which; a directory named cairn on PATH is skipped; a wrapper or copy runs as itself and a .mjs target runs under node.
  - PKG-034: a link whose target is a directory exists and is kept, the hook judges with its own kernel and says nothing, and the agent's own cairn fails loudly, so nothing is silenced; a symlink loop resolves to nothing and is replaced, as before.
  - PKG-035: the walk stops at the Git toplevel, so a roadmap above the working tree is not a project; a cwd that does not exist is one stderr line.
  - PKG-036: a verdict is the first line of standard output, which every kernel prints; a kernel that rejects --root or crashes is reported by its first stderr line and never blocks.
  - PKG-019 and PKG-022: the link block has its own try, so a read-only bin directory, a HOME without write permission, or a file at the link's directory prints one line and the verdict; a missing git is one line in both modes.
  - the evidence history holds one failing node-test record under this commitment (the stale check ran after the declaration named PKG-033 to PKG-036 and before their tests existed); the pass at a1c9240 follows it, and the order is the honest one.
  - each new hook test was run against the hook before the change: six failed there.
findings: []

## Mechanism review at 98d655c, 2026-09-15

Recorded before any code change in this commitment.

## Commitment review at 9d5fd0a, 2026-09-15

PKG-033 through PKG-036, PKG-018, PKG-019, PKG-021, PKG-022 and the
revised PKG-004 have current passing evidence; 450 tests pass, both
lints clean, the kernel at 1507 of 1600 lines under the superseding
decision the-complexity-ceiling-is-1600-lines, which waits in the
queue for the developer. Attacked as listed under examined. No open
finding.
