# Match historical inputs with Git pathspecs

Level: Judged
Decided by: agent
Rests on: LOOP-024, LOOP-032
Would be wrong if: A valid input pattern selects different paths at one commit and its unchanged working tree
History: The earlier reversal keeps a commitment able to complete from its own deliverables. This repairs a concrete final-review finding in the already delivered input digest, without introducing another reporting or digest format.

## Decision

Use ls-files --with-tree to select historical paths with the same Git pathspec rules as current input selection. Intersect that selection with the actual historical ls-tree entries so paths added only in the current index cannot enter the old digest. Read the selected objects in the existing cat-file batch. This preserves binary and link content, includes historical deletions, and supports wildcard and magic pathspecs without writing a temporary index. Use diff-tree pathspec matching for the footprint too, so deleting a file covered by a wildcard remains inside its declaration.

## Realized by

(none yet: recorded, not built)
