commitment: a-git-that-cannot-start-is-a-refusal-never-a-verdict
commit: 2956d29
examined:
  - the failure demonstration before the fix: with the test in place and the kernel at ab0e332's parent, wake on a PATH whose only git is a file without the execute bit printed "is not a Cairn repository (no Git working tree)", blaming the repository; with the change, wake and check each print one line, "cairn: cannot run git: spawnSync git EACCES", exit 3, print no verdict and record nothing, and the full suite passes at 485.
  - every git spawn in the kernel goes through one helper now: the four direct spawnSync calls (diff-tree, hash-object, and two cat-file batches) were routed through it, and the only spawnSync("git") left is the helper itself; two of those sites still check .error themselves, harmlessly.
  - a git that stops mid-command, probed with a counting wrapper that removes its own execute bit after N calls on a PATH holding only the wrapper and node: for N of 2, 4, 6, 9, 12 and 20, check exits 3 with the one line, prints nothing on stdout, records no receipt, and leaves neither the check lock nor the kernel's in-progress record behind; the lock's finally and the record's finally both run under the thrown error. The probe first had to learn that /bin is /usr/bin here, so a broken wrapper on a PATH with /bin still finds the real git.
  - the hooks: a kernel that exits 3 without a verdict is what PKG-036 already handles, one complaint line and no block, so a stop hook never blocks on a git that cannot start; the hook's own git call keeps its separate "cannot run git" line.
  - the entry point: the thrown error carries no record path, so main's catch prints it through usage, the same channel every refusal uses; nothing new was added there, and bin/ is 1586 lines against the 1600 ceiling.
  - the package: every mechanism re-run after the kernel change, every requirement pass.
findings: []

## Commitment review at 2956d29, 2026-09-17

The one promotion that came from watching the loop run rather than
from the kernel review's list. Three failures in a day that each
passed on rerun had no explanation in their output, and the probe here
shows why: the kernel never said git had failed to start, it said
something else was wrong. Now it says so in one line and stops, at
every point in a check, and leaves nothing behind.

No open finding.
