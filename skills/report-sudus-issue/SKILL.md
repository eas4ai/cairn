---
name: report-sudus-issue
description: Report a defect in Sudus itself to the eas4ai/sudus issue tracker after the developer's ok, then watch the issue and update the plugin when the fix is released. Use when a sudus command crashes or exits with an internal error, refuses something the manual says it accepts, wake keeps naming an action whose predicate already holds, or a sudus message contradicts the manual.
---

# Report a Sudus issue

This skill is for a defect in Sudus itself. A failing check, an adversary finding, a scope breach or an escalation is Sudus working as designed: follow the working agreement for those, not this skill.

### `confirm`
Name what Sudus did wrong. Signs of a defect: a stack trace, or "exited N" from a `git` call inside a sudus command; a refusal of something the manual says the command accepts; wake naming the same action after its predicate holds; a message that contradicts the manual. Run `sudus --version` and note the version and the harness. If you cannot say what Sudus should have done instead, it is not yet a report: read the manual section for the command first.

### `search`
Look for an existing report: `gh issue list --repo eas4ai/sudus --state all --search "<the command and the key words of the message>"`. An open issue that matches: go to `watch` with its number; add a comment only when you have facts it lacks, and a comment is a public post like a new issue, so it waits for the developer's ok too. A closed issue that matches and names a release newer than your version: go to `update`. Nothing matches: `reproduce`.

### `reproduce`
Reproduce the defect in a scratch repository outside the project (`mktemp -d`, `git init`, and `sudus init --local-only --quote "scratch reproduction of a Sudus defect"` when the defect needs an initialized project; the scratch repository is thrown away and never pushed), with the smallest spec and the fewest commands that still show it. Keep the exact commands and their output. If it happens only in the project, describe the state that triggers it in general terms instead of copying it.

### `draft`
Write the issue in a file: a one-line title that says what fails; then the Sudus version and harness, the command, the output quoted exactly except for what the next sentence keeps out, what the manual says should happen, the reproduction steps, and the cause when you found it (a file and line in the Sudus plugin). The issue is public. Never put in it the project's code, spec text or record contents, a secret, key or token, a hostname, the developer's name or email, or a path under their home directory (write `~` instead).

### `ask`
Put the report to the developer before anything leaves the machine: what fails, that the issue goes to github.com/eas4ai/sudus and is public, and that it is filed under their GitHub account. End with `ok | instead | ask` and wait. On `ok`, file it: `gh issue create --repo eas4ai/sudus --title "<title>" --body-file <draft>`, and note the number. On `instead`, do what they say instead, which may be not filing. On `ask`, answer, then ask again. Never file without an `ok`. When `gh` is missing or not signed in, say so in one line, keep the draft file, and continue at `work`.

### `work`
Keep working around the defect where the working agreement allows it. When the defect blocks every next action, tell the developer in one line, with the issue link, and wait for the fix.

### `watch`
Watch the issue until it closes. Where the harness runs background commands, start one that ends when the issue closes:

    until [ "$(gh issue view <n> --repo eas4ai/sudus --json state --jq .state)" = CLOSED ]; do sleep 300; done

Where it cannot, check `gh issue view <n> --repo eas4ai/sudus --json state` at the start of each turn. When the issue closes: `update`.

### `update`
Read the closing comment: it names the fix commit and the release. Closed without a fix: tell the developer in one line and stop. Otherwise update the plugin from its marketplace, using the marketplace name the list command shows:

- Claude Code: `claude plugin marketplace update <marketplace>`, then `claude plugin update sudus@<marketplace>`.
- Codex: `codex plugin marketplace upgrade`, then `codex plugin add sudus@<marketplace>`.
- Muse: `muse plugins marketplace update <marketplace>`, then `muse plugins update sudus`.
- A checkout at `~/.local/share/sudus`: `git -C ~/.local/share/sudus pull --ff-only`.

Run `sudus --version`: the command shim runs the newest installed Sudus, so it names the release now. Then tell the developer in one line which release fixes which issue, and that the session needs a reload for the harness to load the new skills and hooks. After the reload, repeat the command that failed. If it still fails, draft a comment on the issue with what you see now, and `ask` before posting it.
