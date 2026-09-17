commitment: unpushed-commits-carry-no-ai-attribution-when-forbidden
commit: 49012dc0
examined:
  - mechanism review of node-test for PKG-040 as revised, inherited by this commitment: tests/release.test.mjs line 66 writes an uncommitted changelog entry and expects the script to refuse it as a dirty tree, which the revised text now allows and requires to be committed in the release commit. The release script's Done check runs the wake on the working tree, and the wake names record for an uncommitted change to CHANGELOG.md, a declared input; so the case the revision allows would still be refused, by the Done check instead of the dirty check. The review before agreement did not see this.
  - PKG-045 is new: no test observes it and nothing implements it; there is no .cairn/policy file.
findings:
  - open: tests/release.test.mjs expects an uncommitted changelog entry to be refused, which PKG-040 as revised allows; the test must assert the release commits it
  - open: scripts/release.mjs judges Done on the working tree, where an uncommitted CHANGELOG.md is named record, so the release PKG-040 now allows can never pass; the Done check must judge the committed HEAD
  - open: PKG-045 has no test and no implementation: the policy, the reword verdict for an unpushed attributed commit, and the release refusal

## Mechanism review at 49012dc0, 2026-09-17

The revision to PKG-040 moved the dirty-tree rule and left the Done
check behind it; a mechanism review that reads the script and not only
the test finds that. All three findings are resolved as one
implementation action after this record.
