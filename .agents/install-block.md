# Install block

Copied verbatim wherever install commands appear (README, INSTALLATION).

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
