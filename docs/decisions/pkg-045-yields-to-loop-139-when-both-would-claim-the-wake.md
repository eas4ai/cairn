# PKG-045 yields to LOOP-139 when both would claim the wake

Level: Consequential
Decided by: developer
Rests on: PKG-045
Would be wrong if: an agent leaves an attributed commit unreworded because it explained a stop record and then stopped, so the attribution reaches a push; the release script still refuses such a commit, which is the backstop this rests on
History: The PKG domain carries no recorded reversals; the level is Consequential because the text ships to everyone who installs Cairn and the requirement governs what leaves a machine.

## Decision

The developer directed it in these words: 'and settle 3'. PKG-045 said rewording comes ahead of every action but waiting for a live check, and LOOP-139 says the same of explaining a stop record, so a commit that was both unexplained and attributed met one of the two falsifiers whichever action the kernel named. The kernel names explaining first. PKG-045's text now yields to it, so no code changes and no evidence is invalidated by a behaviour change. Verified both ways in a scratch clone: with the policy set, a commit that both adds an unexplained stop record and carries a Co-Authored-By Claude trailer makes wake name explain; once the stop record is explained and committed, the next wake names reword for the same commit. Nothing escapes, it is caught one action later, and the release script refuses such a commit in any case.

## Realized by

- 0e51c3c8 Settle both contract defects: the agreement matches the gate, and reword yields to explain
