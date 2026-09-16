---
name: install-cairn
description: Install or repair the Cairn command after its agent skills have been installed. Use when the user asks to set up Cairn or the cairn command is missing. Verifies the executable and PATH without adopting or changing a project.
---

# Install Cairn

Install the executable and verify that the agent can run it. Installed
through the skills CLI, these skills provide instructions and templates
and do not install the `cairn` command; installed as a plugin, the
command comes with them. This workflow uses Node, Git, and a
Bash-compatible shell.

## When Cairn came as a plugin

A harness with a plugin marketplace installed Cairn as a plugin: the
plugin root, the directory two levels above this SKILL.md, holds
`bin/cairn.mjs` and `bin/hook.mjs`, and the harness registered both
hooks from the plugin's `hooks/hooks.json`. There is nothing to clone
and nothing to merge into settings; hook entries written by hand from
the snippet below, if any, are removed, since two registrations run
the hooks twice. The session-start hook links
`$HOME/.local/bin/cairn` to the plugin's `bin/cairn.mjs` at session
start; when the link is missing, run `node <plugin root>/bin/hook.mjs
session-start` once. Then verify PATH and `cairn --help` as below. A
plugin updates through its marketplace; the link follows once it is
removed or its target is gone.

## Check what is already installed

Run `command -v cairn`, `node --version`, and `git --version`. If Cairn is
found, run `cairn --help` and inspect its path. A working Cairn installation
can be reused; do not clone or replace it just to follow the example below.
If a prerequisite is missing, report which one is needed before proceeding.

Use an installation location the user already chose. Otherwise, use
`$HOME/.local/share/cairn` for the persistent checkout and `$HOME/.local/bin`
for the executable link. Inspect either destination if it already exists.
Do not reset an existing checkout or overwrite another file or command.
For an older Cairn checkout without help, inspect its Git origin and local
changes before updating it with `git pull --ff-only`. A failed pull needs
inspection, not a reset. Recheck help after an update.

## Install the command

For a fresh installation, keep a persistent checkout and let the
session-start hook do the linking:

```sh
mkdir -p "$HOME/.local/share"
git clone https://github.com/eas4ai/cairn.git "$HOME/.local/share/cairn"
node "$HOME/.local/share/cairn/bin/hook.mjs" session-start
export PATH="$HOME/.local/bin:$PATH"
cairn --help
```

The hook links `$HOME/.local/bin/cairn` to the checkout's `bin/cairn.mjs`
when nothing is there or the link's target no longer exists, and leaves
any other file or link alone. The hooks judge with the `cairn` on PATH,
then with that link's target, then with their own checkout, and say
which at session start. Keep the checkout in place because the link
points into it.

Then register the two hooks once, so every later session starts from
the wake verdict and a stop is refused while the verdict is Resolvable.
Use the absolute checkout path in place of `<checkout>`. For Claude
Code, merge into `$HOME/.claude/settings.json`, preserving its other
contents:

```json
{ "hooks": {
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "node <checkout>/bin/hook.mjs session-start" }] }],
  "Stop":         [{ "hooks": [{ "type": "command", "command": "node <checkout>/bin/hook.mjs stop" }] }] } }
```

For Codex, write the same object to `$HOME/.codex/hooks.json`. Show the
user the entries you wrote. Another harness that passes JSON on standard
input and reads standard output takes the same two commands under its
own event names. The hooks are optional: the working agreement is the
path an agent takes without them.

If the link exists but the command is not found, fix PATH. Add the export
line to the appropriate startup file for the user's shell only if needed,
preserving its existing contents. An export in a child shell does not
change the parent agent's environment; use the absolute executable path
until its environment is refreshed. Do not claim PATH is fixed everywhere
because it worked in one subprocess.

## Verify and hand back

Check the resolved executable and successful help output. Report where
Cairn is installed and whether a new terminal or agent session is needed
to pick up PATH. If verification fails, name the actual failure.

When installation is complete, point the user to `new-project` for new
software, `existing-project` for an existing codebase, or
`next-iteration` for a project already under Cairn whose loop reports
Done. Installation alone does not authorize adopting a project, writing
AGENTS.md, or creating specs.

For updates, the checkout and skills are separate: `git pull --ff-only`
updates a clean Cairn checkout, and the link and hooks follow it; `npx
skills update install-cairn new-project existing-project next-iteration`
refreshes skills installed with that CLI.
