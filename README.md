![Sudus - Keep agent work tied to what you agreed to build.](assets/cover.png)

# Sudus

**A way to keep AI-assisted development tied to what you actually agreed to build.**

You decide what the software should do. Your coding agent implements it.
Sudus reads the project's Git records, checks whether the evidence is still
current, and names what needs attention next.

The aim is simple: a new agent session should be able to find the agreement,
the work already done, the checks that passed or failed, and the decisions
still waiting for you. Those facts live in your Git repository, in commits
you can inspect with plain Git, rather than only in a conversation that the
next agent may never see.

[Read the human manual](docs/manual.md) | [Try the worked example](docs/walkthrough.md)

## What Sudus does

Sudus has two parts:

- **Project skills** help your agent learn an existing codebase, plan a new
  project with you, or open the next feature of a project already under
  Sudus. They produce written requirements, ways to check them, and one
  selected piece of work.
- **A command-line tool** reads and writes those records, runs the declared
  checks when asked, and reports the next action.

Sudus does not run the agent for you, and it calls no AI model on its own
unless you turn on the TypeSafe evaluator in settings. At one
narrow kind of decision -- a Consequential choice -- the agent takes one
measurement of its own draft before deciding: five scored dimensions and a
composite, computed in code from the model's answers, never a verdict by
itself. Only a fixed code floor and the measurement's own veto ever force
that decision to you instead of the agent; every other case is the agent's
judgment, informed by the reading. On the in-tree benchmark (24 drafts over
one small project, `tests/bench`) the measurement's suggestion matches the
expected route 22 times in 24; the ceiling and weights were chosen on those
same 24 drafts, so treat the figure as in-sample, not a guarantee. You use
your usual coding agent, and the
agent follows the project's working agreement. The tool runs on Node and
Git, with no build step, runtime packages, database, or service.

For example, you might agree that a form must reject an empty name. The
agent writes a check that actually submits an empty name. Sudus records
whether that check passed and whether its result still applies after the
code changes. Before the work is called complete, an independent reviewer,
started with none of the builder's context, also attacks what the check
might have missed.

## The evaluator: the agent's gut check

At one kind of decision, a Consequential one with real options, the agent
measures its own draft before it decides. It runs `sudus measure` with the
draft, gets five scored dimensions back, and reads a composite and a
suggestion computed in code. The suggestion is advice: the agent decides.
Only two things ever take the decision away from it, a fixed code floor
(a draft that would change an Agreed requirement, the working agreement,
or data that cannot be regenerated) and the measurement's own veto (an
option that reaches too far, changes the contract, or opens too much new
surface). Both go to you.

| Dimension | What it scores, 0 to 4 |
|---|---|
| evidence | how much observed evidence backs the draft |
| reach | how far the recommended option reaches beyond the question |
| contract | how much it strains the cited requirement's contract |
| surface | how much new surface it adds |
| ambiguity | how ambiguous the question itself is |

### Two sources, one measurement

| Source | When | What you need |
|---|---|---|
| Your harness's review model (default) | `typesafeai.enabled` is `false` | Nothing. `sudus measure --brief` prints a brief; a fresh session of your review model answers it into a JSON file; `sudus measure <slug> --file <path>` completes the measurement. |
| TypeSafe's jev model | `typesafeai.enabled` is `true` | An API key from https://typesafe.ai in the environment variable `TYPESAFEAI_API_KEY`. |

Both sources answer the same five questions over the same state, and the
same code computes the composite, the veto and the suggestion from their
answers. On the in-tree benchmark they agreed on every draft compared.

### Set up jev in three steps

1. Export the key in the shell that runs your agent. Sudus reads it from
   the environment only; it never writes it to a file, a record, a log or
   an error message.

   ```sh
   export TYPESAFEAI_API_KEY=your-key
   ```

2. In `.sudus/settings.json`, turn the source on with a versioned model
   id. The other keys keep their defaults; they are the values the
   benchmark was scored with.

   ```json
   "typesafeai": {
     "enabled": true,
     "model": "jev-1.13.0",
     "weights": { "evidence": 0.2, "reach": 0.2, "contract": 0.2, "surface": 0.2, "ambiguity": 0.2 },
     "agent_ceiling": 0.35,
     "confidence_floors": { "evidence": 0, "reach": 0, "contract": 0, "surface": 0, "ambiguity": 0 },
     "min_calibration_agent_predictions": 60,
     "request_cap_bytes": 48000
   }
   ```

3. Tell the agent. The file is protected, so the agent states the change
   and, on your ok, binds it:

   ```sh
   sudus authorize --quote "ok, turn jev on"
   ```

That is all. From the next Consequential decision on, `sudus measure`
sends the draft's closed state to `https://api.typesafe.ai/v1/systemone`
and records the answer. Set `"enabled": false` to go back to the review
model; nothing else changes.

### What the agent sees

```
$ sudus measure --commitment ledger --concern EXP-001 \
    --question "..." --recommendation "Keep the current message with no prefix." \
    --because "..." --if-wrong "..." --instead "..." \
    --option "Keep the current message with no prefix." \
    --option "Add a ledger: prefix to match other CLI error conventions." \
    --path src/ledger.mjs
sudus: measure ledger 6484a385... composite suggested:agent
levels: ambiguity=0.5 (confidence 0.8), contract=0.5 (confidence 0.8), evidence=0.5 (confidence 0.8), reach=0.5 (confidence 0.8), surface=0.5 (confidence 0.8)
composite: 0.275
veto: none
reason: composite 0.275 <= 0.35, confidences ok
```

Then one of two commands, with the same draft flags:

| The agent runs | When | What it records |
|---|---|---|
| `sudus decide --consequential ...` | the outcome is `composite`, whatever the suggestion says | a decision line that names the measurement; the work continues |
| `sudus escalate --consequential ...` | the floor or the veto caught the draft, or the agent chooses to ask you anyway | an escalation that names the measurement; the work waits for your answer |

Both refuse a draft that was not measured, or was changed after it was
measured: `sudus: no measurement for this exact draft; run sudus measure
first`.

### What can go wrong, and what happens

| Case | Recorded as | Who decides |
|---|---|---|
| No key, network down, or a rate limit after the built-in retries | `unavailable <class>` | you |
| The model's answer does not parse | `unavailable invalid` | you |
| The request is over `request_cap_bytes` | `unavailable oversize` | you |
| `developer: absent` (an autonomous run) and any escalation is unanswered | the escalation prints as Waiting and `sudus wake` exits 4 | the run stops |

Nothing is retried silently, and nothing routes a floor-caught or vetoed
draft to the agent. `sudus calibrate` reports, from decisions you later
labelled, how often an `agent` suggestion was wrong; it tunes the numbers
above and never gates the agent. To check the evaluator on your own key
against the 24-draft benchmark, run `SUDUS_BENCH=1 npm run bench` from the
checkout, one draft at a time. Every settings key is explained in the
manual's [Settings](docs/manual.md#settings) section.

## How the work moves forward

A **commitment** is one agreed piece of work, such as "reject empty names."
It is not a Git commit. One commitment can involve many Git commits, and at
most one commitment is open at a time.

You and the agent agree on a goal and what would count as success. The agent
then asks Sudus for the next action, does that work, and asks again. When a
decision belongs to you, the agent presents it and waits. When the
commitment is complete, the agent promotes the next idea from the backlog
and continues, or stops at Done. Ideas that would change the agreed
contract wait for the next feature specification, which you open.

### Who does what?

| You | Your coding agent | Sudus |
|---|---|---|
| Choose the goal and confirm the intended behavior. | Investigate, propose requirements, and explain trade-offs. | Read the agreed requirements and the open commitment. |
| Challenge unclear choices and weak checks. | Implement, commit, run checks, and examine the work. | Record check results and determine whether they are current. |
| Answer decisions that need your judgment. | Keep decisions and findings in the repository's records. | Print the next recorded action or the waiting question. |
| Review queued decisions; open the next feature when you choose. | Promote the next backlog idea, or stop at Done. | Report Done only when nothing remains the agent may decide. |

### What the three verdicts mean

| Verdict | Plain meaning | Whose turn? |
|---|---|---|
| `Resolvable` | There is a named action, and the exact record or code that completes it. This is normal progress, not an error. | The agent. |
| `Waiting` | An escalation is unanswered. Sudus prints its five fields; the agent asks you in prose and records your answer. | You. |
| `Done` | Every requirement in the commitment has current passing evidence, an independent report found nothing left open, and the backlog holds nothing to promote. | You: open the next feature when you choose. |

Done does not mean the whole product is finished, deployed, or guaranteed
correct. It means the open commitment meets Sudus's recorded conditions.

### What Done requires

- Every requirement in the commitment's frozen set has a current passing
  check, bound to that requirement's exact text.
- A review and an independent report exist at the same point in the work,
  and every finding either has a fix or a developer ruling.
- The latest acceptance looked at everything that changed since the report,
  including every fix, and accepted each one.
- No question is unanswered, no undeclared change sits unresolved, no known
  defect is unfixed, and no decision that needed building is still unbuilt.

The backlog is not part of this rule. When it holds nothing to promote,
Sudus reports Done and stops. Ideas the agent captures during the work go
to one of two places. An idea already covered by the agreed specification
goes to the backlog. The agent may promote one into the next commitment on
its own, and it records that decision for your review. An idea that would change
an agreed requirement or the working agreement waits for the next feature
specification, which you open. Neither is a place to park unfinished
work: an in-scope problem the agent cannot solve becomes a question to you,
not a note.

Here is the work loop each `sudus wake` cycle follows: one named action
with its completion predicate, done by the agent, then wake again.

```mermaid
flowchart TB
  wake(["sudus wake is read-only: print verdict, action or party, reason and predicate. Missing refs, pending transition or recovery: one line, exit 3"])
  verdict{"Verdict?"}
  waiting["Waiting: print the escalation's five fields verbatim; the agent adds nothing to the work, asks the developer in prose and records their answer with sudus answer. Developer: absent: same print, exit 4"]
  answer["The agent asks you in conversation and records your words: sudus answer ok, instead, or ask --quote, signed when a key exists, attested otherwise"]
  reply["reply after ask: a reply record names the escalation"]
  stop[["Done: a done record exists and nothing waits, render unread queue and stop. Backlog waiting: wake names promote"]]
  act["Do the named action until its predicate holds, actions are listed in precedence order"]
  cannot{"Cannot act, or cycle bound reached?"}
  escalate["Write one evidence-backed escalation. Cycle guard: fourth same-target or 28th admin transition, or third unsuccessful recovery"]
  measure["Consequential decision while acting: sudus measure the draft first. Five Score levels, composite, veto, suggested: advice, not a route"]
  gate{"Floor or veto?"}
  decide["The agent decides: sudus decide --consequential, composite outcome, whatever the suggestion, or escalates anyway"]
  trace["Leave the required trace: branch commit, typed snapshot or canonical log record"]

  wake --> verdict
  verdict -->|"Waiting"| waiting
  waiting --> answer
  answer --> wake
  verdict -->|"Resolvable: reply"| reply
  reply --> wake
  verdict -->|"Done"| stop
  verdict -->|"Resolvable"| act
  act --> cannot
  cannot -->|"can act"| trace
  cannot -->|"cannot or bounded"| escalate
  trace --> wake
  escalate --> wake
  act -->|"Consequential draft"| measure
  measure --> gate
  gate -->|"yes: escalate --consequential"| escalate
  gate -->|"no"| decide
  decide -->|"decision names the measurement"| trace
  decide -.->|"escalate anyway"| escalate
```

The Graphviz source is docs/diagrams/work-loop.dot.

## Install

Sudus is a plugin. One install brings the command, the four skills, and the
hooks. Have Node 24 and Git 2.40 or newer available. Sudus runs on Linux
and macOS; Windows is not supported, since the hooks use symbolic links and
`$HOME`.

### Coming from Cairn

Sudus was named Cairn until 3.0.0. Everything a project recorded under
that name still works, and nothing has to change on the day you upgrade:

- The command answers to both names. A shim, hook or working agreement
  that runs `cairn wake` runs the same kernel.
- A project that keeps its records under `.cairn/` and `refs/cairn/*` is
  read and written there. Wake adds one line naming the move.
- A mechanism that prints `cairn: REQ-001: pass` is still a pass.

Between commitments, when wake says Done or before the first start, the
agent runs `sudus migrate` once. It renames `refs/cairn/*` to
`refs/sudus/*`, moves `.cairn/` to `.sudus/` in one commit, rewrites the
matching lines of `.gitignore`, and refuses while a commitment, lease or
transaction is open. Records already on the log keep their original
form, and the log reads as one. With an authority remote, `sudus push`
then publishes the moved refs, and every other clone runs `sudus migrate`
once after it pulls, which fetches the moved refs rather than renaming
its own stale ones. Install the plugin under its new name (below) and
remove the one named `cairn` from your harness, so two copies of the
hooks do not run. The old GitHub address redirects to `eas4ai/sudus`.

### Install the plugin

In Claude Code:

```
/plugin marketplace add eas4ai/sudus
/plugin install sudus@sudus
```

In Codex:

```sh
codex plugin marketplace add eas4ai/sudus
codex plugin add sudus@sudus
```

In Muse, install the checkout as a local bundle, where `<checkout>` is
the absolute path of the clone:

```sh
muse plugins install <checkout>
muse plugins approve sudus:hook:session-start
muse plugins approve sudus:hook:stop
muse plugins list
```

The skills work as soon as the plugin is installed; the two hooks run
once you approve them. `muse plugins validate <checkout>` checks the
bundle without installing it. After pulling the checkout, run
`muse plugins update sudus` to refresh the installed bundle.

That is the install. Claude Code and Codex register the three hooks from
the plugin's `hooks/hooks.json` (SessionStart, UserPromptSubmit, Stop);
Muse reads two hook entries, SessionStart and Stop, from the plugin's
`.muse-plugin/plugin.json`. Ask your agent to use the `install-sudus`
skill once: it installs a small shim at `$HOME/.local/bin/sudus` that
runs the newest installed Sudus, so a plugin update never strands the
command. Inside a Sudus project, the session-start hook prints the wake
verdict; outside one, it names `/new-project` or `/existing-project`. When
the `sudus` it finds runs an older version than the plugin, or cannot say
its version, it uses the
plugin's copy and prints the one command that installs the shim. No hook
creates the link, refuses a stop, counts anything, or writes a record; a
hook only prints, and a harness without hooks relies on the working
agreement in `AGENTS.md`.
Make sure `$HOME/.local/bin` is on your `PATH`:

```sh
export PATH="$HOME/.local/bin:$PATH"
sudus --help
```

`sudus --help` lists every command; it works outside a project and
changes nothing. Every key in `.sudus/settings.json`, and how to turn on
the TypeSafe evaluator with a key from typesafe.ai, is in the manual's
[Settings](docs/manual.md#settings) section. Updates come through the marketplace (in Claude Code,
`claude plugin update sudus@sudus`), or in Muse with
`muse plugins update sudus`.

Then open your project and continue at
[Start with your project](#start-with-your-project).

### Other agents: the skills CLI

An agent without a plugin marketplace gets the skills through the
[Vercel skills CLI](https://github.com/vercel-labs/skills), using npm/npx:

```sh
npx skills add eas4ai/sudus --skill install-sudus new-project existing-project next-feature --agent codex --global
```

Use `--agent claude-code` for Claude Code. For Muse, use
`--agent universal` without `--global`: it installs into the project's
`.agents/skills/`, which Muse reads in a trusted workspace (with
`--global` it installs into `$HOME/.config/agents/skills`, which Muse
does not read). Omit
`--global` to install only in the project where you run the command.
Preview the available skills with `npx skills add eas4ai/sudus --list`.
The skills carry instructions and templates, not the command. Tell your
agent:

> Use install-sudus to install the Sudus command and verify that it works.

The skill links the command and registers hooks where the harness
supports them, following the same steps as the next section.

### Install from a checkout

The by-hand path, for a harness without a marketplace or for working on
Sudus itself. Run this in the directory where you keep the checkout:

```sh
git clone https://github.com/eas4ai/sudus.git
```

Then, once per machine, install the command shim:

```sh
mkdir -p "$HOME/.local/bin"
[ -e "$HOME/.local/bin/sudus" ] || cp "$(pwd)/sudus/bin/sudus.sh" "$HOME/.local/bin/sudus"
chmod +x "$HOME/.local/bin/sudus"
```

The shim runs the newest Sudus it finds: `$SUDUS_ROOT` (or `$CAIRN_ROOT`)
when set, else the newest Claude Code or Codex plugin cache entry, under
either name, or the checkout at `$HOME/.local/share/sudus` or
`$HOME/.local/share/cairn`, by version. This never replaces an existing
file at that path. Put `$HOME/.local/bin`
on your `PATH` as above and check `sudus --help`. Then register the hooks
under `hooks/` with your agent's own hook configuration, once, using the
event names in `hooks/hooks.json`. They are optional: the working
agreement in `AGENTS.md` is the path an agent takes without them. Skills
come with the plugin, go into your agent's skill directory through the
skills CLI, or are linked from `skills/` by you.

The link points into the plugin or checkout it was made from, so keep
that in place.

## Start with your project

Open your project's repository in your coding agent. The four skills are
opened by you, by name, the way your agent application invokes a skill: in
Claude Code, type the name with a slash. They do not appear in the agent's
own skill list, so a prose request does not reach them.

For new software:

> /new-project I want to build [describe the software]. Help me agree on
> the first useful piece of work and how we will check it.

For a codebase that already exists:

> /existing-project Read the code before making claims about it. Explain
> what you found, then help me prepare [describe the change].

For a project already under Sudus, once the loop reports Done:

> /next-feature Specify [the waiting item or the feature] as the next
> commitment.

Each of these skills runs `sudus init` the first time it is needed. Before
it does, the agent asks you two things in conversation: which Git remote
holds the records, or explicit local-only operation, and whether your
decisions are signed with a key or attested in your own words. Nothing else
in Sudus asks for that setup, and you never type a command yourself.

The agent should explain requirements in terms you understand and propose
observable failures that would show they are not met. Sudus calls one of
these a **falsifier**. "An empty name is accepted" is a concrete example.
You confirm the behavior and its falsifier; the agent writes the files,
tells you what would be bound, and runs `sudus authorize` only after you
say ok, quoting your words in the record.

Once the agreement is recorded, ask the agent to continue under Sudus. It
starts with `sudus wake` from your project's repository root.

**If a question is unclear, ask for another explanation before you decide.**
You can say, "Explain what each option would change for me." A request for
explanation is not approval to implement an option.

## What you need to watch

You do not need to approve every implementation detail. Pay attention to:

- **The agreement.** Does it describe the behavior you want? Does the
  proposed check expose a real failure of that behavior?
- **Escalations.** Is the choice clear, and do you understand what your
  answer authorizes? Asking a question keeps the decision open; the
  agent records it as an `ask` answer.
- **The decision queue.** Some consequential decisions are recorded for
  your review while the agent continues. These are different from
  escalations: work does not wait for you to read them.
- **The result.** Ask what changed, what was checked, what the review
  found, and what remains outside the agreement. Try the result yourself
  where that helps you judge it.

The [human manual](docs/manual.md) walks through each of these moments,
including exactly how `ok`, `instead`, and `ask` work.

## What Sudus can and cannot establish

Sudus can detect missing or stale evidence, malformed declarations,
undeclared changes, unfinished transactions, and open review findings. It
keeps the command output behind the results so you can inspect what
happened, and it records every fact as a Git commit you can read with
plain Git.

It cannot judge whether the agent wrote a useful check or performed a
thoughtful review. A command that always succeeds can produce passes
without proving anything. Ask the agent to show a safe failing example and
the corrected case, and explain why the check failed.

Freshness depends on the files a check declares as inputs. Sudus cannot
infer an omitted dependency or notice that an external service changed
while the repository stayed the same. Broad inputs catch more changes but
can make rechecking expensive. Narrow inputs need careful maintenance.

Sudus is a discipline tool, not a security boundary. It checks recorded
results and freshness; it cannot judge whether a review is thorough or a
check proves what it claims to. The developer must challenge unsound
checks, and the agent must demonstrate what makes them fail.

## Find your way around

| Read this | When you need it |
|---|---|
| [Human manual](docs/manual.md) | Everyday use, decisions, results, and troubleshooting. |
| [Worked example](docs/walkthrough.md) | A small project you can run from install through a finished commitment. |
| [Working agreement template](skills/new-project/templates/AGENTS.md) | The exact responsibilities a project's agreement gives the agent. |
| [Specification](docs/spec/sudus-v2.md) | Sudus's own requirements and terminology. |
| [Releasing Sudus](docs/releasing.md) | How this repository cuts and tags a release. |

Sudus's own development uses the same workflow. From this repository,
`node bin/sudus.mjs wake` reports its current action, and
`node bin/sudus.mjs lint docs/spec` checks the specification.

## License

MIT. See [LICENSE](LICENSE).

## Thanks

John Lockwood ([johnwlockwood](https://github.com/johnwlockwood)) filed
the first bug reports against Sudus, each with the exact timeline, the
cause in the code and the expected behavior. Issues #1 through #7 were
fixed from them, in 2.1.14, 2.2.2, 3.0.1, 3.0.3 and 3.1.2.
