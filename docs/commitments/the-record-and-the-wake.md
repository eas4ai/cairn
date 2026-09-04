# The record and the wake

Slug: the-record-and-the-wake
Requirements: LOOP-001, LOOP-002, LOOP-003, LOOP-021, LOOP-022,
LOOP-027, LOOP-028, DEC-001, DEC-002, DEC-003, DEC-004, DEC-005, DEC-006, DEC-007, DEC-013,
DEC-014, DEC-015
Inherits: every PKG requirement

## Goal

Given only the repository, name the next legal action.

Delivers two commands. `cairn wake` reads the repository and emits
exactly one next action. `cairn decide` writes a decision record and,
for a Consequential decision, adds it to the review queue.

An agent with no memory of any earlier session reads the files below,
reconstructs its position, and knows what to do. Nothing else in Cairn
works until this does, and every later decision is shaped by it.

## Where things live

    docs/spec/                 normative specs; the keystone maps them
    docs/spec/roadmap.md       ordered commitments; a Current: line names one
    docs/commitments/<slug>.md one file per commitment
    docs/decisions/<slug>.md   decision records
    .cairn/in-progress         the write-ahead record for the current action
    .cairn/mechanisms/<name>   what runs, and the paths it reads
    .cairn/evidence/<REQ>/     results; rebuildable, so gitignored
    .cairn/escalations/<slug>  a parked Blocking decision; committed
    .cairn/queue/<slug>        a Consequential decision awaiting review; committed

Everything under docs/ and every committed file under .cairn/ is a
cairn: written for the agent that arrives next.

## Position

The agent's position is the set of:

- the current commitment, from the roadmap's Current: line;
- for each requirement in it, the latest evidence and whether its digest
  still matches;
- the in-progress record, if one exists;
- the open escalation, if one exists;
- every decision record whose realized-by list is empty;
- uncommitted changes in the working tree.

Every element is a fact. Status is derived from them and never stored,
so no two files can disagree about what is done.

## Wake precedence

On wake the agent takes the first that applies:

1. An in-progress record exists: reconcile the working tree against it
   and finish or abandon that action. Nothing else until the record is
   cleared.
2. An open escalation exists: present it. Nothing else until it is
   answered.
3. A decision record has an empty realized-by list: build it.
4. Evidence for a requirement is missing, stale, or failing: run the
   mechanism, or fix the code and run it.
5. A requirement in the commitment has no mechanism: declare one.
6. Every requirement has current passing evidence: mark the commitment
   done and stop.

The review queue is visible at every step and blocks none of them. The
backlog is durable and inactive until a commitment promotes it.

## Persisted transitions

A transition is on disk before the next action begins. The transitions
are: a decision recorded; code committed; evidence recorded; an
escalation written; an escalation answered.

An interruption between two transitions leaves a state the wake reads.
That is what makes resumability honest without promising atomic writes
that files and git do not provide.

## Formats

A commitment file is this file's shape: title, Slug, Status, Requirements,
Inherits, then prose.

The in-progress record, written before any action that changes code and
removed when the action's transition is persisted:

    action: implement | build-decision | run-mechanism
    target: <requirement or decision slug>
    base: <commit identifier>
    started: <iso timestamp>

A mechanism declaration:

    command: <argv>
    inputs:
      - <path or glob>

An evidence record, one file per run:

    requirement: LOOP-001
    mechanism: <name>
    inputs_digest: sha256:<hex>
    mechanism_digest: sha256:<hex>
    result: pass | fail
    recorded: <iso timestamp>

A decision record: title, Level, Decided by, Rests on, Would be wrong if,
a Decision section, a Realized by list of commit identifier and subject.

An escalation: the six-line format from LOOP-026, followed by Status
(open | answered) and, when answered, the developer's reply.

## Done when

- An agent given this repository and nothing else states its position
  and its next action, and a second agent given the same repository
  states the same. This is the primary test of the system.
- Stopping after any persisted transition and restarting produces no
  duplicated and no contradicted work.
- Every requirement listed above names a mechanism, and that mechanism
  passes.

Recording evidence is cairn check, which the next commitment delivers.
See docs/decisions/a-commitment-is-done-by-its-own-deliverables.md.
