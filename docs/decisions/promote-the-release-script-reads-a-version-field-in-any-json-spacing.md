# Promote the release script reads a version field in any JSON spacing

Level: Consequential
Decided by: agent
Promotes: the-release-script-cannot-read-a-compact-json-version-field
Rests on: PKG-042 PKG-040 LOOP-087 LOOP-088
Would be wrong if: a manifest carries the version string in a nested field that the looser match would also find; then the exactly-once check still refuses it, so the risk is a refusal, not a wrong release
History: Five reversals in the decision domain; none about the release script. Consequential: it changes what a release writes, and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/the-release-script-cannot-read-a-compact-json-version-field.md, captured 2026-09-17 when release 0.4.0 was refused. Drafted requirement, PKG-042: the release script finds each version file's version field with any whitespace around its colon, and writes the new version without changing anything else in the file. Falsifier: a version file written as compact JSON makes the script refuse, or a release changes a byte of a version file other than the version. Mechanism: node-test through tests/release.test.mjs. Chosen because it is the only backlog item and it blocks the release the developer asked for.

## Realized by

(none yet: recorded, not built)
