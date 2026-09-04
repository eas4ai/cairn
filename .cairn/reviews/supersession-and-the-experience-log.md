commitment: supersession-and-the-experience-log
commit: 292b595
examined:
  - the domain rule: requirement prefixes are coarse, so every LOOP decision from here carries a History line; that is what DEC-012 says and it is one line
  - the reversal check when the new decision is itself the supersession: the old record is not yet stamped, so its own reversal is not required in History, which is right
  - supersede X --supersedes Y: the positional wins silently
  - causeOf when the superseding record cannot be found: reports unrecorded rather than throwing
  - the stamp on the old record, for a record whose first line is not a heading
  - where the History line lands in the record, against the plan
findings:
  - open: the stamp on the old record is a regex on its first heading line; a record with no heading is left unstamped with no message, so wake would keep offering it as unrealized work
  - open: the plan says History lands "after Level" and the code puts it after Would be wrong if; the code's placement reads better, so the plan is wrong
