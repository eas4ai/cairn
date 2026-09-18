# The working agreement promises a heading the gate refuses

Changes: LOOP-020
Outside because: the agreement and the two template copies are contract text this commitment may not change (LOOP-089)
Captured: 2026-09-18T11:09:22.707Z

AGENTS.md and the shipped copy at skills/new-project/templates/AGENTS.md say that when the findings field holds entries, a heading whose title names findings is read as elaboration and may hold prose. The gate does not do that: at a48ccce4 a report carrying one finding is refused when its body holds a section titled 'Findings I could not place' or 'How I reached the findings above', while the identical report titled 'What else I saw' reaches Done. The same asymmetry holds inside a review record. bin/cairn.mjs carries the agreement's sentence as a comment and the opposite rule on the next line, and the 0.7.0 changelog states the real rule. A reviewer briefed from the agreement writes a report the loop refuses, and that costs a whole round. Either the agreement's sentence changes to match the gate, or the gate changes to match the agreement; both are Agreed text, so the choice is the developer's. Found by the fortieth independent report at a48ccce4, finding 1, and reproduced by that report with a control for each shape.

Noted on 2026-09-18: docs/manual.md carried the same false promise and has
been corrected to the rule the gate actually applies, because the manual is
not contract text and is listed under documents:, so correcting it costs a
check and not a review round. AGENTS.md and the template copy still carry
it, and still need the developer. Until they are changed, the manual and
the agreement disagree, and the manual is the one that matches the code.
