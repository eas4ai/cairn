# Installing Same Page

## Any agent (skills CLI)

    npx skills add eas4ai/same-page

Global install (available in every project):

    npx skills add -g eas4ai/same-page

## Claude Code (plugin, includes the drift gate)

    /plugin marketplace add eas4ai/same-page
    /plugin install same-page@same-page

## Codex (drift gate)

Copy .codex/hooks.json into the target repo, or merge its Stop entry into
an existing one, and vendor skills/new-project/scripts/spec-drift-gate.mjs alongside.

## What lands where

The skills CLI installs both skills into your agent's native skill
directory (templates and the drift-gate script ride inside the
new-project skill); -g targets the user-level directory. On its first
run, /new-project offers to register the gate for your project. The
Claude Code plugin registers the gate automatically at install. For
Codex, the gate is registered via .codex/hooks.json.
Agents with neither hooks nor skills follow docs/WORKFLOW.md in this
package.

## Local development install

    ./scripts/link-skills.sh

Symlinks the skills into ~/.claude/skills and ~/.agents/skills so a git
pull keeps them current.
