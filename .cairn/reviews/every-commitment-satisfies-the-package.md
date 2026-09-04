commitment: every-commitment-satisfies-the-package
commit: 657bc2c
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
  - the verdict rename, every remaining Resolve token in the tree: two are the verb in the new-project skill and two are history in the decision record; the lowercase action resolve was never a match
  - the exit-code map and the header comment after the rename, and the 96 tests asserting on the printed word
  - pkg-lint's declared inputs against every path its source reads: README.md, tests/, and scripts/spec-lint.mjs were read and undeclared, so a non-ASCII character in a test would not have staled PKG-008; now declared
  - the residual after that: pkg-lint also reads the tracked set and .cairn/ directory names, which are not inputs, so a service manifest added at the root or a directory made by hand under .cairn/ is seen on the next run rather than staling this one; declaring the root would stale the review on its own commit, the failure the first review of this commitment found
  - the README's new status section against LOOP-028: it names the commands and points at cairn wake for where the roadmap stands, and stores no status of its own; the command list can drift from the usage text, and no mechanism compares them
  - the review's own freshness after this record is committed: .cairn/ is no declared input, so committing it does not stale it
findings:
  - resolved: PKG-003's message said "named by no decision record" when a record existed and was merely untracked; it now says tracked
  - resolved: the record-kind regex required an artifact noun, so a kind named by its path alone was never checked; loosening it then matched the sentence "The suite adds," so it is now a noun phrase carrying an artifact noun or followed by its path
  - resolved: the lint read every tracked path and crashed on one deleted from the working tree; it reads only paths that exist
  - resolved: .cairn/in-progress was tracked by an over-broad git add; it is a claim about one working tree, so it is gitignored and the lint reports a tracked one
  - resolved: the kernel printed Resolve where loop.md says Resolvable, a choice recorded nowhere; recorded, and the code follows the specification
  - resolved: pkg-lint read README.md, tests/, and scripts/spec-lint.mjs without declaring them; declared
