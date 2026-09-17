![Cairn - Keep agent work tied to what you agreed to build.](assets/cover.jpg)

# Cairn

**A way to keep AI-assisted development tied to what you actually agreed to build.**

You decide what the software should do. Your coding agent implements it.
Cairn reads the project's records, checks whether the evidence is still
current, and names what needs attention next.

The aim is simple: a new agent session should be able to find the agreement,
the work already done, the checks that passed or failed, and the decisions
still waiting for you. Those facts live in your Git repository, rather than
only in a conversation that the next agent may never see.

[Read the human manual](docs/manual.md) | [Try the worked example](docs/walkthrough.md)

## What Cairn does

Cairn has two parts:

- **Project skills** help your agent learn an existing codebase, plan a new
  project with you, or open the next iteration of a project already under
  Cairn. They produce written requirements, ways to check them, and one
  selected piece of work.
- **A command-line tool** reads those files, runs the declared checks when
  asked, records their results, and reports the next action.

Cairn does not call an AI model or run the agent for you. You use your usual
coding agent, and the agent follows the project's working agreement.
The tool runs on Node, uses Git, and needs no build step, runtime packages,
database, or service.

For example, you might agree that a form must reject an empty name. The
agent writes a check that actually submits an empty name. Cairn records
whether that check passed and whether its result still applies after the
code changes. Before the work is called complete, the agent also reviews
what the check might have missed.

## How the work moves forward

A **commitment** is one agreed piece of work, such as "reject empty names."
It is not a Git commit. One commitment can involve many Git commits.

![The Cairn work loop: agree on a goal, follow the next action, return decisions to the human, and stop at Done.](docs/diagrams/work-loop.svg)

You and the agent agree on a goal and what would count as success. The agent
then asks Cairn for the next action, does that work, and asks again. When a
decision belongs to you, the agent presents it and waits. When the
commitment is complete, the agent promotes the next idea from the backlog and
continues, or stops at Done. Ideas that would change the agreed contract wait
in next-iteration for the next feature specification, which you open.

The diagram summarizes the workflow. It does not imply that Cairn launches,
pauses, or supervises your agent. [Mermaid source](docs/diagrams/work-loop.mmd).

### Who does what?

| You | Your coding agent | Cairn |
|---|---|---|
| Choose the goal and confirm the intended behavior. | Investigate, propose requirements, and explain trade-offs. | Read the agreed requirements and selected commitment. |
| Challenge unclear choices and weak checks. | Implement, commit, run checks, and examine the work. | Record check results and determine whether they are current. |
| Answer decisions that need your judgment. | Keep decisions and findings in the repository. | Point to the next recorded action or outstanding question. |
| Review promotions in the queue; open the next specification when you choose. | Promote the next backlog idea, or stop at Done. | Report Done only when nothing remains the agent may decide. |

### What the three verdicts mean

| Verdict | Plain meaning | Whose turn? |
|---|---|---|
| `Resolvable` | There is a named action the agent can take. This is normal progress, not a general error. | The agent. |
| `Escalate` | A recorded question awaits your answer. | You. |
| `Done` | The required checks are current and passing, the review has no open findings, and the backlog holds nothing to promote. | You: run next-iteration when you choose. |

Done does not mean the whole product is finished, deployed, or guaranteed
correct. It means the selected commitment meets Cairn's recorded conditions.

### The verdicts in plain characters

```
met(r)         :=  for all m in mech(r): current(m, r) and pass(m, r)
complete(c)    :=  for all r in reqs(c): met(r), and no d in dec(c) is unrealized(d)
open(e)        :=  answer(e) is empty
unrealized(d)  :=  commit(d) is empty
current(m, r)  :=  ev.inputs = H(inputs(m) at HEAD)
                   and ev.decl = H(decl(m))
                   and ev.req = H(text(r))
reviewed(c)    :=  review(c) exists, naming its examined commit
                   and what it examined
                   and no text(r) changed since the review, for r in reqs(c)
                   and no declared input changed since the examined commit
                   and for all f in findings(c): open(f) or resolved(f),
                   with open(f) := f is listed as open
                   and resolved(f) := f is listed as resolved, naming how
pass(m, r)     :=  m's result line says pass for r,
                   or m prints no lines and exit(m) = 0
                   and candidate(m) committed when the run began
                   and candidate(m) unchanged across the run
done(c)        :=  complete(c) and reviewed(c)
                   and no finding in findings(c) is open
                   and no escalation is open and no changed path is undeclared
                   and every backlog item carries its promotion line
```

Here r is a requirement and mech(r) the mechanisms declared for it; c
is a commitment, reqs(c) its requirements and dec(c) the decision
records it names; e is an escalation and d a decision record; ev is
the latest evidence record of m for r; H is a content digest;
inputs(m) at HEAD are the declared inputs as committed, decl(m) the
declaration, and text(r) the requirement's text. review(c) is the
review record for c and findings(c) the findings it lists; m is a
mechanism, and its result line is the pass or fail line it prints for
r, if any. candidate(m) is the declared inputs, the declaration, and
the requirement texts, as committed; exit(m) is the command's exit
status. The kernel adds what
the definitions leave out: ev also names the digest of the kernel
that wrote it, so a record from another kernel is not current; an
`ask` answer leaves an escalation open, since only `ok` or `instead`
closes it; a committed retention approval sends the review back for
another look; and whether the declared inputs cover the requirement's
behavior is settled when the mechanism is reviewed, not by any run.

Ideas the agent captures during the work go to one of two places. An idea
that fits inside the agreed specification goes to the backlog, and the agent
promotes it into the next commitment on its own, recording the decision for
your review. An idea that would change an agreed requirement or the working
agreement goes to next-iteration and waits there for the next feature
specification, which you open with the next-iteration skill; the loop
never works it. Neither is a place to park
unfinished work: an in-scope problem the agent cannot solve becomes a
question to you, not a note.

## Install

Cairn is a plugin. One install brings the command, the four skills and
the two hooks. Have Node 18 or newer and Git 2.5 or newer available.
Cairn runs on Linux and macOS; Windows is not supported, since the hooks
use symbolic links and HOME.

### Install the plugin

In Claude Code:

```
/plugin marketplace add eas4ai/cairn
/plugin install cairn@cairn
```

In Codex:

```sh
codex plugin marketplace add eas4ai/cairn
codex plugin add cairn@cairn
```

In Muse, install the checkout as a local bundle, where `<checkout>` is
the absolute path of the clone:

```sh
muse plugins install <checkout>
muse plugins list
```

`muse plugins validate <checkout>` checks the same bundle without
installing it. To refresh the installed bundle, run
`muse plugins update cairn`. On a checkout whose tracked
`.cairn/evidence` history holds many thousands of files, install from
a copy without that directory; for more information, see
[installation details](docs/manual.md#installation-details).

That is the install. Claude Code and Codex register the two hooks from
the plugin's `hooks/hooks.json`; Muse reads its two hook entries from
the plugin's `.muse-plugin/plugin.json`, one entry file per hook under
`bin/hooks/`. At your next session start the hook links
`$HOME/.local/bin/cairn` to the plugin's `bin/cairn.mjs` and says so;
inside a Cairn project it prints the wake verdict, and from then on a
stop is refused while the verdict is Resolvable, up to the harness's cap
on consecutive refusals. Make sure `$HOME/.local/bin` is on your `PATH`:

```sh
export PATH="$HOME/.local/bin:$PATH"
cairn --help
```

`cairn --help` lists commands, options, and examples; it works outside a
project and changes nothing. Updates come through the marketplace, or in
Muse from the checkout with `muse plugins update cairn`; after
updating, check the path `cairn --help` resolves to, and if the link still
points at the old version, remove it and start a session. If you once
registered the hooks by hand, from the snippet under "Install from a
checkout", remove those entries: two registrations print two verdicts
and refuse a stop twice.

Then open your project and continue at
[Start with your project](#start-with-your-project).

### Other agents: the skills CLI

An agent without a plugin marketplace gets the skills through the
[Vercel skills CLI](https://github.com/vercel-labs/skills), using npm/npx:

```sh
npx skills add eas4ai/cairn --skill install-cairn new-project existing-project next-iteration --agent codex --global
```

Use `--agent claude-code` for Claude Code. For Muse and other agents
without a dedicated entry, use `--agent universal`, which installs into
`$HOME/.agents/skills`, the cross-vendor directory Muse reads. Omit
`--global` to install only in the project where you run the command.
Preview the available skills with `npx skills add eas4ai/cairn --list`.
The skills carry instructions and templates, not the command. Tell your
agent:

> Use install-cairn to install the Cairn command and verify that it works.

The skill clones a checkout, links the command and registers the hooks
as the next section describes. See the manual for
[skill installation and updates](docs/manual.md#using-the-skills-cli).

### Install from a checkout

The by-hand path, for a harness without a marketplace or for working on
Cairn itself. Run these commands in the directory where you want to
keep the Cairn checkout:

```sh
git clone https://github.com/eas4ai/cairn.git
node cairn/bin/hook.mjs session-start
```

The second command links `$HOME/.local/bin/cairn` to the checkout's
`bin/cairn.mjs` when nothing is there or the link's target is gone; any
other file or link stays. Put `$HOME/.local/bin` on your `PATH` as above
and check `cairn --help`. Then register the two hooks with your agent,
once. For Claude Code, merge this into `$HOME/.claude/settings.json`;
for Codex, write it to `$HOME/.codex/hooks.json`. `<checkout>` is the
absolute path of the clone:

```json
{ "hooks": {
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "node <checkout>/bin/hook.mjs session-start" }] }],
  "Stop":         [{ "hooks": [{ "type": "command", "command": "node <checkout>/bin/hook.mjs stop" }] }] } }
```

The hooks judge with the `cairn` on your PATH, then with that link,
then with their own checkout, and say which. They are optional: the
working agreement in AGENTS.md is the path an agent takes without them.
Skills come with the plugin, go into your agent's skill directory
through the skills CLI, or are linked from `skills/` by you. See the
[installation details](docs/manual.md#installation-details) for removal
and updates.

The link points into the plugin or checkout it was made from, so keep
that in place. There is no
`cairn init` command: the project skills help the agent prepare your project.

## Start with your project

Open your project's repository in your coding agent. The three phase
skills are opened by you, by name, the way your agent application invokes
a skill: in Claude Code, type the name with a slash. They do not appear in
the agent's own skill list, so a prose request does not reach them.

For new software:

> /new-project I want to build [describe the software]. Help me agree on
> the first useful piece of work and how we will check it.

For a codebase that already exists:

> /existing-project Read the code before making claims about it. Explain
> what you found, then help me prepare [describe the change].

For a project already under Cairn, once the loop reports Done:

> /next-iteration Specify [the waiting item or the feature] as the next
> commitment.

The agent should explain requirements in terms you understand and propose
observable failures that would show they are not met. Cairn calls one of
these a **falsifier**. "An empty name is accepted" is a concrete example.
You confirm the behavior and its falsifier; the agent writes the files.

Once the agreement is recorded, ask the agent to continue under Cairn.
It starts with `cairn wake` from your project's repository root.

**If a question is unclear, ask for another explanation before you decide.**
You can say, "Explain what each option would change for me." A request for
explanation is not approval to implement an option.

## What you need to watch

You do not need to approve every implementation detail. Pay attention to:

- **The agreement.** Does it describe the behavior you want? Does the
  proposed check expose a real failure of that behavior?
- **Escalations.** Is the choice clear, and do you understand what your
  answer authorizes? `ask <question>` keeps the decision open.
- **The review queue.** Some consequential decisions are recorded for your
  review while the agent continues. These are different from escalations.
- **The result.** Ask what changed, what was checked, what the review found,
  and what remains outside the agreement. Try the result yourself where
  that helps you judge it.

The [human manual](docs/manual.md) walks through each of these moments,
including exactly how `ok`, `instead`, and `ask` work.

## What Cairn can and cannot establish

Cairn can detect missing or stale evidence, malformed declarations, certain
scope breaches, unfinished records, and open review findings. It keeps the
command output behind the results so you can inspect what happened.

It cannot judge whether the agent wrote a useful check or performed a
thoughtful review. A command that always succeeds can produce passes
without proving anything. Ask the agent to show a safe failing example and
the corrected case, and explain why the check failed.

Freshness depends on the files a check declares as inputs. Cairn cannot infer
an omitted dependency or notice that an external service changed while the
repository stayed the same. Broad inputs catch more changes but can make
rechecking expensive. Narrow inputs need careful maintenance.

Cairn is a discipline tool, not a security boundary. Its command-line checks
and the agent's working agreement play different roles; the tool does not
prevent an agent from ignoring the agreement.

## Upgrading an existing Cairn project

This documentation describes the source in this checkout. If your command
points at a different checkout, its behavior may differ. Before adopting
these rules, read the [upgrade guide](docs/manual.md#upgrading-an-existing-cairn-project).
`cairn --version` prints the version you run; releases and the version
policy are in [docs/releasing.md](docs/releasing.md) and CHANGELOG.md.

In particular, global requirements now need `Scope: every commitment` in
their spec file's header. A `PKG` prefix alone no longer makes them global.
Evidence and output files belong in Git, and `ask` now keeps an escalation
open for a reply.

Every evidence record names the kernel that wrote it. The first wake under
an upgraded kernel re-runs each mechanism once, because earlier records name
no kernel or another one. Upgrade the kernel at Done, never inside a
commitment: a commitment starts and finishes on one referee.

## Find your way around

| Read this | When you need it |
|---|---|
| [Human manual](docs/manual.md) | Everyday use, decisions, results, and troubleshooting. |
| [Worked example](docs/walkthrough.md) | A small project you can run from a failing check through completion. |
| [Working agreement](AGENTS.md) | The exact responsibilities the agent is instructed to follow. |
| [Specification](docs/spec/overview.md) | Cairn's own requirements and terminology. |
| [Source map in the manual](docs/manual.md#where-these-explanations-come-from) | The implementation and tests behind the explanations. |

Cairn's own development uses the same workflow. From this repository,
`node bin/cairn.mjs wake` reports its current action. Contributors can run
`npm test`, `cairn lint docs/spec`, and `node scripts/pkg-lint.mjs`;
recorded evidence is produced by `node bin/cairn.mjs check` after committing.
