commitment: the-record-and-the-wake
commit: 65623aa
examined:
  - every spawnSync call, for shell dependence and for what happens when the child fails to start
  - assess(), for work repeated per requirement that is per mechanism
  - check with named requirements, for what happens to a name no mechanism claims
  - the review staleness rule, for whether committing the review record itself stales the review
  - inputsDigestAt(), for a commit that does not exist and for a file deleted since
  - shell true on the mechanism command, against the threat-model decision record
  - stamp() under two runs in one millisecond
  - the in-progress record when check runs inside an agent's own in-progress action
  - DEC-016's timestamp comparison, for lexical ordering of ISO strings
findings:
  - resolved: check creates the evidence directory by spawning mkdir; a node-only kernel uses mkdirSync
  - resolved: assess recomputes the inputs digest and re-reads every escalation once per requirement; computed once in context() and passed in
  - resolved: check REQ for a requirement no mechanism claims is silently dropped; it now prints skipped
  - resolved: the review went stale when HEAD moved; it now goes stale when a declared input changed since the commit it examined, computed from git at that commit
