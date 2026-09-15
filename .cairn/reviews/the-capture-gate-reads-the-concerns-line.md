commitment: the-capture-gate-reads-the-concerns-line
commit: 1420fc2
examined:
  - captureVerdict's new condition, limited to items with a Changes: line, and the LOOP-090 route end to end in tests/continuation.test.mjs, red before the change and green after.
  - the second audit, docs/audit/2026-09-15-audit-2.md, against the gate this commitment built and the LOOP-114 gate it shares a route with: findings A1 and A2.
findings:
  - open: the capture gate and the LOOP-090 gate accept an escalation raised before the commitment began, in any earlier commitment, when its Concerns line names the requirement (audit-2 A1, A2); the condition the promotion record wrote under Would be wrong if has occurred.

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

## Review at 1420fc2, 2026-09-15

The second audit (docs/audit/2026-09-15-audit-2.md) reproduced the
condition this review called unlikely: an escalation from an earlier
commitment that names R-001, answered `instead keep R-001 exactly as
written`, silences both the capture gate built here and the LOOP-090
gate it shares its route with. In this repository every answered
escalation names LOOP-091. Recorded as the open finding above, to be
resolved as its own work: an escalation covers a change or a capture
only when this commitment's own commits added it.
