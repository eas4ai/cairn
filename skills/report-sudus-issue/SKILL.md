---
name: report-sudus-issue
description: Report a defect in Sudus itself to the eas4ai/sudus issue tracker after the developer's ok, then watch the issue and update the plugin when the fix is released. Use when a sudus command crashes or exits with an internal error, refuses something the manual says it accepts, wake keeps naming an action whose predicate already holds, or a sudus message contradicts the manual.
---

# Report a Sudus issue

This skill is for a defect in Sudus itself. A failing check, an adversary finding, a scope breach or an escalation is Sudus working as designed: follow the working agreement for those, not this skill. An adversary report that stopped on a Sudus bug is the exception: its `sudus_bug` text names a defect, and this skill is how it reaches eas4ai/sudus.

Everything this skill sends to GitHub -- a search, an issue, a comment -- is public or leaves the machine, so it keeps out the project's code, spec text and record contents; any secret, key or token, including one inside a remote URL; hostnames, IP addresses and remote URLs; the developer's name and email; and any path under their home directory (write `~` instead). Nothing is posted -- no issue, no comment -- until the developer answers `ok`.

### `confirm`
Name what Sudus did wrong. Signs of a defect: a stack trace, or "exited N" from a `git` call inside a sudus command; a refusal of something the manual says the command accepts; wake naming the same action after its predicate holds; a message that contradicts the manual. Run `sudus --version` and note the version and the harness. If you cannot say what Sudus should have done instead, it is not yet a report: read the manual section for the command first.

### `search`
Look for an existing report with the sudus command name and a few generic words of the message, never a path, URL or value from it: `gh issue list --repo eas4ai/sudus --state all --search "<command> <generic words>"`. Then:
- An open issue that matches: `watch` it. When you have facts it lacks, `draft` them as a comment on it.
- A closed issue that matches, whose closing comment names a release newer than your version: `update`.
- A closed issue that matches, fixed in your version or earlier, or closed without a fix: the defect is back or was never fixed. `reproduce`, then `draft` a new issue that names the old one.
- Nothing matches: `reproduce`.

### `reproduce`
Reproduce the defect in a scratch repository outside the project (`mktemp -d`, `git init`, and `sudus init --local-only --quote "scratch reproduction of a Sudus defect"` when the defect needs an initialized project; the scratch repository is thrown away and never pushed), with the smallest spec and the fewest commands that still show it. Keep the exact commands and their output. If it happens only in the project, describe the state that triggers it in general terms instead of copying it.

### `draft`
Write the post in a file. A new issue: a one-line title that says what fails; then the Sudus version and harness, the command, the output quoted exactly apart from what the rule above keeps out, what the manual says should happen, the reproduction steps, and the cause when you found it (a file and line in the Sudus plugin). A comment: only the facts the issue lacks, under the same rule. Then `ask`.

### `ask`
Put the post to the developer before anything leaves the machine: what fails, whether it is a new issue or a comment on issue `<n>`, that it goes to github.com/eas4ai/sudus and is public, and that it is posted under their GitHub account. End with `ok | instead | ask` and wait. On `ok`, post it: a new issue with `gh issue create --repo eas4ai/sudus --title "<title>" --body-file <draft>`, noting its number; a comment with `gh issue comment <n> --repo eas4ai/sudus --body-file <draft>`. On `instead`, do what they say instead, which may be not posting. On `ask`, answer, then ask again. Never post without an `ok`. When `gh` is missing or not signed in, say so in one line, keep the draft file, and continue at `work`.

### `work`
Keep working around the defect where the working agreement allows it. When the defect blocks every next action, tell the developer in one line, with the issue link, and wait for the fix.

### `watch`
Watch the issue until it closes. Where the harness runs background commands, start one that ends when the issue closes:

    until [ "$(gh issue view <n> --repo eas4ai/sudus --json state --jq .state)" = CLOSED ]; do sleep 300; done

Where it cannot, check `gh issue view <n> --repo eas4ai/sudus --json state` at the start of each turn. When the issue closes: `update`.

### `update`
Read the closing comment: it names the fix commit and the release. Closed without a fix: tell the developer in one line and stop. Otherwise update the plugin, using the marketplace name the harness's marketplace list command shows:

- Claude Code: `claude plugin marketplace update <marketplace>`, then `claude plugin update sudus@<marketplace>`.
- Codex: `codex plugin marketplace upgrade`, then `codex plugin add sudus@<marketplace>`.
- Muse: `muse plugins marketplace update <marketplace>` when the plugin came from a marketplace, then `muse plugins update sudus`.
- A checkout at `~/.local/share/sudus`: `git -C ~/.local/share/sudus pull --ff-only`.

Run `sudus --version`: the command shim runs the newest installed Sudus, so it names the release now. Then tell the developer in one line which release fixes which issue, and that the session needs a reload for the harness to load the new skills and hooks. After the reload, repeat the command that failed. If it still fails, `draft` a comment on the issue with what you see now.
