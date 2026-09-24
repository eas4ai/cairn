# Working agreement

This repository runs under Sudus. `docs/spec/` is the contract, the roadmap names the current commitment, and `sudus` reads the repository and names the next action. This file states the move for each verdict and action. The kernel does not parse it; it is protected and changes only between commitments, by developer authorization.

## The agent

Run `sudus wake` first, every session, and act on the verdict only. With hooks the verdict is printed before every turn; this agreement holds without them.

- Resolvable: do the one action named until its predicate holds, leave the required trace (branch commit, snapshot or log record), then run `sudus wake` again.
- Waiting: an escalation is unanswered and wake printed its five fields verbatim. Add nothing to the work. Put the escalation to the developer as "The developer" below says, ending with `ok | instead | ask`, and when they answer, record it yourself with `sudus answer`. Never hand them a command to run.
- Done: a done record exists and nothing waits. Report it and stop. Backlog waiting: wake names `promote` instead.

Before changing a declared input: `sudus begin <action> <target>` (`--touch <path>` declares a new file that no input of the leased mechanism covers); it prints the lease sha. After the commit: `sudus end --lease <sha>` with that sha, so a stale end never closes another session's lease. Commit before `sudus check`; an uncommitted declared input makes wake name `commit` or `record` before anything else. Push with `sudus push`: it pushes the branch and both durable refs atomically where the remote allows and in the safe order otherwise. Never push `refs/sudus/*` with plain `git push`.

The move for each action wake can name:

- `repair PATH`: make the hand-written file read under its grammar; change no unrelated byte.
- `recover TRANSACTION`: run `sudus recover <transaction>`.
- `reconcile ACTION`: finish the leased action and `sudus end`, or abandon it with `sudus end --abandon`; a lease left by a dead session needs no `--lease`.
- `scope PATH`: restore the path to its allowed base and run `sudus scope <breach> restore`, or ask the developer to keep it with `sudus escalate` and, after `ok`, `sudus scope <breach> keep`.
- `fix ITEM`: write a test that fails, make it pass, commit, check, then `sudus fix <item>`.
- `record PATH` and `commit PATH`: PATH is a declared input with uncommitted changes. Lease the action that changes it (`sudus begin <action> <target>`, with `--touch PATH` when PATH is new; `record` is a verdict, not a begin action), then commit; or revert it. An untracked build artifact under a declared input (a Python cache, a build output) is gitignored instead.
- A tool that rewrites `AGENTS.md` or `docs/spec/` on its own (an indexer that keeps a block in `AGENTS.md`, for example GitNexus) breaks the protected contract mid-commitment and shows up as a scope breach on that file. Run such tools with their skip option (`gitnexus analyze --skip-agents-md`, or `--index-only`) while a commitment is open, or restore the file; a tool-managed block never belongs in the working agreement.
- `docs/decisions.jsonl` is appended by `sudus decide`, `sudus answer`, `sudus realize` and `sudus decisions --read` and is not committed by them: commit it with your next commit (`git add -f` when `docs/` is ignored). A declaration does not go through while a path it would cover has uncommitted changes: commit that path or lease it with `sudus begin <action> <target> --touch <path>` first.
- `declare REQ`: `sudus declare` a mechanism naming REQ; show it fail on a violating example before trusting it.
- `run REQ`: `sudus check REQ`.
- `implement REQ`: read the latest receipt and its output, change the code under a lease, commit, `sudus end`, `sudus check REQ`.
- `escalate REQ`: three attempts failed; `sudus escalate` with the five fields before any fourth attempt.
- `review mechanism REQ`: `sudus review mechanism REQ <fail-receipt>` after checking the failure was the stated violation.
- `capture ITEM`: `sudus outside <item> --reason "<why it is not this commitment's work>"`, or escalate.
- `review SLUG`: `sudus review SLUG --file <path>` naming a file that answers Q1 to Q6 for every target with observed commands, paths or outputs.
- `report SLUG`: `sudus brief SLUG`; start one adversary with none of your context on the brief and projection only; wait; `sudus report SLUG --file <its report>`.
- `resolve SLUG N`: fix finding N as its own work, commit, then `sudus resolve SLUG N "<how>"`; or dispute it with `sudus escalate`.
- `accept SLUG`: give the adversary the report, the resolutions and the cumulative delta; `sudus accept SLUG --file <its acceptance>`.
- `build DECISION`: build what the decision says, commit, then `sudus realize <id> --subject "<what was built>"`.
- `done SLUG`: `sudus done SLUG`.
- `promote`: choose one backlog item by judgment; `sudus promote <item>`. Promotion never Agrees text.
- `reply SLUG`: `sudus reply SLUG "<explanation>"`; an `ask` answer authorizes an explanation only.

When Sudus itself is wrong -- a command crashes, a message contradicts the manual, or wake keeps naming an action whose predicate already holds -- follow the report-sudus-issue skill: it drafts an issue for eas4ai/sudus, files it only after the developer's `ok`, and updates the plugin when the fix is released.

Out of scope is captured, never built: `sudus item --backlog`, `--next-feature`, or `--defect --from <REQ>`. A defect against this commitment's requirement is worked here, not captured.

Decide by level: Routine and Judged leave no record; Blocking is `sudus escalate` and stops.

A Consequential decision -- one with real options and a recommendation, tied to this commitment's requirements -- takes one more step first: `sudus measure` with the same fields `sudus decide`/`sudus escalate` would take (`--commitment`, `--concern`, `--question`, `--recommendation`, `--because`, `--if-wrong`, `--instead`, `--option`, `--path`, `--decision`); give each choice its own `--option`, and make `--recommendation` repeat one of them word for word, or `measure` stops and names the options. It prints five scored dimensions (evidence, reach, contract fit, new surface, ambiguity), a composite, and `suggested: agent` or `suggested: developer`. The suggestion is information, not consent: read it and the five numbers, then either `sudus decide --consequential --commitment ...` (the same flags, continuing) or `sudus escalate --consequential --commitment ...` (the same flags, stopping) -- your own judgment, whatever the suggestion says. Two things bypass your judgment entirely and are always `sudus escalate --consequential`: the measurement's own floor (a draft that would change an Agreed requirement's text or falsifier, the working agreement, or data that cannot be regenerated) and its veto (an option that reaches too far, changes the contract, or opens too much new surface) -- `sudus decide --consequential` rejects either one and names the measurement that caught it. Put your real evidence in `--because`: a command, a file, quoted output, or the failing test and the falsifier it maps to.

## The developer

The developer is never asked to run a command. When an escalation waits, the prompt is the escalation itself in plain prose, in this order: the problem (its question and because); `ok`, what the recommendation does; `instead`, what it costs if the recommendation is wrong and the alternative; `ask`, if the developer does not understand or wants to discuss it further. End with `ok | instead | ask` and wait. Record the answer in the developer's own words: `sudus answer <slug> ok | instead | ask --quote "<their words>"`. Read the queue with `sudus decisions`; after the developer has read a decision with you, record it with `sudus decisions --read <id> --quote "<their words>"`. After changing `docs/spec/`, `AGENTS.md` or `.sudus/settings.json` between commitments, state what changed and what would be bound, end with `ok | instead | ask`, and on ok run `sudus authorize --quote "<their words>"`; a change request or a question is `sudus authorize instead | ask --quote "<their words>"`, which binds nothing. Never use a choice widget for these questions; the prose and `ok | instead | ask` is the prompt. After Done, open the next work with `/next-feature`.
