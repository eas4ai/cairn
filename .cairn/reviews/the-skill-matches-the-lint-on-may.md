commitment: the-skill-matches-the-lint-on-may
commit: e1adb800f9644e76c298c0d204007c83905c5ee0
examined:
  - SPEC-025 against skills/new-project/SKILL.md, tests/skills.test.mjs, tests/spec-lint.test.mjs, and scripts/spec-lint.mjs; the existing-project skill and this repository's own spec for MAY statements.
findings:
  - resolved: The new-project skill exempted a permission-only MAY from the Falsifier: line while the lint reported every Agreed block without one; the skill now states the lint's rule and says what a permission's falsifier is.

## Commitment review at e1adb80, 2026-09-14

The first commitment promoted under LOOP-087. SPEC-025 carries the
marker Status: Agreed 2026-09-14 by promotion
promote-the-may-falsifier-mismatch-the-skill-matches-the-lint, and the
decision record names the backlog item and the drafted falsifier. Wake
accepted the marker because the record exists; the LOOP-088 tests show
what happens when it does not.

Failure demonstration: with the tests written and the skill unchanged,
the skills suite ran 20 passing and 1 failing on the old exemption
sentence. With the rule replaced, the full suite is 372 passing. The
spec-lint fixture shows an Agreed block whose only keyword is MAY is a
SPEC-002 finding without a Falsifier: line and clean with one, which
the lint already did; the test now guards it.

Attacked: the existing-project skill, which makes no MAY statement and
needs no change; this repository's own spec, which holds no MAY block;
the drafted requirement itself, whose first wording mentioned MAY in
prose and was counted by the lint as a second obligation until the
word was quoted as a mention, the lint's documented rule. No code
changed during this review.

Self-audit against the production rules: the change is one skill
paragraph and two tests, inside the promoted item's text, with every
check reported here run and passed. No open finding.
