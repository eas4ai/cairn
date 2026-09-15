commitment: records-in-every-shape
commit: 7bfddce
examined:
  - LOOP-124: Concerns is normalized where escalations are read for wake, so standing, withAnswer, and both gates see a string; the scope-approval reader still requires a string Concerns and skips a list silently, which only a hand-edited scope escalation can produce, since the kernel writes that record.
  - LOOP-125: one leading .cairn/backlog/ or .cairn/next-iteration/, one .md, and surrounding backticks are stripped; decide --promotes writes the canonical slug so new records need no normalization.
  - LOOP-126: the tracked-path check fires once evidence is tracked; the first run under a covering input is caught by the candidate branch instead, which names the declaration when every changed candidate path is under .cairn/evidence/; a mechanism that writes under a real input still gets the LOOP-063 message, which is right.
  - LOOP-127: the directory listing carries the record tag; the per-entry lstat needs only the directory's execute bit, which the listing already needed.
  - LOOP-128: escalate slugs from --concerns, which always has letters; decide and backlog refuse an empty slug before writing.
  - LOOP-130: the restore diff is --relative, and the approval reader's later-changes set already was; the nested test raises the escalation with an unrestored path (refused) and after restoration (accepted).
  - LOOP-131: only records the commitment's own commits added are checked, so the two Consequential records of the first remediation, marked by commit f2b4fde's message, stay as they are; an entry added and later removed by the developer's review still counts as queued through the add filter.
  - the memoized commitment history: one reading per process; a mechanism that moves HEAD during a check is caught by the candidate comparison, so a stale reading cannot record evidence.
  - the five helpers folded to one line each change no behavior; the suite is the evidence.
  - each new test was run against the kernel before the change: thirteen failed there, and the DEC-016 wording test was updated to the corrected message.
findings: []

## Commitment review at 7bfddce, 2026-09-15

LOOP-124 through LOOP-131 and the eight repairs under PKG-028,
LOOP-107, LOOP-030, LOOP-110, LOOP-104, SPEC-018, DEC-016, LOOP-105
and LOOP-044 have current passing evidence; 444 tests pass, both
lints clean, the kernel at 1496 of 1500 lines after folding five
helpers. Attacked as listed under examined. No open finding.
