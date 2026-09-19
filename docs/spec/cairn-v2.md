# Cairn 2: feature specification

Status: Draft, 2026-09-18, revised the same day after an adversarial
review of the first draft. Nothing here is Agreed until the developer
confirms it.

This document says what Cairn 2 is, which processes it keeps, what each
record is for, and what 1.x had that 2 does not. It is a feature
specification: it names behaviors and the reader of each record, not
requirement identifiers. The requirements, with falsifiers, are written
from it in the next step, under the policy in section 7. This document
is self-contained: every term the kernel relies on is defined in it.

The six process digraphs in docs/diagrams/ are part of this
specification: install, new-project, existing-project, next-feature,
the spec-phase tail the three entry flows share, and the work loop.

## 1. Purpose

Cairn keeps agent-led development tied to what the developer agreed to
build. A coding agent from any vendor does the work; Cairn is the
referee that reads the repository, records what was checked, decides
what is still current, and names the next action. Belief that the code
matches the agreement lives in the repository, not in a session, so a
new session with no memory can continue.

Cairn 2 keeps seven ideas from 1.x, and little else:

1. A requirement is Agreed only with an observable failure, its falsifier.
2. Work happens one commitment at a time, named in the roadmap.
3. Each requirement is checked by a declared command that tries to
   falsify it; the result is recorded with digests of everything it ran
   against. A passing check has not falsified the requirement; it has
   not proven it.
4. Evidence is current only while those digests match; nothing is re-run
   for its own sake and nothing stale counts.
5. Nothing is Done until a reviewer with none of the builder's context
   has looked and every finding is answered. Done means: not falsified
   by the declared checks, and looked at by someone who does not share
   the builder's blind spots.
6. Work outside the commitment is captured, never built.
7. Agreed text changes only by the developer's ruling. The agent stops
   for the developer only when the decision is theirs.

Everything in Cairn 2 serves one of those seven. A behavior that serves
none of them is not in Cairn 2.

## 2. Definitions

The kernel's terms. A term in this list means this and nothing else.

- **Specification**: the files under `docs/spec/`. The **keystone**
  (`docs/spec/overview.md`) says what the software is and holds the
  **spec map**, one row per **domain** file with its identifier prefix.
  The **glossary** (`docs/spec/glossary.md`) holds the project's terms.
  The **roadmap** (`docs/spec/roadmap.md`) holds a `Current:` line
  naming the current commitment's slug, and is parsed for nothing else.
- **Requirement**: one block in a domain file: an identifier
  `[PREFIX-nnn]`, one obligation with the actor named, a `Falsifier:`
  line naming the observable state in which it is violated, and a
  `Status:` line. The block grammar is in section 4.
- **Status**: one of `Draft` (written, not confirmed), `Observed`
  (derived from existing code; describes what is, never contract),
  `Agreed <date>` (confirmed by the developer, or by a deference
  decision the rationale line names), `Retired <date>` (no longer
  contract; kept so identifiers are never reused). Only Agreed blocks
  are digested and checked. A commitment may name only Agreed
  requirements.
- **Commitment**: `docs/commitments/<slug>.md`, one agreed unit of work.
  Parsed lines: `Requirements:`, `Specified from:` (next-feature items
  it carries), `Promoted from:` (the backlog item it carries). Not a
  Git commit; one commitment spans many.
- **Mechanism**: `.cairn/mechanisms/<name>`, written by `cairn declare`:
  the command, its working directory, the paths it reads (`inputs:`),
  the inputs whose change costs a check and not a review
  (`documents:`), the requirements it speaks for, whether it prints
  per-requirement result lines (`results: per-requirement`, in which
  case stdout carries `cairn: REQ: pass|fail` and a requirement with no
  line is unverified), and its **reviewed list**: one entry per
  requirement it has been accepted for, naming the requirement's text
  digest and the fail receipt of its violating example.
- **Receipt**: `.cairn/evidence/<stamp>`, written by `cairn check`: the
  mechanism, the digest of its input set, the digests of the
  declaration and of each requirement's text, the receipt schema
  version, the exit and signal, per-requirement results, and the
  digest and path of the captured output. Keyed by digests, never by a
  commit.
- **Current**: a receipt is current for a requirement when the input
  set digest, the declaration digest and the requirement text digest
  it names equal the ones computed now. The input set digest is the
  Git tree identity of the declared paths as they are in the working
  tree; tracked clean files use Git's own blob identity.
- **Review**: `.cairn/reviews/<slug>.md`, written by `cairn review`: the
  commit and input set digest it examined, what was examined, the
  builder's answers to the fixed questions (section 9), and findings,
  each open or resolved.
- **Report**: `.cairn/reviews/<slug>.report.md`, written by `cairn
  report`: the adversary's record at Done, section 9.
- **Decision**: `docs/decisions/<slug>.md`, written by `cairn decide`
  at Consequential: what it rests on, who decided (`developer`,
  `agent`, `joint`), what would make it wrong, the commits that
  realized it, and, when it supersedes another, the cause. The kernel
  knows two levels: Consequential (record, queue, continue) and
  Blocking (escalate). The working agreement's guidance keeps four
  (Routine and Judged leave no record).
- **Queue**: `.cairn/queue/<slug>`, one entry per unread Consequential
  decision; presented at Done and at the start of next-feature; the
  developer removes an entry to mark it read.
- **Escalation**: `.cairn/escalations/<slug>.md`, written by `cairn
  escalate` with five one-line fields (question, recommendation,
  because, if wrong, instead), answered by the developer with `cairn
  answer <slug> ok | instead <text> | ask <text>`. An `ask` keeps it
  open for the agent's `reply`. A Blocking decision is its escalation;
  no separate decision record is written.
- **Item**: `.cairn/backlog/<slug>.md` or `.cairn/next-feature/<slug>.md`,
  written by `cairn item`. A **backlog** item is work the current
  Agreed requirements already cover. A **next-feature** item would
  change Agreed text or the working agreement, and names what. A
  **defect** item is a backlog item with `Defect: yes` naming an Agreed
  requirement the code violates. Header fields are the kernel's:
  `Surfaced from:`, `Changes:`, `Outside because:`, `Defect:`,
  `Fixed by:`, `Promoted to:`. The body is never parsed.
- **In-progress record**: `.cairn/in-progress`, ignored by Git, written
  by the agent before it changes a declared input and removed when the
  change is committed: `action`, `target`, `base` (the commit), `started`,
  `session` (the harness session identifier when the hook provides
  one). A second session that finds one names `reconcile`. `cairn
  check` writes its own while a mechanism runs and removes it after.
- **Policy**: `.cairn/policy`, hand-written flat fields: `outside:` the
  paths that are nobody's input and never a scope breach (README,
  CHANGELOG, CI configuration); `source:` the directories under which
  no `documents:` or `outside:` entry may lie; `attribution:
  forbidden` for the release script.
- **Working agreement**: `AGENTS.md` at the repository root, copied from
  the template the plugin ships: the move for each verdict and action.
  The kernel digests it to know when it changed; it does not parse it.
- **The loop's own history**: the first-parent commits since the commit
  that wrote the roadmap's current `Current:` line. Merged branches
  stay off it.
- **Carried**: a report finding n is carried when exactly one review
  finding cites it as `(report n)` and begins with the finding's words.
- **Verdict**: what wake prints. Four: `Resolvable` with an action
  (the agent's turn), `Waiting` (the developer's turn: an escalation
  has been presented and not answered), `Escalate` with a slug (a
  question awaits presentation), `Done`. A pending adversary's report
  is the agent's wait, not the developer's, and stays Resolvable.
  Outside a project, wake prints one line saying so and exits 3; that
  is not a verdict.
- **Predicate**: the condition the kernel tests on the next wake to
  decide the named action is complete, printed with the action.
- **Attempt**: a failing receipt for a requirement at an input set
  digest not seen among the failures since its last pass.

The term next-feature replaces 1.x's next-iteration everywhere: the
skill, the directory, and the flag.

## 3. The processes

Four entry flows, one shared tail, and one loop.

**Install** (install.dot). Prerequisites first: Node and Git, or stop
naming the missing one. Then the plugin (Claude Code, Codex, Muse) or
the skills CLI plus `/install-cairn`, which does by hand what the
plugin's hooks do. The install skill links `~/.local/bin/cairn`; the
session-start hook only says when the link or PATH is missing. Done
when `cairn --help` prints, and inside a project the verdict prints. In
a harness with no hook system, Cairn degrades to instruction-only: the
working agreement is the whole enforcement.

**New project** (new-project.dot). From an empty directory, or one
holding only a README, a license and Git, to an Agreed first
commitment. One open question (what the software is for) and four
confirmation gates: the restatement, the glossary, the domain
partition, each requirement block. Ends in the spec-phase tail.

**Existing project** (existing-project.dot). From a codebase Cairn has
not specified, or one whose specification drifted, to one prepared
commitment. Recon before questions, every claim cited in
`docs/recon.md`; Observed text is never contract; drift is raised with
both sides cited and the developer rules. When the developer's request
falls outside the current commitment, the developer chooses: finish the
current commitment and capture the request, or supersede the commitment
and take the request. Ends in the spec-phase tail.

**Next feature** (next-feature.dot). From Done to the next Agreed
commitment, starting from the specification. Every change the developer
asks for goes into the commitment: one that fits the Agreed
requirements needs no new text; one that does not is revised or added
under the developer's confirmation. Ends in the spec-phase tail.

**The spec-phase tail** (spec-phase.dot). Shared by the three flows
above, defined once: falsifiers proposed as one set with a mechanism
named for each; a self-review for contradictions, falsifiers that would
not catch their violation, and requirements no mechanism can check
(done, not recorded: nothing reads the record); `cairn lint`; present
by exception, with the invitation to ask for another explanation; the
developer confirms or corrects, or rules that the recommendation stands
(a deference decision, quoting their words); `Status: Agreed <date>`
per confirmed block; the commitment file; `cairn declare` for the
commitment's requirements only, each with a failing test as its
violating example; the working agreement; commit; wake.

**The work loop** (work-loop.dot). Wake names one action with its
predicate; the agent does it until the predicate holds, leaves the
trace, and wakes again. Escalate presents the question; Waiting is the
developer's turn and the agent stops. Done reports and stops.

## 4. The record set

A record exists only if something reads it at a known moment: the
kernel on the next wake, or the developer at a moment this document
names. The kernel parses exactly two hand-written files, the
requirement files and the commitment files, and in them exactly the
lines the grammar below names. Every other record it reads, it wrote.
A human-readable view is generated from a record and never read back.

| Record | Written by | Read by | Moment |
|---|---|---|---|
| Requirement files | agent, in the spec phases | kernel: the grammar lines; developer: agreement | every wake; each spec phase |
| Commitment file | agent, in the spec phases | kernel: three field lines; developer: done-when | every wake |
| Roadmap | agent, in the spec phases | kernel: `Current:` | every wake |
| Glossary, keystone, recon | agent | developer and the next agent | each spec phase |
| Mechanism | kernel, from `cairn declare` and `cairn review mechanism` | kernel | every check and wake |
| Receipt | kernel, from `cairn check` | kernel; developer asking what was checked | every wake |
| Review | kernel, from `cairn review` | kernel: findings, claims; the adversary at Done | before Done |
| Report | kernel, from `cairn report` | kernel: carry; developer at Done | at Done |
| Decision | kernel, from `cairn decide` | developer: the queue; kernel: realized, superseded | Done, next-feature |
| Escalation | kernel, from `cairn escalate`, `cairn answer` | developer, once; kernel: open or answered | when raised |
| Item | kernel, from `cairn item` | kernel: promotion, deferral, defects; developer in next-feature | Done, next-feature |
| In-progress record | agent; kernel during check | kernel | every wake |
| Policy | developer or agent, by hand | kernel | every wake |
| Working agreement | the template, copied | the agent | every session |

**The requirement block grammar.** A block begins at a line matching
`[PREFIX-nnn]` at the margin and ends at the next blank line. Inside
it, in order: the identifier line, whose remainder begins the text; the
text, continuing on following lines until a `Falsifier:` line; the
`Falsifier:` line, one line; an optional `Rationale:` line, one line,
outside the digest; the `Status:` line. Nothing else is inside a block.
The digest of a requirement is the identifier, the text and the
falsifier, whitespace-normalized. A file header holds `Prefix:`, an
optional `Scope: every commitment`, and an optional `Host paths:` line,
each before the first block. Everything outside a block and the header
is prose the kernel skips, fenced or not. `cairn lint docs/spec` refuses
a file that breaks this grammar, a duplicate identifier, a reference to
an identifier that does not exist, a block with no falsifier, and an
Agreed block whose falsifier names no mechanism; its refusal is the
falsifier for every rule in this paragraph.

**The commitment file.** Parsed lines: `Requirements:` (a comma-separated
list of identifiers, all Agreed), `Specified from:`, `Promoted from:`.
The rest is prose: what it delivers, its done-when, what the
review-before-agreement attacked. The kernel writes `Promoted to:` onto
an item and `Specified from:` is written by the agent in next-feature;
both are parsed as field lines and nothing else in either file is.

**Reviews and reports** are entered through commands, one field per
flag: `cairn review --examined "<what>" --open "<text>" --resolved <n>
"<how>" --observed <q> "<observation>" --not-checked <q>`. The kernel
writes the file in its own form. A finding is a field; there is no
prefix inside it and no markup to see through.

Records from 1.x are not read. A project moves to 2 at Done by
re-running its checks and writing its review through the new commands.

## 5. Verdicts, actions, predicates, precedence

Wake prints the verdict, the action or party, one line of reason, and
the predicate. The predicate is the specification of the action: each
row below becomes one requirement with a falsifier, which with the
precedence list and the Done rule is most of the loop specification.

| Action | Complete when |
|---|---|
| `reconcile ACTION` | the in-progress record is gone; the action it named finished or was abandoned |
| `record PATH` | the in-progress record names the action, or PATH is clean at the base commit |
| `commit PATH` | PATH is clean |
| `repair PATH` | the named record reads under its grammar, and nothing else changed |
| `scope PATH` | the path is declared by a mechanism, listed under `outside:`, or an approved retention or restoration names it |
| `capture PATH` | the item carries `Outside because:`, or an escalation names it |
| `fix ITEM` | `Fixed by:` names a commit that changes no Agreed text, and the requirement has a current passing receipt after it |
| `declare REQ` | a mechanism names REQ |
| `run REQ` | a current receipt for REQ exists |
| `implement REQ` | a current passing receipt for REQ exists, and the mechanism's reviewed list carries REQ with a fail receipt |
| `review mechanism REQ` | the reviewed list carries REQ with the current text digest and a fail receipt; no declared input changed |
| `escalate REQ` | an escalation names REQ (three attempts without a pass) |
| `review SLUG` | the review names the current input set digest, answers every fixed question, and no finding is open |
| `report SLUG` | the brief is issued; a report names the review's digest and the brief's digest, answers every claim of the review by its question and target, and every answer and finding is carried into the review |
| `resolve SLUG` | no finding is open; each resolution is its own commit |
| `build DECISION` | `Realized by` names a commit that resolves |
| `promote` | a Consequential decision names the item; the commitment file names only Agreed requirements; the roadmap's `Current:` moved; the item stamped |
| `reply SLUG` | the escalation carries the agent's explanation |

**Precedence.** Wake tests in this order and names the first that
fails: an in-progress record from another session or an abandoned one
(`reconcile`); an undeclared changed path on the loop's own history
(`scope`); an open escalation (`Escalate`, or `Waiting` on the
developer after `ask` is answered by the agent); a defect item without
`Fixed by:` (`fix`); a dirty declared input (`record`, `commit`); a
requirement with no mechanism (`declare`); a requirement with no current
receipt (`run`), or a failing one (`implement`, or `escalate` at three
attempts); a revised requirement without a mechanism review (`review
mechanism`); a capture from the commitment's own requirement without
its reason (`capture`); a review that is stale or incomplete
(`review`); an open finding (`resolve`); a report missing, not
answering every claim, or not carried (`report`); an unrealized
Consequential decision (`build`); a backlog item (`promote`); Done.

**Done.** Every requirement of the current commitment has a current
passing receipt whose mechanism's reviewed list carries it; the review
names the current input set digest with no open finding and every
fixed question answered; the report names the review's digest and the
brief's digest and every report finding is carried; no escalation is
open; no changed path on the loop's own history is undeclared; no
backlog item lacks `Promoted to:`; no defect item lacks `Fixed by:`. The
queue is presented with Done.

**Waiting.** The agent's turn ends when an escalation has been
presented and not answered. The hooks print `Waiting` and do not nag.
A pending report is not Waiting: the agent started the adversary, and
`report SLUG` stays its action until the record exists.

## 6. Hooks

Where the harness has a per-turn hook (UserPromptSubmit), it is the
enforcement: it prints the verdict, action and predicate before every
turn, so a skipped step is in front of the model. Wake costs under a
second. The stop hook prints the same line and exists only as the
fallback for a harness without a per-turn hook. The session-start hook
prints the verdict and says, in one line, when the command link or PATH
is missing; it changes nothing. The install skill makes the link, once.

No hook refuses a stop, counts refusals, or writes a record. 1.x's stop
hook wrote twenty-seven stop records in two days, every one explaining
that the agent was waiting for a reviewer; the Waiting verdict is the
state that hook lacked.

## 7. Requirements policy

- A requirement describes something a user of Cairn can observe: a
  verdict, a refusal, a record, a command's output. The kernel's
  internals are tests, not contract. 1.x had 255 requirements, 141 of
  them about the loop; the predicate table, the precedence list and
  the Done rule replace most of those with about 25.
- A requirement block holds its identifier, text, falsifier, one
  optional rationale line naming a decision, and its status. History is
  Git's.
- A falsifier names a mechanism that could observe it before the
  requirement is Agreed. A mechanism counts for a requirement only once
  its reviewed list names a fail receipt for that requirement's
  violating example: the check was seen to fail before it was seen to
  pass.
- Agreement is per block, by the developer's confirmation or by a
  deference decision quoting their words. Promotion never Agrees text.

## 8. What each kept process does, and what changed

**Freshness.** A receipt is current by the digests in section 2. A
kernel release does not invalidate evidence; the receipt schema version
does, when the format changes. A revised requirement needs `review
mechanism` before its evidence counts. A review is stale when an input
outside `documents:` changed since the digest it names. A `documents:`
entry must be among the mechanism's inputs and must not lie under a
`source:` directory; `cairn declare` refuses otherwise. A receipt whose
output file is absent, as on a fresh clone, is current; the output
digest lets its absence or alteration be reported when asked.

**Scope.** A change on the loop's own history to a path no mechanism
declares and `outside:` does not list is a breach, named with the path.
Recovery: declare the input, or escalate to keep or to restore.

**Deferral.** An item captured from one of the commitment's own
requirements carries `Outside because:`, or an escalation names it. A
defect item is never deferral: a defect against the commitment's own
requirement is worked under it.

**Attempts.** After three attempts without a pass, a fourth requires an
escalation first; wake names `escalate REQ`. Reruns at a seen digest
and changes only to `documents:` or `outside:` paths are not attempts.

**Decisions.** Two kernel levels. Consequential: `cairn decide` writes
the record and the queue entry; the agent continues; the developer
reads the queue at Done and in next-feature. Blocking: `cairn escalate`;
the answered escalation is the record. Supersession names one of four
causes (the stated condition occurred; an unforeseen condition
occurred; it was wrong when it was made; the premise was false).

**Escalation.** Five one-line fields; `ok`, `instead`, `ask`; a reply
turn after `ask`. The developer runs `cairn answer`; the agent never
does. Where the harness gives session identity, `cairn answer` refuses
the session that raised the escalation.

**Capture and promotion.** A backlog item is work the Agreed
requirements already cover; the agent promotes one at Done by a
Consequential decision that writes a commitment naming only Agreed
requirements. An item that would need new or changed text is a
next-feature item and waits for the developer. Defect items are fixed
before any promotion.

**Review.** The builder's review answers the fixed questions and lists
findings; the adversary's report at Done answers each claim and each
finding by name; each report finding is carried into the review.

**Evidence.** The receipt is committed. The output is written beside it,
ignored by Git, and named by digest in the receipt.

## 9. Self-evaluation and one adversarial review

The loop takes the agent's word at three points: that a falsifier is
observable, that a mechanism fails for the right reason, and that a
change makes its falsifier unreachable. At each, the builder records
claims; at Done, one adversary attacks them all.

**Claims.** Fixed questions with identifiers, answered through the
review command as `--observed <q> "<command, path or output>"` or
`--not-checked <q>`. The kernel checks that every question is answered;
it cannot check truth, and the adversary can.

- Q1, per mechanism: which violating example failed the check, which
  fail receipt records it, and what the check printed. (Enforced: the
  reviewed list entry names the receipt, and the receipt holds the
  output.)
- Q2, per mechanism: why the failure was the stated reason and not a
  setup error.
- Q3, per requirement implemented: why the falsifier is now unreachable.
- Q4, per requirement implemented: what else the change touched that no
  check covers.
- Q5, per commitment: what could be wrong that every check would still
  pass.
- Q6, per commitment: what was not tested.

**The adversary at Done.** When the review is complete, wake names
`report SLUG` and prints the brief: `cairn brief <slug>` emits the
commitment, its requirements and falsifiers, the declarations, the
review's claims and findings, the commit range, and the brief's digest.
The agent starts an adversary with none of its context, gives it the
brief and the repository, and waits for its record; `report SLUG`
stays the named action meanwhile. The adversary's tasks, each answered
by name against the claim it attacks: for each mechanism (Q1, Q2), make
it pass without the behavior, make it fail for a setup reason, and find
an input it reads that it does not declare; for each Q3, reach the
falsifier with an input; for each Q4, find a touched path the claim
omits; for Q5 and Q6, look where the builder said not to. Its record,
through `cairn report`, is a list of attempts, each naming the claim,
what was tried and what happened, and carries the brief's digest; a
report whose brief digest is not the current one, or that leaves a
claim unanswered, is refused. The builder carries each answer and each
finding by number.

What the kernel cannot check: that the adversary was a different agent.
The brief's digest keeps the builder's hand off the adversary's input;
where the harness gives session identities, `cairn report` refuses a
session that wrote the review. Beyond that, the record's shape is the
evidence.

**Cost.** One adversary per commitment, with the repository and the
brief, not the builder's session. Nothing runs per spec phase, per
mechanism or per commit. The trade, stated: a mechanism that passes
without the behavior is caught at Done rather than at its first pass;
the fail-receipt rule and Q1's printed output cover the gap.

## 10. Distribution

One plugin: the command, the hooks, four skills (`install-cairn`,
`new-project`, `existing-project`, `next-feature`). Manifests for
Claude Code, Codex and Muse share one version. The skills also install
by the skills CLI. Node and Git; no build, no packages, no service.
Linux and macOS.

How this repository develops Cairn (its release script, its attribution
refusal at release, its kernel line ceiling as a norm) is in the
repository's own commitment, not in this specification.

## 11. Removed from 1.x

- The autonomy and Jev modes (AUTO-001 to AUTO-018): Agreed, never
  built, never checked.
- The stop hook's refusal, its count, stop records, and `explain`.
- Reading review and item records as Markdown: the findings sweep, the
  heading, fence and markup rules, and the working agreement's
  paragraph describing them (LOOP-086, LOOP-108 to LOOP-138).
- `Revised <date>` rationale paragraphs inside requirement blocks.
- Agreed by promotion. Promotion never Agrees text.
- Decision files at Judged; the reversals report.
- The `reword` action; attribution is refused at release only.
- The kernel digest as a freshness input.
- Command output files in Git.
- The release process, attribution policy and kernel ceiling as product
  requirements.
- docs/audit and the 1.x diagrams.
- Every requirement that described a kernel internal. The cut list is
  produced when the 2 requirements are written, identifier by
  identifier.

## 12. Decisions in this draft the developer may reverse

1. A defect against the commitment's own requirement is worked, not
   captured (section 8).
2. The hooks prompt and never block (section 6).
3. The kernel knows two decision levels; the guidance keeps four
   (section 2).
4. next-iteration is renamed next-feature, directory and flag included.
5. 1.x records are not read; the move to 2 is at Done.
6. Command output lives outside Git; a receipt is current without it.
7. The branch is `v2` in this repository; the 1.x line is archived at
   cutover.
8. One adversary, at Done; nothing per spec phase, per mechanism or
   per commit (section 9). The developer ruled this on 2026-09-18: "I
   only see the need for one adversarial review instead of 3."
9. Promotion never Agrees text; the agent starts a backlog commitment
   at Done without the developer (section 8).
10. A fourth verdict, Waiting, for the developer's turn only; a pending
    report is the agent's wait (section 5).
11. The developer runs `cairn answer`; the agent never does (section 8).
12. The install skill makes the command link; the hooks change nothing
    (section 6).
13. The spec-phase self-review is done and not recorded (section 3).

## 13. Next steps

1. The developer corrects this document and the six digraphs.
2. The requirements are written from it, each with a falsifier and the
   mechanism that observes it, under section 7's policy, with the 1.x
   cut list beside them.
3. The record commands and the kernel are built against those
   requirements, under the work loop, in this branch.
4. At the first Done, the 1.x line is archived and this branch becomes
   main.
