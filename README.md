# Cairn

A cooperative workflow for agent-led software development.

Cairn has two phases.

**Specification.** The human and the agent build an unambiguous
specification together, through a staged confirm-back conversation. A
requirement is not agreed until both parties have named the observable
state that would prove it false.

**The loop.** The agent then works against that specification on its own:
resumable across sessions, recording every decision, and stopping only
for a blocker a human must actually resolve. All loop state lives on
disk, so an agent with no memory of the previous session reconstructs its
position and continues.

The name is the idea. A cairn is a marker left by someone who was here
before, for someone who arrives with no memory of them.

## Status

The kernel starts at `bin/cairn.mjs` and shares its specification parser
in `bin/spec.mjs` with the lint. It runs on Node with no dependencies
and no build step. `cairn wake` reads the repository and names the next
action. `cairn check` runs the current commitment's mechanisms against
a committed tree and records evidence with receipts. `cairn decide`,
`escalate`, `answer`, `backlog`, `supersede`, and `reversals` write
the records the loop runs on. The skills under `skills/` carry the
specification phase.

Cairn bootstraps on itself: its own specification is the input to its
own loop. Run `cairn wake` here and the referee reports where its
roadmap stands; no file in this repository states that separately.

`docs/spec/` is the specification, Agreed 2026-09-04.
`docs/design-record.md` holds the decisions and measurements that
preceded it. It is the input to the specification, not the
specification.

## Install

    git clone git@github.com:eas4ai/cairn.git
    cairn/scripts/link.sh

The script links `cairn` into `$HOME/.local/bin`, which must be on your
path, and each skill into `$HOME/.agents/skills`, so a pull keeps them
current. Pass `--bin DIR` for a directory that is on your path, or
`--skills DIR` for another skill directory, `--force` to replace a link another
package left under the same name, and `--unlink` to take it all away.
The skills alone also install with the skills CLI, which reads the
Agent Skills layout Cairn already has:

    npx skills add eas4ai/cairn

That puts the skills in front of the agent. The kernel still comes from
the clone and the script.

## Updating an existing project

Keep each requirement's `Status: Agreed <date>` beside its text and
falsifier, before the next blank line. That status overrides the file's
header. Mark unconfirmed blocks Draft or Observed; confirming one
requirement does not confirm the others.

For rules that every commitment must satisfy, add `Scope: every commitment`
to their spec file's header, before the first requirement. Only Agreed
blocks are inherited. The `PKG` prefix alone no longer enables inheritance;
existing projects that relied on it must add the Scope line.

Track `.cairn/evidence/`, including receipts and output files. Remove any
ignore rule for that directory and commit the existing history. Keep
`.cairn/in-progress` ignored because it describes one working tree.

An escalation answer `ask <question>` now keeps the decision open. The
agent uses `cairn answer <slug> "<explanation>"` to reply, then the developer
answers again. Only `ok` or `instead <what>` closes the decision.

## Background

For a concrete example, follow [one small project with Cairn](docs/walkthrough.md):
agree on a requirement, catch a failure, fix it, review the result, and
choose the next piece of work.

The design record explains the workflow's rationale, the failures its
rules prevent, and the boundary that keeps the referee small.
