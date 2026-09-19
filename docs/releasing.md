# Releasing Cairn

A release is one tagged commit. Every file a marketplace reads carries
the same version, CHANGELOG.md says what changed, and the release tag
carries that entry as its message. The version lives in package.json;
four plugin manifests, under `.claude-plugin/`, `.codex-plugin/`, and
`.muse-plugin/`, mirror it.

`scripts/release.mjs` cuts the release. Run it from the checkout root:

```sh
node scripts/release.mjs X.Y.Z
```

It refuses, in one line and with nothing written, when any of these
holds:

- One of the five version files (`package.json`,
  `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`,
  `.codex-plugin/plugin.json`, `.muse-plugin/plugin.json`) does not
  carry `"version": "<the current version>"` exactly once.
- CHANGELOG.md has no `## X.Y.Z - YYYY-MM-DD` entry for the version you
  named.
- The tag `vX.Y.Z` already exists.
- The working tree is dirty. Write the CHANGELOG.md entry first, then
  run the script; it commits that entry with the release, so a release
  costs one check and one review, not two.
- `.cairn/settings.json` sets `attribution: forbidden` and a commit
  since the last release tag carries an AI attribution line: a
  `Co-Authored-By:` naming a known assistant, a `Generated with
  [Claude Code` marker, a `Claude-Session:` trailer, a
  `claude.ai/code/session` URL, or a `Signed-off-by:` at
  `noreply@anthropic.com`. Reword the offending commit before
  releasing.
- The loop is not at Done: `cairn wake` does not report `Done`. A
  release is a complete commitment, never work in flight.

When none of these holds, the script sets the new version in the five
files, commits `Release X.Y.Z`, and tags `vX.Y.Z` with the changelog
entry as the tag message.

## After the script runs

The version files are declared inputs to some mechanisms, so their
evidence goes stale at the release commit, the same way any committed
change to a declared input does. Check every requirement wake names,
record the review, and let wake reach `Done` again before you push.
Push the branch and the tag together:

```sh
git push origin main vX.Y.Z
```

Never push `refs/cairn/log` or `refs/cairn/snapshots` with plain
`git push`; `cairn push` moves those two refs, atomically with the
branch where the remote allows it. A GitHub release is optional.

A harness refreshes an installed plugin when the marketplace's version
changed, so the version bump is what reaches users; a change pushed
under the same version reaches nobody who already installed it.

## Versions

Cairn 2 is versioned 2.0.0 and above, under ordinary semantic
versioning:

- **patch**: no verdict, record shape, or document meaning changes.
- **minor**: requirements, verdicts, or record shapes are added or
  revised, and earlier records still read.
- **major**: earlier records mean something else.

A receipt's freshness never depends on which kernel version wrote it.
Freshness depends only on the input snapshot tree, the mechanism
definition digest, the requirement text digest, the observed declared
execution identity, and the record schema (section 2 of the
specification). Upgrading Cairn itself does not, by itself, stale any
evidence.

## Attribution and this repository's own release process

The attribution check, the five-file version mirror, and this
document belong to how this repository develops and releases Cairn.
They are not part of the Cairn product specification: a project using
Cairn to build something else follows its own release process, and
only the `attribution` setting in `.cairn/settings.json` is something
Cairn's kernel itself acts on, through `scripts/release.mjs`.
