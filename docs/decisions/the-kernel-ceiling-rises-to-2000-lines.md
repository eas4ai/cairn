# The kernel ceiling rises to 2000 lines

Level: Consequential
Decided by: developer
Rests on: PKG-004
Would be wrong if: the kernel grows toward 2000 lines without the record reader getting simpler, so the next ceiling is asked for within a few commitments rather than the reader being replaced by the canonical record the next-iteration item proposes
History: PKG-004 has moved before: 1500 to 1600 on 2026-09-15 on the developer's direction after the second audit, and 1600 to 1900 on 2026-09-17 confirmed by the developer in the next-iteration phase. This is its third rise.

## Decision

The developer directed it in these words: 'set the package cveiling to 2000'. PKG-004 capped the files under bin/ at 1900 and they stood at exactly 1900. The kernel stood at 1900 on the day of this decision, the whole of the old ceiling, so no change to it could add a line without removing one, and the later rounds of the independent-report gate were paid for by deleting comment, which is why two committed records disagreed about the kernel's size and the reader is denser than it should be. The requirement's text and falsifier now say 2000, scripts/pkg-lint.mjs enforces 2000, and its test checks that 2000 lines pass and 2001 fail. This does not authorise growth: the waiting next-iteration item still proposes a canonical record that would remove more reader code than it adds, and the extra 100 lines are room to write the existing reader plainly, not budget for new rules.

## Realized by

- edb4460a Raise the kernel ceiling to 2000 and drop the 0.6.0 bullet from the 0.7.0 notes
