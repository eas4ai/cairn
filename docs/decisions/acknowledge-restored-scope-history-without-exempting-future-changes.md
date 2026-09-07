# Acknowledge restored scope history without exempting future changes

Level: Judged
Decided by: agent
Rests on: LOOP-035 LOOP-048 LOOP-049 LOOP-050 LOOP-051 LOOP-081 LOOP-082 LOOP-083
Would be wrong if: An acknowledgment hides unrestored work, later commits, or a different commitment, or bootstrap skips validation once mechanisms exist.
History: The reversed decision a-commitment-is-done-by-its-own-deliverables tried to weaken completion around a bootstrap gap. Preserve evidence requirements and the scope guard instead. The answered-escalation fix under LOOP-048 through LOOP-051 already provides answer selection; reuse it for scope visibility. Scoped restoration acknowledgment is the separate missing resolution, supported by the earlier verdict-resume backlog. Judged remains appropriate because the developer authorized repairing these defects and only a scope-specific developer ok can acknowledge restored history.

## Decision

Share scope diagnostics between wake and check. With no applicable mechanism, name declaration before scope. Reuse the existing answered annotation for scope actions under LOOP-035. Add an explicit --scope escalation snapshot with commitment activation, HEAD, and exact paths. An ok answer binds that snapshot by digest; only a committed closed answer applies, and only to recorded history whose paths remain restored to the activation tree. Later commits still count even if reverted. Keep ordinary answers unchanged and preserve all incident history.

## Realized by

(none yet: recorded, not built)

- b90c3650b61ebcbab5ecefd7c81302a0dbd2bdc2 Repair scope bootstrap, diagnostics, and restored-history recovery
