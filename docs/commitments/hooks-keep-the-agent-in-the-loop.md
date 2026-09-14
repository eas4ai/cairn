# Hooks keep the agent in the loop

Slug: hooks-keep-the-agent-in-the-loop
Requirements: PKG-018, PKG-019, LOOP-091, PKG-014
Inherits: every PKG requirement
Status: Agreed 2026-09-14

## Goal

An agent that skips wake, ignores the verdict, or stops mid-commitment
is held by the harness: a session-start hook prints the verdict into
context and links the command if it is missing, and a stop hook refuses
a stop while wake says Resolvable. After the developer answers a
next-iteration escalation, wake names the specification of the chosen
item instead of asking again.

## Authorization and scope

The developer requested the hooks on 2026-09-14 and answered ok to
escalation loop-091 the same day, which recommended them. The developer
ruled that a hook answering the harness with the verdict does not
manage execution under PKG-012, and that the earlier no-hook decision
was the agent's own call against direction. Item:
.cairn/next-iteration/hooks-keep-the-agent-in-the-loop.md.

## Decisions to record

- Supersede cairn-installs-by-one-link-script-with-no-plugin-and-no-hook
  with cause "the stated condition occurred": its own record named the
  developer's ruling as what would make it wrong. Consequential: the
  install skill writes hook entries into the developer's harness
  settings, and the link script every README reader ran is retired.
- Which item an answer chooses: ok takes the item the Recommend line
  names, instead takes the item the answer names, matched against the
  files under .cairn/next-iteration/. Judged.

## Deliverables

- hooks/stop.mjs: reads the harness JSON on standard input when
  present; finds the repository root from its cwd; exits 0 silently
  outside a Cairn repository or on any error; runs this checkout's
  kernel wake; on Resolvable writes
  {"decision":"block","reason":"<verdict>\nAct on the named action,
  then run cairn wake again (AGENTS.md)."} and exits 0; on Escalate or
  Done writes nothing and exits 0. No counter: the harness caps
  consecutive blocks.
- hooks/session-start.mjs: links $HOME/.local/bin/cairn to this
  checkout's bin/cairn.mjs when nothing is there, printing the link;
  leaves any existing file or link alone; in a Cairn repository prints
  the wake output as plain text; exits 0 always.
- bin/cairn.mjs: after the review is clean, with the backlog empty and
  next-iteration nonempty, when the latest closed escalation concerning
  LOOP-091 was answered after the current commitment began, wake names
  `specify <item>` with the answer quoted, instead of a new escalation
  (LOOP-091). A next-iteration item carrying a Promoted to: line is
  not waiting, so a specified item is not offered again.
- skills/install-cairn/SKILL.md: after the checkout exists, registers
  both hooks once, in ~/.claude/settings.json for Claude Code and
  ~/.codex/hooks.json for Codex, using the documented JSON shape, and
  shows the entries it wrote; the session-start hook then links the
  command on the next session. The link script section is removed.
- README install section and docs/manual.md installation details: the
  hook registration replaces the link script; a hookless install
  remains documented as the two commands the session-start hook runs.
- scripts/link.sh and tests/install.test.mjs are removed; PKG-014's
  proof moves to the session-start hook's link test.
- AGENTS.md and the template gain one sentence: when the harness runs
  Cairn's hooks, the verdict arrives at session start and a stop is
  refused while Resolvable; the agreement holds without them.
- tests/hooks.test.mjs and tests/wake.test.mjs cases below.

## Tests

- stop.mjs at a Resolvable fixture writes a block decision whose reason
  carries the verdict; at Done and at Escalate writes nothing and exits
  0; in a directory with no roadmap writes nothing and exits 0
  (PKG-018)
- session-start.mjs with a temporary HOME links cairn to this checkout,
  keeps an existing link on a second run, prints the wake verdict in a
  Cairn fixture, and prints no verdict outside one (PKG-019, PKG-014)
- the linked cairn runs wake (PKG-005, PKG-014)
- an answered LOOP-091 escalation makes wake name specify with the
  recommended item on ok and the named item on instead; an unanswered
  one still gives Escalate (LOOP-091)
- the skills suite reads the install skill for the two settings paths
  and the working agreement for the hook sentence (PKG-006 static
  proxy)

## Verification

Reproduce the failure the hooks remove: a fixture at Resolvable where
the stop hook is absent and a stop is allowed, then present with the
hook and refused. Reproduce the repeated escalation after ok at the
commit before the kernel change. Run the full suite, both lints, full
committed mechanisms, and review before Done.

## Done when

- Every requirement listed above has current passing evidence from
  node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, specify, or Done.
