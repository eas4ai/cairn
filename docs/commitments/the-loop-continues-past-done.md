# The loop continues past Done

Slug: the-loop-continues-past-done
Requirements: LOOP-087, LOOP-088, LOOP-089, LOOP-090, LOOP-091, LOOP-092, LOOP-093, LOOP-029, SPEC-002
Inherits: every PKG requirement
Status: Agreed 2026-09-14

## Goal

Done stops the loop only when there is nothing left the agent may
decide. Ideas inside the specification are promoted by the agent,
recorded, and reviewed later. Ideas that would change the
specification wait in next-iteration for the developer, and the loop
asks for them once, with a recommendation, when the backlog is empty.

Drafted 2026-09-14. The developer ruled that a human asked to confirm
every bounded item stops reading and confirms without deciding, and
then does not invest attention when a decision needs it. Approval is
reserved for changes to the contract; everything else is decided,
recorded, and open to review in the queue.

## Authorization and scope

The developer requested the continuation on 2026-09-14 and confirmed
the two-bucket sorting and the promotion levels in conversation. This
commitment changes the working agreement, the glossary, the decision
scale's rationale, the keystone's status paragraph, the kernel's wake
and capture, the spec lint, both project skills' template, the
README, and the manual. It does not build any hook; that item waits in
next-iteration. It does not change evidence, freshness, or review
rules.

## Decisions to record

- `.cairn/next-iteration/` is a directory under `.cairn/`, so PKG-003
  needs a record naming it and the failure that forced it:
  specification-changing ideas sat in the backlog beside bounded ones,
  and nothing on disk said which an agent could promote. Consequential:
  every consumer gains the directory.
- The promotion marker `Status: Agreed <date> by promotion <decision
  slug>`. Consequential: it changes how an Agreed line is read in every
  consumer, and it is the one search that answers which requirements
  the developer never confirmed.
- `cairn backlog --next-iteration --changes <REQ|working-agreement>`
  writes the capture under `.cairn/next-iteration/` with a `Changes:`
  line in place of `Surfaced from:`; `--outside TEXT` writes an
  `Outside because:` line in either directory. Judged: options on an
  existing command, no new command.

## Deliverables

### Kernel (bin/cairn.mjs)

- `backlog()`: with `--next-iteration`, the file goes under
  `.cairn/next-iteration/` and `--changes` is required and written as
  `Changes:`; `--outside TEXT` writes `Outside because:`; the
  never-overwrite rule (LOOP-016) holds in both directories.
- Deferral gate, before Done and before promote: every file added under
  either directory by a commit inside the footprint whose `Surfaced
  from:` or `Changes:` line names a requirement of the commitment must
  carry `Outside because:` or be named by an escalation; otherwise
  `Resolvable: escalate <item>` naming the file and the requirement
  (LOOP-092). A next-iteration file with no `Changes:` line is
  `Resolvable: repair <path>` (LOOP-093, a malformed artifact under
  LOOP-005).
- `wakeVerdict()`, after the review is clean and before Done:
  - a backlog item with no `Promoted to:` line: `Resolvable: promote`,
    the reason listing the candidates (LOOP-087);
  - none, and next-iteration holds an item: `Resolvable: escalate
    next-iteration`, the reason listing the items; once an open
    escalation names next-iteration, the ordinary Escalate verdict
    (LOOP-091);
  - both empty: Done, as today.
- `requirementSet()` or its caller: an Agreed line carrying `by
  promotion <slug>` with no `docs/decisions/<slug>.md` is a repair
  verdict naming the requirement and the missing record (LOOP-088).
- `currentCommitment()`: reads an optional `Promoted from:` line. For a
  promoted commitment, `scopeVerdict()` compares every Agreed
  requirement's digest and the working agreement file at the footprint
  base with HEAD; a change is `Resolvable: escalate <slug>` naming the
  changed requirement or file, and Escalate once an escalation names
  the commitment (LOOP-089, LOOP-090).
- The kernel stays under the PKG-004 ceiling; the estimate is under
  sixty lines.

### Spec lint (scripts/spec-lint.mjs)

- A `by promotion <slug>` marker whose slug has no file under
  docs/decisions/ is a finding (LOOP-088, the static proxy).

### Glossary (docs/spec/glossary.md), on confirmation

Agreed gains this sentence after "Only Agreed requirements are
contract.":

    A requirement promoted from the backlog is Agreed by the promotion
    decision that names it, and its Status: line names that decision.

Backlog becomes:

    **Backlog.** Ideas captured during the loop that fit inside the
    current specification and are not yet promoted into a commitment.
    The scope valve writes here. At Done, the loop promotes from here
    without the developer.

A new entry between Mechanism and Observed:

    **Next-iteration.** Ideas captured during the loop that would change
    an Agreed requirement, its falsifier, or the working agreement. They
    enter a commitment only through a specification phase the developer
    confirms.

### Decision scale rationale (docs/spec/decisions.md), on confirmation

After the scale table, before DEC-001:

    Promoting a backlog item is inside the specification: it changes
    nothing the developer agreed to, so it takes Judged or Consequential
    by reversal cost and never Blocking. A change to an Agreed
    requirement, its falsifier, or the working agreement is the Blocking
    row's change to what gets built, and it reaches the developer
    through next-iteration (LOOP-029). A confirmation asked for every
    bounded promotion is given without reading; a confirmation that is
    always given is not a decision, and it spends the attention the
    Blocking decisions need.

### Keystone (docs/spec/overview.md), on confirmation

Appended to "Status of this specification":

    A requirement promoted from the backlog carries `Status: Agreed
    <date> by promotion <decision slug>`. The decision, not the
    developer, confirmed its falsifier (LOOP-088). The marker is the
    search that lists every requirement the developer never read.

### Working agreement (AGENTS.md and skills/new-project/templates/AGENTS.md)

The Done bullet becomes:

    - Done: the commitment is complete, the backlog holds nothing to
      promote, and next-iteration is empty. Report it, and stop.

Two paragraphs after the `reply <slug>` paragraph:

    When wake says `promote`, the commitment is complete and the backlog
    holds an item. Choose the item by judgment. Record the promotion
    with `cairn decide` at Judged or Consequential, naming the item, the
    requirement you draft from it, and that requirement's falsifier.
    Write the requirement into the specification with `Status: Agreed
    <date> by promotion <decision slug>`, write
    docs/commitments/<slug>.md with a `Promoted from:` line naming the
    item, add the roadmap section, move the roadmap's Current: line, and
    stamp the item `Promoted to: <slug>`. Commit, then wake. A promoted
    commitment must not change an Agreed requirement, its falsifier, or
    this file. When the work needs that, move the item to
    next-iteration with the reason, escalate, and stop.

    When wake says `escalate next-iteration`, the backlog is empty and
    next-iteration holds items. Raise one escalation that recommends
    which item to specify next, with the alternatives, and stop. The
    developer's `ok` starts a specification phase for that item.

A new paragraph after the out-of-scope paragraph:

    Deferral is not allowed. Work the commitment includes is finished or
    escalated, never captured. When an idea surfaces from one of the
    commitment's own requirements and is not its work, say why on an
    `Outside because:` line. When in-scope work cannot be finished, that
    is a real problem: escalate with the evidence, and do not report
    Done around it.

The out-of-scope paragraph becomes:

    Out of scope is captured, never built. An idea that fits inside the
    specification goes to `cairn backlog --title ... --body ... --from
    <REQ>`. An idea that would change an Agreed requirement, its
    falsifier, or this file goes to `cairn backlog --next-iteration
    --title ... --body ... --changes <REQ>`, naming what it would
    change. A backlog item enters a commitment by a recorded promotion
    at Done. A next-iteration item enters only when the developer writes
    it into the specification.

The developer section's last paragraph becomes:

    The next commitment is the loop's while the backlog holds items.
    Read promotions in the review queue; supersede one to reverse it.
    When the loop escalates with a next-iteration recommendation, answer
    ok, instead, or ask. An ok starts a specification phase for that
    item, in which you confirm its falsifier; the agent moves the
    roadmap's Current: line when the phase ends.

### Skills

- new-project and existing-project: capture rules name both
  directories and the sort test; the template carries the working
  agreement above.

### Cairn's own records, in this commitment

- Move to `.cairn/next-iteration/`, each gaining a `Changes:` line:
  evidence-names-the-kernel-that-wrote-it (LOOP-024),
  one-record-per-run-rather-than-one-per-requirement (LOOP-041),
  two-mechanisms-that-both-prove-one-requirement (LOOP-056), and
  hooks-keep-the-agent-in-the-loop (PKG-012 and the working
  agreement).
- Stay in the backlog: run-only-stale-mechanisms-without-a-requirement-
  lookup (Consequential) and the-spec-lint-demands-a-falsifier-on-a-may-
  that-the-skill-says-carries-none (Judged).
- Stamp prepare-a-next-iteration-without-repeating-project-adoption
  `Promoted to: the-loop-continues-past-done`; the next-iteration
  escalation is the skill it asked for.

### Human documentation

- README "How the work moves forward" and "Who does what?": Done
  continues through the backlog; the developer answers one escalation
  per specification change.
- Manual: the backlog and next-iteration under "Know where the records
  live"; promotions under "Review decisions that did not stop the
  work"; the next-iteration escalation under "Answer a decision without
  guessing".

## Tests

- wake at a complete commitment with an unpromoted backlog item names
  promote and lists it; with every item stamped and next-iteration
  empty it says Done (LOOP-087)
- wake at a complete commitment with an empty backlog and one
  next-iteration item names escalate next-iteration; with an open
  escalation naming it, Escalate (LOOP-091)
- a requirement Agreed by promotion of a slug with no decision record
  is a repair verdict, and a spec-lint finding (LOOP-088)
- a promoted commitment whose footprint changes an Agreed requirement's
  text names escalate; a commit to AGENTS.md does the same; an
  unpromoted commitment is untouched (LOOP-089, LOOP-090)
- `cairn backlog --next-iteration` writes under the new directory with
  a Changes: line, refuses a capture without --changes, and never
  overwrites (LOOP-016, LOOP-093)
- a capture added inside the footprint from one of the commitment's
  requirements without Outside because: blocks Done with an escalate
  action; with the line, or with an escalation naming it, Done
  proceeds; a capture from a requirement outside the commitment is
  untouched (LOOP-092)
- a next-iteration file without a Changes: line is a repair verdict
  (LOOP-093)
- the working agreement and the template state the promote and
  next-iteration moves (the static proxy, LOOP-029)
- spec lint and the walkthrough pass with the revised SPEC-002

## Verification

Reproduce the stop this commitment removes: a complete commitment, an
unpromoted backlog item, and wake printing Done at the commit before
the change. Run the existing wake, scope, agreement, skills, and
spec-lint suites, full committed mechanisms, and review the final
change before Done.

## Done when

- Every requirement listed above has current passing evidence from
  node-test or spec-lint, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done, and on the next wake names the first
  promotion.
