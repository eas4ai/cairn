commitment: the-release-script-reads-a-version-field-in-any-json-spacing
commit: 25af927d
examined:
  - the failure demonstration before the fix: with the new test in place and scripts/release.mjs at ab5e655's parent, the release of a fixture whose Muse manifest is compact was refused with the same line the real 0.4.0 release printed, '.muse-plugin/plugin.json does not carry "version": "0.1.0" exactly once'; with the change it releases 0.2.0, the compact file stays compact with only the version changed, the three pretty manifests and the marketplace listing are byte for byte what a release should write, and the tag exists. The four release tests pass, and the full suite passes at 486.
  - the real repository, on a scratch clone: the script passed the version-file check on all five real files, which the old script refused, and stopped only at the Done check because this review did not exist yet. A direct count shows each of the five files carries the field exactly once.
  - the match on shapes, probed directly: pretty, compact, a newline after the colon and tabs around it each match once and keep their spacing when rewritten; a minVersion or engine_version key carrying the same value is not matched, because the pattern needs the quote directly before version; a version that differs only in its dots is not matched, since the dots are escaped; a file carrying the field twice matches twice and is refused as before.
  - the refusals that came before this change are unchanged: every existing release test, including the disagreeing file and the dirty tree, passes.
  - the documents: docs/releasing.md says the script sets the version in the version files and names none of their formatting, so nothing there needs to change.
  - the package: every mechanism re-run after the script change, every requirement pass.
findings: []

## Commitment review at 25af927d, 2026-09-17

The fixture was the defect's hiding place: every manifest in it had the
spacing the script expected, so the requirement's test passed while no
real release could be cut. The new test writes the one shape the real
repository ships, and the clone run shows the real files pass.

No open finding.
