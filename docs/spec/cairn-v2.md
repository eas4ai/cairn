# Cairn 2: feature specification

Status: Draft, revision 4, 2026-09-18. Nothing here is Agreed until the
developer confirms it.

Revision 4 answers a twenty-finding review and its caveats. The eight
blockers it resolves, by name, so the next reviewer can check them
first: the evaluator's authority composition and injection boundary
(section 10); protected settings and realization-time privilege checks
(sections 2, 5, 8); the evaluation record's identity and raw outputs
(section 4); the state identity that determinism is claimed over
(section 10); durable anchoring of code trees by a snapshot ref
(section 2, 4); the split of the agent's in-progress record from the
check lock (section 2); formal closure of a superseded commitment
(section 4, 5); and the post-report delta rule (section 9). The rest
of the findings are in the sections they touch.

This document says what Cairn 2 is, which processes it keeps, what each
record is and where it lives, and what 1.x had that 2 does not. It is a
feature specification: it names behaviors and the reader of each
record, not requirement identifiers. The requirements, with falsifiers,
are written from it in the next step, under the policy in section 7.
This document is self-contained: every term the kernel relies on is
defined in it. Where a process digraph in docs/diagrams/ and this text
disagree, the text is normative.

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
none of them is not in Cairn 2. Where a model is consulted, code owns
the invariants and the model owns only the judgment code cannot make;
no model output changes who decides without code having said the
decision is in the model's envelope.

## 2. Definitions

The kernel's terms. A term in this list means this and nothing else.

**Reserved paths.** The kernel reserves `.cairn/**`, `docs/spec/**`,
`docs/decisions.jsonl` and `AGENTS.md`. No settings entry may match
them, no mechanism may declare them as inputs, and a change to any of
them on the loop's own history is the developer's (section 8, Scope).
This list is in the kernel, not in a file the kernel reads, so no
record can weaken it.

**The tree.** Hand-written files the kernel parses, and nothing else:

- **Specification**: the files under `docs/spec/`. The **keystone**
  (`docs/spec/overview.md`) says what the software is and is not, and
  holds the **spec map**, one row per **domain** file with its
  identifier prefix. The **glossary** (`docs/spec/glossary.md`) holds
  the project's terms. The **roadmap** (`docs/spec/roadmap.md`) holds a
  `Current:` line naming the current commitment's slug and one section
  per commitment: a heading with the slug, a `Requirements:` line, and
  prose (what it delivers, its done-when).
- **Requirement**: one block in a domain file: an identifier
  `[PREFIX-nnn]`, one obligation with the actor named, a `Falsifier:`
  line naming the observable state in which it is violated, a
  `Mechanism:` line naming the declaration that observes it, and a
  `Status:` line. The block grammar is in section 4. A domain file
  whose header carries `Scope: every commitment` contributes its Agreed
  blocks to every commitment's set at the moment the commitment starts
  (see Start). A header's `Host paths:` line declares the absolute or
  home-relative paths the software's behavior depends on; lint refuses
  an undeclared one in a block.
- **Status**: one of `Draft`, `Observed` (derived from existing code;
  never contract), `Agreed <date>` (confirmed by the developer, or by a
  deference decision the rationale line names), `Retired <date>`
  (identifiers are never reused). Only Agreed blocks are digested and
  checked. A commitment may name only Agreed requirements.
- **Commitment**: one agreed unit of work: a roadmap section, opened by
  a start record and closed by a done record or a superseded record on
  the ref. One is open at a time.
- **Settings**: `.cairn/settings.json`, hand-written, tracked, the only
  configuration file: `schema`; `authority_remote` (the one remote the
  Cairn refs travel to, confirmed by the developer at setup, never
  assumed); `outside` (paths that are nobody's input and never a scope
  breach; structurally forbidden from matching a reserved path);
  `source`; `interfaces`; `data` (a decision touching one is the
  developer's); `network_exclude` (paths whose content never leaves the
  machine: never in an evaluator state, never in an adversary's brief;
  host paths, keys and credential-bearing files are excluded whether
  listed or not); `signing_key`; `attribution`; `harness`; `typesafeai`
  (section 10). A settings file carrying a key-shaped field, a path in
  two lists, or a reserved path under `outside` is refused. Settings
  are **protected**: a change on the loop's own history is a breach
  unless a signed developer answer names it (section 8).
- **Working agreement**: `AGENTS.md`, copied from the template. Not
  parsed. Reserved: a change on the loop's own history is the
  developer's unless a next-feature item names the working agreement.

**The tree, kernel-written:**

- **Mechanism**: an entry in `.cairn/mechanisms`, written by `cairn
  declare` and `cairn review mechanism`. Two parts with two digests:
  the **definition** (command, working directory, `inputs`,
  `documents`, requirements, `results: per-requirement`, and the
  declared **execution identity**: runtime and tool versions,
  container or image identity, and named non-secret environment
  variables, each captured as a value the kernel records verbatim,
  never a hash of an undeclared variable) and the **review metadata**
  (the reviewed list: per requirement, the definition digest it was
  accepted against, the requirement's text digest, and the fail
  receipt of its violating example). A reviewed entry binds to the
  definition digest: changing the definition unbinds it. Undeclared
  external state, an installed tool, a service, a locale, makes
  "current" weaker than it sounds, and the specification says so.
- **Command output**: `.cairn/output/`, ignored by Git, named by digest
  from the receipt.

**The refs.** Three, all under `refs/cairn/`, all written by the kernel
alone, never rewritten, updated with compare-and-swap (the expected old
value supplied; a mismatch is a refusal, never an overwrite):

- **`refs/cairn/snapshots`**: a chain of **snapshot commits**, each
  whose tree *is* a code tree the loop examined (the declared paths of
  a mechanism, or the whole working tree at a review), parented on the
  previous snapshot. A snapshot commit is the durable anchor for a
  code state: a tree OID written in a trailer is text and anchors
  nothing, so every record that names code names a snapshot commit,
  which makes the tree reachable and lets a worktree check it out. The
  working branch stays unconstrained.
- **`refs/cairn/log`**: a chain of **records**, each an empty commit
  whose subject names the kind and whose trailers are the fields
  (section 4). Records reference records by SHA and code by snapshot
  commit SHA.
- **`refs/cairn/in-progress`**: the agent's single **action record**,
  written by `cairn begin <action> <target>` before it changes a
  declared input and removed by `cairn end`: `action`, `target`, the
  snapshot at start, `started`, `session` when the harness provides
  one. While it exists, the declared inputs of its target are neither
  `record` nor `commit` findings. It is the agent's alone; the
  **check lock** is separate, in the Git directory (`cairn-check.lock`
  under `git rev-parse --git-path`), taken by `cairn check` for the
  run and released after, so a check inside an implement nests without
  contention.

**Records** (the kinds on the log; schema in section 4):

- **Receipt**: one mechanism run: the definition digest, the input
  snapshot, the execution identity as observed, whether the command ran
  or errored, and per requirement its text digest and result. A **fail
  receipt** for a requirement is one whose command ran and whose result
  for that requirement is `fail`; `error` never counts.
- **Current**: a receipt is current for a requirement when its input
  snapshot's tree, its definition digest, its requirement text digest
  and its observed execution identity equal the ones computed now, and
  its schema version is one the kernel reads.
- **Review**: the builder's record at a snapshot: what was examined,
  the answers to the fixed questions (section 9), findings.
- **Report**: the adversary's record at the same snapshot: attempts
  against the review's claims, findings. Written once per commitment.
- **Finding**: a numbered entry on a review, a report, or an
  acceptance. Answered by a **resolution** (the snapshot after the fix
  and how) or a **dispute** (an escalation naming it).
- **Acceptance**: the adversary's record at a later snapshot over the
  **cumulative post-report delta**: per resolution, accepted or
  rejected with why, and any new findings the delta introduced.
- **Escalation**, **answer**, **reply**: as in 1.x; the answer is the
  developer's record, signed when settings name a key.
- **Evaluation**: the evaluator's record (section 10), naming the
  draft it judged and the full input identity.
- **Item**: kind `backlog`, `next-feature` or `defect`; later records
  reference it: an outside-reason, a promotion, a fix.
- **Start**: opens a commitment: the roadmap snapshot, and the
  commitment's **set**: every requirement identifier the section names
  plus every `Scope: every commitment` block, each with its text digest
  at that moment. The set and its digests are the contract for the
  range; a block revised mid-commitment is a revision (`review
  mechanism`), a block added to a global file is not in the set until
  the next start, and a retired one stays in the set until then.
- **Done**: closes a commitment at its final snapshot.
- **Superseded**: closes a commitment without Done, by the developer's
  decision, naming the successor start. Its open records: unanswered
  escalations stay open; unresolved findings and unfixed defect items
  carry to the successor's range by reference; receipts stay valid by
  identity; its items stay items.
- **The range**: the log from a start record to its head or its
  closing record.

**The ADR.** `docs/decisions.jsonl`, append-only, one JSON object per
line, written by `cairn decide`, `cairn escalate` (a downgrade),
`cairn answer`, `cairn decisions --read`, read by `cairn decisions`.
Kinds: `decision`, `realized`, `superseded`, `answered`, `read`. A
`read` line is the developer's, signed when settings name a key. Two
kernel levels: Consequential (a line, the queue, the agent continues)
and Blocking (an escalation; its `answered` line names the answer
record). Guidance keeps four; Routine and Judged leave no line.

**Other terms:**

- **The loop's own history**: the first-parent commits of the working
  branch since the tree the start record's roadmap snapshot holds.
- **Verdict**: `Resolvable` with an action, `Waiting` with an
  escalation's five fields, `Done`. Wake is read-only. Outside a
  project, with the refs absent, or with a crashed multi-write command
  to recover, wake prints one line naming the command that fixes it
  and exits 3.
- **Predicate**: which records exist in the range; printed with the
  action.
- **Attempt**: a failing receipt at an input snapshot not seen among
  the failures since the last pass.

## 3. The processes

Four entry flows, one shared tail, one loop. Unchanged from revision 3
except where noted.

**Install** (install.dot). Prerequisites first. The plugin or the
skills CLI plus `/install-cairn`, which links the command, registers
the hooks where the harness has them, and asks the developer to confirm
the authority remote, proposing `origin` and never assuming it; only
that remote gets the `refs/cairn/*` refspecs. A harness with no hook
system is instruction-only.

**New project**, **Existing project**, **Next feature** (their
digraphs). As revision 3. In existing-project, superseding a commitment
under way writes a superseded record naming the developer's decision
and the successor's start; nothing is left open by omission.

**The spec-phase tail** (spec-phase.dot). As revision 3; `cairn start`
writes the start record with the set and its digests, and sets the
refspecs on the authority remote only.

**The work loop** (work-loop.dot). Wake names one action with its
predicate; the agent does it, leaves the record, wakes again. Waiting
prints the escalation. When the Done rule holds, wake names `done`;
`cairn done` writes the done record; the next wake prints Done and the
unread queue, or names `promote`.

## 4. The record set

The kernel parses two hand-written things, the specification and the
settings, and in the specification only the grammar lines. Everything
else it reads, it wrote.

**The log schema.** Every record: subject `cairn: <kind> <target>`,
`Cairn-Schema: 1` (refused if unread), one trailer per line, a list as
a repeated key. `<snap>` is a snapshot commit SHA; `<sha>` a log
record SHA.

| Kind | Trailers |
|---|---|
| start | `Cairn-Commitment: <slug> start`, `Cairn-Roadmap: <snap>`, `Cairn-Set: <REQ> <text-digest>` (repeated) |
| receipt | `Cairn-Receipt: <mechanism> <definition-digest> <snap> ran\|error`, `Cairn-Env: <name> <value>` (repeated, declared identities as observed), `Cairn-Result: <REQ> <text-digest> pass\|fail\|unverified` (repeated), `Cairn-Output: <digest>`, `Cairn-Exit: <code or signal>` |
| review | `Cairn-Review: <slug> <snap>`, `Cairn-Examined:` (repeated), `Cairn-Q: <n> <target> observed\|not-checked <text>` (repeated), `Cairn-Finding: <n> <text>` (repeated) |
| brief | `Cairn-Brief: <slug> <review-sha> <digest>` |
| report | `Cairn-Report: <slug> <snap> <brief-sha> model=<name>`, per attempt `Cairn-Attempt: <n> <q> <target>`, `Cairn-Tried: <n> <text>`, `Cairn-Outcome: <n> <text>`; `Cairn-Finding: <n> <text>` (repeated) |
| resolution | `Cairn-Resolves: <sha> <n> <snap> <how>` |
| acceptance | `Cairn-Acceptance: <slug> <report-sha> <snap>`, per resolution `Cairn-Accepts: <resolution-sha>` or `Cairn-Rejects: <resolution-sha> <why>`, and `Cairn-Finding: <n> <text>` (repeated) for new findings in the cumulative delta |
| escalation | `Cairn-Escalation: <slug>`, the five field trailers, `Cairn-Concerns: <REQ or sha>` |
| answer | `Cairn-Answer: <escalation-sha> ok\|instead\|ask <text>` (developer; verified against `signing_key` when set) |
| reply | `Cairn-Reply: <escalation-sha> <text>` |
| evaluation | `Cairn-Eval-Of: <draft-digest>`, `Cairn-Eval-Input: <state-digest> tree=<snap> log=<input-log-head> adr=<input-adr-digest> settings=<digest>`, `Cairn-Eval: typesafeai <resolved-model> <schema> tokens=<n> bytes=<n> tier=<0\|1\|2\|3> cut=<bytes>` or `Cairn-Eval: unavailable <reason>` or `Cairn-Eval: shadow ...`, `Cairn-Eval-Answer: <id> <raw value or distribution>` (repeated, every answer), `Cairn-Eval-Gate: <gate> pass\|fail <value>` (repeated), `Cairn-Eval-Route: capture\|developer\|agent\|shadow reason=<gate or owner>` |
| item | `Cairn-Item: backlog\|next-feature\|defect <slug>`, `Cairn-From: <REQ>` or `Cairn-Changes: <REQ or agreement>`, `Cairn-Body: <text>` |
| outside | `Cairn-Outside: <item-sha> <reason>` |
| promotion | `Cairn-Promotes: <item-sha> <decision-id>` |
| fix | `Cairn-Fixes: <item-sha> <snap>` |
| scope | `Cairn-Scope: keep\|restore <snap> <path>` (repeated), with its escalation and answer |
| done | `Cairn-Commitment: <slug> done`, `Cairn-Tree: <snap>` |
| superseded | `Cairn-Commitment: <slug> superseded`, `Cairn-Decision: <id>`, `Cairn-Successor: <start-sha>` |

**The ADR schema.** As revision 3, with `read` lines
(`{"kind":"read","id":..,"of":<id>,"by":"developer","signature":..}`)
and `realized` naming a snapshot (`"snap":<snap>`), never a tree OID.

**The requirement block grammar.** As revision 3: identifier, text,
`Falsifier:`, `Mechanism:` (outside the digest), optional
`Rationale:` (outside), `Status:`; the digest is identifier, text and
falsifier, whitespace-normalized; file headers carry `Prefix:`,
optional `Scope: every commitment`, optional `Host paths:`. `cairn
lint docs/spec` refuses every violation and is the falsifier for the
grammar.

**Commands write records; each multi-store command has a crash model.**
A command that writes to more than one store (the log, the snapshots,
the ADR, the roadmap) writes in a fixed order, each write idempotent
on its input identity, and wake recognizes every intermediate state:
a record on the log whose ADR line is missing, or an ADR line whose
record is missing, is named as `recover <command>`, which finishes the
write from the state on disk. No command requires a human to infer
whether it half-succeeded. Terminal output is never a fact: `cairn
done` is complete when the done record exists, and the queue is
rendered by whichever invocation runs next.

**The refs travel with the code, to one remote.** `cairn start` sets
fetch and push refspecs for `refs/cairn/*` on `authority_remote` only.
The working agreement's "push" is `git push --atomic <authority>
<branch> refs/cairn/*` where the remote supports atomic pushes; where
it does not, the refs are pushed first and the branch second, and wake
on a clone whose branch is ahead of its refs names the fetch. On a
clone without the refs, wake exits 3 naming `git fetch <authority>
'refs/cairn/*:refs/cairn/*'`. The refs are never rewritten.

Records from 1.x are not read.

## 5. Verdicts, actions, predicates, precedence

| Action | Complete when |
|---|---|
| `repair PATH` | the named file reads under its grammar; nothing else changed |
| `recover COMMAND` | the interrupted command's writes are complete |
| `reconcile ACTION` | the action record is gone; the action it named finished or was abandoned |
| `scope PATH` | see the scope rule below |
| `capture ITEM` | an outside record names the item, or an escalation concerns it |
| `fix ITEM` | a fix record names the item and a snapshot that changes no Agreed text or reserved path; the requirement has a current passing receipt at or after it |
| `record PATH` | the action record covers PATH, or PATH is clean |
| `commit PATH` | PATH is clean, or the action record covers it |
| `declare REQ` | a mechanism definition names REQ |
| `run REQ` | a current receipt carries a result for REQ |
| `implement REQ` | a current receipt carries `pass` for REQ, and the reviewed list carries REQ bound to the current definition digest with a fail receipt |
| `review mechanism REQ` | the reviewed list carries REQ with the current definition digest, the current text digest and a fail receipt; no declared input changed |
| `escalate REQ` | an escalation concerns REQ (three attempts without a pass) |
| `review SLUG` | a review names the current snapshot and answers every fixed question |
| `report SLUG` | a brief names the review; a report names the same snapshot and the brief, with an attempt against every question |
| `resolve SLUG N` | a resolution names finding N of the review, the report or an acceptance, or an escalation concerns it |
| `accept SLUG` | an acceptance at the current snapshot covers the cumulative post-report delta, every resolution accepted, and every finding it raised has a resolution |
| `build DECISION` | a `realized` line names the decision and a snapshot, and the realization check passed (section 8, Decisions) |
| `done SLUG` | a done record names the commitment |
| `promote` | no commitment is open; a promotion record names one backlog item and a decision; a roadmap section naming only Agreed requirements; `Current:` moved; a start record |
| `reply SLUG` | a reply record names the escalation |

**The scope rule.** A path changed on the loop's own history that no
mechanism declared *at the commit that changed it* and `outside` does
not list is a breach, and stays one: a declaration added later
legalizes only changes after it. `scope PATH` is complete when a scope
record with an `ok` answer names the path, or the path is restored to
the start snapshot's content and committed. Idea 6 is not "built first,
declared after."

**Precedence.** `repair`; `recover`; `reconcile`; `scope`; an
unanswered escalation (`Waiting`; `reply` after `ask`); `fix`;
`record`, `commit`; `declare`; `run`, `implement`, `escalate`; `review
mechanism`; `capture`; `review`; `report`; `resolve`; `accept`;
`build`; `done`; `promote`; Done.

**Done.** Every requirement in the start record's set has a current
passing receipt bound to a reviewed definition; a review and a report
exist at the reviewed snapshot; an acceptance exists at the final
snapshot over the cumulative delta with every resolution accepted and
every finding, on any of the three records, resolved or disputed; no
escalation is unanswered; no path on the loop's own history is in
breach; no defect item lacks a fix. Backlog items are not in the rule.

**The cost of Done.** The report is written once at the candidate
snapshot. Every fix after it is a resolution. The adversary then
examines the cumulative delta from the reported snapshot to the current
one, accepts or rejects each resolution, and may raise new findings on
that delta; those get resolutions and the next acceptance covers them
too. There is no unreviewed final mutation: Done requires the last
acceptance at the final snapshot. The bound is on repeated rejection,
not on passes: a resolution rejected twice for the same finding is
escalated to the developer.

**Waiting.** An escalation exists and no answer does. Wake prints the
five fields verbatim; the agent adds nothing. A pending report or
acceptance is the agent's wait and stays Resolvable.

## 6. Hooks

As revision 3: the per-turn hook is the enforcement where it exists,
the stop hook the fallback, the session-start hook prints and changes
nothing. No hook refuses, counts, or writes. The session-start hook
records the harness name in the Git directory for `cairn brief`.

## 7. Requirements policy

As revision 3: product-observable requirements only; kernel internals
are tests; one optional rationale line; a mechanism counts only once
seen to fail; promotion never Agrees text.

## 8. What each kept process does, and what changed

**Freshness.** A receipt is current by the identities in section 2:
input snapshot tree, definition digest, requirement text digest,
observed execution identity. A revised requirement needs `review
mechanism`. A changed definition unbinds its reviewed entries. A
`documents` entry must be among the inputs and outside `source`.

**Scope.** The scope rule in section 5. Reserved paths and protected
settings on the loop's own history are the developer's: `.cairn/**`,
`docs/spec/**`, the ADR and `AGENTS.md` need a signed answer or a
next-feature item that names them; nothing in settings can exempt
them, because the reservation is in the kernel.

**Deferral.** An item from the commitment's own requirement has an
outside record or an escalation. A defect against the commitment's own
requirement is worked under it.

**Attempts.** After three attempts without a pass, a fourth requires an
escalation first.

**Decisions.** Two kernel levels, in the ADR. Consequential: the agent
continues, the developer reads at Done and in next-feature. Blocking:
`cairn escalate`; the answer is the decision. **The realization
check**: `build DECISION` compares the realizing delta against the
protected categories before a `realized` line is accepted; a delta
that touches a `data` path, Agreed text, the working agreement,
reserved paths or protected settings stops and escalates, whatever
level the decision was recorded at, and whatever the evaluator said.
This is the postcondition that makes a downgraded decision safe: the
evaluator judged the draft, and the check judges what was built.

**Escalation.** As revision 3. The developer runs `cairn answer` and
`cairn decisions --read`; the agent never does.

**Capture and promotion.** As revision 3.

**Review.** As section 9.

**Evidence.** The receipt is on the log; the output in
`.cairn/output/`, ignored, named by digest.

## 9. Self-evaluation and one adversarial review

The claims (Q1 to Q6) and the brief are as revision 3, with these
changes.

**Snapshots.** The review names the snapshot it examined; `cairn
report` refuses a worktree whose tree differs from that snapshot's; the
adversary experiments in a throwaway worktree checked out from the
snapshot commit, which is why snapshots are commits.

**The post-report delta.** After the report, every fix is a resolution
at a new snapshot. When the agent asks for acceptance, the adversary
receives the report, every resolution, and the cumulative delta from
the reported snapshot to the current one, and writes one acceptance:
per resolution accepted or rejected with why, plus any new finding the
delta introduced, anywhere in it, related to a finding or not. New
findings get resolutions; the next acceptance covers the cumulative
delta again. Done requires the last acceptance at the final snapshot.
A resolution rejected twice for the same finding escalates.

**Egress.** The brief never contains the content of a
`network_exclude` path, a host path, a key or a credential-bearing
file; the adversary's worktree does, because it is local, and the
brief says which paths it may not report verbatim.

**The adversary's model.** As revision 3: per harness in settings, the
exact identifier that harness accepts, passed through.

## 10. The evaluator: one optional model call at Consequential

Ritual ascent is the agent pricing its own uncertainty at zero and the
developer's attention at zero. The evaluator answers "could the agent
have decided this?" at the one level where the agent may decide and is
inclined not to. It is optional, off by default, runs in shadow mode
until calibrated, and never changes who decides unless code has first
established that the decision is inside the model's envelope.

**Where it lives.** `bin/typesafeai.mjs`, the one file that makes a
network call. The key is `TYPESAFEAI_API_KEY` in the environment and
nowhere else.

**The envelope, in code, before any judgment.** In order; the first
that fires decides, and nothing later is consulted:

```
protected(D)     -- a data path, Agreed text, the working agreement, reserved paths or
                 --   protected settings among the touched or named paths; a fourth
                 --   attempt; scope retention; no recommendation
                 -> developer, no call
state too large  -> developer, no call (unavailable oversize)
call fails       -> developer (unavailable <reason>)
invalid answer   -- any routing-critical answer missing, malformed, NaN, out of [0,1],
                 --   a distribution that does not sum to 1, or a schema the kernel
                 --   does not read
                 -> developer (unavailable invalid)          -- every gate fails closed
sufficient        < sufficient_threshold  -> developer (insufficient context)
outside_rec      >= outside_threshold     -> capture: refuse that option, print the
                                             capture command, list options under threshold
contradicts_rec  >= contradicts_ceiling   -> developer
reversible_rec    < reversible_floor      -> developer
observed          < observed_floor        -> developer
owner = agent and conf(owner) >= route_confidence
                 -> agent: cairn escalate writes the Consequential line; it queues
otherwise        -> developer: the escalation record stands
```

The Nouls are gates, not weights: TypeSafe's own guidance is that
separate answers need not obey the logical relations a reader expects,
so no answer is allowed to stand in for another. The composite score is
kept as the per-option assist the developer reads in the queue and has
no role in routing.

**Two calls, two states.** The owner call receives only text inside the
trust boundary: the five fields and options (the agent's, the thing
judged), the commitment's section, the requirement blocks of the set,
the keystone's what-it-is and what-it-is-not, the glossary entries
matched, the cited ADR lines, and the kernel's facts. It receives no
source code, no diff, no mechanism output, no findings, no repository
prose outside `docs/spec/`, and no agent-authored explanation beyond
the five fields. Those texts are inside the boundary because the
developer owns them: Agreed text and settings change only by the
developer's ruling, and the ADR lines are records. The option call, for
`reversible_n`, `contradicts_n` and `outside_n`, additionally receives
the code tiers under the cap, because those judgments need the code
and their answers gate toward the developer, never away. Both calls
are one fan-out each.

**State identity.** The input to each call is a deterministic function
of `(input_tree, input_log_head, input_adr_digest, draft_digest,
settings_digest)`, all captured before the evaluator writes anything:
the evaluation record itself advances the log, and an agent-routed
decision appends to the ADR, so the identity names the pre-write
state or it is self-referential. The invariant is: same identity,
byte-identical request. Nothing is claimed about the model's answers
being deterministic, because TypeSafe does not guarantee it; the
record carries every raw answer so a re-run at the same identity can be
compared.

**Budget.** The byte cap is a deterministic prefilter, not the
correctness bound. The model's limits are 32k tokens for the state
plus the longest question and 64k for the state plus all questions;
the question set grows with options. The kernel therefore keeps
`state_cap_bytes` (default 48,000; ceiling 64,000, refused above),
`code_tiers` (default 2), estimates the combined request, refuses to
call when the estimate exceeds three quarters of either limit, and
treats an API context error as `unavailable context` — developer, fail
closed. Relevance before size: tier 3 exists because a project may want
it, and the model's documented weak point is large irrelevant state.

**Egress.** No `network_exclude` path, host path, key or
credential-bearing file enters either state; a state that would is
refused as `unavailable excluded`, and the agent is told which path.

**The record.** One evaluation record per input, whatever the route:
`Cairn-Eval-Of` the draft digest, `Cairn-Eval-Input` the full identity,
every raw answer including the owner distribution, every gate with its
value and outcome, and the route with the gate or judgment that decided
it. A capture, a downgrade and an escalation all reference it the same
way.

**Shadow mode, and calibration.** `typesafeai.mode` is `shadow` or
`route`; the default is `shadow`, in which every Consequential draft
is evaluated and recorded and the developer still decides, so the
record set accumulates the model's answers beside the developer's
rulings. `cairn calibrate` reads them and reports, separately, the
false-downgrade rate: drafts the model routed `agent` that the
developer answered as their own. `route` mode is refused until
`calibrate` shows that rate under `max_false_downgrade` on at least
`min_calibration_samples` developer-labelled drafts from this project.
Supersessions are analytics, never labels: a superseded decision is
not evidence the evaluator was wrong, and the ADR's causes say so.

**Tuning.** The gates' thresholds and the weights are in settings; the
questions do not change. The false-positive rate of `outside` is read
from items whose `Cairn-From` names a requirement in the set of the
commitment they came from.

**The kill switch.** As revision 3: unread Consequential decisions at a
done record disable routing on the next commitment; reading is the
developer's act.

**Validation.** As revision 3, plus: `mode: route` without a passing
calibration record; a `state_cap_bytes` above 64,000; any threshold
outside [0, 1]; a `network_exclude` entry that a mechanism declares as
a `documents` path is allowed, as `inputs` is allowed, but its content
never enters a state.

**Falsifiers.** An evaluation record missing for an evaluated draft; a
route other than `developer` when any gate fails or any answer is
invalid; a routing call whose state carries code, a diff, findings or
prose outside `docs/spec/`; a request byte-different for the same
identity; `route` mode active without a passing calibration; a
`realized` line accepted for a delta that touches a protected
category; a state containing an excluded path; a settings file with a
reserved path under `outside`.

**Settings shape.**

```json
{
  "schema": 1,
  "authority_remote": "origin",
  "outside": ["README.md", "CHANGELOG.md", ".github/**"],
  "source": ["bin/**", "src/**"],
  "interfaces": ["src/api/**"],
  "data": ["src/store/**", "migrations/**"],
  "network_exclude": ["fixtures/private/**", "config/*.secret.*"],
  "signing_key": null,
  "attribution": "forbidden",
  "harness": {
    "claude_code": { "adversary_model": "claude-fable-5-1" },
    "codex":       { "adversary_model": "gpt-5.6-sol" },
    "muse":        { "adversary_model": "muse-spark-1.3" }
  },
  "typesafeai": {
    "enabled": true,
    "mode": "shadow",
    "model": "jev-1.13.0",
    "weights": { "reversible": 0.4, "contradicts": 0.3, "observed": 0.3 },
    "route_confidence": 0.8,
    "sufficient_threshold": 0.7,
    "outside_threshold": 0.8,
    "contradicts_ceiling": 0.3,
    "reversible_floor": 0.7,
    "observed_floor": 0.6,
    "max_false_downgrade": 0.05,
    "min_calibration_samples": 30,
    "state_cap_bytes": 48000,
    "code_tiers": 2
  }
}
```

What this does not do: it does not make the agent's judgment better; it
makes the routing of that judgment cheaper for the developer, inside an
envelope code owns. The option scores beside the agent's wrong-if in
the queue are the part that may improve a decision.

## 11. Distribution

As revision 3: one plugin, hooks, four skills, the optional evaluator
module; one network call, opt-in, in one file; three refs under
`refs/cairn/` that travel to the authority remote.

## 12. Removed from 1.x

As revision 3, plus: tree OIDs as references into code (snapshot
commits replace them); "queue printed" as a completion condition; the
in-progress record as the check lock.

## 13. Decisions in this draft the developer may reverse

Decisions 1 to 25 as revision 3, with 10 (three verdicts), 15 (now:
references into the code are snapshot commits, not tree OIDs) and 23
(the evaluation is its own record) restated accordingly, plus:

26. The evaluator's authority is bounded by a code envelope; the model
    Nouls are gates that fail closed; the owner call carries no code
    and no prose outside the trust boundary (section 10).
27. Shadow mode is the default; `route` requires a passing calibration
    on this project's developer-labelled drafts, measured on the
    false-downgrade rate (section 10).
28. Code states are anchored by snapshot commits on
    `refs/cairn/snapshots` (section 2).
29. The agent's action record and the check lock are separate; refs are
    updated compare-and-swap (section 2).
30. Reserved paths are in the kernel; settings are protected; `outside`
    cannot match either (section 2, 8).
31. A later declaration never legalizes an earlier breach (section 5).
32. A commitment can be closed by a superseded record with defined
    carry-over (section 2).
33. The acceptance pass covers the cumulative post-report delta and may
    raise findings; twice-rejected resolutions escalate (section 9).
34. `build DECISION` runs a realization check against protected
    categories (section 8).
35. The start record pins the set's membership and text digests
    (section 2).
36. Reviewed entries bind to the mechanism definition digest (section 2).
37. Execution identity is declared, never inferred from undeclared
    environment (section 2).
38. One authority remote, confirmed by the developer at setup; atomic
    pushes where supported (section 4).
39. `network_exclude` and the built-in exclusions bound what leaves the
    machine (section 2, 10).

## 14. Next steps

1. The developer corrects this document and the six digraphs.
2. The requirements are written from it, each with a falsifier and the
   mechanism that observes it, with the 1.x cut list beside them.
3. The record commands and the kernel are built against those
   requirements, under the work loop, in this branch.
4. At the first Done, the 1.x line is archived and this branch becomes
   main.
