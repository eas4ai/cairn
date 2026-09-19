![Cairn - Keep agent work tied to what you agreed to build.](../assets/cover.jpg)

# Using Cairn: a human manual

You do not need to learn Cairn's record formats before you can use it. Your
job is to explain what you want, confirm that the written agreement means
what you think it means, and make the decisions that belong to you. The
agent can handle the files, the records, and the commands.

This manual explains what to expect at each stage, and gives the exact
command for when you want to act directly. Examples using `APP-001` or
`reject-empty-names` are illustrative: substitute the identifier or slug
Cairn actually prints. Run project commands from your project's repository
root.

Run `cairn --help` for the full list of commands. It works outside a
project and changes nothing.

Start with the [README](../README.md) for installation and an overview.
For a complete exercise you can run yourself, use the
[worked example](walkthrough.md). This manual is also the complete
reference: every command Cairn ships and every kind of record it writes
are listed near the end.

## Contents

- [Start with a clear goal](#start-with-a-clear-goal)
- [Agree on behavior you can recognize](#agree-on-behavior-you-can-recognize)
- [Let the agent work, and know when it needs you](#let-the-agent-work-and-know-when-it-needs-you)
- [The action lease](#the-action-lease)
- [Answer a decision without guessing](#answer-a-decision-without-guessing)
- [Decisions that did not stop the work](#decisions-that-did-not-stop-the-work)
- [Understand checks and their results](#understand-checks-and-their-results)
- [Review, the adversary, and Done](#review-the-adversary-and-done)
- [Scope: work Cairn did not expect](#scope-work-cairn-did-not-expect)
- [The optional evaluator](#the-optional-evaluator)
- [Sending the records with the code](#sending-the-records-with-the-code)
- [Get unstuck](#get-unstuck)
- [Command reference](#command-reference)
- [Record reference](#record-reference)
- [Installation details](#installation-details)
- [Where these explanations come from](#where-these-explanations-come-from)

## Start with a clear goal

Describe an outcome, not a list of implementation steps. For example:

> People keep losing unfinished drafts when they close the app. I want them
> to be able to reopen a draft and continue writing.

For a new project, open the `new-project` skill by name. For existing
software, open `existing-project`. For a project already under Cairn whose
loop reports Done, open `next-feature`, which starts from the agreed
specification instead of reading the whole codebase again. The
existing-project skill instructs the agent to inspect the code first and
cite what it finds, in `docs/recon.md`. A description of what the code
currently does is marked **Observed**. It becomes an agreement about what
the code should do only after you confirm it.

Each of these skills runs `cairn init` the first time your project needs
it. It asks you three things: whether Cairn's durable records should travel
to a Git remote (naming one, or explicit local-only operation), whether to
verify your decisions with a signing key or record them as unsigned-local
evidence, and then it confirms that choice once. You do this once per
project, not once per commitment.

Expect the agent to propose the first **commitment**: one selected piece of
work with a defined result. A commitment is not a Git commit or a promise
about how long the work will take. It names what belongs in the current
task, and at most one commitment is open at a time. You can ask:

> Explain what this commitment includes, what it leaves out, and what I
> will be able to do when it is finished.

The agent records ideas outside that task as items. An item already covered
by the agreed specification is a backlog item; at Done the agent may
promote one by a recorded decision that waits for your review. An item that
would change the agreement is a next-feature item, and waits for you to
open the next feature specification. A defect against the current
commitment's own requirement is neither: it is worked now, because the
agreement already forbids it.

## Agree on behavior you can recognize

A useful requirement describes an observable result. "Make draft saving
robust" leaves too much room for interpretation. "A saved draft can be
reopened with the same text" gives you something you can examine.

Cairn uses two terms you will see often:

| Term | Meaning | Example |
|---|---|---|
| Falsifier | An observation that would show the requirement is not met. | Reopening a saved draft loses part of its text. |
| Mechanism | The declared command that checks the requirement. | A test that saves a draft, reopens it, and compares the text. |

Before agreeing, ask whether the failure example would catch the mistake
you care about. A build succeeding does not, on its own, show that drafts
survive closing the app.

A requirement is one block in a file under `docs/spec/`:

```text
[APP-001] The validator MUST reject an empty name.
Falsifier: The validator accepts an empty string.
Mechanism: names
Status: Draft
```

The identifier's prefix (`APP` above) is fixed by that file's `Prefix:`
header line, at the top of the file. `Status:` is one of `Draft`,
`Observed`, `Agreed <date>`, or `Retired <date>`. Only your confirmation,
directly or through a decision that quotes your ruling, moves a block to
`Agreed <date>`. Only Agreed blocks are checked, and a commitment may name
only Agreed requirements. A `Rationale:` line, at most one, may sit between
`Falsifier:` and `Status:`.

You do not have to correct every item yourself. The agent should present
related requirements and falsifiers together so you can correct the wrong
ones by exception. You do need to confirm the set; silence is not
confirmation. If anything is unclear:

> Explain what each option would change for me, before I decide.

### When the software requires a host path

Most requirements should name repository-relative paths, such as
`src/server.rs`. Some products also depend on a particular host binary or
configuration location outside the repository. Declare those in the
affected spec file's header, before its first requirement:

```text
Host paths: /usr/bin/bwrap, ~/.widget/config.toml
```

The list applies only to that file. Cairn reads this field; it never scans
requirement text for paths, and never copies a host path's target into a
snapshot or a model request.

## Let the agent work, and know when it needs you

The agent's working agreement (`AGENTS.md`) tells it to run `cairn wake`,
do the action named until its predicate holds, then run it again. You can
also run it to see the current position:

```sh
cairn wake
```

Wake prints a verdict, one line naming the action or party, a reason, and
the predicate that completes the action:

```text
verdict: Resolvable
action: run APP-001
reason: no current receipt carries a result for APP-001
predicate: a current receipt carries a result for the requirement
```

| Verdict | What it means for you |
|---|---|
| `Resolvable` | A named action can be taken now. The reason and predicate say what and why. |
| `Waiting` | An escalation is unanswered. Wake prints its five fields verbatim; only you can close it. |
| `Done` | The open commitment meets every recorded condition, and the backlog holds nothing to promote. |

Outside a project, with the durable refs missing, during a pending
supersession, or with an interrupted transaction, `cairn wake` prints one
line naming the exact command or skill that continues, and exits 3; none
of these is a verdict.

You should not need to type "continue" after every `Resolvable` verdict.
Continuing is the agent's responsibility under the working agreement. Cairn
itself is a command-line tool; it does not keep an agent running or grant
permissions your agent application has withheld.

When returning in a new session, a useful prompt is:

> Read the working agreement and run Cairn's wake command. Explain the
> current goal and continue with the action it names.

Records exist only once committed, or, for a workspace snapshot, once
Cairn has captured the working tree's bytes into one. The agent should
commit the agreement, spec, mechanisms, and its own working code as it
goes; a fresh clone only sees what reached a commit or a Cairn record.

## The action lease

Before changing a file a mechanism declares as its input, the agent claims
it:

```sh
cairn begin implement APP-001
```

This prints a lease sha and creates a local, unpushed ref
(`refs/cairn/in-progress`) naming the action, its target, and the
workspace at that moment. `cairn begin implement APP-001 --touch
src/new-file.mjs` also declares a new file as an input for the life of the
lease, so writing to it is not an undeclared change. After committing the
work:

```sh
cairn end --lease <the-sha-begin-printed>
```

Passing `--lease` means a stale `end` from a different, dead session can
never close the lease a live session is using. `cairn end --abandon`
releases the lease without claiming any touched path as a real change,
for when the attempt did not pan out.

The lease is local to your clone; it is never pushed and does not
coordinate two clones working at once. Two clones meet at the authority
remote: `cairn push` refuses a non-fast-forward or losing race there,
stopping the later writer before it publishes.

## Answer a decision without guessing

An **escalation** is a decision the agent cannot settle within its
authority or available information. `cairn wake` prints it in full so your
answer survives the current conversation, whatever happens to the chat:

```text
verdict: Waiting
party: developer
reason: three attempts at APP-004 without a pass
question: Should a name containing only spaces be rejected?
recommendation: Reject it.
because: It would look empty to the person reading the name.
if wrong: A caller relying on spaces as a name would need to change.
instead: Keep accepting spaces and reject only the empty string.
predicate: an answer record names the escalation with ok or instead
```

If those consequences are unclear, ask. You are not expected to approve
something because the agent used confident language.

### Your three answer forms

Assume Cairn named the escalation `app-002`:

| Your choice | Command | What it authorizes |
|---|---|---|
| Accept the recommendation. | `cairn answer app-002 ok` | Proceed on the recommendation, within the agreed scope. |
| Give a different instruction. | `cairn answer app-002 instead 'Keep drafts on this device only.'` | Use your stated direction; update the agreement if the scope changes. |
| Ask for an explanation. | `cairn answer app-002 ask 'What would syncing change for users?'` | Explain the choice. It does not authorize implementation. |

An `ask` answer keeps the question open. The agent records its explanation
with `cairn reply app-002 "<explanation>"`, and the decision comes back to
you. You can ask again; only `ok` or `instead` closes it. You can tell the
agent your answer in conversation and ask it to record that exact answer;
you do not have to operate the terminal yourself.

`cairn answer` and `cairn decisions --read` authenticate you. With a
signing key configured, your answer must carry a valid `--signature`; the
command prints the exact bytes to sign and the `--nonce` to repeat when it
needs one. Without a signing key, the project uses unsigned-local mode: the
command asks you to confirm at a real terminal and records your Git author
identity as evidence, not as cryptographic proof it was you.

## Decisions that did not stop the work

Cairn has two levels of decision, both left to the agent's judgment about
which applies:

| Level | What happens |
|---|---|
| Consequential | A costly-to-reverse or boundary-crossing choice is recorded with `cairn decide --consequential` and queued for your review; the agent continues. |
| Blocking | The agent stops and raises an escalation with `cairn escalate`. |

The working agreement may also describe Routine and Judged guidance for the
agent's own use; neither leaves a record.

Read the queue:

```sh
cairn decisions
cairn decisions --read <decision-id>
```

The first command renders every line in `docs/decisions.jsonl`. Reading a
decision is a developer-authenticated act, the same as answering an
escalation; `--read` marks it seen, appending a `read` line rather than
deleting anything. You can ask:

> Show me the queued decisions. For each, explain what was chosen, what it
> changes, and what would make us reconsider it.

A promotion from the backlog is one of these decisions. Read it for the
requirement and falsifier the agent wrote; if you disagree, tell the agent
and it can supersede the commitment before continuing.

When a Consequential decision requires building something, the agent
builds it, commits, and records:

```sh
cairn realize <decision-id> --subject "what was actually built"
```

`build <decision>` stays the wake action until that realized line names
the decision's starting and resulting workspace snapshots, and the
realization check, comparing the two, passes: a change touching a `data`
path, frozen Agreed text, the working agreement, or protected settings
always stops and escalates, whatever the decision said it intended.

If a resolution to a finding is rejected twice, or you want to contest one
directly, that becomes an escalation of its own:

```sh
cairn dispute --commitment reject-empty-names --record <finding-record-sha> --n 2 \
  --question '...' --recommendation '...' --because '...' --if-wrong '...' --instead '...'
```

## Understand checks and their results

A **mechanism** is the declared command that checks one or more
requirements. The agent writes its definition as JSON and declares it:

```sh
cairn declare names --file mechanism-names.json
```

```json
{
  "command": "node tests/names.mjs",
  "inputs": ["src/names.mjs", "tests/names.mjs"],
  "requirements": ["APP-001"],
  "results": "per-requirement"
}
```

`inputs` are literal paths, never globs; a directory covers everything
Git tracks beneath it. `documents` (optional) is a subset of `inputs` whose
changes cost a check but never stale a review; a `documents` path may not
also sit below a `source` root in settings. With `"results":
"per-requirement"`, the command must print one line per requirement it
speaks for, `cairn: APP-001: pass` or `cairn: APP-001: fail`; an omitted
requirement stays `unverified`. Without that field, the command's exit
code decides every declared requirement's result: zero is pass, nonzero or
a signal is fail.

Run the check:

```sh
cairn check APP-001
```

This selects the one mechanism declaring APP-001 (two or more is refused;
name one explicitly by fixing the declarations first), runs it against an
input snapshot of exactly its declared inputs, and appends a receipt
record. `cairn show <receipt-sha>` prints it, including the observed exit
code and a digest of the captured output, which lives at
`.cairn/output/<digest>`, ignored by Git.

| Result | What it establishes |
|---|---|
| `pass` | The command reported a pass for this requirement, under its declared reporting rule. |
| `fail` | The command reported a failure. Inspect the output to understand why. |
| `unverified` | This run established no verdict for the requirement. It cannot satisfy Done, and it does not count as a failed attempt. |

A receipt is **current** only while its input snapshot tree, mechanism
definition digest, the requirement's exact text digest, the observed
declared execution identity, and the record schema all still match. Any of
these changing makes wake name `run <REQ>` again; a kernel upgrade, by
itself, does not.

Before a mechanism's evidence counts at all, the agent shows it fail on a
violating example and binds that failure:

```sh
cairn review mechanism APP-001 <the-fail-receipt-sha>
```

This binds the mechanism's review metadata to its current definition
digest and the requirement's current text digest, with that fail receipt
as the demonstration that the check actually catches the violation. A
revised requirement, or a changed mechanism definition, unbinds this and
`review mechanism REQ` becomes the next wake action before another check
counts.

## Review, the adversary, and Done

Before Done, the builder answers six fixed questions and lists findings, in
a JSON file the agent writes and records:

```sh
cairn review reject-empty-names --file review.json
```

```json
{
  "examined": ["the empty-name failure before the fix and the pass after it"],
  "answers": [
    { "question": "Q1", "target": "names", "status": "observed", "text": "..." },
    { "question": "Q2", "target": "names", "status": "observed", "text": "..." },
    { "question": "Q3", "target": "APP-001", "status": "observed", "text": "..." },
    { "question": "Q4", "target": "APP-001", "status": "observed", "text": "..." },
    { "question": "Q5", "target": "reject-empty-names", "status": "observed", "text": "..." },
    { "question": "Q6", "target": "reject-empty-names", "status": "not-checked", "text": "" }
  ],
  "findings": []
}
```

| # | Per | Question |
|---|---|---|
| Q1 | mechanism | Which violating example failed the check, which fail receipt records it, and what did the check print? |
| Q2 | mechanism | Why was that failure the stated violation, not a setup error? |
| Q3 | implemented requirement | Why is its falsifier now unreachable? |
| Q4 | implemented requirement | What else did the change touch that no check covers? |
| Q5 | commitment | What could still be wrong while every check passes? |
| Q6 | commitment | What was not tested? |

`answers` needs exactly one entry for every `(question, target)` pair this
commitment has: Q1 and Q2 once for each declared mechanism, Q3 and Q4 once
for each requirement the commitment implements, Q5 and Q6 once for the
commitment itself. Each entry's `status` is `observed`, with `text` naming
a command, path, or output, or `not-checked`, with empty text. `findings`
is a list of `{"n": 1, "text": "..."}`, numbered from 1, or `[]` for none.
Cairn checks this shape, never truth: it cannot tell a careful review from
an empty claim.

Once the review exists, wake names `report reject-empty-names`. First:

```sh
cairn brief reject-empty-names
```

This writes a brief record and a materialized **adversary projection**: a
copy of the reviewed workspace with every `network_exclude` path and
built-in credential pattern (`.env`, `.env.*`, private-key files,
conventional SSH key names) removed, and no `.git` directory. It prints
the brief file's path, the projection directory, and the exact instruction
for starting the adversary: which harness, which model and transport (or
`any`, when settings do not pin one), and to use the brief file as that
session's entire prompt. The agent starts that adversary with none of the
builder's conversation context and waits. The adversary tries, for each
mechanism, to make it pass without the behavior, fail for a setup reason
instead of the real one, and find an input it reads but the declaration
omits; for each implemented requirement, to reach the falsifier anyway;
and it gives every changed interface a caller-level attempt whether or not
the builder raised it. Its findings, in a JSON file shaped like the
review's but with `attempts` (one `{"question", "target", "text"}` per
required pair) in place of `answers`, plus `interface_attempts` (one
`{"path", "text"}` per changed interface path) and the `model` and
`projection_digest` the brief printed, are recorded:

```sh
cairn report reject-empty-names --file report.json
```

This refuses a report whose workspace differs from the reviewed snapshot,
whose brief is stale, whose model, transport, or projection digest does
not match the brief's launch instruction, or which leaves a required
question or interface attempt missing. There is one report per commitment.

Every finding, from the review or the report, is answered:

```sh
cairn resolve reject-empty-names 1 "fixed by validating with String.prototype.trim first" --source <sha of the review or report>
```

or disputed with `cairn escalate` when you and the agent disagree that it
is a real finding. After fixes, give the same adversary session the
report, every resolution since it, and the cumulative delta; it judges
each submitted resolution and may raise new findings anywhere in that
delta, in a JSON file:

```sh
cairn accept reject-empty-names --file acceptance.json
```

```json
{
  "resolutions": [
    { "sha": "<resolution sha>", "verdict": "accepted", "reason": "the fix matches the finding" }
  ],
  "findings": []
}
```

A rejected verdict needs a `reason`. A resolution rejected twice for the
same finding raises its own escalation automatically.

Done requires the latest acceptance to examine the final workspace
snapshot with every resolution accepted and every finding, anywhere,
resolved or disputed by you. When it holds:

```sh
cairn done reject-empty-names
```

Ask for a completion report that answers:

> What can I do now? What changed? What was tested? What did the review
> and the report examine? Is anything important still outside this
> agreement?

Try the behavior yourself where that gives you useful information. Cairn
cannot tell a careful review from an empty claim, or a thoughtful
adversary from a rubber stamp; the shape of the record, the model's
identity, and the projection boundary are the evidence it can show you.

## Scope: work Cairn did not expect

Before any state-changing command, Cairn compares the working tree with the
newest allowed workspace snapshot. An undeclared, non-`outside` changed
path becomes a durable **scope breach** record, and wake names `scope
<path>` before anything else. A path touched under an active lease is
already declared, so ordinary implementation work under `cairn begin` is
never a breach.

Restore the path to its recorded base and dispose of the breach:

```sh
cairn scope <breach-sha> restore
```

Or, when the work is correct and belongs, ask you to keep it explicitly
with `cairn escalate`, then:

```sh
cairn scope <breach-sha> keep
```

A later `cairn declare` cannot retroactively clear an existing breach; it
only legalizes future changes.

## The optional evaluator

A project may turn on a model that helps decide whether a Consequential
draft can stay the agent's decision, instead of always going to you. It is
off by default (`typesafeai.enabled: false` in `.cairn/settings.json`) and,
even on, starts in shadow mode: you still decide everything, and Cairn
only records what the model would have chosen, so you can judge it before
trusting it.

Deterministic code owns every authority boundary; the model answers only
narrow yes/no and multiple-choice questions after code has already ruled
out protected paths, oversize requests, and a handful of other
disqualifying conditions. A qualifying answer only ever vetoes agent
authority or recommends a capture; it can never grant authority code has
not already allowed.

```sh
cairn calibrate
```

reports whether enough developer-labelled shadow evaluations exist, and
how many were wrong, against the project's configured bound. Only a
passing, policy-matched calibration lets `mode: route` actually route a
Consequential draft to the agent instead of you; changing the policy (the
model, a threshold, the request shape) resets calibration. Only
`bin/typesafeai.mjs` performs the network call, reading `TYPESAFEAI_API_KEY`
from the environment; it never stores the key.

## Sending the records with the code

Only `refs/cairn/log` and `refs/cairn/snapshots` travel with the code. Set
`authority_remote` during `cairn init` (or change it with a new
`cairn authorize`) to the one remote these should reach; `null` means
explicit local-only operation. Push everything together:

```sh
cairn push
```

This pushes the branch and both durable refs atomically where the remote
supports it, or snapshots first, log second, and branch last otherwise,
stopping the sequence on any failure. Never push `refs/cairn/*` with plain
`git push`; a bypassing push can create a mismatch wake will need to
repair. After a fetch, `cairn wake` validates every cross-reference and
names the exact fetch or push that repairs a gap; it never guesses. A
clone missing the durable refs is told the exact `git fetch` to run, or,
with no remote configured, to run `cairn init`.

## Get unstuck

Read the reason and predicate printed below the verdict; they are more
specific than the action word alone.

| Action wake names | What it means, and what to do |
|---|---|
| `repair PATH` | A hand-written file (spec or settings) does not read under its grammar. Fix only what is broken; `cairn lint docs/spec` shows spec problems. |
| `recover TRANSACTION` | A multi-record write (`start`, `promote`, `supersede`, `authorize`) was interrupted. Run `cairn recover <transaction>`. |
| `reconcile ACTION` | A local action lease exists with no matching finished work. Finish it and `cairn end --lease <sha>`, or `cairn end --abandon`. |
| `scope PATH` | An undeclared change was observed. Restore it (`cairn scope <breach> restore`) or ask to keep it (`cairn escalate`, then `cairn scope <breach> keep`). |
| `fix ITEM` | A recorded defect against this commitment is still open. Write a failing test, fix it, commit, check, then `cairn fix <item-sha>`. |
| `record PATH` / `commit PATH` | A declared input has uncommitted changes with no covering lease. Put it under `cairn begin`, or commit or revert it. |
| `declare REQ` | No mechanism speaks for this requirement yet. `cairn declare` one. |
| `run REQ` | A check is due: `cairn check REQ`. |
| `implement REQ` | The latest receipt is not a current pass. Read it and the captured output, then fix the code under a lease. |
| `escalate REQ` | Three distinct failing attempts with no pass since. `cairn escalate` before a fourth. |
| `review mechanism REQ` | The requirement or the mechanism definition changed. Compare the check against the new text, then `cairn review mechanism REQ <fail-receipt>`. |
| `capture ITEM` | An idea outside this commitment needs a disposition: `cairn outside <item-sha> --reason "..."`, or escalate if it actually belongs. |
| `review SLUG` | Write and record the review, answering all six questions. |
| `report SLUG` | `cairn brief`, start an adversary with none of your context, then `cairn report --file`. |
| `resolve SLUG N` | An open finding needs a fix or a dispute. |
| `accept SLUG` | Give the adversary the report, the resolutions, and the delta; `cairn accept --file`. |
| `build DECISION` | Build what the decision says, commit, then `cairn realize`. |
| `done SLUG` | Every condition holds: `cairn done SLUG`. |
| `promote` | No commitment is open and the backlog holds an item. Choose one; `cairn promote <item-sha>`. |
| `reply SLUG` | You asked a question with `ask`; the agent owes an explanation: `cairn reply SLUG "..."`. |
| `Waiting` | An escalation needs your answer. |

## Command reference

Run `cairn --help` for the authoritative, exact list; this table explains
each one's purpose. `<sha>` is any record's commit SHA; `cairn show <sha>`
prints one with its references resolved.

| Command | Purpose |
|---|---|
| `show <sha>` | Print one record, with the records and snapshots it references described. |
| `lint docs/spec` | Check the specification's grammar: identifiers, falsifiers, mechanisms, statuses, and the spec map. |
| `init` | Create or adopt `.cairn/settings.json` and the two durable refs; the developer confirms the remote, the signing choice, and settings adoption. |
| `authorize` | Bind the current digests of the specification, the working agreement, and settings in one developer-authenticated record. |
| `decisions [--read <id>]` | Print the ADR file, or mark one decision read (developer-authenticated). |
| `recover <transaction>` | Finish or safely abandon an interrupted multi-record write. |
| `begin <action> <target> [--touch <path>]...` | Claim the local action lease before changing a declared input; `--touch` provisionally declares a new path. |
| `end [--abandon] [--lease <sha>]` | Release the action lease; `--lease` refuses a mismatched sha; `--abandon` releases without claiming touched paths. |
| `check <REQ>` | Run the one mechanism declaring `REQ` and record a receipt. |
| `declare <name> --file <path>` | Read a mechanism definition as JSON and write it under that name. |
| `scope <breach-sha> keep\|restore` | Dispose of a scope breach: keep the captured work (after a developer `ok`) or restore the path to its allowed base. |
| `start <slug>` | Open the commitment named in the roadmap's `Current:` line, after verifying the authorization; commits the prepared spec, agreement, and mechanisms. |
| `done <slug>` | Close the open commitment once every Done condition holds. |
| `supersede <successor> --quote <text>` | Close the open commitment without Done, quoting the developer's ruling, and name the intended successor slug. |
| `promote <item-sha>` | After Done, with the backlog holding this item, open it as the next commitment. |
| `item --backlog\|--next-feature\|--defect --slug <s> --from <REQ or contract> --body <text>` | Capture an idea or a defect. |
| `outside <item-sha> --reason <text>` | Record that a captured item is not this commitment's work. |
| `fix <item-sha>` | Record that a defect item is fixed, naming the workspace snapshot. |
| `decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body <t>` | Record a Consequential decision; the agent continues. |
| `realize <decision-id> --subject <text>` | Record that a Consequential decision was built. |
| `escalate --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <p>...] [--decision <id>...]` | Raise a Blocking decision; the agent stops. |
| `calibrate` | Check the evaluator's shadow-mode accuracy against the configured bound. |
| `answer <slug> ok\|instead\|ask [<text>] [--escalation <sha>]` | The developer's answer to an escalation. |
| `reply <slug> <text> [--escalation <sha>]` | The agent's explanation after a developer `ask`. |
| `dispute --commitment <s> --record <sha> --n <n> --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i>` | Escalate disagreement with a specific finding or its resolution. |
| `review <slug> --file <path>` | Record the builder's review. |
| `review mechanism <REQ> <fail-receipt>` | Bind a mechanism's review metadata to its current definition and the requirement's current text. |
| `brief <slug> [--harness <name>]` | Write the adversary brief and projection for a reviewed commitment. |
| `report <slug> --file <path>` | Record the adversary's report. |
| `resolve <slug> <n> "<how>" [--source <sha>]` | Record a fix for finding `n` of a specific review, report, or acceptance record. |
| `accept <slug> --file <path>` | Record the adversary's verdict on the post-report delta. |
| `push` | Push the branch and both durable refs to the authority remote. |
| `wake` | Print the current verdict. Writes nothing. |
| `--help` | Print the command list. |

## Record reference

Every durable fact is one of these record kinds, a commit on
`refs/cairn/log`, or a line in `docs/decisions.jsonl`. `cairn show <sha>`
prints any log record. This table names what each kind carries and where
Cairn reads it back; the full field list is in
[the specification](spec/cairn-v2.md#4-the-record-set).

| Kind | Carries | Read at |
|---|---|---|
| `init` | Settings digest, authority remote or local-only, developer-auth mode. | Every project command. |
| `authorization` | Spec, agreement, and settings digests; developer-auth evidence. | `start` and every protected write. |
| `command-intent` / `command-abort` | A multi-record write's plan, or its verified rollback. | `wake` and `recover`, until finished. |
| `start` | Slug, roadmap workspace snapshot, the frozen requirement set with text digests. | Every wake; opens the range. |
| `receipt` | Mechanism and definition digest, input snapshot, per-requirement result and text digest, output digest. | Freshness and attempt counting. |
| `review` | Slug, workspace snapshot, the six answers, findings. | Brief, report, Done. |
| `brief` | Slug, review sha, projection and payload digests. | Report validation. |
| `report` | Slug, workspace snapshot, brief sha, model, attempts, findings. | Done and resolution. |
| `resolution` | Source record sha, finding number, workspace snapshot, explanation. | Acceptance and Done. |
| `acceptance` | Slug, report sha, workspace snapshot, accepted/rejected resolutions, new findings. | The next resolve, accept, and Done. |
| `escalation` | Slug, the five fields, concern reference. | Every wake, until answered. |
| `answer` | Escalation sha, `ok`/`instead`/`ask`, text, developer-auth evidence. | Wake, ADR, calibration. |
| `reply` | Escalation sha, text. | Wake, after `ask`. |
| `read` | Decision id, developer-auth evidence. | Queue and ADR. |
| `evaluation-intent` / `evaluation-call` / `evaluation` | The evaluator's fixed request, each attempted call, and the final route. | Escalation, capture, queue, calibration. |
| `calibration` | Policy digest, sample, false-downgrade count, bound, pass/fail. | Route-mode validation. |
| `item` | Kind (backlog/next-feature/defect), slug, source, body. | Capture, Done, next feature. |
| `outside` | Item sha, reason. | Capture gate. |
| `promotion` | Item sha, decision id. | After Done. |
| `fix` | Item sha, workspace snapshot. | Done. |
| `scope-breach` / `scope` | Path, first-observed snapshot, allowed base, disposition. | Every wake, until disposed. |
| `done` | Slug, final workspace snapshot. | Closes the range. |
| `superseded` | Slug, old start sha, decision id, successor slug, carried records. | Closes the old range; the successor start. |
| ADR `decision` / `realized` / `superseded` / `answered` / `read` | One canonical JSON line each in `docs/decisions.jsonl`. | `cairn decisions`, wake, calibration. |

## Installation details

See the [README](../README.md#install) for the marketplace and checkout
install paths. In every path, the agent links `$HOME/.local/bin/cairn` to
the plugin's or checkout's `bin/cairn.mjs`, once, only when nothing is
there; it never replaces a link whose target still exists. Claude Code and
Codex read `hooks/hooks.json` (SessionStart, UserPromptSubmit, Stop);
Muse reads two entries (SessionStart, Stop) from
`.muse-plugin/plugin.json`. Every hook prints the current wake verdict, in
one line, at most, beyond that. No hook writes a file, commits, refuses a
stop, or counts anything; a harness without hooks relies entirely on the
working agreement in `AGENTS.md`.

`cairn --root DIR` does not exist in this version; run commands from your
project's repository root. There is no separate status command; `cairn
wake` is how you see the current position.

## Where these explanations come from

This manual describes the source in this checkout. The CLI enforces
record structure, freshness, and precedence; the skills and the working
agreement instruct the agent how to reason and when to stop.

| Behavior explained here | Implementation |
|---|---|
| Verdicts, actions, and precedence | `lib/wake.mjs` |
| The command table and `--help` | `lib/cli.mjs` |
| Requirement grammar and the spec lint | `lib/spec.mjs` |
| Settings validation | `lib/settings.mjs` |
| Mechanisms, receipts, and freshness | `lib/mechanisms.mjs`, `lib/check.mjs` |
| The action lease and crash recovery | `lib/lease.mjs`, `lib/tx.mjs` |
| Commitments, items, and the ADR | `lib/commitment.mjs`, `lib/adr.mjs` |
| Scope breaches | `lib/scope.mjs` |
| Escalations and answers | `lib/escalate.mjs` |
| Review, the brief, and the adversary | `lib/review.mjs` |
| The optional evaluator | `lib/evaluate.mjs`, `bin/typesafeai.mjs` |
| Pushing the durable refs | `lib/travel.mjs` |
| Starting a project and confirming behavior | `skills/new-project/SKILL.md`, `skills/existing-project/SKILL.md`, `skills/next-feature/SKILL.md` |
| The agent's per-turn and per-project responsibilities | `skills/new-project/templates/AGENTS.md` |

Tests under `tests/` exercise each module named above; run `npm test` in
this checkout.
