# Cairn installs by one link script, with no plugin and no hook

Level: Consequential
Decided by: agent
Rests on: PKG-014, PKG-005, PKG-006, PKG-012, PKG-001
Would be wrong if: a harness the developer uses cannot read a skill from a linked directory or a binary from the path; or the developer rules that a stop hook does not manage the agent's execution, in which case PKG-012 is superseded first and the hook follows
History: the PKG reversal was a deferral framing; this record ships every channel the specification allows and names the two it does not ship with the requirement that excludes each, and is Consequential because it writes links into the developer's home directory

## Decision

The kernel was on no path and the skills were linked into no agent's skill directory. One script, scripts/link.sh, links bin/cairn.mjs onto the path and each skill into each skill directory it is given, defaulting to $HOME/.local/bin and $HOME/.agents/skills, so a git pull keeps every install current and --unlink takes it away. Any directory can be passed, so no harness is required (PKG-006). A link that exists and points outside this repository is reported and kept unless --force is passed, and --force replaces only a link, never a real directory, because on the developer's machine the skill names already resolve to another package.

A plugin manifest is a second copy of the skill list to keep in sync, and the linked directory reaches the same harness. A stop hook that keeps the agent working would manage its execution, which PKG-012 forbids; the working agreement is the mechanism for the same end. Either channel requires a supersession of the requirement that excludes it before it can be added.

## Realized by

- 7e42ed3  Cairn installs by one link script
