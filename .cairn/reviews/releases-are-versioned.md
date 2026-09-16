commitment: releases-are-versioned
commit: f129935
examined:
  - cairn --version: prints the package.json version and exits 0 outside a repository and ahead of a command, and the help lists it; the read happens only when asked, so a kernel copied without package.json, as the hooks and plugin tests do with bin/, still wakes and judges; --version there is one line and exit 3.
  - the release script's refusals, each reproduced in the fixture tests: a malformed or extra argument, a version that is not an increase, a missing changelog entry, an existing tag, a version file that disagrees, a dirty tree including the changelog, and a loop not at Done; each is one line, exit 3, and leaves HEAD, the tags and the working tree as they were.
  - the release itself, in the fixture: one commit Release X.Y.Z setting the version in the four files, an annotated tag vX.Y.Z whose message is the changelog entry, a clean tree, and a loop that then asks for the next run because the version files are declared inputs; the heading's markdown marks are stripped from the tag message, since git drops lines that start with a hash.
  - the changelog entry is committed before the release, not carried into the release commit: the changelog is a declared input, so an uncommitted entry makes wake ask for a record and the script refuse; the guide says so.
  - the real changelog has an entry for package.json's version, pinned by a test, so a bump without an entry fails the suite as well as the script.
  - the kernel is 1514 of 1600 lines after the four lines this adds.
  - attack: the script run from a subdirectory of the checkout, where package.json is not in cwd; the read throws, printing a stack trace with exit 1 instead of one line and exit 3. Recorded as the open finding below.
findings:
  - resolved: scripts/release.mjs run from a directory without package.json or CHANGELOG.md printed a stack trace and exited 1; every file read now refuses in one line naming the file and the directory (6e327ea), with a test from a subdirectory.

## Commitment review at f8b9bf6, 2026-09-15

PKG-039, PKG-040 and the rest have current passing evidence; 460
tests pass, both lints clean. Attacked as listed under examined. One
open finding, resolved as its own work below.

## Commitment review at f129935, 2026-09-15

The resolution changed the script and its test; node-test and pkg-lint
rerun and passing. No open finding.
