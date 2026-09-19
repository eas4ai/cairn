# Cairn 2: feature specification

Status: Draft, 2026-09-18. Nothing here is Agreed until the developer confirms it.

This document says what Cairn 2 is, which processes it keeps, what each
record is for, and what 1.x had that 2 does not. It is a feature
specification: it names behaviors and the reader of each record, not
requirement identifiers. The requirements, with falsifiers, are written
from it in the next step, under the policy in section 7.

The five process digraphs beside it, in docs/diagrams/, are part of this
specification: install, new-project, existing-project, next-feature, and
the work loop.

## 1. Purpose

Cairn keeps agent-led development tied to what the developer agreed to
build. A coding agent from any vendor does the work; Cairn is the
referee that reads the repository, records what was proven, decides what
is still current, and names the next action. Belief that the code
matches the agreement lives in the repository, not in a session, so a
new session with no memory can continue.

Cairn 2 keeps seven ideas from 1.x, and little else:

1. A requirement is Agreed only with an observable failure, its falsifier.
2. Work happens one commitment at a time, named in the roadmap.
3. Each requirement is proven by a declared command whose result is
   recorded with digests of everything it ran against.
4. Evidence is current only while those digests match; nothing is re-run
   for its own sake and nothing stale counts.
5. Nothing is Done until a reviewer with none of the builder's context
   has looked and every finding is answered.
6. Work outside the commitment is captured, never built.
7. The agent stops for the developer only when the decision is theirs.

Everything in Cairn 2 serves one of those seven. A behavior that serves
none of them is not in Cairn 2.

## 2. Vocabulary

- **Requirement**: one obligation, the actor named, with a **falsifier**:
  the observable state in which it is violated.
- **Commitment**: one agreed unit of work; the roadmap names the current
  one. Not a Git commit.
- **Mechanism**: a declared command, the paths it reads, and the
  requirements it speaks for.
- **Receipt**: the record of one mechanism run: commit, digests, result.
- **Review**: the builder's record of what it examined and found.
- **Report**: the independent reviewer's record, same shape.
- **Decision**: a recorded choice above routine, with what would make it
  wrong.
- **Escalation**: a question only the developer can answer, with a
  recommendation.
- **Item**: a captured idea. A **backlog** item fits the specification; a
  **next-feature** item would change it; a **defect** item names an
  Agreed requirement the code already violates.
- **Verdict**: what wake prints: Resolvable with an action, Escalate, or
  Done.
- **Predicate**: the condition under which the named action is complete,
  printed with the action.

The term next-feature replaces 1.x's next-iteration everywhere: the
skill, the directory `.cairn/next-feature/`, and the flag
`--next-feature`.

## 3. The processes

Four entry flows and one loop. Each flow ends where the loop begins.

**Install** (docs/diagrams/install.dot). From a harness with no Cairn to
a working command, registered hooks and the four skills. Done when
`cairn --help` prints and, inside a project, wake prints a verdict.

**New project** (new-project.dot). From an empty directory to an Agreed
first commitment: keystone, glossary, domain specifications with
falsifiers, roadmap, commitment, mechanisms, working agreement. One
question to the developer at the start; everything else is drafted and
corrected by exception. Done when wake names the first action.

**Existing project** (existing-project.dot). From a codebase Cairn has
not specified, or one whose specification has drifted, to one prepared
commitment. Recon before questions, every claim cited; Observed text is
never contract; drift is raised, never quietly fixed. Done when wake
names the first action.

**Next feature** (next-feature.dot). From Done to the next Agreed
commitment, starting from the specification rather than the code. The
developer's phase: it is the only route by which Agreed text changes.
Done when wake names the first action of the new commitment.

**The work loop** (work-loop.dot). Wake names one action; the agent does
it; wake again. Escalate presents the question and stops. Done reports
and stops, unless a backlog item waits, which the agent promotes by a
recorded decision. Every step leaves a trace in the repository: a
commit, a receipt, a record.

## 4. The record set

A record exists only if something reads it at a known moment: the
kernel on the next wake, or the developer at a moment they can name.
The kernel writes every record it reads, and never parses prose. A
human-readable view is generated from a record, never read back from
one.

| Record | Written by | Read by | When |
|---|---|---|---|
| Requirement (`docs/spec/*.md`) | agent, in the spec phases | kernel (identity, status, digest); developer (agreement) | every wake; each spec phase |
| Commitment (`docs/commitments/<slug>.md`) | agent, in the spec phases | kernel (its requirements); developer (done-when) | every wake |
| Mechanism (`.cairn/mechanisms/<name>`) | agent | kernel | every check and wake |
| Receipt (`.cairn/evidence/`) | kernel | kernel; developer when asking what was proven | every wake |
| Review and report (`.cairn/reviews/`) | kernel, from `cairn review` and `cairn report` | kernel (open findings, carry); developer at Done | before Done |
| Decision (`docs/decisions/`) | kernel, from `cairn decide` | developer (the queue); kernel (realized, superseded) | Consequential and Blocking only |
| Escalation (`.cairn/escalations/`) | kernel, from `cairn escalate` and `cairn answer` | developer, once; kernel (open or answered) | when raised |
| Item (`.cairn/backlog/`, `.cairn/next-feature/`) | kernel, from `cairn item` | kernel (promotion, deferral, defects); developer in next-feature | at Done and in next-feature |

Requirement and commitment files are the only records the agent writes
by hand, because the developer reads and edits them. Their parsed part
is small: the identifier, the text, the falsifier line, the status line,
the requirements list. Everything else in them is prose the kernel skips.

A review or report is entered through the command, one field per flag:
`cairn review --commit <sha> --examined "<what>" --finding "open|resolved: <text>"`.
The kernel writes the file in its own form. The reviewer's words are
kept verbatim in the field; there is no markup the kernel has to see
through, because there is no markup.

Records from 1.x are not read. This is a major version; a project moves
to it at Done, by re-running its checks and writing its review through
the new commands.

## 5. Verdicts, actions, and predicates

Three verdicts, as in 1.x. Wake prints the verdict, the action, one line
of reason, and the predicate: the condition the kernel will test on the
next wake to decide the action is complete. The predicate is the
notation from the 1.x README, made per-action:

| Action | Complete when |
|---|---|
| `run REQ` | a receipt for REQ exists at HEAD and is current; the receipt is committed |
| `implement REQ` | as run, and the result is pass |
| `declare REQ` | a committed mechanism names REQ |
| `record PATH` | `.cairn/in-progress` names the action, or PATH is clean at HEAD |
| `commit PATH` | PATH is clean at HEAD |
| `reconcile ACTION` | `.cairn/in-progress` is absent and the tree is clean or committed |
| `review SLUG` | the review and the report both name HEAD, are committed, and every report finding is carried |
| `resolve SLUG` | no finding is open; each resolution is its own commit |
| `review mechanism REQ` | the declaration's reviewed list carries REQ with the current text digest, committed |
| `fix ITEM` | the item names a fixing commit that changes no Agreed text, and REQ passes at or after it |
| `capture PATH` | the item carries a reason it is outside, or an escalation names it |
| `build DECISION` | the record's Realized by names a commit that resolves |
| `promote` | a promotion decision, the requirement Agreed by it, the commitment, the roadmap, the stamped item |
| `present SLUG` | none: the developer's turn |
| `reply SLUG` | the escalation carries the agent's explanation |

The predicate is the specification of the action. The working agreement
lists the actions and points at the predicates; it does not describe
record formats, because the commands own them.

## 6. Hooks

Two hooks, both prompting, neither blocking.

- **Session start**: link the command if missing; say which kernel
  judges; inside a project, print the verdict and its predicate.
- **Each turn** (UserPromptSubmit where the harness has it): print the
  verdict and its predicate. Wake costs under a second. The referee's
  line sits in front of the model before every response, which is where
  a skipped step is caught.
- **Stop**: print the verdict and predicate as a message. No refusal, no
  refusal count, no stop record.

1.x's stop hook refused a stop while Resolvable and, after three
refusals with no change to the tree, wrote a record the next session had
to explain. Twenty-seven such records were written in two days, every
one explaining that the agent was waiting for a reviewer. The
prompting hook keeps the enforcement that worked (the model sees the
named action) and drops the part that did not (refusing a wait).

## 7. Requirements policy

- A requirement describes something a user of Cairn can observe: a
  verdict, a refusal, a record, a command's output. The kernel's
  internals are tests, not contract. 1.x had 255 requirements, 141 of
  them about the loop; most of those were internals.
- A requirement block holds its identifier, its text, its falsifier and
  its status. Rationale is at most one line, naming a decision record if
  there is one. History is Git's.
- A falsifier names a mechanism that could observe it before the
  requirement is Agreed. Every mechanism demonstrates a safe violating
  example when it is built, and the review that accepts a new or revised
  mechanism carries a line saying what example was tried.
- Agreement is per block, by the developer's confirmation, or by a
  recorded deference or promotion decision, as in 1.x.

## 8. What each kept process does, and what changed

**Freshness.** Evidence is current when the digests of the mechanism's
inputs, its declaration, the requirement text and the kernel match now.
A revised requirement needs a mechanism review before its evidence
counts. A review is stale when a code input changed since it was
written; a declaration may list `documents:` for inputs whose change
costs a check and not a review, and the kernel refuses a `documents:`
entry that is not among the inputs or that lies under a source
directory.

**Scope.** A change on the loop's own history to a path no mechanism
declares is a breach, named with the path. The two recovery routes from
1.x remain: declare the input, or escalate to keep or to restore.

**Deferral.** An item captured from one of the commitment's own
requirements carries the agent's reason it is outside, or an escalation
names it. A defect item is never deferral: a defect from the
commitment's own requirement is worked under it. (1.x's LOOP-092 and
LOOP-140 disagreed on this case; 2 takes LOOP-140's side.)

**Attempts.** Three distinct input digests that fail without a pass make
the next decision Blocking. Reruns and documentation changes do not
count.

**Decisions.** The four-level scale stays. Routine and Judged leave no
file; a Judged decision is a line in the commit message. Consequential
writes a record and queues it; Blocking escalates. Supersession names
one of the four causes; `cairn reversals` reports the rate by decider.

**Escalation.** Five one-line fields; `ok`, `instead`, `ask`; a reply
turn after `ask`. Unchanged from 1.x, because it is the record that
works.

**Capture and promotion.** Backlog items are promoted at Done by a
Consequential decision. Next-feature items wait for the developer.
Defect items are fixed before any promotion.

**Review.** The builder records what it examined and found; a reviewer
with none of the builder's context writes a report at the same commit;
each report finding is carried into the review by number. Both records
are written through commands, so a finding is a field, not a line the
kernel has to recognize.

**Release.** One tagged commit sets the version in every manifest and
carries the changelog entry; the script refuses a dirty tree, a
non-increase, a taken tag, an attributed commit, or a loop not at Done.
The attribution policy in `.cairn/policy` stays, opt-in.

**Evidence.** The receipt is committed. The command's output is written
beside it but ignored by Git, and the receipt names its digest, so a
missing or altered output is detectable and a repository does not grow
by the size of its test logs.

## 9. Distribution

One plugin: the command, two hooks, four skills (`install-cairn`,
`new-project`, `existing-project`, `next-feature`). Manifests for Claude
Code, Codex and Muse share one version. The skills also install by the
skills CLI. Node and Git; no build, no packages, no service. Linux and
macOS.

The kernel keeps a line ceiling. Its value is set when the kernel
exists, from what the seven ideas need, and it is not raised inside a
commitment.

## 10. Removed from 1.x

- The autonomy and Jev modes (AUTO-001 to AUTO-018): Agreed, never
  built, never checked. Not carried.
- The stop hook's refusal, its refusal count, stop records, and the
  `explain` action.
- Reading review and item records as Markdown: the findings sweep, the
  heading rules, the fence rules, the markup tolerance, and the 778-word
  paragraph in the working agreement that described them (the class
  LOOP-108 to LOOP-138 and LOOP-086 covered).
- `Revised <date>` rationale paragraphs inside requirement blocks.
- Decision files at Judged.
- Command output files in Git.
- docs/audit and the diagrams of 1.x; this specification's digraphs
  replace them.
- Every requirement that described a kernel internal rather than an
  observable behavior. The cut list is produced when the 2 requirements
  are written, identifier by identifier, so the developer rules on
  specifics.

## 11. Decisions in this draft the developer may reverse

1. A defect from the commitment's own requirement is worked, not
   captured (section 8, Deferral).
2. The stop hook prompts and never blocks (section 6).
3. Judged decisions have no file (section 8, Decisions).
4. next-iteration is renamed next-feature, including the directory and
   the flag (section 2).
5. 1.x records are not read; the move to 2 is at Done and re-checks
   (section 4).
6. Command output lives outside Git (section 8, Evidence).
7. The version is 2.0.0 and the branch is `v2` in this repository; the
   1.x line is archived at cutover.

## 12. Next steps

1. The developer corrects this document and the five digraphs.
2. The requirements are written from it, each with a falsifier and the
   mechanism that observes it, under section 7's policy, with the 1.x
   cut list beside them.
3. The record commands and the kernel are built against those
   requirements, under the work loop, in this branch.
4. At the first Done, the 1.x line is archived and this branch becomes
   main.
