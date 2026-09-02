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
an existing one, and vendor the gate script at exactly
skills/new-project/scripts/spec-drift-gate.mjs under the repository root.
The hook resolves that path from the git top level and exits silently
when the file is absent, so a partial setup never blocks a session.

## What lands where

The skills CLI installs all three skills into your agent's native skill
directory (the spec-set templates, the drift-gate script, and the
language check ride inside the new-project skill; existing-project
carries its own recon and defect templates); -g targets the user-level
directory. On its first run, /new-project or /existing-project offers
to register the gate for your project. The Claude Code plugin registers
the gate automatically at install. For Codex, the gate is registered
via .codex/hooks.json. Agents with neither hooks nor skills follow
docs/WORKFLOW.md in this package.

## Local development install

    ./scripts/link-skills.sh

Symlinks the skills into ~/.claude/skills and ~/.agents/skills so a git
pull keeps them current.

## The engine (Same Page Conformance)

The engine ships inside the new-project skill at
skills/new-project/scripts/engine/same-page.ts and needs no install: it
is TypeScript that node 22.18 or later runs directly (type stripping is
on by default from that version; node 24 prints an ExperimentalWarning
unless run with --disable-warning=ExperimentalWarning), and bun runs
unchanged. From a project root:

    node --disable-warning=ExperimentalWarning <skill dir>/scripts/engine/same-page.ts elaborate
    node --disable-warning=ExperimentalWarning <skill dir>/scripts/engine/same-page.ts verify

or `bun <skill dir>/scripts/engine/same-page.ts elaborate`. The skills
name the step at every stage close.
