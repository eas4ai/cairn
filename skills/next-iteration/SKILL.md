---
name: next-iteration
description: Opens the phase between loops for a project already under Cairn -- starts from the Agreed specification and the items waiting in next-iteration, restates each change, revises or adds requirements with falsifiers, and ends by naming the next commitment. Writes no recon report and no Observed text. Use when cairn wake says Done and the developer wants a waiting contract change or a new feature specified.
disable-model-invocation: true
---

# /next-iteration -- the phase between loops

The loop stopped at Done. The specification exists and is Agreed, the
roadmap names a finished commitment, and either items wait in
.cairn/next-iteration/ or the developer has a feature in mind. You are
specifying the next commitment from that specification, with the
developer, and handing it back to the loop. /new-project designs
software that does not exist; /existing-project adopts a codebase by
reading it first. Neither is this: the specification is the source of
truth for what the software should do, and the code is read only
where a change's blast radius touches it.

## Standing rules

Rules 1 through 8 of /new-project apply: resolve and state, restate
before you write, vocabulary at first occurrence, nothing Agreed
without a falsifier, a falsifier names a mechanism, one obligation per
sentence, review before agreement, depth from the project. Read
"Writing for the developer" in the
[working-agreement template](../new-project/templates/AGENTS.md)
before presenting a change or asking for agreement, and include its
invitation: "If this isn't clear, ask me to explain it another way
before you decide."

Three more:

9. Start from the specification. Do not write docs/recon.md. Write no
   Observed text: an Agreed requirement already says what the code
   should do, and a difference between them is a defect against the
   requirement, not a finding about the code. Read the code inside a
   change's blast radius to cite what the change touches.
10. A contract change is the developer's. An item in next-iteration
    names the Agreed requirement, falsifier, or working agreement it
    would change (LOOP-093). Only the developer's confirmation lets it
    in (LOOP-029), and the record says who confirmed and when. A
    decision you make on the way, at Judged or above, is recorded with
    `cairn decide` before you build on it (DEC-003); a decision that
    ships something consumers install is Consequential and goes to the
    review queue.
11. Not deferral. An item you do not take this time stays waiting, and
    wake keeps counting it. An item the developer rules out is removed
    in a commit whose message states the ruling. Nothing is moved to a
    later version (PKG-013).

## Stage 0 -- Where the loop stands

Run `cairn wake`. It must say Done. Resolvable or Escalate means the
loop is not finished: stop, and hand the verdict to the working
agreement. A `promote` action is the loop's, not this phase's: the
agent promotes from the backlog on its own (LOOP-087).

Read the glossary, the keystone, the roadmap, the finished commitment,
every item under .cairn/next-iteration/ that carries no Promoted to:
line, the decision records those items cite, and the backlog, so you
know what the loop will promote on its own after this commitment. The
glossary's terms are your vocabulary.

Ask what this phase is for: the waiting items, a feature the developer
names, or both. That is the one question this stage asks. For each
change, trace its blast radius -- the requirements, the mechanisms,
the code, and the documents it touches -- and cite each.

## Stage 1 -- The change, restated

For each change, state in your own words what changes for the user,
the agent, or the developer; which Agreed requirement, falsifier, or
working-agreement sentence it revises, quoted; what the alternative
is; and what you recommend (SPEC-003). Present the changes together;
the developer corrects your reading before you write. A change that
turns out to fit inside the specification is a backlog item, not this
phase's: capture it with `cairn backlog` and say so.

## Stage 2 -- The requirements

Revise a requirement in place, under its own identifier. Never reuse
an identifier for different text. Write the new text and falsifier,
then a note in the block's rationale that begins `Revised <date>` and
says what the first text said and why it changed. Add a new
requirement to the domain file that owns it, in the shape /new-project
Stage 3 uses: one obligation per sentence, the actor named, a
Falsifier: line, a MAY included (SPEC-025). Add a term to the glossary
at its first occurrence (SPEC-010). A change to the working agreement
is made in the template beside /new-project and copied to AGENTS.md
verbatim; a consumer project's copy follows the template when it is
next written.

Propose the falsifiers as one set, and for each name the mechanism
that could observe it (SPEC-004, SPEC-013). Review the set before
presenting it: contradictions with requirements that stand, falsifiers
that would not catch their violation, requirements no mechanism can
check (SPEC-014). Record what the review attacked and what it found in
the commitment file under "Review before agreement" (SPEC-015).
Present for agreement by exception. When the developer confirms, add
`Status: Agreed <date>` inside each confirmed block (SPEC-002), and
say in the block's rationale who confirmed and how. A revised
requirement makes its evidence stale (LOOP-058); the loop names a
mechanism review before it checks again (LOOP-059).

Run `cairn lint docs/spec` before the stage closes.

## Stage 3 -- The commitment

Write docs/commitments/<slug>.md as /new-project Stage 4 describes:
its requirements by identifier, what it delivers, the decisions to
record, the tests that will prove it, and its done-when. Add a
`Specified from:` line naming each next-iteration item the commitment
carries. A commitment specified here is not a promotion: LOOP-089 does
not bind it, and it may change the Agreed text the item names. Add
the roadmap section, and move the roadmap's Current: line to the new
slug. Stamp each item the commitment carries with `Promoted to: <slug>`
on its own line; while a named item is unstamped, wake names the stamp
as the repair (SPEC-027).

For each requirement, write or extend its mechanism under
.cairn/mechanisms/, adding a new requirement to the declaration that
speaks for it. Apply /new-project's guidance on a safe violating
example when the mechanism is built (SPEC-022); a test that fails until
the work exists, committed with the agreement, is the cheapest such
example. Commit the specification, the commitment, the roadmap, the
stamps, and the declarations before `cairn check`.

## Closing

Run the spec lint and `cairn wake`. The phase ends by naming the next
commitment: wake names its first action, and the loop takes over under
the working agreement. Summarize what changed in the specification,
quoting each revised requirement's old and new text, what the
commitment delivers, which items still wait, and what wake said.
Remind the developer that a Consequential decision made here waits in
.cairn/queue/ for their reading.
