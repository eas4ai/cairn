commitment: unpushed-commits-carry-no-ai-attribution-when-forbidden
commit: f6862e9c
examined:
  - completion review at f6862e9c: every requirement passes on fresh evidence and the full suite passes at 497. The two attribution tests and the release test failed on the kernel and script before the build and pass now.
  - this repository with its own policy on: the unpushed commits carry no attribution line, and the wake names its real next action, not reword.
  - the pattern, attacked: a line in a commit body that describes the rule in prose does not match, because the pattern reads a trailer at the start of a line; a trailer naming an AI vendor in any case matches; a Co-Authored-By naming a person does not. A commit already on a remote-tracking branch is never named, so pushed history is never asked to be rewritten.
  - a repository with no remote: every commit is on no remote-tracking branch, so an attributed commit anywhere in its history is named; with the policy on, that is what the policy asks.
  - the release script's Done check on an uncommitted changelog: the entry is kept in a backup in the Git directory while the committed changelog is judged, and restored in a finally block; an interruption between leaves the backup, which the next run refuses by name rather than overwriting.
  - the PKG-012 lint change, recorded as a Judged decision: a request, a URL or a model client import is still refused; only a vendor's name in text is allowed, which PKG-012's text never forbade.
  - found while building, outside this commitment: PKG-012 says Cairn MUST NOT call a model, and AUTO-014, agreed the same day, says the loop sends a submission to Jev, a model. The autonomy specification's review before agreement missed it. Captured to next-iteration, changing PKG-012.
  - the package: bin/ is 1643 lines against the 1900 ceiling; pkg-lint and spec-lint clean.
  - mechanism review of node-test for LOOP-020, LOOP-059 and LOOP-087 as revised at 49012dc by the same specification phase: none is in this commitment, and check asks for their reviews anyway, which is the defect LOOP-059's revision fixes under a later commitment. The existing tests observe each first text: a review record naming what it examined (LOOP-020), a mechanism review before revised evidence (LOOP-059), promote named at a complete commitment with a backlog item (LOOP-087). No test observes the added clauses, the independent report, the commitment-only gate, or a defect item named before promote, and the kernel implements none of them. Each is built and tested by its own commitment: reviews-carry-an-independent-report, check-asks-mechanism-reviews-only-for-the-commitment, defects-are-fixed-without-a-promotion. Recorded here, not opened, because it is not this commitment's work.
  - mechanism review of node-test for PKG-040 as revised, inherited by this commitment: tests/release.test.mjs line 66 writes an uncommitted changelog entry and expects the script to refuse it as a dirty tree, which the revised text now allows and requires to be committed in the release commit. The release script's Done check runs the wake on the working tree, and the wake names record for an uncommitted change to CHANGELOG.md, a declared input; so the case the revision allows would still be refused, by the Done check instead of the dirty check. The review before agreement did not see this.
  - PKG-045 is new: no test observes it and nothing implements it; there is no .cairn/policy file.
findings:
  - resolved: tests/release.test.mjs expects an uncommitted changelog entry to be refused, which PKG-040 as revised allows; the test must assert the release commits it. Resolved: the test now writes an uncommitted 0.3.0 entry, refuses a second dirty file by name, refuses a leftover changelog backup, then releases and asserts the release commit carries CHANGELOG.md with the entry (7c3b2bc2)
  - resolved: scripts/release.mjs judges Done on the working tree, where an uncommitted CHANGELOG.md is named record, so the release PKG-040 now allows can never pass; the Done check must judge the committed HEAD. Resolved: the script writes the pending changelog to a backup in the Git directory, puts the committed changelog in place while the wake judges, and restores the entry in a finally block; a backup left by an interrupted run is refused by name (7c3b2bc2)
  - resolved: PKG-045 has no test and no implementation: the policy, the reword verdict for an unpushed attributed commit, and the release refusal. Resolved: the wake reads .cairn/policy and names reword for the oldest commit on no remote-tracking branch whose message carries a Co-Authored-By, Claude-Session or Generated with line naming an AI vendor, after the check lock and a stop record; the release script refuses it through its Done check; tests/attribution.test.mjs covers the policy, a pushed commit, each form, a prose mention and the oldest first, and tests/release.test.mjs the refusal; this repository's .cairn/policy sets attribution: forbidden. The package lint's PKG-012 rule named vendor words as a proxy for a model call and would have forbidden the rule; it now looks for a request or a model client import, recorded as the-pkg-012-lint-looks-for-a-model-call-not-a-vendor-s-name (7c3b2bc2)

## Mechanism review at 49012dc0, 2026-09-17

The revision to PKG-040 moved the dirty-tree rule and left the Done
check behind it; a mechanism review that reads the script and not only
the test finds that. All three findings are resolved as one
implementation action after this record.

## Commitment review at f6862e9c, 2026-09-17

The rule that would have caught this morning's pushed trailers is in,
and on in this repository. Two things surfaced that the specification
phase missed: the release script's Done check stood behind the dirty
rule it was supposed to relax, and PKG-012 forbids the Jev call the
autonomy specification requires. The first is built; the second is a
contract contradiction and waits for the developer.

No open finding.
