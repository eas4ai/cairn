# A linked input is its target path in both views

Level: Judged
Decided by: agent
Rests on: LOOP-023, LOOP-024, LOOP-006
Would be wrong if: mechanisms routinely read through links without declaring the target, so that a change the mechanism sees leaves its evidence current; then the kernel should follow links to tracked targets in both views
History: LOOP's reversal was a plan that could not finish; this record takes git's own reading of a link so neither view needs a new concept, and stays Judged because the alternative, following links in both views, is a bounded addition if the invalidation condition arrives

## Decision

The kernel digests declared inputs over the working tree for evidence and over a commit for a review's freshness. In the tree it read a symbolic link through to its target's content; git shows a link as its target path. The two views never agreed on a link, so a review that examined one was stale on its own commit, forever.

The tree view now reads a link as its target path, which is the blob git stores, so both views hash the same bytes and no new reading of a commit is needed. A mechanism that reads through a link declares the target as well, as it declares any other file it reads (LOOP-006); a change to the target then stales the evidence through the target's own path.

The alternative was to follow links to their tracked targets in both views. That is more code in the kernel and a second way for a declared input to name a file, for a case no mechanism in this repository has.

## Realized by

(none yet: recorded, not built)
