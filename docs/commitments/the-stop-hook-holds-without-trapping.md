# The stop hook holds without trapping

Slug: the-stop-hook-holds-without-trapping
Requirements: PKG-018, PKG-021, PKG-033, PKG-043, PKG-044, LOOP-139
Inherits: every PKG requirement
Status: Agreed 2026-09-17

## Goal

The stop hook refuses a stop while the agent can act, and never traps a
session: it judges with the kernel that wrote the evidence, it names
escalation as the honest exit, and after three refusals with no
progress it lets the stop through where the developer sees it and the
next wake asks why.

Specified on 2026-09-17 in the next-iteration phase, after the
developer asked for a stop hook that is not a frustration and cannot
be cheated, and confirmed the design.

## Deliverables

- bin/hook.mjs: the give-way on stop_hook_active is removed; the kernel
  is chosen by the latest receipt's kernel digest among the PATH
  command, the link, the project's bin/cairn.mjs and its own kernel,
  falling back to today's order; the refusal names cairn escalate; per
  session, a refusal with the same verdict, commit and working tree
  counts, and the fourth such stop is allowed with a systemMessage and
  a stop record under .cairn/stops/.
- bin/cairn.mjs, the wake: an unexplained or uncommitted stop record is
  named `explain <path>` ahead of every action but a live check lock.
- skills/new-project/templates/AGENTS.md and AGENTS.md: the explain
  move.
- docs/manual.md: the stop hook paragraph says the same.

## Tests

- stop_hook_active true no longer lets a Resolvable stop through
  (PKG-018)
- receipts written by the project's bin/cairn.mjs are judged with it,
  not with a different kernel on PATH (PKG-021, PKG-033)
- three refusals, then a fourth stop allowed with a systemMessage and a
  stop record; a commit or an edit in between resets the count; a
  different session counts on its own (PKG-043)
- the refusal names cairn escalate (PKG-044)
- an unexplained or uncommitted stop record is named explain first;
  explained and committed, the wake moves on (LOOP-139)

## Review before agreement

- PKG-043 against the developer's "we also cannot allow cheating": the
  valve lets an idle agent stop after three refusals. It is not
  prevented, it is made visible twice: the harness message and the
  record the next wake demands. Never giving way was the alternative,
  and it trapped a session more than ten times.
- PKG-043's progress test: an agent waiting on a long check without
  touching the tree counts toward the valve; the check lock verdict
  names waiting, and a check that finishes changes the tree, which
  resets the count.
- PKG-033 against LOOP-095: judging with the kernel that wrote the
  evidence could hide an upgrade; after a real upgrade the old kernel
  is no longer on disk, so the rule does not apply and the re-run
  stands.
- PKG-033 against PKG-021: PKG-021 named the link first; it now defers
  to the evidence rule, and the two otherwise read as before.
- PKG-043 against PKG-002: the count lives in the Git directory, like
  the check lock; the stop record is committed.
- The message: Claude Code shows a hook's systemMessage to the user.
  Codex's handling of that field is not verified; the stop record and
  the next wake hold either way.

## Done when

- PKG-018, PKG-021, PKG-033, PKG-043, PKG-044 and LOOP-139 have current
  passing evidence from node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
