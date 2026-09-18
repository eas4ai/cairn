# Reviews and reports are written in a form the loop reads

Changes: LOOP-020
Outside because: found across review rounds 9 to 16 of this commitment; it changes the record format LOOP-020 and LOOP-086 describe, which only the developer can change
Captured: 2026-09-17T20:11:34.799Z

Eight review rounds of this commitment, 9 to 16, found defects of one kind: a review or an independent report is Markdown a person or another agent writes, and the loop guesses which lines are entries. Each rule read one more honest shape and missed or refused another; the rounds cost more than every other fix in the commitment. Proposed: the loop writes and reads these records itself. cairn review --examined ... --finding 'open: ...' and cairn report --file <path> would write a canonical record, and the loop would read the canonical form only, naming anything else as a repair with the command that writes it. Hand-written records stay readable, but the loop stops inferring; the ambiguity a prose bullet carries disappears. Changes LOOP-020 and LOOP-086, and the working agreement's record formats.

Rounds 17 to 23 continued the same pattern and sharpened the case. The
count now stands at twenty-two rounds, and two of the defects were
silent losses, where a real finding reached Done with nothing named: a
declared empty findings list refusing every record with a bulleted body
(round 17), and a report's further findings under a section titled
findings, read as prose because a report's findings carry no prefix
(round 22). The second is only half closed: a heading whose title names
findings may now hold no list, but findings buried under a heading with
any other title are still read as prose, and no rule over prose can tell
them from notes. That residual case is the clearest argument for the
canonical records proposed above: the loop would read only what it
wrote, and a finding could not be a bullet whose meaning depends on its
heading's title.


Rounds 24 to 26 made the trade explicit, and it is the reason to change
the format rather than the rule. Each of those three rounds found a
silent loss, and each was created by the previous round's fix: an
unterminated fence blanked every line after it (round 24), a table or a
paragraph under a findings-titled heading was read as prose (round 25),
and the section rule that closed that case gave the heading only the
lines above its first subheading, so a finding under a subsection was
invisible again (round 26).

Round 26 then reached the wall directly. Its second finding asked for
the refusal to be narrowed, because a heading titled "How I reached the
findings above" is refused although every finding is in the list, and
this repository's own review freshness-and-scope-guidance-agree.md is
refused for its "Documentation review finding" section. Narrowing the
title to its first word was tried and reverted: no rule over a title
tells "More findings" from "What the findings mean", so the loop must
either refuse both in the open or lose a finding in silence. It refuses.
That is a permanent cost of reading prose, paid by every honest reviewer
who titles a section with the word, and it disappears the moment the
loop reads only records it wrote itself.

Twenty-six rounds are now carried in the review, with 83 findings from
the reports and 141 entries once the builder's own are counted, and no
downward trend. The cost is not the kernel's complexity; it is that each
new reviewer writes in a shape the last rule did not anticipate.
