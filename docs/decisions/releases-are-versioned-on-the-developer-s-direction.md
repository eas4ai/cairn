# Releases are versioned on the developer's direction

Level: Consequential
Decided by: developer
Rests on: PKG-037 PKG-014 PKG-017 PKG-005
Would be wrong if: a release cut by the script carries versions that disagree across the files a marketplace reads, or a harness sees a new version whose content is the old one
History: Three deference rulings in this domain; this one adds the version and release path the developer asked for after the plugin install.

## Decision

On 2026-09-15 the developer asked, in conversation, for a versioning system and a release. Until now the version lived in package.json and the three plugin manifests, pinned equal by a test, with no way to print it, no changelog, no tag and no release step; a marketplace refreshes a plugin only when its version changes, so an untagged bump was the only release there was. This record is the deference SPEC-002 names: PKG-039 and PKG-040 are Agreed by it and carry the marker naming it, built under the commitment releases-are-versioned, and the first tagged release follows from it. Decided by the developer in conversation; recorded by the agent.

## Realized by

- b644f076ea13e8b214f5bea947b647df8b15544f Build: cairn --version, the changelog, and the release script that cuts one tagged commit at Done (PKG-039, PKG-040)
