# PKG-045 and LOOP-139 claim the same slot and one cannot be satisfied

Changes: PKG-045
Outside because: PKG-045 and LOOP-139 are Agreed requirements this commitment may not revise (LOOP-089)
Captured: 2026-09-18T11:09:22.749Z

Both requirements say their action comes ahead of every action but a live check. The kernel can honour only one, so PKG-045's falsifier is met as written: at a48ccce4, with .cairn/policy forbidding attribution, a commit that both adds an unexplained record under .cairn/stops/ and carries a Co-Authored-By Claude trailer makes wake name explain, which PKG-045's falsifier calls another action. The controls behave: the same commit without the stop record names reword, and the same stop record with a clean message names explain. Nothing escapes, because the attribution is caught one action later, but one of the two Agreed texts is unsatisfiable. The fix is to order the two in their own text, which changes at least one Agreed requirement. Found by the fortieth independent report at a48ccce4, finding 4.

Answered on 2026-09-18. The developer directed it ("and settle 3"). PKG-045's
text now yields to LOOP-139, which is the order the kernel already applied, so
no behaviour changed and no evidence was invalidated by this. Verified both
ways in a scratch clone: both conditions together name explain, and once the
stop record is explained the same commit is named for reword. The decision is
docs/decisions/pkg-045-yields-to-loop-139-when-both-would-claim-the-wake.md.
Nothing of this item is left waiting.
