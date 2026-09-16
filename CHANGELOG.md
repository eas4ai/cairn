# Changelog

Every release is one tagged commit; the tag is v<version>, and
scripts/release.mjs cuts it, as docs/releasing.md describes. Versions
follow semantic versioning below 1.0: a patch changes no verdict,
record shape or document meaning; a minor adds or revises
requirements, verdicts or record shapes and still reads earlier
records; a major changes what earlier records mean.

## 0.3.0 - 2026-09-15

- `cairn --version` prints the version from package.json.
- scripts/release.mjs cuts a release as one tagged commit, after
  checking the tree, the version, this file, the tag and the loop.
- This changelog, and docs/releasing.md.

## 0.2.0 - 2026-09-15

- Cairn installs as a plugin from a marketplace, in Claude Code and
  in Codex: the manifest, the marketplace listing and hooks/hooks.json
  register the session-start and stop hooks from the plugin.
- The second audit's remediation: the gates bind to the commitment,
  every record shape is read or repaired by name, the hooks find the
  kernel and the project, the lints and tests observe what they name,
  the documents say what the code does, and the verifiers' findings
  are closed.
- The kernel ceiling is 1600 lines.

## 0.1.0 - 2026-09-04

- The kernel, the four skills, and the hooks registered by hand.
