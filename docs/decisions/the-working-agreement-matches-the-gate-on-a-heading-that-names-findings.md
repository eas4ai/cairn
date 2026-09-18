# The working agreement matches the gate on a heading that names findings

Level: Consequential
Decided by: developer
Rests on: LOOP-020
Would be wrong if: a reviewer's honest elaboration has nowhere to go, so reports get thinner rather than better placed, and reviewers start omitting the reasoning that makes a finding checkable
History: Three LOOP decisions have been reversed: a-commitment-is-done-by-its-own-deliverables, an-answered-next-iteration-escalation-chooses-by-its-text and freshness-by-declared-inputs. Each reversed a rule about what the loop reads from a record, which is this decision's subject, so it is recorded at Consequential and goes to the review queue rather than being made quietly; the developer reads it and can supersede it.

## Decision

The developer directed it after asking why the agreement had not been fixed. AGENTS.md and the shipped copy at skills/new-project/templates/AGENTS.md promised that when the findings field holds entries, a heading whose title names findings is read as elaboration and may hold prose. The gate refuses such a heading whatever the list holds, so a reviewer briefed from the agreement wrote a report the loop rejected, at the cost of a whole round, and every new project got that copy. Two ways to settle it: change the gate to allow a prose-only section under such a heading, or change the text to match the gate. The text changes, because telling prose from a finding is the judgment this whole commitment found unreliable, and a heading that names findings is the one place the loop must not guess. The agreement now says such a heading is refused whatever sits beneath it and tells the reviewer to put elaboration under a heading that does not name findings. docs/manual.md already said this; the stale comment in bin/cairn.mjs is deleted.

## Realized by

- 0e51c3c8 Settle both contract defects: the agreement matches the gate, and reword yields to explain
