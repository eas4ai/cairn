---
name: install-sudus
description: Make the sudus command available to this agent once, globally, and register the hooks the harness supports. Never initializes or changes a project. Use when sudus is missing, the link is broken, or the developer asks to set Sudus up.
---

# Install Sudus

Global setup only. Nothing here touches a repository: `sudus init` belongs to the new-project and existing-project skills.

### `start`
A harness with no Sudus. Follow the nodes in order.

### `prereq`
Run `node --version` and `git --version`: Node 24 and Git 2.40 or later. Either missing: `missing`. Both present: `harness`.

### `missing`
Stop and name the missing prerequisite. Do not install it silently.

### `harness`
Claude Code or Codex: `cc`. Muse: `muse`. Anything else: `other`.

### `cc`
Install the Sudus plugin from its marketplace. The plugin registers the hooks in `hooks/hooks.json` (Claude Code: SessionStart, UserPromptSubmit, Stop). Do not also write hook entries by hand; two registrations run a hook twice. Continue at `link`.

### `muse`
Install the plugin with `muse plugins install <plugin root>`, then approve its two hooks with `muse plugins approve sudus:hook:session-start` and `muse plugins approve sudus:hook:stop`; its manifest registers SessionStart and Stop. Continue at `link`.

### `other`
Install the four skills with the skills CLI (`npx skills add eas4ai/sudus --skill install-sudus new-project existing-project next-feature --global`), then run this skill. Register `hooks/session-start.sh`, `hooks/turn.sh` and `hooks/stop.sh` under the harness's own event names where it has them. No hook system: `nohooks`.

### `nohooks`
Instruction-only: the working agreement in AGENTS.md is the enforcement and the agent runs `sudus wake` itself. Continue at `link`.

### `link`
Install the command shim, `bin/sudus.sh`, at `~/.local/bin/sudus`. It runs the newest installed Sudus at run time (`$SUDUS_ROOT` when set, else the newest Claude Code or Codex plugin cache entry or the checkout at `~/.local/share/sudus`, by version), so a plugin update never strands it. Write it when nothing is there, or when what is there is a symlink to a `bin/sudus.mjs` or an earlier copy of the shim; never replace any other file. No remote is selected here.

    mkdir -p ~/.local/bin
    if [ ! -e ~/.local/bin/sudus ] || [ -L ~/.local/bin/sudus ] || grep -q 'sudus command shim' ~/.local/bin/sudus; then
      rm -f ~/.local/bin/sudus && cp "<plugin root>/bin/sudus.sh" ~/.local/bin/sudus && chmod +x ~/.local/bin/sudus
    fi

### `path`
Is `~/.local/bin` on PATH? `command -v sudus` answers. Yes: `help`. No: `addpath`.

### `addpath`
Tell the developer to add `export PATH="$HOME/.local/bin:$PATH"` to their shell startup file. No hook edits the shell. Until a new shell, use the absolute path `~/.local/bin/sudus`. Then `help`.

### `help`
Run `sudus --help`. It prints the command list: `project`. It does not: `broken`.

### `broken`
Stop and name the failure exactly as observed: link target, PATH or node.

### `project`
Is this an initialized Sudus project? `sudus wake` exits 0 with a verdict when it is (`wake`) and 3 with one line naming the skill that continues when it is not (`choose`).

### `wake`
The session-start hook prints the verdict and predicate. Hand the developer to the working agreement.

### `choose`
Choose `/new-project` or `/existing-project`; the chosen flow runs `sudus init`. Installation never does.

### `done`
Report where the command is linked, which hooks are registered, and that the four skills are available.
