commitment: escalation
commit: 0c4e81f
examined:
  - the Blocking bypass, for what happens when a field is multi-line: it is flattened and the Malformed line records the fact
  - a second Blocking escalation arriving while one is open: refused, which is one-at-a-time working, and the developer answers the first
  - the slug when the same concern is escalated twice: a counter suffix after an answer
  - answer on a file with no trailing newline
  - the Raised timestamp against DEC-016's lexical comparison
  - the --level flag, for what a value other than Blocking does
findings:
  - open: --level is not validated; any value other than exactly Blocking silently loses the bypass, so a typo in the one flag that protects a Blocking decision is the worst place for silence
