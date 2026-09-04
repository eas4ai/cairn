commitment: every-commitment-satisfies-the-package
commit: eb9ab00
examined:
  - the fold's effect on the footprint: pkg-lint's inputs join every commitment's footprint, which is right because PKG is every commitment's
  - the fold called twice on one wake through check: guarded by includes, and currentCommitment is read fresh each call
  - the lint reading decisions from the tracked set only, for what an agent mid-work sees
  - the record-kind regex against every Formats block in every commitment plan
  - PKG-006's vendor regex against the word cursor in ordinary prose
  - PKG-013's rule exemption, for a requirement whose forbidden phrase wraps to a later line
  - the lint's own fixtures, for the character class they exist to catch
findings:
  - open: PKG-003's message says "named by no decision record" when a record exists and is merely untracked; an agent mid-work reads that as a lie; the message should say tracked
  - open: the record-kind regex requires the word record, declaration, file, or item before the comma, so "An escalation, .cairn/escalations/<slug>.md:" in the escalation plan is never checked; match to the first comma
