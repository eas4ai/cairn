commit: e5097ae
examined: Help dispatch, command reference, command validators, and README/manual guidance.
verification:
  - The new help test failed against the old CLI with exit 3 and an unknown-option error; it passes after implementation.
  - All 176 tests and both lints pass through the committed-tree check. The check requested this review after all requirements passed.
  - Tested both help flags for all eight commands outside a repository, with a nonexistent --root. Help returns identical stdout, empty stderr, and exit 0; no files are created. Unknown options still fail, and -- preserves literal arguments.
  - Inspected the actual help output from outside the project. Compared command options and descriptions against main, decide, escalate, answer, backlog, and reversals. Decision levels and reversal causes come from the existing constants.
  - Help returns immediately after argument parsing, before root lookup, repository checks, or command dispatch. Existing command execution remains unchanged.
  - Reviewed the change against the production coding rules. Plain-text output, no new dependencies, no repository mutations, and no open finding.
findings:
  - none
