# The sweep introduced five commands and the backlog

Level: Consequential
Decided by: agent
Rests on: PKG-003, and the commitment plans for escalation,
scope-and-the-backlog, and supersession-and-the-experience-log
Would be wrong if: any of the five commands or the backlog directory
answers no failure a commitment plan names, in which case it should
leave
History: the PKG reversal was a deferral framing; this record defers
nothing and is Consequential because it is the first record written to
satisfy PKG-003 as revised, which the package lint now checks

## Decision

Five commands and one directory entered Cairn during the sweep of
commitments two through four, each named by its commitment plan and by
no decision record. PKG-003 as revised requires the record. This is it.

- `cairn escalate` and `cairn answer` (.cairn/escalations/): a Blocking
  decision reached the developer only as prose in a session, which dies
  with the session; the escalation file is the resume point an agent
  with no memory reads (LOOP-009, LOOP-013).
- `cairn backlog` (.cairn/backlog/, the backlog item record kind): work
  outside the commitment was implemented opportunistically or forgotten;
  a third response was needed that is neither (LOOP-015, LOOP-016).
- `cairn supersede`: a reversed decision was overwritten or deleted,
  losing the cause; a reversal is a permanent record with its cause
  classified (DEC-008, DEC-009, DEC-010).
- `cairn reversals`: reversal rate by decider was unmeasured, so the
  escalation threshold was a guess; it is now reported (DEC-011).

`wake`, `check`, and `decide` were named by earlier records. The
package lint found these six unnamed on its first run.

## Realized by

(none yet: recorded, not built)
