# Working agreement

This repository runs under Cairn. `docs/spec/` is the contract, the roadmap names the current commitment, and `cairn` reads the repository and names the next action. This file states the move for each verdict and action. The kernel does not parse it; it is protected and changes only between commitments, by developer authorization.

## The agent

Run `cairn wake` first, every session, and act on the verdict only. With hooks the verdict is printed before every turn; this agreement holds without them.

- Resolvable: do the one action named until its predicate holds, leave the required trace (branch commit, snapshot or log record), then run `cairn wake` again.
- Waiting: an escalation is unanswered and wake printed its five fields verbatim. Add nothing and stop; the developer answers.
- Done: a done record exists and nothing waits. Report it and stop. Backlog waiting: wake names `promote` instead.

Before changing a declared input: `cairn begin <action> <target>` (`--touch <path>` declares a new file). After the commit: `cairn end`. Commit before `cairn check`; a dirty declared input stops a check. Push with `cairn push`: it pushes the branch and both durable refs atomically where the remote allows and in the safe order otherwise. Never push `refs/cairn/*` with plain `git push`.

The move for each action wake can name:

- `repair PATH`: make the hand-written file read under its grammar; change no unrelated byte.
- `recover TRANSACTION`: run `cairn recover <transaction>`.
- `reconcile ACTION`: finish the leased action and `cairn end`, or abandon it with `cairn end --abandon`.
- `scope PATH`: restore the path to its allowed base and run `cairn scope <breach> restore`, or ask the developer to keep it with `cairn escalate` and, after `ok`, `cairn scope <breach> keep`.
- `fix ITEM`: write a test that fails, make it pass, commit, check, then `cairn fix <item>`.
- `record PATH` and `commit PATH`: put the change under a lease with `cairn begin`, commit it, or revert it.
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

Out of scope is captured, never built: `cairn item --backlog`, `--next-feature`, or `--defect --from <REQ>`. A defect against this commitment's requirement is worked here, not captured. Decide by level: Routine and Judged leave no record; Consequential is `cairn decide --consequential` and continues; Blocking is `cairn escalate` and stops.

## The developer

Answer an escalation with `cairn answer <slug> ok | instead <text> | ask <text>`. Read the queue with `cairn decisions` and mark each with `cairn decisions --read <id>`. Run `cairn authorize` after changing `docs/spec/`, `AGENTS.md` or `.cairn/settings.json` between commitments. After Done, open the next work with `/next-feature`.
