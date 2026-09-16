# Releases are versioned

Slug: releases-are-versioned
Requirements: PKG-039, PKG-040, PKG-037, PKG-017, PKG-005, PKG-014, PKG-004
Inherits: every PKG requirement
Status: Agreed 2026-09-15 by deference releases-are-versioned-on-the-developer-s-direction

## Goal

A release is one tagged commit whose version every file a marketplace
reads agrees on, whose changelog entry says what changed, and which
the kernel can report.

## Authorization and scope

Requested by the developer on 2026-09-15 in conversation, recorded in
docs/decisions/releases-are-versioned-on-the-developer-s-direction.md.
The version lived in four files pinned equal by a test, with no way
to print it, no changelog, no tag and no release step.

## Deliverables

- `cairn --version` prints the package.json version without a
  repository, and the help lists it (PKG-039).
- CHANGELOG.md at the repository root, with the version policy and
  an entry per version.
- scripts/release.mjs cuts a release: refuses a dirty tree, a version
  that is not an increase, a missing changelog entry, an existing tag
  or a loop not at Done; sets the version in package.json and the
  three manifests; commits once and tags v<version> (PKG-040).
- docs/releasing.md says how a release is cut and what follows it;
  the README points there.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
