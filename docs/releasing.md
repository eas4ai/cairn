# Releasing Cairn

A release is one tagged commit. Every file a marketplace reads carries
the same version, the changelog says what changed, and `cairn
--version` prints it. The version lives in package.json; the three
plugin manifests under .claude-plugin/ and .codex-plugin/ mirror it,
and a test keeps them equal.

## Cut a release

1. Be at Done: `cairn wake` says so. A release is a complete
   commitment, never work in flight.
2. Write the entry in CHANGELOG.md, headed `## X.Y.Z - YYYY-MM-DD`,
   and commit it; the changelog is a declared input, so the loop
   asks for that commit before it says Done again.
3. Run `node scripts/release.mjs X.Y.Z` from the checkout root. It
   refuses, in one line and with nothing written, a dirty tree, a
   version that is not an increase, a missing changelog entry, an
   existing tag, a version file that disagrees, or a loop not at
   Done. Then it sets the version in the four files, commits
   `Release X.Y.Z`, and tags `vX.Y.Z` with the entry as the message.
4. The version files are declared inputs, so their evidence is stale
   at the release commit. Run `cairn check --stale`, record the
   review, and wake to Done; commit as usual.
5. Push the branch and the tag: `git push origin main vX.Y.Z`. Update
   the production checkout the same way and push it with the tag.
   A GitHub release is optional: `gh release create vX.Y.Z --title
   "Cairn X.Y.Z"` with the entry as its notes.

A harness refreshes an installed plugin when the marketplace's version
changed, so the bump is what reaches users; a change pushed under the
same version reaches nobody who already installed it.

## Versions

Semantic versioning, below 1.0:

- patch: no verdict, record shape or document meaning changes.
- minor: requirements, verdicts or record shapes are added or
  revised, and earlier records still read.
- major: earlier records mean something else.

Evidence names the kernel that wrote it by digest, not by version, so
a record from another kernel is stale whatever the version says.
