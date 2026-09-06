commitment: evidence-remains-tied-to-the-checked-state
commit: c53ef3f
examined:
  - Mechanism construction against the original kernel at c53ef3f: 38 focused tests ran, 35 failed on the reported behaviors and three existing-behavior controls passed. No command startup error was mistaken for a caught product assertion; the deletion/submodule cases asserted the unwanted fatal exit explicitly.
  - The original failures covered changing inputs and HEAD, executable and link kind identity, both missing and corrupt logs, absent receipt output fields, concurrent ownership, malformed declarations, unsupported gitlinks, and 206 Git processes for 100 identical input lists.
  - During implementation, four additional failing probes exposed inconsistent Unicode path ordering, Git flags hiding uncommitted contents or modes, and a live legacy kernel action. Each failure was observed before its correction. Separate-worktree execution and error cleanup were successful controls.
  - The focused corrected suite reached 43 passing tests before the final declaration-validation refactor. Committed-tree evidence and the final review are still required.
findings:
  - open: examine the finished implementation after committed passing evidence
