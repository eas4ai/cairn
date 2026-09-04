commitment: the-record-and-the-wake
commit: e334d55
examined:
  - every spawnSync call, for shell dependence and for what happens when the child fails to start
  - assess(), for work repeated per requirement that is per mechanism
  - check with named requirements, for what happens to a name no mechanism claims
  - the review staleness rule, for whether committing the review record itself stales the review
  - shell true on the mechanism command, against the threat-model decision record
  - stamp() under two runs in one millisecond
  - the in-progress record when check runs inside an agent's own in-progress action
  - DEC-016's timestamp comparison, for lexical ordering of ISO strings
findings:
  - open: check creates the evidence directory by spawning mkdir; a node-only kernel uses mkdirSync
  - open: assess recomputes the inputs digest and re-reads every escalation once per requirement; 35 requirements on one mechanism means 35 identical digests of bin/ and tests/
  - open: check REQ for a requirement no mechanism claims is silently dropped; the output should say it was skipped
  - open: the review goes stale when HEAD moves, so committing the review record itself stales the review; it must go stale the way evidence does, when a declared input changes since the commit it examined (LOOP-024 applied to reviews)
