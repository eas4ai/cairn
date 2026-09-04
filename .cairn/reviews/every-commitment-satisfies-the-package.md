commitment: every-commitment-satisfies-the-package
commit: 79d26ac
examined:
  - the fold's effect on the footprint: pkg-lint's inputs join every commitment's footprint, which is right because PKG is every commitment's
  - the fold called twice on one wake through check: guarded by includes, and currentCommitment is read fresh each call
  - the lint reading decisions from the tracked set only, for what an agent mid-work sees
  - the record-kind regex against every Formats block in every commitment plan, and against ordinary prose in one
  - PKG-006's vendor regex against the word cursor in ordinary prose
  - PKG-013's rule exemption, for a requirement whose forbidden phrase wraps to a later line
  - the lint's own fixtures, for the character class they exist to catch
  - the lint against a tracked path deleted from the working tree
  - .cairn/in-progress, for whether it belongs in the repository at all
findings:
  - resolved: PKG-003's message said "named by no decision record" when a record existed and was merely untracked; it now says tracked
  - resolved: the record-kind regex required an artifact noun, so a kind named by its path alone was never checked; loosening it then matched the sentence "The suite adds," so it is now a noun phrase carrying an artifact noun or followed by its path
  - resolved: the lint read every tracked path and crashed on one deleted from the working tree; it reads only paths that exist
  - resolved: .cairn/in-progress was tracked by an over-broad git add; it is a claim about one working tree, so it is gitignored and the lint reports a tracked one
