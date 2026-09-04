# The review queue has no documented exit

Surfaced from: DEC-014
Captured: 2026-09-04T21:57:33.327Z

DEC-014 says a decision stays in the review queue until the developer marks it reviewed, and nothing says how. cairn decide writes the queue entry and nothing reads or removes it; there is no command and no documented convention, so the developer cannot discharge the queue in a way the next agent recognizes.

If promoted, the resolution that adds nothing: the developer removes the queue entry in a commit, and git's authorship and date are the mark. That stores no status (LOOP-028) and adds no command (PKG-003). The alternative is a cairn reviewed <slug> command, which needs a decision record naming the failure that forced it. Promotion is the developer's.
