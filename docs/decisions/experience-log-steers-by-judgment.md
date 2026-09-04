# The experience log steers, by recorded judgment

Level: Consequential
Decided by: developer
Supersedes: experience-log-reports-it-does-not-steer
Cause: it was wrong when it was made
Rests on: DEC-012, PKG-013
Would be wrong if: the agent's recorded judgment about reversal history
proves no better than ignoring it, in which case DEC-012 costs a
sentence per decision and buys nothing

## Decision

The level threshold moves by the agent's recorded judgment, per
decision, with the reversal history in front of it. DEC-012 requires
every new decision in a reversed domain to state what that history
changed about its level. That is the complete mechanism, and it is in
the current commitment sequence.

The superseded record said the log "reports; it does not steer" and that
adaptive escalation "can enter later." Both halves were wrong. DEC-012
already steers: judgment with the history in front of it is adaptation,
and the record undersold the requirement it was summarising. And "later"
named a third state between in-scope and absent, which the developer
ruled does not exist. The reasoning pattern to avoid is adopting a
reviewer's framing of scope when the project's own rules already settle
it.

A formula that moves the threshold from a reversal rate is not in the
specification. That is absence, not deferral: nothing is owed.

## Realized by

- 2c5cf9e  No deferral: PKG-013, and the first supersession
