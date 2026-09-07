# Evidence explains its freshness

Slug: evidence-explains-its-freshness
Requirements: LOOP-076, LOOP-077, LOOP-078, LOOP-079, LOOP-080
Status: Draft

## Authorization and activation

The developer confirmed explainable freshness as the next iteration on
2026-09-07 and requested existing-project. The exact requirements and
falsifiers in docs/spec/loop.md await confirmation under SPEC-002. After
confirmation, mark only those blocks Agreed and move the roadmap Current
line to this slug. This draft does not activate a second commitment.

## Goal

Make the next stale-evidence action understandable from its explanation:
which receipt it concerns, which facts changed, and what to do next.

## Deliverables

- Receipt, requirement, and mechanism identity in stale-evidence explanations.
- Changed-path details for newly recorded evidence, including raw content,
  executable mode, file kind, additions, and deletions.
- Explicit limits when older evidence cannot support a path-level explanation.
- The next permitted command, preserving review and escalation priorities.
- Deterministic tests of event sequences against an independent fixture model.
- Human manual examples and recorded verification of violating/corrected cases.

## Boundaries and design constraints

Use the existing wake and check commands. Preserve verdicts and action order.
No public JSON interface, selective-check command, next-iteration skill,
release-version feature, or backlog cleanup enters this commitment.

Input details are explanatory facts about a checked state. They do not replace
the existing input digest or become a second stored freshness status. Record
paths and identities, not source contents. Share details where practical for
one mechanism run, preserve historical receipts, and keep memory and repeated
reads bounded. Record the concrete format choice with cairn decide before
implementation; a new record kind requires the decision named by PKG-003.

## Mechanism and inputs

Extend the existing node-test mechanism after agreement to speak for these
five requirements. Its command remains node --test tests/*.test.mjs. Its
current declared inputs cover bin/, tests/, skills/, scripts/, AGENTS.md,
CLAUDE.md, README.md, and docs/walkthrough.md. The inherited pkg-lint mechanism
also covers docs/, including the manual and this commitment. The spec-lint
mechanism covers docs/spec/, scripts/spec-lint.mjs, and bin/spec.mjs.

Implement targeted cases in tests/freshness-explanations.test.mjs and sequence
cases in tests/freshness-sequences.test.mjs, reusing tests/helpers.mjs for
real Git fixtures. Existing requirement-freshness, execution-order,
candidate, evidence-integrity, and git-conversion tests guard adjacent rules.
No new declaration claims a passing check before these cases are built.

## Verification plan

For LOOP-076 and LOOP-079, begin with the existing stale-input output, which
omits both the receipt path and the explicit check command. Require the test
to fail for those omissions, then pass with the completed explanation.

For LOOP-077, create baseline evidence and independently change content,
mode, kind, selection membership, and Git-clean raw bytes. Check additions,
deletions, several changes together, restored bytes, unusual path characters,
and more than 20 changed paths. Match exact paths and the omitted count;
assert that unchanged inputs and file contents are never reported.

For LOOP-078, retain old receipts without details and introduce malformed or
inconsistent optional details, unavailable old requirement text, changed
mechanisms, changed history, and damaged output in disposable fixtures.
Require an honest cause or an explicit unavailable comparison. Old receipt
bytes stay unchanged. Fresh legacy evidence does not become stale merely
because its explanation is less detailed.

For LOOP-080, use a deterministic event generator and a small independent
model of the fixture facts. Compare verdict and action after each persisted
step and a fresh process restart. Every failure prints the seed/case and
short event prefix. Include controls for restored inputs, unrelated commits,
review priority, backward clocks, imported histories, and failure attempts.
Demonstrate a safe injected violation and corrected case for checks whose
negative path is not already demonstrated by the baseline behavior.

Run the complete suite and inherited package/specification checks. Commit
implementation before cairn check, then commit its receipts and logs. Review
what the mechanisms miss without changing code; resolve findings separately.

## Done when

All five Agreed requirements have current passing evidence, all inherited
package requirements pass, and the commitment review is current and clean.
The tests prove explanation accuracy and preservation of existing decisions.
