# Declare per-requirement reporting before execution

Level: Judged
Decided by: agent
Rests on: LOOP-061 LOOP-062 LOOP-039 LOOP-052
Would be wrong if: A command that never reports a requirement can still grant it a pass or count it as failed in explicit mode.
History: Prior LOOP reversals warn against implicit bookkeeping decisions. The mode is declared before execution and leaves legacy commands unchanged; this stays Judged within the requested repair.

## Decision

An optional results: per-requirement field prevents exit-code inference even when zero accepted markers arrive. Omitted declarations retain existing behavior. Unknown modes are errors rather than silent fallback. Retain exit, signal, spawn error, and stderr separately in the existing receipt; no new command or record kind. Unverified records remain excluded from attempt accounting and cannot satisfy Done. Preserve old evidence unchanged.

## Realized by

(none yet: recorded, not built)
