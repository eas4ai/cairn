# Capture options rather than a new command

Level: Judged
Decided by: agent
Rests on: PKG-003, LOOP-092, LOOP-093, LOOP-016
Would be wrong if: an agent cannot find the next-iteration capture because it lives behind an option of backlog, or the option set grows past what one help line explains
History: PKG carries a reversal from a deferral framing; this record adds no command and no record kind, only options on the capture command, so the level stays Judged.

## Decision

cairn backlog gains three options. --next-iteration writes the capture under .cairn/next-iteration/ and requires --changes, written as a Changes: line naming the requirement or the working agreement the idea would change (LOOP-093). --outside TEXT writes an Outside because: line in either directory, the agent's stated reason that an idea surfaced from one of the commitment's own requirements is not the commitment's work (LOOP-092). A new command would need its own PKG-003 record and its own help block for what is one capture with a different destination; the options keep the surface at one command.

## Realized by

- 1a20409742445dc4ec171754797ec0589a01af59 The loop continues past Done: promote, next-iteration, and no deferral
