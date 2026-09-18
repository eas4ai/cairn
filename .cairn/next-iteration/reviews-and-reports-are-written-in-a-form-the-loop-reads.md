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

Rounds 27 and 28 add the strongest evidence yet, and two accepted
limits. Round 28 found four silent losses at once, all one fault: the
reader recognised a finding only in the exact markup it expected, so a
blockquote marker, a task box, emphasis round the prefix, an HTML list
item, a table cell, a space before the colon, and a bare paragraph
under a findings-naming heading each hid a line that plainly said
"open:". Each was fixed by reading what the line says rather than how it
is marked up (commit 9ada401f), but the list of shapes has no end: the
next reviewer's habits are not in it.

Two limits are recorded rather than closed, on the developer's ruling of
2026-09-18 (escalation loop-020):

- An indented four-space code block that quotes the finding shape is
  read as a live finding. Only a fence hides an example. Telling a
  fence from an indented block means implementing Markdown's block
  structure, which is the argument for canonical records, not against
  the rule.
- A "resolved:" carry needs no account of how it was resolved: the
  report's words plus the citation reach Done. Cairn is a discipline
  tool, not a security boundary, as the working agreement says, so the
  gate cannot tell a real resolution from an echo. A canonical record
  written by the loop could at least require the account as a field.

Twenty-eight rounds are now carried, with 103 findings from the reports
and 163 entries counting the builder's own.

Rounds 27 to 32 settle the argument. Every one of those six rounds found
at least one silent loss, and 15 of the 19 silent losses across the whole
commitment were created by the previous round's own fix. The sequence is
worth reading as one story, because it is the same story six times:

- round 28: the reader recognised a finding only in the exact markup it
  expected, so a blockquote marker, a task box, emphasis, a table cell
  and a bare paragraph each hid one
- round 29: every region the reader did not sweep was a hiding place, the
  header above the list included, and a finding written as its own
  heading was invisible
- round 30: the fix enumerated markup, so a second list marker, a number
  in parentheses, an emoji and an HTML comment walked past it; the answer
  was to stop enumerating and read the line from its first letter
- round 31: that rule made every marker containing a letter into cover,
  the plainest being a checked task box, and fence markers paired by
  position let a prose line beginning with three backticks blank the
  findings below it
- round 32: the fence rule then lost findings in both directions at once,
  in six opener and closer shapes, and a decorative divider used twice
  was a closed fence; the answer was structural, not another rule -- the
  findings sweep stopped reading the fence-stripped text at all
- round 33 is under way at the seam that answer created

The lesson for the specification is not that the rules were wrong. Each
was right about the case in front of it. It is that a finding in a
Markdown record has no mark of its own, so every rule is a guess about
which line a human meant as a finding, and each guess creates the next
round's hiding place. A canonical record the loop writes and reads ends
the class: a finding would be a field, not a bullet whose meaning depends
on the markup before it, the heading above it and the fence around it.

One practical constraint has also arrived. PKG-004 caps the kernel at
1900 lines, and it now sits at exactly 1900. Rounds 31, 32 and 33 each
paid for their fixes by trimming comment. The next round of this class
needs either a larger ceiling, which is an Agreed requirement and so the
developer's, or the canonical records proposed above, which would remove
more reader code than they add.

Rounds 34 to 39 closed the class by the structural route rather than by
another rule. Round 34 gave the prefix to the findings list alone: a line
carrying it anywhere else in a record is a finding, whatever marks it up.
That one sentence deleted the markup stripper, the label rule and the
marker table, and the kernel briefly shrank. Rounds 35 to 38 narrowed the
reading to a single predicate and tested it at scale: 240,000 generated
record shapes and 21,450 spellings of the prefix, which found exactly one
silent class left, an HTML element round the word with other markup in the
gap, closed by reading each line five ways. Round 39 built about 360
committed record pairs, swept a finding-shaped bullet through all 47 line
positions of a rich report and a rich review, and generated 200 further
report shapes at random. It found no silent loss.

What rounds 34 to 39 leave behind is a different defect of the same
origin, and it is the reason the canonical record still matters. The gate
now refuses the unreadable record reliably, but it must then tell the
agent what to do, and it cannot know which party the fault belongs to. So
it sometimes prescribes a repair only the reviewer could honestly make:
writing entries under an empty examined field asks the agent to author
another party's observations; declaring a report empty when the report
names its defect in prose asks the agent to overwrite the reviewer's
meaning; an indented header is answered about the wrong field; and a
reviewer who writes that it found nothing, in words, inside its findings
list is told to carry that non-finding. Each is a message, not a lost
finding, and each exists only because a finding has no mark of its own and
the gate is guessing what the reviewer meant. A canonical record removes
the guess and the message together: there is nothing to prescribe when the
writer's tool cannot produce the unreadable shape.

The ceiling moved with the work. The files under bin/ stood at 1900 in
round 33 and stand at 1900 now, the ceiling itself, because what giving the
prefix to one list saved has since been spent
less code than the rules it replaced. The constraint is real and binding: the files under bin/ are at the ceiling,
so the next change of this class must remove as much as it adds, or the
ceiling must be raised, which is the developer's. Corrected on 2026-09-18
after the fortieth report found this file claiming 1872; the number came
from the thirty-ninth report and was never checked here.

One piece of dead code belongs with this item rather than in the backlog.
The reader still declares a constant beside ENTRY, at bin/cairn.mjs line
909, that neither the kernel nor the tests ever reads: the last trace of
the rule round 34 replaced when the prefix was given to the findings list
alone. Round 39 found it. It is not a commitment of its own -- there is no
requirement to draft for deleting an unused declaration, and PKG-004 is
not violated at 1900 of 1900, though there is no headroom left -- and the
canonical record proposed above
rewrites this reader and removes the constant with it. Delete it with that
work.

Round 40 added one more shape of the same kind, and it is the sharpest
argument yet for the canonical record. A report with a stray bullet on the
line below its commit field is sent back for a whole new reviewer, while
the identical bullet one line lower is repaired in place with every word
kept. The reader already carries the gentler repair, for a commit line
that carries more than the commit, but it is missed when the stray bullet
joins the value with no space, because the first whitespace-separated word
is then not a commit either. An honest reviewer's report is discarded over
a space. A record the loop writes cannot produce the shape at all.
