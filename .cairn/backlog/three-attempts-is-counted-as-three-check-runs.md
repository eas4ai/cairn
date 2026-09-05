# Three attempts is counted as three check runs

Surfaced from: DEC-016
Captured: 2026-09-05T13:00:02.000Z

assess() counts the last three records failing regardless of whether anything changed between them. Three checks at one commit escalate; a full check while one requirement is worked on pushes every other toward escalation; the adoption skill's baseline check is attempt one. Item 2; drafted as DEC-017 and DEC-018.
