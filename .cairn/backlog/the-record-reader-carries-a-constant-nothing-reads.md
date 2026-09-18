# The record reader carries a constant nothing reads

Surfaced from: LOOP-020
Outside because: the developer's ruling on escalation loop-020 fixes only a silent loss inside this commitment; this is dead code, not a lost finding, and changing the kernel now would make the release round's review stale and cost another report
Captured: 2026-09-18T10:34:41.702Z

bin/cairn.mjs declares FINDING beside ENTRY in the record reader, and neither the kernel nor the tests ever reads it. It is the last trace of a rule the gate stopped applying when the finding prefix was given to the findings list alone in round 34. Deleting the declaration removes one line and changes no behaviour, and the files under bin/ stand at 1872 against the PKG-004 ceiling of 1900, so nothing is violated while it stays. Found by the thirty-ninth independent report at 3833b02a, finding 5, and reproduced: a search of bin/, tests/ and scripts/ for the name returns only the declaration itself.
