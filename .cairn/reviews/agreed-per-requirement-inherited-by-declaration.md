commit: c9ad8ce
examined: Shared status grammar, file header boundaries, explicit Scope inheritance, migration instructions, path lint, and the combined 11-14 runtime changes. All 167 tests and 120 receipts pass, but an isolated review with declared src/* reports stale at its own commit. git ls-tree treats that wildcard differently from git ls-files.
findings:
  - open: Historical input selection must use the same Git pathspec matching as the index before hashing blobs (LOOP-024, LOOP-032).
