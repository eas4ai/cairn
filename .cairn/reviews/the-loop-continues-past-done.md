commitment: the-loop-continues-past-done
commit: fab3fbf5b233e601442e65678f8047da918fb198
examined:
  - node-test against the revised LOOP-029: tests/scope.test.mjs, the kernel's requirementSet and currentCommitment, and a throwaway fixture carrying a promotion marker.
  - spec-lint against the revised SPEC-002 with four temporary spec directories.
  - The continuation implementation at fab3fbf: parseSpec's promotion field, requirementSet, currentCommitment, captureVerdict, promotedContractVerdict, the wake ending, backlog options, help, spec-lint, tests/continuation.test.mjs, and the commitment's deliverables list.
findings:
  - resolved: LOOP-029's first clause had no test and no kernel check; a requirement marked Agreed by promotion of a decision that does not exist was accepted by wake. The marker check under LOOP-088 and its tests close it.
  - open: The working agreement and its template still say stop at Done and state no promote, next-iteration, or no-deferral move, and no test reads them for those moves.
  - open: The new-project and existing-project skills do not name the two capture directories or the sort test.
  - open: Four backlog items that change the contract are not under next-iteration with Changes: lines, and prepare-a-next-iteration is not stamped as absorbed.
  - open: The README and the manual do not describe promotion, next-iteration, or the no-deferral rule.
## LOOP-029 mechanism review, 2026-09-14

Revised text: a backlog item needs a recorded promotion decision, and a
next-iteration item needs the developer's confirmation. Falsifier: a
commitment includes a requirement that neither covers.

node-test speaks for LOOP-029 through the suite's exit code. The one
test naming it, in tests/scope.test.mjs, covers the second clause: a
commitment naming R-003 while R-003 is not Agreed produces the repair
verdict. Observed again in the fixture: Status: Draft on R-003 gives
Resolvable: repair docs/commitments/first.md.

The first clause has no test. Safe violating example: R-003 marked
Status: Agreed 2026-09-14 by promotion no-such-decision, and the
commitment carrying Promoted from: some-item. Observed: wake proceeds
to Resolvable: run R-001, identical to the developer-confirmed control.
The kernel's Status regex reads the first word and ignores the marker,
so the suite passes while the falsifier state stands. That mismatch is
the open finding above. The corrected case cannot be shown until the
kernel reads the marker, which is LOOP-088's implementation; that
action follows this review and takes the fixture above as its test.
No code changed during this review.

## SPEC-002 mechanism review, 2026-09-14

Revised text: the agent must not record a requirement as Agreed before
the developer confirms its falsifier or a promotion decision under
LOOP-088 names it. Falsifier: an Agreed marker with no confirmed
falsifier and no promotion decision in its Status: line.

spec-lint speaks for SPEC-002 through one rule: an Agreed block with no
Falsifier: line is a finding. That rule is the observable proxy for
both paths, because a promoted requirement still carries its falsifier
in the spec; the decision names it, it does not replace it. Four cases
ran through scripts/spec-lint.mjs on a temporary spec directory. Safe
violating examples: an Agreed block with no Falsifier: line, with and
without a by promotion marker, each reported "R-001 is Agreed and
carries no Falsifier: line (SPEC-002)" and exit 1. Corrected cases: the
same blocks with a Falsifier: line, with and without the marker, each
clean and exit 0. Whether the marker's decision slug resolves is
LOOP-088's proxy and is listed under this commitment's spec-lint
deliverables; it is not part of SPEC-002's falsifier. No mismatch. No
code changed during this review.

## Commitment review at fab3fbf, 2026-09-14

Every declared requirement has current passing evidence. This review
asks what the mechanisms miss. No code changed while looking.

The LOOP-029 fixture from the first mechanism review ran again on the
new kernel. The violating case, a marker naming a decision that does not
exist, now gets Resolvable: repair docs/spec/test.md naming the missing
record. The control that carried Promoted from: some-item with no
decision naming the item now gets Resolvable: repair
docs/commitments/first.md under the second clause. The not-Agreed
control is unchanged. Eight new tests failed on the previous kernel and
pass on this one; the full suite is 368 passing.

Attacked and found sound: promote is reached only after a clean review,
so the agent cannot promote around an unreviewed commitment; a stamped
item is invisible to the candidate list, so the thirty stamped items in
this repository stay quiet; a missing next-iteration directory lists as
empty; the deferral gate reads only files added by the loop's own
commits, so items captured before the commitment began are not
re-litigated; the contract guard compares only requirements Agreed at
both ends, so the requirement a promotion adds does not trip it; the
capture options refuse a next-iteration item with no target and keep
the never-overwrite rule in both directories.

Limits recorded, not findings: an escalation is taken to name a path or
a commitment when its text contains that string, so a long slug is
safer than a short one; a capture made in the activation commit itself
sits at the footprint boundary and is not read by the deferral gate,
which matches how LOOP-035 counts the loop's own commits; fields()
reads any Key: value line, so a body line beginning Changes: or
Promoted to: counts as the field, which is also true of every other
record today.

What the mechanisms cannot see is the rest of the commitment's
deliverables, listed as the four open findings: the working agreement
and its template, the two skills, this repository's own capture
sorting, and the human documentation. Each is resolved as its own
action. The working agreement's static proxy is a test in
tests/agreement.test.mjs, which becomes part of node-test's evidence.

Self-audit against the production rules: the change is bounded to the
nine requirements, adds no dependency, keeps the kernel at 1306 of
1500 lines, and every check reported here ran and passed.
