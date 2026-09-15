commitment: lints-and-tests-observe-what-they-name
commit: 6fe5e82
examined:
  - mechanism review, SPEC-028 revised: tests/spec-lint.test.mjs "a regex literal is not a path ..." observes an anchor and a group but neither a class nor a quantifier, which the revised falsifier names; the checker still exempts the old set. Mismatch, recorded as the open finding below and fixed as this commitment's own work.
  - mechanism review, PKG-025 revised: tests/coverage.test.mjs reads the node-test declaration by its filename and scans every test title; it runs under that mechanism, so the file it reads is the declaration of the mechanism running it. No mismatch.
  - mechanism review, PKG-026 revised: tests/coverage.test.mjs matches three read shapes; the revised rationale says every ../ literal and relative import. Mismatch, recorded below and fixed as this commitment's own work.
findings:
  - open: the SPEC-028 checker exempts ^ $ * | ? and backslash only, and its test observes no class or quantifier; the PKG-026 scan sees three read shapes and misses template-string URLs, relative imports, and cpSync of the kernel directory.

## Mechanism reviews at 6fe5e82, 2026-09-15

Recorded before any code change in this commitment. The two
mismatches are the audit's F1 and E1, which this commitment exists to
fix; they are open findings until the fix is committed and checked.
