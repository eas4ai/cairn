# Cairn installs by one script

Slug: cairn-installs-by-one-script
Requirements: PKG-014, PKG-005, PKG-006
Inherits: every PKG requirement

## Goal

A developer with node and git puts Cairn on the path and its skills in
front of their agent with one command, and takes it away with one.

The kernel was on no path and the skills were linked into no agent's
skill directory, so the only way to use Cairn on another repository was
the kernel by absolute path with --root. Promoted from the backlog on
the developer's word.

Delivers three things.

- scripts/link.sh: links bin/cairn.mjs onto the path as cairn and each
  skills/<name>/ into each skill directory it is given, so a git pull
  keeps every install current. Defaults: $HOME/.local/bin and
  $HOME/.agents/skills, the cross-vendor skill directory; any directory
  can be passed, so no harness is required (PKG-006). A link that
  already exists and points outside this repository is reported and
  kept; --force replaces it, and only a link, never a real directory.
  --unlink removes the links this script made and nothing else.
- The README's install section, which documents the script. The skills
  follow the Agent Skills layout, so any skills installer reads them
  as they are.
- No plugin manifest and no hook. A manifest is a second copy of the
  skill list to keep in sync, and the linked directory reaches the same
  harness. A hook that stops an agent from stopping would manage its
  execution, which PKG-012 forbids; the working agreement is the
  mechanism.

## Where things live

    scripts/link.sh          the installer; bash, no dependencies
    tests/install.test.mjs   runs it into a temporary home

## Tests

- the script links cairn and both skills into the given directories,
  and the linked cairn runs wake on a fixture repository; a second run
  is the same as one (PKG-014, PKG-005)
- a link owned by another package is reported and kept; --force
  replaces it; --unlink removes the script's links and leaves a
  stranger's

## Done when

- PKG-014 has current passing evidence from node-test.
- A review record at the current commit with no open finding.
- `cairn wake` says Done.
