# The complexity ceiling is 1600 lines

Level: Consequential
Decided by: agent
Supersedes: complexity-ceiling-1500-lines
Cause: an unforeseen condition occurred
Rests on: PKG-004
Would be wrong if: the kernel grows past 1600 lines without a further audit-driven need, or a reviewer finds that the lines added since 1500 duplicate paths the kernel already had
History: The ceiling was set at 1500 lines by complexity-ceiling-1500-lines when the kernel held about 1200; no reversal in this domain since. This record supersedes it under the deference the-second-audit-is-remediated-on-the-developer-s-direction and is queued for the developer's review.

## Decision

The two audits of 2026-09-15 required gates the kernel did not have: repository checks before every command, per-mechanism standings, the record readers that refuse or repair every shape, the contract gate over the activation commit, the include files and demoted requirements, and the hooks' resolution of the kernel and the project. At 1496 lines of 1500 the hooks cannot take the twelve lines PKG-033 to PKG-036 need. The ceiling moves once, to 1600, so that the audit's findings are fixed without moving help text out of bin/ or folding code into fewer lines for the count alone. The count stays the ceiling's purpose: a reviewer who finds duplicated paths reverses this record.

## Realized by

(none yet: recorded, not built)
