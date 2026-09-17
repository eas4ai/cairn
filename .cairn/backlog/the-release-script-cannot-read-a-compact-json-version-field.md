# The release script cannot read a compact JSON version field

Surfaced from: PKG-040
Outside because: found while cutting release 0.4.0 after the current commitment reached Done; the commitment's own falsifiers pass, and the script's refusal blocks the release rather than producing a wrong one
Captured: 2026-09-17T13:22:53.108Z

scripts/release.mjs finds the version in each manifest by the literal text "version": "X" with a space after the colon. .muse-plugin/plugin.json is written as compact JSON, "version":"0.3.0", so the script refuses every release with '.muse-plugin/plugin.json does not carry "version": "0.3.0" exactly once'. Reproduced on 2026-09-17 trying to cut 0.4.0. The test fixture writes every manifest with a space, so PKG-040's test never saw the compact form. The script should match the field with any whitespace around the colon and keep each file's formatting when it writes the new version.
