# The record, the wake, and the check

Slug: the-record-and-the-wake
Requirements: LOOP-001, LOOP-002, LOOP-003, LOOP-004, LOOP-005, LOOP-006,
LOOP-007, LOOP-008, LOOP-017, LOOP-018, LOOP-019, LOOP-020, LOOP-021,
LOOP-022, LOOP-023, LOOP-024, LOOP-025, LOOP-027, LOOP-028, LOOP-030,
LOOP-031, LOOP-032, LOOP-033, LOOP-034, DEC-001, DEC-002, DEC-003,
DEC-004, DEC-005, DEC-006, DEC-007, DEC-013, DEC-014, DEC-015, DEC-016
Inherits: every PKG requirement

## Goal

Given only the repository, name the next legal action, and reach Done
honestly.

This is the loop's happy path, end to end. An agent with no memory
reads the files below, reconstructs its position, decides and records,
runs mechanisms against a committed tree, records evidence with
receipts, reviews, and reports the commitment complete only when every
requirement has current passing evidence and the review is clean.

Delivers three commands. `cairn wake` reads the repository and emits
exactly one next action (built). `cairn decide` writes a decision
record and queues a Consequential one (built). `cairn check` runs the
current commitment's mechanisms and records evidence.

## Where things live

    docs/spec/                 normative specs; the keystone maps them
    docs/spec/roadmap.md       ordered commitments; a Current: line names one
    docs/commitments/<slug>.md one file per commitment
    docs/decisions/<slug>.md   decision records
    .cairn/in-progress         the write-ahead record for the current action
    .cairn/mechanisms/<name>   what runs, the paths it reads, the requirements it speaks for
    .cairn/evidence/<REQ>/     one record per run; rebuildable, so gitignored
    .cairn/reviews/<slug>.md   the review record for a commitment; committed
    .cairn/escalations/<slug>  a parked Blocking decision; committed (built in commitment 2)
    .cairn/queue/<slug>        a Consequential decision awaiting review; committed

Everything under docs/ and every committed file under .cairn/ is a
cairn: written for the agent that arrives next.

## Position

The agent's position is the set of:

- the current commitment, from the roadmap's Current: line;
- for each requirement in it, its evidence history and whether the
  latest record's digests still match the tree;
- the in-progress record, if one exists;
- the open escalation, if one exists;
- every decision record whose realized-by list is empty;
- the review record for the commitment, if one exists, and whether its
  commit is the current commit;
- uncommitted changes in the working tree.

Every element is a fact. Status is derived from them and never stored,
so no two files can disagree about what is done.

## Wake precedence

On wake the agent takes the first that applies:

1. An in-progress record exists: reconcile the working tree against it
   and finish or abandon that action. Nothing else until it is cleared.
2. An open escalation exists: present it. Nothing else until answered.
3. A decision record has an empty realized-by list: build it.
4. A requirement's last three records all fail and no escalation was
   raised since the first of them: write the escalation (DEC-016).
5. A requirement's latest evidence fails and an earlier record passed:
   fix the code and run the mechanism. Regressions first (LOOP-031).
6. A requirement has a mechanism and its evidence is missing, stale, or
   failing: run the mechanism, or fix the code and run it.
7. A requirement in the commitment has no mechanism: declare one.
8. No review record exists for the commitment, or its commit is not the
   current commit: review (LOOP-020, LOOP-032).
9. The review record names an open finding: resolve it (LOOP-033).
10. Every requirement has current passing evidence, the review is at
    the current commit, and no finding is open: Done.

The review queue is visible at every step and blocks none of them.

## check

    cairn check [REQ ...]

For every mechanism that speaks for a requirement in the current
commitment (or for the named requirements):

- Refuse if any declared input has uncommitted changes, naming the
  path (LOOP-030). Evidence describes a committed state or nothing.
- Compute the inputs digest over the declared paths at HEAD and the
  mechanism digest over the declaration (LOOP-023).
- Run the command in its working directory. Capture the exit code and
  a digest of combined stdout and stderr.
- Write one evidence record per requirement the mechanism speaks for,
  carrying the receipt (LOOP-034). Never overwrite, never delete
  (LOOP-025).
- Print the wake verdict, and exit with its code.

A record of an interrupted check is not written; the in-progress record
(action: run-mechanism) says which run did not finish.

## Persisted transitions

A transition is on disk before the next action begins: a decision
recorded; code committed; evidence recorded; a review recorded; an
escalation written; an escalation answered. An interruption between two
leaves a state the wake reads.

## Formats

A commitment file is this file's shape.

The in-progress record:

    action: implement | build-decision | run-mechanism | review
    target: <requirement, decision slug, or commitment slug>
    base: <commit identifier>
    started: <iso timestamp>

A mechanism declaration:

    command: <argv>
    cwd: <path, default .>
    inputs:
      - <path or glob>
    requirements:
      - <REQ-ID>

An evidence record, .cairn/evidence/<REQ>/<iso>:

    requirement: LOOP-001
    mechanism: node-test
    commit: <sha>
    inputs_digest: sha256:<hex>
    mechanism_digest: sha256:<hex>
    command: node --test tests/*.test.mjs
    cwd: .
    exit: 0
    output_digest: sha256:<hex>
    result: pass | fail
    recorded: <iso timestamp>

A review record, .cairn/reviews/<slug>.md:

    commitment: <slug>
    commit: <sha the review examined>
    examined:
      - <what was attacked, one line each>
    findings:
      - open: <one line>
      - resolved: <one line>

The review is stale when its commit is not HEAD; a review that cannot
change code (LOOP-032) is one whose commit equals HEAD when it ends.

A decision record: title, Level, Decided by, Rests on, Would be wrong
if, a Decision section, a Realized by list of commit identifier and
subject.

## Tests

The primary test stays: two agents on one checkout derive one action.
The suite adds, each spawning the CLI against a temp repository:

- check refuses a dirty declared input and names the path; a dirty
  undeclared file does not block it (LOOP-030)
- check writes a record carrying command, cwd, exit, output digest,
  commit, and both digests; a nonzero exit writes result fail (LOOP-034)
- two checks write two records; nothing is overwritten (LOOP-025)
- after a commit that changes a declared input, wake says run; after a
  commit that changes only an undeclared file, wake still says Done
  (LOOP-024)
- a requirement that passed then failed is named before one that never
  passed (LOOP-031)
- three consecutive fails with no escalation since: wake says write the
  escalation; a fourth is never attempted (DEC-016)
- all passing and no review record: wake says review; review at an
  older commit: wake says review; open finding: wake says resolve;
  clean review at HEAD: Done (LOOP-020, LOOP-032, LOOP-033)
- Done is refused while any requirement lacks current passing evidence
  (LOOP-017)

## Done when

- Every requirement listed above has a mechanism and current passing
  evidence with a receipt, recorded by cairn check.
- A review record for this commitment exists at the current commit
  with no open finding.
- Stopping after any persisted transition and restarting produces no
  duplicated and no contradicted work.
- Two agents given only the repository state the same position and
  next action.
- `cairn wake` on this repository says Done.
