---
name: install-cairn
description: Make the cairn command available to this agent once, globally, and register the hooks the harness supports. Never initializes or changes a project. Use when cairn is missing, the link is broken, or the developer asks to set Cairn up.
---

# Install Cairn

Global setup only. Nothing here touches a repository: `cairn init` belongs to the new-project and existing-project skills.

### `start`
A harness with no Cairn. Follow the nodes in order.

### `prereq`
Run `node --version` and `git --version`: Node 24 and Git 2.40 or later. Either missing: `missing`. Both present: `harness`.

### `missing`
Stop and name the missing prerequisite. Do not install it silently.

### `harness`
Claude Code or Codex: `cc`. Muse: `muse`. Anything else: `other`.

### `cc`
Install the Cairn plugin from its marketplace. The plugin registers the hooks in `hooks/hooks.json` (Claude Code: SessionStart, UserPromptSubmit, Stop). Do not also write hook entries by hand; two registrations run a hook twice. Continue at `link`.

### `muse`
Install the plugin with `muse plugins install <plugin root>`; its manifest registers SessionStart and Stop. Continue at `link`.

### `other`
Install the four skills with the skills CLI (`npx skills add eas4ai/cairn --skill install-cairn new-project existing-project next-feature --global`), then run this skill. Register `hooks/session-start.sh`, `hooks/turn.sh` and `hooks/stop.sh` under the harness's own event names where it has them. No hook system: `nohooks`.

### `nohooks`
Instruction-only: the working agreement in AGENTS.md is the enforcement and the agent runs `cairn wake` itself. Continue at `link`.

### `link`
Link the command once, only when nothing is there, and never replace an existing file. No remote is selected here.

    mkdir -p ~/.local/bin
    [ -e ~/.local/bin/cairn ] || ln -s "<plugin root>/bin/cairn.mjs" ~/.local/bin/cairn

### `path`
Is `~/.local/bin` on PATH? `command -v cairn` answers. Yes: `help`. No: `addpath`.

### `addpath`
Tell the developer to add `export PATH="$HOME/.local/bin:$PATH"` to their shell startup file. No hook edits the shell. Until a new shell, use the absolute path `~/.local/bin/cairn`. Then `help`.

### `help`
Run `cairn --help`. It prints the commands and exit codes: `project`. It does not: `broken`.

### `broken`
Stop and name the failure exactly as observed: link target, PATH or node.

### `project`
Is this an initialized Cairn project? `cairn wake` exits 0 with a verdict when it is (`wake`) and 3 with one line naming the skill that continues when it is not (`choose`).

### `wake`
The session-start hook prints the verdict and predicate. Hand the developer to the working agreement.

### `choose`
Choose `/new-project` or `/existing-project`; the chosen flow runs `cairn init`. Installation never does.

### `done`
Report where the command is linked, which hooks are registered, and that the four skills are available.
