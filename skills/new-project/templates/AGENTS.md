# Working agreement

This repository runs under Cairn. The specification in docs/spec/ is
the contract, the roadmap names the current commitment, and the
referee, `cairn`, reads the repository and names the next action. This
file says what each party does when it is their turn.

Cairn is a discipline tool, not a security boundary. It checks recorded
results and freshness; it cannot judge whether a review is thorough or a
mechanism proves its requirements. A command that always succeeds can
produce passes without testing anything. The developer must challenge
unsound mechanisms, and the agent must demonstrate what makes them fail.

## The agent

Wake. Before anything else, run `cairn wake`. Read the glossary, the
keystone, the roadmap, the current commitment, and the decision records
for what it names. Nothing you remember from an earlier session counts; the
repository does. When the harness runs Cairn's hooks, the verdict arrives
at session start and a stop is refused while it is Resolvable; this
agreement holds without them.

Act on the verdict, and only on it.

- Resolvable: do the one action named. Then run `cairn wake` again.
  Do not stop while the verdict is Resolvable.
- Escalate: present the escalation file to the developer, in its own
  words, and stop. Do nothing else until it is answered.
- Done: the commitment is complete and the backlog holds nothing to
  promote. Report it, and stop. Next-iteration is the developer's to
  open.

When wake says `reply <slug>`, read the developer's question and append
your explanation with `cairn answer <slug> "<explanation>"`. Run wake again
to return the decision to the developer. An `ask` answer authorizes only
an explanation; it does not authorize implementation.

When wake says `promote`, the commitment is complete and the backlog
holds an item. Choose the item by judgment. Record the promotion with
`cairn decide` at Judged or Consequential, naming the item, the
requirement you draft from it, and that requirement's falsifier. Write
the requirement into the specification with `Status: Agreed <date> by
promotion <decision slug>`, write docs/commitments/<slug>.md with a
`Promoted from:` line naming the item, add the roadmap section, move
the roadmap's Current: line, and stamp the item `Promoted to: <slug>`.
Commit, then wake. A promoted commitment must not change an Agreed
requirement, its falsifier, or this file. When the work needs that,
move the item to next-iteration with the reason, escalate, and stop.

Before you change code, write `.cairn/in-progress`:

    action: implement | build-decision | run-mechanism | review
    target: <requirement, decision slug, or commitment slug>
    base: <commit identifier>
    started: <iso timestamp>

Remove it when the change is committed. On wake, an existing record is
reconciled before any new work: finish or abandon the action it names.

Check execution has a separate working-tree lock. When wake names
`cairn-check.lock`, wait for a live owner. If the owner is dead or the
record is incomplete, inspect the command and any surviving children;
remove the named lock only after execution has stopped. Keep the agent's
in-progress record until its own action is finished or abandoned.

Commit before you check. `cairn check` records evidence only against a
committed tree and refuses a dirty declared input. Your own test runs
while editing are how you work; they are not evidence. Commit the new
evidence receipts and their output files after each check. Evidence
history is tracked; only .cairn/in-progress stays ignored.

Keep the candidate stable throughout a check. Cairn compares it with the
commit before execution and validates it again before recording evidence.
A changed candidate keeps its diagnostic output but gets no receipt.
Missing or damaged captured output needs a new check, never an edited
historical receipt.

When wake says `run <REQ>`, use `cairn check <REQ>`; Cairn selects its
mechanism for you. Declare every file that can affect the result, including
shared dependencies. Broad directories are easier to maintain but rerun
checks for unrelated edits. Narrow paths reduce reruns but need updating
when dependencies change. Do not omit a dependency just to shorten a run.

When wake says `review mechanism <REQ>`, compare the check with the
revised requirement and falsifier without changing code. Record what you
examined and any mismatch in the existing commitment review. Fix a
mismatch as a separate implementation action. Try a safe violating example
and the corrected case; record the results, or why that demonstration is
impractical. Add the exact `REQ sha256:...` entry wake prints to
the declaration's `reviewed:` list only after that review. Commit before
check. Copying the digest alone does not establish that the check works.
Apply the same failure demonstration when building a new check.

Decide by level. Routine: decide, no record. Judged and above: record
it with `cairn decide` before you build it. Blocking: `cairn escalate`,
then stop. Three attempts at a requirement without new passing evidence
make the next decision about it Blocking. An attempt is one distinct
digest of the mechanism's declared inputs among the failing checks
since the last pass; reruns, documentation changes, and a return to a
digest already tried add nothing, and the first check of a
requirement is its baseline, never an attempt. A failure no change
inside the footprint can address is not an attempt at all: it is an
escalation, and the wake names DEC-019 when it sees three runs at one
digest. A failing requirement every commitment inherits is repaired
under the current commitment; its mechanism's inputs are already in
the footprint, and a fix outside them means the declaration was
incomplete: declare, then fix.

Out of scope is captured, never built. An idea that fits inside the
specification goes to `cairn backlog --title ... --body ... --from
<REQ>`. An idea that would change an Agreed requirement, its
falsifier, or this file goes to `cairn backlog --next-iteration
--title ... --body ... --changes <REQ>`, naming what it would change.
A backlog item enters a commitment by a recorded promotion at Done. A
next-iteration item enters only when the developer writes it into the
specification.

Deferral is not allowed. Work the commitment includes is finished or
escalated, never captured. When an idea surfaces from one of the
commitment's own requirements and is not its work, say why on an
`Outside because:` line. When in-scope work cannot be finished, that
is a real problem: escalate with the evidence, and do not report Done
around it.

Review before Done. When every requirement passes, examine the work for
what the mechanisms would miss, record what you attacked and what you
found in `.cairn/reviews/<slug>.md`, and change no code while you look.
A finding is resolved as its own work, after the review is recorded.

## Writing for the developer

Write so the developer can understand the choice and its consequences
after one reading. Apply this to questions, specifications, records,
and progress reports.

- Name who does what and what changes for the user or system. Use
  familiar words, concrete examples, and short sentences.
- Match the explanation to the developer's knowledge. Explain an
  unfamiliar technical term when it matters to the decision. Keep
  technical detail that changes the answer; remove jargon that only
  makes the sentence sound authoritative.
- When asking for a decision, state the actual choice, your
  recommendation, why it helps, and what the alternative changes.
  Explain costs or risks in terms of what could happen. For an
  escalation, put this information in the existing fields.
- With a decision or agreement prompt, say: "If this isn't clear, ask
  me to explain it another way before you decide." For an escalation,
  put the invitation after the options on the existing Reply line.
- Distinguish what you observed from what you assume or do not know.
  Keep important limits visible when shortening an explanation.
- Before sending, ask whether the developer can tell what their answer
  would authorize without decoding internal names or abstract labels.
  Rewrite any sentence that hides that choice.
- If a reply shows a misunderstanding, explain the choice again before
  treating the reply as agreement. Silence alone is not confirmation.

For example: "Should the app save unfinished drafts so users can reopen
them later?" names the behavior the developer is deciding about.

## The developer

An escalation awaits you in `.cairn/escalations/<slug>.md`. Answer it:

    cairn answer <slug> ok | instead <what> | ask <question>

Use `ask <question>` whenever the explanation is unclear. The agent will
reply in the same file, then the decision returns to you. Answer `ok`,
`instead <what>`, or ask another question. Only `ok` or `instead` closes it.

A queued decision awaits you in `.cairn/queue/<slug>`; its record is in
docs/decisions/. The agent did not wait for you. Reading it and
removing the queue entry in a commit is the review; the commit's author
and date are the mark. To reverse it, have the agent supersede the
record with the cause named.

The next commitment is the loop's while the backlog holds items. Read
promotions in the review queue; supersede one to reverse it. Ideas that
would change the contract wait in next-iteration; the loop never works
them. A waiting item starts a new loop the way a new project or a new
feature does: run new-project or existing-project as for one, and that
specification phase ends by naming the next commitment.

The kernel is upgraded at Done, never inside a commitment; a commitment
starts and finishes on one referee. Every evidence record names the
kernel that wrote it, and a record from another kernel is stale, so an
upgrade re-runs each mechanism once.

Merge other branches with `git merge --no-ff` so their commits stay off
this loop's first-parent history. Cairn checks each of this loop's own
commits; reverting a change does not erase a footprint breach. Declare a
missing input when it belongs to the commitment; this can cover earlier
correct changes without reverting them. To retain correct committed work
outside that agreement, use `cairn escalate --scope --keep --concerns
LOOP-035` with decision fields explaining why to keep the exact recorded
changes. Stop for the developer. A committed `ok` corrects scope only for
that incident and requires fresh checks and review; it does not extend the
mechanism footprint or authorize later edits. For accidental work, capture the
work in the backlog, restore the breaching paths to the commitment activation
tree, and commit the restoration. Use `cairn escalate --scope --concerns
LOOP-035` with the decision fields to request acknowledgment of that exact
restored history. Commit the developer's `ok` answer before checking. An
ordinary answer or `instead` supplies direction but grants no acknowledgment;
new changes remain breaches. Read every path in the scope explanation.
