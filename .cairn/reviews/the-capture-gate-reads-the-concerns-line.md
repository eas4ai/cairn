commitment: the-capture-gate-reads-the-concerns-line
commit: 4f23b0e
examined:
  - captureVerdict's new condition, limited to items with a Changes: line, and the LOOP-090 route end to end in tests/continuation.test.mjs, red before the change and green after.
findings: []

## Commitment review at 4f23b0e, 2026-09-15

LOOP-119, LOOP-092 and LOOP-114 have current passing evidence; the
suite is 423 passing, both lints clean, the kernel at 1474 of 1500
lines.

Attacked: the condition reads any escalation, open or answered, whose
Concerns names the changed requirement, so an old answered escalation
about that requirement would cover a later moved item; the decision
records that as the condition under which it is wrong, and the
alternative, requiring the escalation to postdate the capture, adds a
sequence comparison the route does not need today. A backlog capture
is not covered, since it names no changed requirement. No open
finding.
