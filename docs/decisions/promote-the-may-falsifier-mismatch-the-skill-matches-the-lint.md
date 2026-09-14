# Promote the MAY falsifier mismatch: the skill matches the lint

Level: Judged
Decided by: agent
Rests on: SPEC-002, SPEC-013, LOOP-087, LOOP-088
Would be wrong if: a consumer needs a permission-only requirement that no falsifier can state, in which case the lint gains a MAY exemption and this record is superseded
History: No reversal is recorded in the SPEC domain. Judged: a text consistency fix inside the specification, cheap to reverse, and the first promotion under LOOP-087.

## Decision

Promotes .cairn/backlog/the-spec-lint-demands-a-falsifier-on-a-may-that-the-skill-says-carries-none.md, captured 2026-09-05 from SPEC-002. The new-project skill said a permission-only MAY carries no Falsifier: line; the spec lint reports every Agreed block without one. The lint's reading is the safer one: a requirement with no observable falsifier cannot produce evidence (SPEC-013), and a MAY whose limit matters is written as the MUST that bounds it. Drafted requirement, SPEC-025: The specification skills MUST require a Falsifier: line on every requirement they record as Agreed, including one whose only keyword is MAY. Falsifier: a skill states that any Agreed requirement carries no Falsifier: line, or the spec lint accepts an Agreed block without one. Mechanism: node-test, through the skills suite's static proxy and the spec-lint suite's fixture. Chosen first of the two backlog candidates because it is the smaller and cheaper to reverse; run-only-stale-mechanisms-without-a-requirement-lookup follows.

## Realized by

(none yet: recorded, not built)
