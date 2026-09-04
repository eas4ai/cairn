# Git and files are the store; no database

Level: Consequential
Decided by: developer
Rests on: PKG-001, no infrastructure the developer must provision
Would be wrong if: the experience log grows to a size where reversal
history cannot be read on wake without a query

## Decision

Cairn stores state as files in the project repository. No database.

The developer ruled that a database is an infrastructure requirement and
therefore not an option. Git additionally supplies ordering, authorship,
and history for free, and the decision records depend on pointing at
commits, which is only meaningful inside the repository.

## Realized by

(none yet: recorded, not built)
