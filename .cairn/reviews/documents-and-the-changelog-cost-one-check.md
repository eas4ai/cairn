commitment: documents-and-the-changelog-cost-one-check
commit: 35d00622
examined:
  - PKG-040 as revised, built under unpushed-commits-carry-no-ai-attribution-when-forbidden: the release test refuses a second dirty file by name, refuses a leftover changelog backup, and releases with an uncommitted entry whose commit carries CHANGELOG.md.
  - LOOP-141: review freshness now compares each mechanism's inputs less the documents its own declaration lists, through a git exclude pathspec, so a file listed as a document by one declaration still counts for another that does not list it. The new test in tests/check.test.mjs failed on the kernel before the build and passes now: a document change leaves the review fresh with evidence stale, and a code change makes the review stale.
  - this repository's declarations: node-test lists README.md, CHANGELOG.md, docs/manual.md and docs/walkthrough.md; pkg-lint lists those and docs/releasing.md and docs/recon.md. docs/spec/ and docs/decisions/ are contract and stay ordinary inputs.
  - the check under this commitment: two tests failed once under a load average of 12.7 from other sessions, a test's own check lock reported dead and an empty output; both files passed three runs in a row, and the named rerun passed.
  - a release dry run on a scratch clone of this repository at Done: with an uncommitted 0.7.0 entry the clone's wake named record CHANGELOG.md, the script cut 0.7.0 anyway, the release commit carries CHANGELOG.md beside the five version files, the tree is clean, the tag exists, and no changelog backup is left. The clone was removed.
findings: []

## Commitment review at 35d00622, 2026-09-17

A release now costs one check and one review, and a manual or changelog
edit no longer reopens a review. Evidence still goes stale on a
document, because tests read documents.

No open finding.
