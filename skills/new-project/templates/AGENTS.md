# Working agreement

This repository runs under Cairn. `docs/spec/` is the contract, the roadmap names the current commitment, and `cairn` reads the repository and names the next action. This file states the move for each verdict and action. The kernel does not parse it; it is protected and changes only between commitments, by developer authorization.

## The agent

Run `cairn wake` first, every session, and act on the verdict only. With hooks the verdict is printed before every turn; this agreement holds without them.

- Resolvable: do the one action named until its predicate holds, leave the required trace (branch commit, snapshot or log record), then run `cairn wake` again.
- Waiting: an escalation is unanswered and wake printed its five fields verbatim. Add nothing to the work. Put the escalation to the developer as "The developer" below says, ending with `ok | instead | ask`, and when they answer, record it yourself with `cairn answer`. Never hand them a command to run.
- Done: a done record exists and nothing waits. Report it and stop. Backlog waiting: wake names `promote` instead.

Before changing a declared input: `cairn begin <action> <target>` (`--touch <path>` declares a new file); it prints the lease sha. After the commit: `cairn end --lease <sha>` with that sha, so a stale end never closes another session's lease. Commit before `cairn check`; an uncommitted declared input makes wake name `commit` or `record` before anything else. Push with `cairn push`: it pushes the branch and both durable refs atomically where the remote allows and in the safe order otherwise. Never push `refs/cairn/*` with plain `git push`.

The move for each action wake can name:

- `repair PATH`: make the hand-written file read under its grammar; change no unrelated byte.
- `recover TRANSACTION`: run `cairn recover <transaction>`.
- `reconcile ACTION`: finish the leased action and `cairn end`, or abandon it with `cairn end --abandon`; a lease left by a dead session needs no `--lease`.
- `scope PATH`: restore the path to its allowed base and run `cairn scope <breach> restore`, or ask the developer to keep it with `cairn escalate` and, after `ok`, `cairn scope <breach> keep`.
- `fix ITEM`: write a test that fails, make it pass, commit, check, then `cairn fix <item>`.
- `record PATH` and `commit PATH`: put the change under a lease with `cairn begin`, commit it, or revert it.
- A tool that rewrites `AGENTS.md` or `docs/spec/` on its own (an indexer that keeps a block in `AGENTS.md`, for example GitNexus) breaks the protected contract mid-commitment and shows up as a scope breach on that file. Run such tools with their skip option (`gitnexus analyze --skip-agents-md`, or `--index-only`) while a commitment is open, or restore the file; a tool-managed block never belongs in the working agreement.
- `docs/decisions.jsonl` is appended by `cairn decide`, `cairn answer`, `cairn realize` and `cairn decisions --read` and is not committed by them: commit it with your next commit (`git add -f` when `docs/` is ignored). A declaration does not go through while a path it would cover has uncommitted changes: commit that path or lease it with `cairn begin <action> <target> --touch <path>` first.
- `declare REQ`: `cairn declare` a mechanism naming REQ; show it fail on a violating example before trusting it.
- `run REQ`: `cairn check REQ`.
- `implement REQ`: read the latest receipt and its output, change the code under a lease, commit, `cairn end`, `cairn check REQ`.
- `escalate REQ`: three attempts failed; `cairn escalate` with the five fields before any fourth attempt.
- `review mechanism REQ`: `cairn review mechanism REQ <fail-receipt>` after checking the failure was the stated violation.
- `capture ITEM`: `cairn outside <item> --reason "<why it is not this commitment's work>"`, or escalate.
- `review SLUG`: `cairn review SLUG --file <path>` naming a file that answers Q1 to Q6 for every target with observed commands, paths or outputs.
- `report SLUG`: `cairn brief SLUG`; start one adversary with none of your context on the brief and projection only; wait; `cairn report SLUG --file <its report>`.
- `resolve SLUG N`: fix finding N as its own work, commit, then `cairn resolve SLUG N "<how>"`; or dispute it with `cairn escalate`.
- `accept SLUG`: give the adversary the report, the resolutions and the cumulative delta; `cairn accept SLUG --file <its acceptance>`.
- `build DECISION`: build what the decision says, commit, then `cairn realize <id> --subject "<what was built>"`.
- `done SLUG`: `cairn done SLUG`.
- `promote`: choose one backlog item by judgment; `cairn promote <item>`. Promotion never Agrees text.
- `reply SLUG`: `cairn reply SLUG "<explanation>"`; an `ask` answer authorizes an explanation only.

Out of scope is captured, never built: `cairn item --backlog`, `--next-feature`, or `--defect --from <REQ>`. A defect against this commitment's requirement is worked here, not captured.

Decide by level: Routine and Judged leave no record; Blocking is `cairn escalate` and stops.

A Consequential decision -- one with real options and a recommendation, tied to this commitment's requirements -- takes one more step first: `cairn measure` with the same fields `cairn decide`/`cairn escalate` would take (`--commitment`, `--concern`, `--question`, `--recommendation`, `--because`, `--if-wrong`, `--instead`, `--option`, `--path`, `--decision`). It prints five scored dimensions (evidence, reach, contract fit, new surface, ambiguity), a composite, and `suggested: agent` or `suggested: developer`. The suggestion is information, not consent: read it and the five numbers, then either `cairn decide --consequential --commitment ...` (the same flags, continuing) or `cairn escalate --consequential --commitment ...` (the same flags, stopping) -- your own judgment, whatever the suggestion says. Two things bypass your judgment entirely and are always `cairn escalate --consequential`: the measurement's own floor (a draft that would change an Agreed requirement's text or falsifier, the working agreement, or data that cannot be regenerated) and its veto (an option that reaches too far, changes the contract, or opens too much new surface) -- `cairn decide --consequential` rejects either one and names the measurement that caught it. Put your real evidence in `--because`: a command, a file, quoted output, or the failing test and the falsifier it maps to raise the evidence score and lower the composite.

## The developer

The developer is never asked to run a command. When an escalation waits, the prompt is the escalation itself in plain prose, in this order: the problem (its question and because); `ok`, what the recommendation does; `instead`, what it costs if the recommendation is wrong and the alternative; `ask`, if the developer does not understand or wants to discuss it further. End with `ok | instead | ask` and wait. Record the answer in the developer's own words: `cairn answer <slug> ok | instead | ask --quote "<their words>"`. Read the queue with `cairn decisions`; after the developer has read a decision with you, record it with `cairn decisions --read <id> --quote "<their words>"`. After changing `docs/spec/`, `AGENTS.md` or `.cairn/settings.json` between commitments, state what changed and what would be bound, end with `ok | instead | ask`, and on ok run `cairn authorize --quote "<their words>"`; a change request or a question is `cairn authorize instead | ask --quote "<their words>"`, which binds nothing. Never use a choice widget for these questions; the prose and `ok | instead | ask` is the prompt. After Done, open the next work with `/next-feature`.
