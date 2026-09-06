---
name: install-cairn
description: Install or repair the Cairn command after its agent skills have been installed. Use when the user asks to set up Cairn or the cairn command is missing. Verifies the executable and PATH without adopting or changing a project.
---

# Install Cairn

Install the executable and verify that the agent can run it. Installing
these skills provides instructions and templates; it does not install the
`cairn` command. This workflow uses Node, Git, and a Bash-compatible shell.

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

For a fresh installation with both destinations available:

```sh
mkdir -p "$HOME/.local/share" "$HOME/.local/bin"
git clone https://github.com/eas4ai/cairn.git "$HOME/.local/share/cairn"
ln -s "$HOME/.local/share/cairn/bin/cairn.mjs" "$HOME/.local/bin/cairn"
export PATH="$HOME/.local/bin:$PATH"
cairn --help
```

Keep the checkout in place because the link points into it. This links
only the executable. The skills are already installed; running Cairn's
combined `scripts/link.sh` installer here can conflict with skills managed
by the skills CLI.

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
software or `existing-project` for an existing codebase. Installation alone
does not authorize adopting a project, writing AGENTS.md, or creating specs.

For updates, the checkout and skills are separate: `git pull --ff-only`
updates a clean Cairn checkout; `npx skills update install-cairn new-project
existing-project` refreshes skills installed with that CLI.
