commitment: the-hooks-name-the-failure-they-met
commit: 2f75c78
examined:
  - the failure demonstration before the fix: with both tests in place and bin/hook.mjs and bin/hooks/ restored to 116b124's parent, the stop hook given a removed directory printed "cannot run git: spawnSync git ENOENT", and a Muse entry beside no hook.mjs printed Node's module-loader stack and exited 1; with the change, both modes print one line naming the directory and exit 0 without a decision, and both entries print one line naming the missing hook.mjs and exit 0. Full suite 479.
  - the walk at a toplevel of /, which no test can build: the loop copied into a script with a toplevel of / and no roadmap anywhere ends after four steps at / and returns null; with a toplevel of /home/x it ends after three steps when dirname leaves the toplevel. The old loop's condition was d === top || d.startsWith(top + "/"), which at top / is always true and dirname("/") is "/", so it never ended. The demonstration on a real repository at / is impractical; the reasoning and the script stand in.
  - a working directory that exists but is a file: the hook prints "cannot run git: spawnSync git ENOTDIR", so git is blamed again for a working directory the harness got wrong. PKG-041 names a directory that does not exist; this is its sibling and the same trap. Finding, below.
  - the entries: a hook.mjs that is present but crashes still prints whatever Node prints under stdio inherit; that is hook.mjs's own PKG-022 duty, which its outer try satisfies, and the entry now exits 0 on a spawn error rather than the child's status. The Claude Code and Codex hooks files run bin/hook.mjs directly and are untouched.
  - the documents: neither the manual nor the README quotes a hook error line, so nothing there needs to change; the hook file's header comment already states the one-line contract.
  - the package: every mechanism re-run after the hook change, every requirement pass; bin/ is 1572 lines against the 1600 ceiling.
findings:
  - open: a working directory that exists but is a regular file is reported as "cannot run git: spawnSync git ENOTDIR"; the hook should name the working directory as not a directory before it spawns git, the same way it names one that does not exist

## Commitment review at 2f75c78, 2026-09-17

The fourth promotion out of the kernel review. Three small repairs to
the surface every installed project meets first. The one part that
cannot be demonstrated, the walk at a toplevel of /, is now bounded
by construction rather than by a condition that happened to hold, and
the review says how it was read. The probe that found the sibling gap
is the finding's own probe with a file in place of a missing
directory.
