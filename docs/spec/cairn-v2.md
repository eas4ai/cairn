# Cairn 2: feature specification

Status: Draft, 2026-09-18, third revision after two adversarial reviews
and a design discussion on where records live. Nothing here is Agreed
until the developer confirms it.

This document says what Cairn 2 is, which processes it keeps, what each
record is and where it lives, and what 1.x had that 2 does not. It is a
feature specification: it names behaviors and the reader of each
record, not requirement identifiers. The requirements, with falsifiers,
are written from it in the next step, under the policy in section 7.
This document is self-contained: every term the kernel relies on is
defined in it.

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
   falsify it; the result is recorded with the identity of everything
   it ran against. A passing check has not falsified the requirement;
   it has not proven it.
4. Evidence is current only while those identities match; nothing is
   re-run for its own sake and nothing stale counts.
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

**The tree.** Hand-written files the kernel parses, and nothing else:

- **Specification**: the files under `docs/spec/`. The **keystone**
  (`docs/spec/overview.md`) says what the software is and holds the
  **spec map**, one row per **domain** file with its identifier prefix.
  The **glossary** (`docs/spec/glossary.md`) holds the project's terms.
  The **roadmap** (`docs/spec/roadmap.md`) holds a `Current:` line
  naming the current commitment's slug and one section per commitment:
  a heading with the slug, a `Requirements:` line, and prose (what it
  delivers, its done-when).
- **Requirement**: one block in a domain file: an identifier
  `[PREFIX-nnn]`, one obligation with the actor named, a `Falsifier:`
  line naming the observable state in which it is violated, a
  `Mechanism:` line naming the declaration that observes it, and a
  `Status:` line. The block grammar is in section 4. A domain file
  whose header carries `Scope: every commitment` contributes its Agreed
  blocks to every commitment's requirement set; the Done rule reads
  them with the roadmap section's. A header's `Host paths:` line
  declares the absolute or home-relative paths the software's behavior
  depends on; lint refuses an undeclared one in a block.
- **Status**: one of `Draft` (written, not confirmed), `Observed`
  (derived from existing code; describes what is, never contract),
  `Agreed <date>` (confirmed by the developer, or by a deference
  decision the rationale line names), `Retired <date>` (no longer
  contract; kept so identifiers are never reused). Only Agreed blocks
  are digested and checked. A commitment may name only Agreed
  requirements.
- **Commitment**: one agreed unit of work: a roadmap section, opened by
  a start record and closed by a done record on the ref. Not a Git
  commit; one commitment spans many.
- **Settings**: `.cairn/settings.json`, hand-written, tracked, the only
  configuration file: `schema` (the settings version, tied to the
  record schema; the kernel refuses one it does not read), `outside`
  (paths that are nobody's input and never a scope breach), `source`
  (paths under which no `documents` or `outside` entry may lie),
  `interfaces` (paths whose change is a public interface change),
  `data` (paths whose change is a persisted-data change; a decision
  touching one is the developer's), `signing_key` (the key `cairn
  answer` verifies against, when the developer signs), `attribution`
  (`forbidden` or `allowed`, for the release script), `harness` (one
  entry per harness the project runs under, naming the model the
  adversary is started on, section 9), and `typesafeai` (section 10).
  All path lists use one glob syntax; a path in both
  `outside` and `source` is refused. A settings file that carries a
  field whose name or value looks like an API key is refused; secrets
  come from the environment and never from a tracked file.
- **Working agreement**: `AGENTS.md` at the repository root, copied from
  the template the plugin ships: the move for each verdict and action.
  The kernel does not parse it. A change to it on the loop's own
  history is a scope breach unless a next-feature item names the
  working agreement; the spec-phase tail writes it before the start
  record, off that history.

**The tree, kernel-written:**

- **Mechanism**: an entry in `.cairn/mechanisms`, written by `cairn
  declare` and `cairn review mechanism`: the command, its working
  directory, the paths it reads (`inputs`), the inputs whose change
  costs a check and not a review (`documents`), the requirements it
  speaks for, whether it prints per-requirement result lines
  (`results: per-requirement`, in which case stdout carries `cairn:
  REQ: pass|fail` and a requirement with no line is unverified), and
  its **reviewed list**: one entry per requirement it has been accepted
  for, naming the requirement's text digest and the fail receipt of its
  violating example. The kernel digests each entry on its own, so a
  change to one mechanism stales only its receipts.
- **Command output**: `.cairn/output/`, ignored by Git, named by digest
  from the receipt.

**The ref.** `refs/cairn/log`: a chain of commits the kernel alone
writes and never rewrites, each a record: an empty commit whose message
subject names the kind and whose trailers are the fields. Section 4
gives the schema. Records reference other records by SHA, and the code
by tree OID, never by a code commit: the working branch may be rebased,
squashed and amended freely, and the loop does not care.

- **Receipt**: a record of one mechanism run: the mechanism entry's
  digest, the input set's tree OID, whether the command ran or errored,
  and per requirement its text digest and result. Keyed by identities,
  never by a commit. A **fail receipt** for a requirement is one whose
  command ran and whose result for that requirement is `fail`; an
  `error` receipt never counts as one, so a violating example needs
  enough of a stub to run.
- **Input set tree OID**: the Git tree identity of the mechanism's
  declared paths as they are in the working tree, built from the index
  for tracked clean files and hashed for the rest.
- **Current**: a receipt is current for a requirement when its input
  set tree OID, mechanism entry digest and the requirement's text
  digest equal the ones computed now, and its schema version is one the
  kernel reads.
- **Review**: the builder's record for a commitment at a tree: what was
  examined, the answers to the fixed questions (section 9), and
  findings.
- **Report**: the adversary's record for a commitment at the same tree:
  attempts against the review's claims, and findings. Written once per
  commitment, at the reviewed tree; the adversary's experiments run in
  a throwaway worktree.
- **Finding**: a numbered entry on a review or a report. Both kinds are
  answered the same way: a **resolution** (the tree after the fix and
  how) or a **dispute** (an escalation naming the finding; the
  developer rules). **Acceptance**: the adversary's record that a
  resolution closes its finding at the final tree.
- **Escalation**: a record with five one-line fields (question,
  recommendation, because, if wrong, instead). Wake prints the five
  fields under `Waiting`; the agent does not paraphrase them.
  **Answer**: the developer's record, `ok`, `instead <text>` or `ask
  <text>`, written by `cairn answer`, signed when the settings name a
  key. An `ask` keeps it open for the agent's **reply**.
- **Evaluation**: the evaluator's record (section 10), its own record
  naming what it judged.
- **Item**: a record capturing an idea: kind `backlog` (work the
  Agreed requirements already cover), `next-feature` (would change
  Agreed text or the working agreement, and names what), or `defect`
  (names an Agreed requirement the code violates). Later records
  reference it: an outside-reason, a promotion, a fix.
- **Start** and **done**: the records that open and close a commitment,
  the start pinning the roadmap's tree OID so the requirements list at
  the moment of commitment is fixed. The **range** is the ref from the
  start record to its head.
- **In-progress**: `refs/cairn/in-progress`, a single record written by
  `cairn begin <action> <target>` before the agent changes a declared
  input and removed by `cairn end` when the change is committed:
  `action`, `target`, the tree OID at start, `started`, `session` when
  the harness provides one. While it exists, the declared inputs of its
  target are neither `record` nor `commit` findings; the action's own
  predicate decides. `cairn check` writes and removes its own while a
  mechanism runs.

**The ADR.** `docs/decisions.jsonl` on the working branch: one JSON
object per line, append-only, written by `cairn decide`, `cairn
escalate` (on a downgrade, section 10), `cairn answer` and `cairn
decisions --read`, and read by `cairn decisions`. Every line has a
`kind` (`decision`, `realized`, `superseded`, `answered`, `read`), an
`id`, and a timestamp; a line about an earlier decision carries its
`id`; no line is ever written twice. A `decision` line carries `by`
(`agent`, `developer`, or `joint` for one made in conversation and
recorded by the agent quoting the developer), `rests_on` (requirement
identifiers and record SHAs), `wrong_if`, and `body`. A `read` line is
written by the developer only, signed when the settings name a key;
the queue is the `decision` lines without one. The kernel knows two
decision levels: Consequential (a `decision` line, the agent continues,
the developer reads it at Done and in next-feature) and Blocking (an
escalation; its `answered` line names the answer record's SHA, which
is where the signature check lives). The working agreement's guidance
keeps four levels; Routine and Judged leave no line.

**Other terms:**

- **The loop's own history**: the first-parent commits of the working
  branch since the tree the start record pins. Merged branches stay off
  it.
- **Verdict**: what wake prints. Three: `Resolvable` with an action (the
  agent's turn), `Waiting` with the escalation's five fields (the
  developer's turn: an escalation exists and no answer does), `Done`.
  Wake is the presentation, so nothing marks one; a pending report is
  the agent's wait and stays Resolvable. Wake is read-only: it writes
  nothing to the tree, the ref or any remote. Outside a project, or
  when the ref is absent from a clone, wake prints one line saying so,
  naming the command that fixes it, and exits 3; neither is a verdict.
- **Predicate**: the condition the kernel tests on the next wake to
  decide the named action is complete: which records exist in the
  range. Printed with the action.
- **Attempt**: a failing receipt for a requirement at an input set tree
  OID not seen among the failures since its last pass.

The term next-feature replaces 1.x's next-iteration everywhere: the
skill, the item kind, and the flag.

## 3. The processes

Four entry flows, one shared tail, and one loop.

**Install** (install.dot). Prerequisites first: Node and Git, or stop
naming the missing one. Then the plugin (Claude Code, Codex, Muse) or
the skills CLI plus `/install-cairn`, which does by hand what the
plugin's hooks do: link `~/.local/bin/cairn`, register the hooks where
the harness has them, and set the fetch and push refspecs for
`refs/cairn/*` on every remote. The session-start hook only says when
the link, PATH or refspec is missing. Done when `cairn --help` prints,
and inside a project the verdict prints. In a harness with no hook
system, Cairn degrades to instruction-only.

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
falls outside the current commitment, the developer chooses: finish it
and capture the request, or supersede it. Ends in the spec-phase tail.

**Next feature** (next-feature.dot). From Done to the next Agreed
commitment, starting from the specification. Every change the developer
asks for goes into the commitment: one the Agreed requirements cover
needs no new text; one they do not is revised or added under the
developer's confirmation. Ends in the spec-phase tail.

**The spec-phase tail** (spec-phase.dot). Shared by the three flows
above, defined once: falsifiers proposed as one set with a mechanism
named for each; a self-review for contradictions, falsifiers that would
not catch their violation, and requirements no mechanism can check
(done, not recorded); `cairn lint`; present by exception with the
invitation to ask for another explanation; the developer confirms or
corrects, or rules that the recommendation stands (a deference decision
quoting their words); `Status: Agreed <date>` per confirmed block; the
roadmap section and `Current:`; `cairn declare` for the commitment's
requirements only, each with a failing test as its violating example;
the working agreement; commit; `cairn start`, which writes the start
record and sets the `refs/cairn/*` refspecs on the project's remotes;
wake.

**The work loop** (work-loop.dot). Wake names one action with its
predicate; the agent does it until the predicate holds, leaves the
record, and wakes again. Waiting prints the escalation and the agent
stops. When the Done rule holds, wake names `done`; `cairn done` writes
the done record and prints the queue; the next wake says Done, or, with
a backlog item waiting, names `promote`.

## 4. The record set

A record exists only if something reads it at a known moment: the
kernel on the next wake, or the developer at a moment this document
names. The kernel parses exactly two hand-written things, the
specification files and the settings file, and in the specification
exactly the lines the grammar below names. Everything else it reads,
it wrote: the mechanisms entry, the ref, the ADR. There is no prose for
it to see through.

**The ref schema.** Every record on `refs/cairn/log` is an empty commit.
Its subject is `cairn: <kind> <target>`; its trailers are below. Every
record carries `Cairn-Schema: 1`; the kernel refuses a version it does
not read. One trailer is one line; a list is the same key repeated; a
multi-line answer is several trailers. A reference into the ref is a
record SHA; a reference into the code is a tree OID.

| Kind | Trailers | References | Read at |
|---|---|---|---|
| start | `Cairn-Commitment: <slug> start`, `Cairn-Roadmap: <tree-oid>` | the roadmap's tree | every wake: the range begins here |
| receipt | `Cairn-Receipt: <mechanism> <entry-digest> <input-tree-oid> ran\|error`, `Cairn-Result: <REQ> <text-digest> pass\|fail\|unverified` (repeated), `Cairn-Output: <digest>`, `Cairn-Exit: <code or signal>` | the input set's tree | every wake: freshness, attempts |
| review | `Cairn-Review: <slug> <tree-oid>`, `Cairn-Examined: <text>` (repeated), `Cairn-Q: <n> <target> observed\|not-checked <text>` (repeated), `Cairn-Finding: <n> <text>` (repeated) | the tree reviewed | before the report; at Done |
| brief | `Cairn-Brief: <slug> <review-sha> <digest>` | the review | when the report is checked |
| report | `Cairn-Report: <slug> <tree-oid> <brief-sha> model=<name>`, per attempt `Cairn-Attempt: <n> <q> <target>`, `Cairn-Tried: <n> <text>`, `Cairn-Outcome: <n> <text>`, `Cairn-Finding: <n> <text>` (repeated) | the review's tree, verified equal; the brief | at Done: every finding resolved or disputed |
| resolution | `Cairn-Resolves: <review-or-report-sha> <n> <tree-oid> <how>` | the record that holds the finding; the tree after the fix | at Done |
| acceptance | `Cairn-Accepts: <resolution-sha> <tree-oid>` or `Cairn-Rejects: <resolution-sha> <text>` | the resolution; the final tree | at Done |
| escalation | `Cairn-Escalation: <slug>`, `Cairn-Question:`, `Cairn-Recommend:`, `Cairn-Because:`, `Cairn-If-Wrong:`, `Cairn-Instead:`, `Cairn-Concerns: <REQ or record-sha>` | what it concerns | every wake until answered |
| answer | `Cairn-Answer: <escalation-sha> ok\|instead\|ask <text>` | the escalation | every wake; verified against `signing_key` when set |
| evaluation | `Cairn-Eval-Of: <escalation-sha> \| <decision-id>`, `Cairn-Eval: typesafeai <resolved-model> <schema> <state-digest> tokens=<n> tier=<1\|2\|3> cut=<bytes>` or `Cairn-Eval: unavailable <reason>`, `Cairn-Eval-Option: <n> reversible=<p> contradicts=<p> interface=<yes\|no\|unknown> score=<s>` (repeated), `Cairn-Eval-Route: agent\|developer conf=<c> sufficient=<p> observed=<p>` | the escalation it judged, or the decision it became | the queue; `cairn reversals` |
| reply | `Cairn-Reply: <escalation-sha> <text>` | the escalation | after an `ask` |
| item | `Cairn-Item: backlog\|next-feature\|defect <slug>`, `Cairn-From: <REQ>` or `Cairn-Changes: <REQ or agreement>`, `Cairn-Body: <text>` | a requirement | Done, next-feature |
| outside | `Cairn-Outside: <item-sha> <reason>` | the item | the capture gate |
| promotion | `Cairn-Promotes: <item-sha> <decision-id>` | the item; the ADR | Done |
| fix | `Cairn-Fixes: <item-sha> <tree-oid>` | the item; the tree after the fix | Done |
| scope | `Cairn-Scope: keep\|restore <tree-oid> <path>` (repeated) with its escalation and answer | the tree | the scope gate |
| done | `Cairn-Commitment: <slug> done`, `Cairn-Tree: <tree-oid>` | the final tree | the range ends here |

**The ADR schema.** One object per line in `docs/decisions.jsonl`:

- `{"kind":"decision","id":<ulid>,"ts":..,"level":"Consequential","by":"agent|developer|joint","title":..,"rests_on":[..],"wrong_if":..,"body":..,"mode":..}`
- `{"kind":"realized","id":<ulid>,"ts":..,"of":<id>,"tree":<tree-oid>,"subject":..}`
- `{"kind":"superseded","id":<ulid>,"ts":..,"of":<id>,"by":<id>,"cause":"the stated condition occurred|an unforeseen condition occurred|it was wrong when it was made|the premise was false"}`
- `{"kind":"answered","id":<ulid>,"ts":..,"escalation":<record-sha>,"answer":<record-sha>}`
- `{"kind":"read","id":<ulid>,"ts":..,"of":<id>,"by":"developer","signature":<sha or null>}`

`cairn decisions` renders the file; the queue is the `decision` lines
with no `read` line. `cairn decisions --read <id>` appends the `read`
line and is the developer's command, as `cairn answer` is: signed when
the settings name a key, the author line as evidence otherwise, and a
`read` line the agent wrote is a violation.

**The requirement block grammar.** A block begins at a line matching
`[PREFIX-nnn]` at the margin and ends at the next blank line. Inside
it, in order: the identifier line, whose remainder begins the text; the
text, continuing until a `Falsifier:` line; the `Falsifier:` line, one
line; a `Mechanism:` line naming the declaration that observes the
falsifier, outside the digest; an optional `Rationale:` line, one
line, outside the digest; the `Status:` line. The digest of a
requirement is the identifier, the text and the falsifier,
whitespace-normalized. A file header holds `Prefix:`, an optional
`Scope: every commitment` (section 2), and an optional `Host paths:`
line (section 2), each before the first block. Everything outside a
block and the header is prose the kernel skips, fenced or not. `cairn
lint docs/spec` refuses a file that breaks this grammar, a duplicate
identifier, a reference to an identifier that does not exist, a block
with no falsifier, an Agreed block with no `Mechanism:` line, and an
undeclared host path; its refusal is the falsifier for every rule in
this paragraph.

**The roadmap.** Parsed: `Current: <slug>` and, in the section whose
heading is that slug, `Requirements: <identifiers>`. The rest is prose.

**Commands write records.** `cairn begin` and `cairn end` write and
remove in-progress; `cairn check` writes receipts; `cairn review`,
`cairn brief`, `cairn report`, `cairn resolve`, `cairn accept` write
the review chain, one field per flag (`--examined`, `--observed <q>
<target> "<text>"`, `--not-checked <q> <target>`, `--finding "<text>"`,
`--attempt <q> <target> --tried "<text>" --outcome "<text>"`); `cairn
escalate`, `cairn answer`, `cairn reply`; `cairn item`, `cairn
outside`, `cairn fix`; `cairn decide`, `cairn promote`; `cairn start`
and `cairn done`. Wake writes nothing. No command edits a record; each
writes a new one.

**The ref travels with the code.** `cairn start` sets fetch and push
refspecs for `refs/cairn/*` on the project's remotes, because refspecs
are per repository and a fresh clone has run neither the install skill
nor the hook; the working agreement's "push" means the branch and the
ref together. On a clone without the ref, wake exits 3 naming `git
fetch origin 'refs/cairn/*:refs/cairn/*'`. The ref is never rewritten.
The working branch is unconstrained: rebase, squash and amend as the
project likes.

Records from 1.x are not read. A project moves to 2 at Done by
re-running its checks and writing its review through the new commands.

## 5. Verdicts, actions, predicates, precedence

Wake reads the range and prints the verdict, the action or party, one
line of reason, and the predicate. The predicate is the specification
of the action: each row below becomes one requirement with a falsifier,
which with the precedence list and the Done rule is most of the loop
specification.

| Action | Complete when |
|---|---|
| `repair PATH` | the named file reads under its grammar; nothing else changed |
| `reconcile ACTION` | `refs/cairn/in-progress` is gone; the action it named finished or was abandoned |
| `record PATH` | in-progress names an action whose target's declared inputs include PATH, or PATH is clean |
| `commit PATH` | PATH is clean, or in-progress covers it |
| `scope PATH` | a mechanism declares the path, `outside:` lists it, or a scope record with an `ok` answer names it |
| `capture ITEM` | an outside record names the item, or an escalation concerns it |
| `fix ITEM` | a fix record names the item and a tree that changes no Agreed text; the requirement has a current passing receipt at or after that tree |
| `declare REQ` | a mechanism entry names REQ |
| `run REQ` | a current receipt carries a result for REQ |
| `implement REQ` | a current receipt carries `pass` for REQ, and the mechanism's reviewed list carries REQ with a fail receipt |
| `review mechanism REQ` | the reviewed list carries REQ with the current text digest and a fail receipt; no declared input changed |
| `escalate REQ` | an escalation concerns REQ (three attempts without a pass) |
| `review SLUG` | a review names the current tree and answers every fixed question |
| `report SLUG` | a brief names the review; a report names the same tree and the brief; every question of the review has an attempt |
| `resolve SLUG N` | a resolution names finding N of the review or the report, or an escalation concerns it |
| `accept SLUG` | every resolution has an acceptance at the current tree, or a rejection with a new resolution |
| `build DECISION` | a `realized` line names the decision and a tree |
| `done SLUG` | a done record names the commitment; the queue was printed |
| `promote` | no commitment is open; a promotion record names one backlog item and a decision; the roadmap section names only Agreed requirements; `Current:` moved; a start record exists |
| `reply SLUG` | a reply record names the escalation |

**Precedence.** Wake tests in this order and names the first that
fails: a file the kernel reads that does not read (`repair`); an
in-progress ref from another session or an abandoned one
(`reconcile`); an undeclared changed path on the loop's own history
(`scope`); an escalation with no answer (`Waiting`, printing its
fields; `reply` after an `ask`); a defect item with no fix (`fix`); a
dirty declared input in-progress does not cover (`record`, `commit`);
a requirement with no mechanism (`declare`); a requirement with no
current receipt (`run`), or a failing one (`implement`, or `escalate`
at three attempts); a revised requirement without a mechanism review
(`review mechanism`); a capture from the commitment's own requirement
without its reason (`capture`); no review at the current tree
(`review`); no report at the reviewed tree (`report`); a finding on
either record with no resolution (`resolve`); a resolution with no
acceptance at the current tree (`accept`); an unrealized Consequential
decision (`build`); the Done rule holds and no done record exists
(`done`); no commitment is open and a backlog item waits (`promote`);
Done.

**Done.** Every requirement in the roadmap section the start record
pins, plus every Agreed block under `Scope: every commitment`, has a
current passing receipt whose mechanism's reviewed list carries it; a
review and a report exist at the reviewed tree; every finding on either
has a resolution or an escalation concerns it; every resolution has an
acceptance at the current tree; no escalation is unanswered; no changed
path on the loop's own history is undeclared; no defect item lacks a
fix. Backlog items are not in the rule: captured means waiting, however
long. When the rule holds, wake names `done`; `cairn done` writes the
done record and prints the queue; the next wake prints Done, or names
`promote` when a backlog item waits, so one commitment is open at a
time and each promotion is one decision.

**The cost of Done.** The report is written once, at the candidate
tree. A fix after it does not stale the review: it is a resolution
against a finding, and the adversary accepts or rejects the delta at
the final tree. Evidence for the changed inputs re-runs, as it should;
the review does not.

**Waiting.** The agent's turn ends when an escalation exists and no
answer does. Wake prints `Waiting` and the escalation's five fields,
verbatim from the record; that is the presentation, and the agent adds
nothing to it. The hooks print the same and do not nag. A pending
report is not Waiting: the agent started the adversary, and `report
SLUG` stays its action until the record exists.

## 6. Hooks

Where the harness has a per-turn hook (UserPromptSubmit), it is the
enforcement: it prints the verdict, action and predicate before every
turn, so a skipped step is in front of the model. Wake reads one `git
log` of the range and costs under a second. The stop hook prints the
same line and exists only as the fallback for a harness without a
per-turn hook. The session-start hook prints the verdict and says, in
one line, when the command link, PATH or refspec is missing; it changes
nothing. The install skill makes the link and sets the refspecs, once.

No hook refuses a stop, counts refusals, or writes a record. 1.x's stop
hook wrote twenty-seven stop records in two days, every one explaining
that the agent was waiting for a reviewer; the Waiting verdict is the
state that hook lacked.

## 7. Requirements policy

- A requirement describes something a user of Cairn can observe: a
  verdict, a refusal, a record, a command's output. The kernel's
  internals are tests, not contract. 1.x had 255 requirements, 141 of
  them about the loop; the predicate table, the precedence list, the
  Done rule and the schema replace most of those with about 25.
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

**Freshness.** A receipt is current by the identities in section 2. A
kernel release does not invalidate evidence; the schema version does,
when the format changes. A revised requirement needs `review mechanism`
before its evidence counts. A `documents` entry must be among the
mechanism's inputs and must not lie under a `source` directory; `cairn
declare` refuses otherwise. A receipt whose output file is absent, as
on a fresh clone, is current; the output digest lets its absence be
reported when asked.

**Scope.** A change on the loop's own history to a path no mechanism
declares and `outside` does not list is a breach, named with the path.
Recovery: declare the input, or a scope record with an escalation the
developer answers `ok`.

**Deferral.** An item captured from one of the commitment's own
requirements has an outside record, or an escalation concerns it. A
defect item is never deferral: a defect against the commitment's own
requirement is worked under it.

**Attempts.** After three attempts without a pass, a fourth requires an
escalation first. Reruns at a seen tree and changes only to `documents`
or `outside` paths are not attempts.

**Decisions.** Two kernel levels, in the ADR. Consequential: `cairn
decide` appends the line; the agent continues; the developer reads at
Done and in next-feature. Blocking: `cairn escalate`; the answer record
and its `answered` line are the decision. Supersession is a line naming
one of four causes.

**Escalation.** Five one-line fields; `ok`, `instead`, `ask`; a reply
after `ask`. The developer runs `cairn answer`; the agent never does.
When the settings name a `signing_key`, the answer record must verify
against it, and that is a check. Without one, the author line is
evidence and not a check, and the specification says so. `cairn
escalate` and `cairn decide --consequential` take the same input; with
the evaluator enabled, the route decides which record is written
(section 10).

**Capture and promotion.** A backlog item is work the Agreed
requirements already cover; the agent promotes one at Done by a
Consequential decision and a promotion record, writing a roadmap
section that names only Agreed requirements and a start record. A
next-feature item waits for the developer. Defect items are fixed
before any promotion.

**Review.** The builder's review answers the fixed questions and lists
findings; the adversary's report attacks each claim and lists its own
findings; each finding on either record gets a resolution or a dispute;
the adversary accepts each resolution at the final tree.

**Evidence.** The receipt is on the ref. The output is in
`.cairn/output/`, ignored by Git, named by digest in the receipt.

## 9. Self-evaluation and one adversarial review

The loop takes the agent's word at three points: that a falsifier is
observable, that a mechanism fails for the right reason, and that a
change makes its falsifier unreachable. At each, the builder records
claims; at Done, one adversary attacks them all.

**Claims.** Fixed questions with identifiers, answered in the review as
`observed` with a command, path or output, or `not-checked`. The kernel
checks that every question is answered for every target; it cannot
check truth, and the adversary can.

- Q1, per mechanism: which violating example failed the check, which
  fail receipt records it, and what the check printed. (Enforced: the
  reviewed list entry names the receipt, and the receipt names the
  output.)
- Q2, per mechanism: why the failure was the stated reason and not a
  setup error.
- Q3, per requirement implemented: why the falsifier is now unreachable.
- Q4, per requirement implemented: what else the change touched that no
  check covers.
- Q5, per commitment: what could be wrong that every check would still
  pass.
- Q6, per commitment: what was not tested.

**The adversary at Done.** When the review exists, wake names `report
SLUG` and `cairn brief <slug>` writes the brief record and prints it:
the roadmap section, its requirements and falsifiers, the mechanism
entries, the review's claims and findings, and the brief's digest. The
agent starts an adversary with none of its context, gives it the brief
and the repository, and waits; `report SLUG` stays the named action.
The adversary's tasks, each an attempt against the claim it attacks:
for each mechanism (Q1, Q2), make it pass without the behavior, make it
fail for a setup reason, and find an input it reads that it does not
declare; for each Q3, reach the falsifier with an input; for each Q4,
find a touched path the claim omits; for Q5 and Q6, look where the
builder said not to. The adversary experiments in a throwaway Git
worktree of its own, since attacking a mechanism changes code; the
report is written at the reviewed tree. `cairn report` refuses a
worktree whose tree differs from the review's, a brief that is not the
current one, and a report that leaves a question unattempted.

**After the report.** Each finding gets a resolution (a fix and a
record naming the finding and the new tree) or a dispute (an escalation
the developer answers). The adversary is asked once more, at the final
tree, to accept or reject each resolution; a rejection names why and
the builder resolves again. No second report.

**The adversary's model.** A different model has different blind spots,
which is what idea 5 wants; a second session of the same model only
has less context. Settings name, per harness, the model the adversary
is started on (`harness.<name>.adversary_model`): the exact identifier
that harness's subagent launch accepts, verbatim, which for an
API-driven harness is the API model id. The kernel passes the string
through and never maps names; the skill for each harness says how the
identifier is handed to that harness's subagent launch. The session-start
hook records which harness is running, in the Git directory beside the
check lock, never tracked; `cairn brief` reads it and prints the
instruction: start the adversary on that model, with none of your
context, never as a fork. A `null` entry or an unknown harness means
"any model but your own", and the report records what was used. The
report's `model=` trailer is required; where the harness reports the
session's own model, `cairn report` refuses a report whose model equals
it.

What the kernel cannot check: that the adversary was a different agent
or model, beyond what the harness reports. The brief's digest keeps the
builder's hand off the adversary's input; where the harness gives
session identities, `cairn report` refuses a session that wrote the
review. Beyond that, the record's shape is the evidence.

**Cost.** One adversary per commitment, plus its acceptance pass. The
trade, stated: a mechanism that passes without the behavior is caught
at Done rather than at its first pass; the fail-receipt rule and Q1's
printed output cover the gap.

## 10. The evaluator: one optional model call at Consequential

Ritual ascent is the agent pricing its own uncertainty at zero and the
developer's attention at zero, so every borderline call goes up. The
evaluator answers "could the agent have decided this?" before an
escalation is written, at the one level where the agent is both
allowed to decide and inclined not to. It is optional, off by default,
and touches nothing but escalations and Consequential decisions.

**Where it lives.** `bin/typesafeai.mjs`, the one file in the plugin
that makes a network call; the kernel's no-network rule holds for
`bin/cairn.mjs` on its own. `cairn escalate` and `cairn decide
--consequential` call it only when `settings.typesafeai.enabled` is
true and `TYPESAFEAI_API_KEY` is in the environment. The key comes
from the environment and nowhere else.

**What is never evaluated.** An escalation that changes Agreed text or
the working agreement, a fourth attempt after three without a pass, a
scope retention or restoration, one whose options touch a `data` path,
or one whose recommendation is empty is the developer's by
construction and is written without a call. The evaluator never raises
a decision's level, and never touches lint, receipts, mechanisms,
reviews or items.

**The state.** A deterministic function of the decision draft and the
tree, assembled by the kernel; the agent supplies references, the
kernel resolves them. Two invocations at the same tree produce
byte-identical state.

```
D        := decide(c, R*, o1..on, rec, wrong_if, d*)   -- five fields + options + ids
state(D) := < process,                                  -- the level rule, the by-construction list,
                                                        --   the safety net, the predicate, ~300 tokens
             D,
             keystone.is + keystone.is_not,             -- what the software is and is not
             section(c) @ c.start,                      -- the commitment's roadmap section, whole:
                                                        --   what it delivers, its done-when, its
                                                        --   Requirements: line
             block(r) for r in scope(c) + R*,           -- scope(c): every requirement the section
                                                        --   names plus every Scope: every commitment
                                                        --   block; R*: the draft's pointer to which
                                                        --   of those the decision is about
             context(r) for r in R*,                    -- the domain file's prose around each cited
                                                        --   block: its section heading and the
                                                        --   paragraphs between it and the block,
                                                        --   stopping at the previous block's end so
                                                        --   adjacent blocks never share prose
             glossary(terms(D)),                        -- every glossary term that appears as a whole
                                                        --   word, case-insensitive, in the five fields
                                                        --   or the options
             decision(d) for d in d*,                   -- the ADR lines it cites
             declaration(m(r)) for r in R*,
             facts,                                     -- touched paths; which of them no mechanism
                                                        --   of the commitment declares; which lie
                                                        --   under docs/spec/; interface and data hits
                                                        --   by settings globs; diff stat; attempts;
                                                        --   escalations this commitment; queue unread
             open(range(c)),                            -- findings, escalations, in-progress
             code >                                     -- tiered, capped, last
```

The commitment is resolved by the kernel, never cited: its section,
its whole requirement set and the keystone's what-it-is and
what-it-is-not are always present, ahead of `facts` and `code` so they
are never what gets cut. "Inside the commitment" is meaningless
without the commitment, and a scope question judged against blocks the
builder selected would be the hand-on-the-brief problem again. The
domain context and glossary entries are bounded by the cited blocks
and the draft's own words.

"Changes Agreed text" in the by-construction list is a fact, not a
judgment: a touched path under `docs/spec/`. The same fact feeds
`outside_n`. Nothing is matched in the agent's prose.

The code row fills in order until `state_cap_bytes` is spent: the diff
of the touched paths since the tree in-progress pinned; the whole files
that diff touches; the remaining declared inputs in declaration order,
whole files. The cap is in bytes because the kernel can count bytes
without a tokenizer, so truncation is deterministic. Only the code row
is ever cut: the parts above it are sent whole or not at all. When
they alone exceed the cap, the kernel does not call; the record says
`unavailable oversize` and the escalation stands, because a half-sent
commitment is worse than none. The record says which tier was reached
and how many bytes were cut, and the token count the API reports
beside it, which is how the developer sees whether the byte cap maps
to the token budget for this project's mix of prose and code. The cap
is Cairn's rule, a default of 80,000 bytes, chosen so that the state
stays under a 32k-token budget at either end of the byte-per-token
range (about 4 for prose, about 3 for code and JSON), with the fixed
tier, under 20 KB for thirty blocks and a section, leaving most of it
for the diff; and because a Consequential decision that cannot be
judged from its diff, its files, its commitment and its cited decisions
is a decision that should be smaller. It is not an API limit.

**The questions.** One call, all questions at once:

| id | type | asks |
|---|---|---|
| `sufficient` | noul | does `state` hold what is needed to judge `D`? |
| `reversible_n` | noul | would reverting the commits that realize option n restore the prior behavior with no migration, data change or caller change? |
| `contradicts_n` | noul | does option n contradict any cited decision, given its body and wrong-if, or any Agreed block in the commitment's set? |
| `outside_n` | noul | would option n require work that no requirement in the commitment's set covers, given `facts` (paths no mechanism of the commitment declares) and the keystone's what-it-is-not? |
| `observed` | noul | does `D.because` name something observed (a command, path or output) rather than a belief? |
| `owner` | choice | under `process`, whose decision is `D`: `agent` or `developer`? |

Interface and data exposure are facts from the `interfaces` and `data`
globs, never questions and never weights. A `data` hit makes the
decision the developer's before any call. An `interfaces` hit is
recorded on the option and is a mandatory attempt for the adversary's
report; the route may still say `agent`. When an option names no paths
the facts are unknown and the record says so.

**The route.** Two quantities, never blended. The composite score is
the per-option assist the developer reads in the queue; the Choice's
confidence is what routes:

```
score(o_n) := w_rev * reversible_n + w_con * (1 - contradicts_n) + w_obs * observed
route(D)   := sufficient < sufficient_threshold
                -> the escalation stands; reason: insufficient context; nothing else consulted
              outside_rec >= outside_threshold                       -- rec: the recommended option
                -> refuse that option: neither a decision nor an escalation for it; print the
                   capture command, cairn item --backlog or --next-feature with the reason, and
                   list the options whose outside_n is under threshold, if any, to recommend
                   instead; a re-escalation with a new recommendation is a new input
              owner = agent and conf(owner) >= route_confidence
                -> cairn escalate writes the decision itself: a Consequential line in the ADR
                   with the recommendation as the decision; no escalation record; it queues
              otherwise
                -> the escalation record is written and stands
```

The third leg is idea 6 applied to the evaluator: work outside the
commitment is captured, never built, and never decided. Escalating a
scope question is the ritual ascent this section exists to stop;
downgrading one is the agent widening its own commitment. Capture is
the only right answer, and the kernel names it.

Outside is tested before owner, and the Done rule bounds the cost of
that order. A false positive, inside work captured as outside, cannot
lose work: if a requirement in the commitment's set needs it, that
requirement's receipt stays failing, wake keeps naming `implement`, and
the agent does the work; the item merely sits. If no requirement needs
it to pass, it was outside by the kernel's own definition. The cost of
outside-first is a stray item; the cost of owner-first is the developer
answering scope questions the rule already answers.

The evaluator is called once per input, by the command that has the
input. `cairn escalate` writes whichever record the route selects, so
the decision is never re-evaluated on a second command against
possibly different state. The evaluation is its own record on the ref,
`Cairn-Eval-Of` naming the escalation it judged or the decision it
became; it has one shape wherever it lands.

**The record.** Every evaluated record carries the trailers in section
4: the model the response named (settings pin a version; an alias can
resolve to another later, so what actually answered is recorded), the
schema version, the state digest, the token count the API reported,
the tier and the bytes cut, one line per option, and the route with
its confidence. A failed call writes
`Cairn-Eval: unavailable <reason>` (`no-key`, `schema`, `overloaded`,
or the network error) and the escalation stands; 429 and 529 are
retried three times with backoff, in seconds, before that. "Not asked"
and "asked and unavailable" are never the same line.

**Tuning.** `cairn reversals`, in this narrow form only: the rate at
which evaluated decisions are superseded at the queue, by route
confidence. Reversals climbing means the evaluator is downgrading
decisions that were the developer's; reversals near zero with
escalations still high means the threshold is too timid. The developer
turns `route_confidence`, `sufficient_threshold`, `outside_threshold`
and the weights; the questions do not change. The false-positive rate
of `outside_threshold` is already in the record set: an item whose
`Cairn-From` names a requirement in `scope(c)` of the commitment it was
captured from is one the deferral rule then demands an outside record
for; count those per commitment. No new field.

**Validation.** The kernel refuses `enabled: true` with no `model`, a
`schema` it does not read, a path in both `outside` and `source`, any
key-shaped field, and a `state_cap_bytes` above 96,000: that is 32k
tokens at three bytes per token, the dense end of the range, so a
larger cap can overflow the state budget on a code-heavy state whatever
the tiered cut does. The refusal names the ceiling and the reason.
Weights that do not sum to 1 are normalized and the record says so.
`attribution` is `forbidden` or `allowed`.

**The kill switch.** A downgrade is safe only because the queue is read.
When a done record is written with unread Consequential decisions, the
evaluator is not called on the next commitment, and `cairn escalate`
says why, until the queue is read. Reading is the developer's act:
`cairn decisions --read` is theirs as `cairn answer` is, signed when
the settings name a key, and a `read` line the agent wrote is a
violation; otherwise the agent could lift the switch with one command.
The kernel does not edit the settings file; it refuses to evaluate.

**Falsifiers.** An evaluation trailer on a record that is not an
escalation or a Consequential decision; an escalation in an enabled
project with neither an evaluation nor an `unavailable` line; a state
over `state_cap_bytes`; two states at the same tree with different
digests; an evaluated decision in the by-construction class, a `data`
hit included; a call made while the queue holds unread decisions from
the last Done; a settings file carrying a key; a record whose model
trailer is the alias rather than the resolved version; a capture
refusal where the recommended option's `outside` is under
`outside_threshold`; a decision or escalation written where it is at
or above it; a settings file with `state_cap_bytes` above 96,000
accepted.

**Settings shape.**

```json
{
  "schema": 1,
  "outside": ["README.md", "CHANGELOG.md", ".github/**"],
  "source": ["bin/**", "src/**"],
  "interfaces": ["src/api/**"],
  "data": ["src/store/**", "migrations/**"],
  "signing_key": null,
  "attribution": "forbidden",
  "harness": {
    "claude_code": { "adversary_model": "claude-fable-5-1" },
    "codex":       { "adversary_model": "gpt-5.6-sol" },
    "muse":        { "adversary_model": "muse-spark-1.3" }
  },
  "typesafeai": {
    "enabled": true,
    "model": "jev-1.13.0",
    "weights": { "reversible": 0.4, "contradicts": 0.3, "observed": 0.3 },
    "route_confidence": 0.8,
    "sufficient_threshold": 0.7,
    "outside_threshold": 0.8,
    "state_cap_bytes": 80000
  }
}
```

`interfaces` and `data` sit at the top level because the scope gate and
the adversary's brief use them whether or not the evaluator is on.
`harness` is keyed by the name the session-start hook records, and
`adversary_model` is the exact identifier that harness accepts when it
starts a subagent, passed through verbatim; an entry may later carry
the facts the kernel needs per harness (whether
a per-turn hook exists, whether subagents exist), filled by the
install skill rather than written by the developer.

What this does not do, said once: it does not make the agent's
judgment better; it makes the routing of that judgment cheaper for the
developer. The option scores beside the agent's wrong-if in the queue
are the part that may improve a decision, and only because the
developer reads both.

## 11. Distribution

One plugin: the command, the hooks, four skills (`install-cairn`,
`new-project`, `existing-project`, `next-feature`), and the optional
evaluator module. Manifests for Claude Code, Codex and Muse share one
version. The skills also install by the skills CLI. Node and Git; no
build, no packages, no service; one network call, opt-in, in one file.
Linux and macOS.

How this repository develops Cairn (its release script, its attribution
refusal at release, its kernel line ceiling as a norm) is in the
repository's own roadmap, not in this specification.

## 12. Removed from 1.x

- The record directories: `.cairn/evidence`, `.cairn/reviews`,
  `.cairn/escalations`, `.cairn/backlog`, `.cairn/next-iteration`,
  `.cairn/stops`, `.cairn/queue`, `docs/decisions/`,
  `docs/commitments/`, `docs/audit`. 1,490 tracked record files become
  one ref and one JSONL file.
- The autonomy and Jev modes (AUTO-001 to AUTO-018): Agreed, never
  built, never checked.
- The stop hook's refusal, its count, stop records, and `explain`.
- The `Escalate` verdict and the `present` action: wake prints the
  escalation's fields under `Waiting`, so nothing is paraphrased and
  nothing marks a presentation.
- Reading review and item records as Markdown: the findings sweep, the
  heading, fence and markup rules, and the working agreement's
  paragraph describing them (LOOP-086, LOOP-108 to LOOP-138).
- Carrying report findings into the review by number: a finding is a
  record, and its resolution references it by SHA.
- A second report after resolutions; the acceptance pass replaces it.
- `Revised <date>` rationale paragraphs inside requirement blocks.
- Agreed by promotion. Promotion never Agrees text.
- Decision files at Judged; the reversals report as analytics (it
  returns only as the evaluator's tuning instrument, section 10).
- The `reword` action; attribution is refused at release only.
- The kernel digest as a freshness input; the schema version replaces it.
- Command output files in Git.
- Commit SHAs as references into the code; trees replace them.
- The release process, attribution policy and kernel ceiling as product
  requirements.
- Every requirement that described a kernel internal. The cut list is
  produced when the 2 requirements are written, identifier by
  identifier.

## 13. Decisions in this draft the developer may reverse

1. A defect against the commitment's own requirement is worked, not
   captured (section 8).
2. The hooks prompt and never block (section 6).
3. The kernel knows two decision levels; the guidance keeps four.
4. next-iteration is renamed next-feature, item kind and flag included.
5. 1.x records are not read; the move to 2 is at Done.
6. Command output lives outside Git; a receipt is current without it.
7. The branch is `v2` in this repository; the 1.x line is archived at
   cutover.
8. One adversary, at Done, plus its acceptance pass; nothing per spec
   phase, per mechanism or per commit (section 9). The developer ruled
   this on 2026-09-18: "I only see the need for one adversarial review
   instead of 3."
9. Promotion never Agrees text; the agent starts a backlog commitment
   at Done without the developer (section 8).
10. Three verdicts: Resolvable, Waiting, Done. Waiting is the
    developer's turn only and prints the escalation's fields verbatim;
    the 1.x `Escalate` verdict and `present` action are gone, since
    nothing observable marked a presentation and the agent's paraphrase
    shaped the developer's view.
11. The developer runs `cairn answer`; the agent never does; signing is
    opt-in and, without it, the author line is evidence, not a check.
12. The install skill makes the command link and sets the refspecs;
    the hooks change nothing.
13. The spec-phase self-review is done and not recorded.
14. Records are commits on `refs/cairn/log`, all kinds but decisions;
    decisions are `docs/decisions.jsonl` on the working branch. The
    developer ruled this on 2026-09-18 ("Yes commits are fine... 1490
    files is not").
15. References into the ref are SHAs; references into the code are
    tree OIDs, `realized` included. The working branch is unconstrained.
16. The report is written once; resolutions and acceptances are
    deltas; there is no carry (section 5, the cost of Done).
17. `docs/commitments/` is gone; a commitment is a roadmap section
    between a start record and a done record.
18. An optional evaluator, TypeSafe's Jev, at Consequential only, routing
    escalations the agent could have decided into the queue; the Choice's
    confidence routes, the composite score assists, the state is capped
    in bytes, a `data` hit is the developer's before any call (section
    10). The developer's direction on 2026-09-18.
19. `.cairn/policy` becomes `.cairn/settings.json`, the only
    configuration file; the API key comes from `TYPESAFEAI_API_KEY`
    and a settings file carrying a key is refused.
20. The adversary's model is set per harness in settings, the
    session-start hook records the harness, the brief prints the
    instruction and the report records the model (section 9).
    Confirmed by the developer on 2026-09-18 ("confirmed").
21. Backlog items are not in the Done rule; `cairn done` closes the
    commitment and the next wake names `promote` for one item, so one
    commitment is open at a time (section 5).
22. Wake is read-only; `cairn done` and `cairn start` write what wake
    used to, and `cairn start` sets the refspecs (section 4).
23. A downgraded escalation is written as the decision by `cairn
    escalate` itself, and the evaluation is its own record naming what
    it judged (section 10).
24. `cairn decisions --read` is the developer's command, like `cairn
    answer` (section 4).
25. A change to the working agreement on the loop's own history is a
    breach unless a next-feature item names it (section 2).

## 14. Next steps

1. The developer corrects this document and the six digraphs.
2. The requirements are written from it, each with a falsifier and the
   mechanism that observes it, under section 7's policy, with the 1.x
   cut list beside them.
3. The record commands and the kernel are built against those
   requirements, under the work loop, in this branch.
4. At the first Done, the 1.x line is archived and this branch becomes
   main.
