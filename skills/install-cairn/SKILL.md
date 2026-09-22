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
Install the plugin with `muse plugins install <plugin root>`, then approve its two hooks with `muse plugins approve cairn:hook:session-start` and `muse plugins approve cairn:hook:stop`; its manifest registers SessionStart and Stop. Continue at `link`.

### `other`
Install the four skills with the skills CLI (`npx skills add eas4ai/cairn --skill install-cairn new-project existing-project next-feature --global`), then run this skill. Register `hooks/session-start.sh`, `hooks/turn.sh` and `hooks/stop.sh` under the harness's own event names where it has them. No hook system: `nohooks`.

### `nohooks`
Instruction-only: the working agreement in AGENTS.md is the enforcement and the agent runs `cairn wake` itself. Continue at `link`.

### `link`
Install the command shim, `bin/cairn.sh`, at `~/.local/bin/cairn`. It runs the newest installed Cairn at run time (`$CAIRN_ROOT` when set, else the newest Claude Code or Codex plugin cache entry or the checkout at `~/.local/share/cairn`, by version), so a plugin update never strands it. Write it when nothing is there, or when what is there is a symlink to a `bin/cairn.mjs` or an earlier copy of the shim; never replace any other file. No remote is selected here.

    mkdir -p ~/.local/bin
    if [ ! -e ~/.local/bin/cairn ] || [ -L ~/.local/bin/cairn ] || grep -q 'cairn command shim' ~/.local/bin/cairn; then
      rm -f ~/.local/bin/cairn && cp "<plugin root>/bin/cairn.sh" ~/.local/bin/cairn && chmod +x ~/.local/bin/cairn
    fi

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
