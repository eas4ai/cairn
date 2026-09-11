# Empty footprint blocks whole declare-before-mechanism window

Surfaced from: LOOP-035
Promoted to: scope-breaches-have-a-recovery-path (2026-09-07, on the developer's word; stamped 2026-09-11 after the commitment reached Done)
Captured: 2026-09-07T15:59:36.822Z

Observed in suprtui: commitment render-core was declared (Current advanced) before its first mechanism existed, so breaches() computed an empty input set and every source path changed since the window base breached. The scope guard then blocked ALL evidence recording for the entire window between declaration and mechanism, including unrelated requirements (UNI-008). A commitment with no mechanism yet has no meaningful footprint; the guard should distinguish declared-but-not-yet-mechanized from mechanized scope.

Captured by Muse in the production checkout; preserved in development for scope-breaches-have-a-recovery-path.
