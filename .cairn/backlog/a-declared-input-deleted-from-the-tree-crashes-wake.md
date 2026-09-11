# A declared input deleted from the tree crashes wake

Surfaced from: LOOP-027
Promoted to: the-wake-names-an-action-or-refuses (2026-09-05, on the developer's word; stamped 2026-09-11 after the commitment reached Done)
Captured: 2026-09-05T13:00:04.000Z

blob() lstats a path git ls-files returned from the index; absent from the tree it throws ENOENT and wake prints a stack trace instead of a verdict. Item 4; drafted as LOOP-045.
