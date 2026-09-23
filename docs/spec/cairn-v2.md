# Cairn 2: feature specification

Prefix: CAIRN
Scope: the Cairn 2 kernel: its records, verdicts, commands, skills and evaluator


Status: Draft, revision 6, 2026-09-21. Nothing here is Agreed until the
developer confirms it.

Revision 6 changes one rule: the developer is never asked to run a command.
The developer answers in conversation; the agent records the answer, quoting
the developer's words, with the developer-only commands. Unsigned evidence is
now the quoted answer, the harness that carried it and the Git author, called
attested evidence. The controlling-terminal confirmation is gone. Revision 5
had "one authorization command at start" run by the developer; the developer
ruled on 2026-09-21: "The user should never be asked to run cli commands for
anything" and "It should be a prompt... the model can run the cli command".

Revision 5 is a consistency revision. It closes the remaining authority,
record, supersession, calibration, egress, scope, initialization and liveness
gaps found in revision 4. It also restores the normative text revision 4
referred to but did not contain. Section 10 is shorter: the composite score,
weights and configurable code tiers are gone, while the two request states and
their questions are explicit again. This revision was drafted by a second
reviewer, corrected against two further reviews, and settled on 2026-09-19 with
three developer decisions: one authorization command at start, command intents
for the four multi-store commands only with a local cycle counter, and readable
canonical JSON record bodies.

This document says what Cairn 2 is, which processes it keeps, what each record
is and where it lives, and what 1.x had that 2 does not. It is a feature
specification: it names behaviors and the reader of each record, not requirement
identifiers. The requirements, with falsifiers, are written from it in the next
step under the policy in section 7.

This document is self-contained. The six process digraphs in `docs/diagrams/`
are part of it: install, new-project, existing-project, next-feature, the shared
spec-phase tail, and the work loop. Where a digraph and this text disagree, this
text is normative.

## 1. Purpose

Cairn keeps agent-led development tied to what the developer agreed to build.
A coding agent from any vendor does the work; Cairn is the referee that reads
the repository, records what was checked, decides what is still current, and
names the next action. Belief that the code matches the agreement lives in the
repository, not in a session, so a new session with no memory can continue.

Cairn 2 keeps seven ideas from 1.x, and little else:

1. A requirement is Agreed only with an observable failure, its falsifier.
2. Work happens one commitment at a time, named in the roadmap.
3. Each requirement is checked by a declared command that tries to falsify it;
   the result is recorded with the identity of everything it ran against. A
   passing check has not falsified the requirement; it has not proven it.
4. Evidence is current only while those identities match; nothing is re-run for
   its own sake and nothing stale counts.
5. Nothing is Done until a reviewer with none of the builder's context has
   looked and every finding is answered. Done means: not falsified by the
   declared checks, and looked at by someone who does not share the builder's
   blind spots.
6. Work outside the commitment is captured, never built.
7. Agreed text changes only by the developer's ruling. The agent stops for the
   developer only when the decision is theirs.

Everything in Cairn 2 serves one of those seven. A behavior that serves none of
them is not in Cairn 2. Where a model is consulted, code owns the invariants and
the model owns only the judgment code cannot make. No model output changes who
decides until code has established that the decision is inside the model's
envelope.

## 2. Definitions

The kernel's terms. A term in this list means this and nothing else.

### Paths and authority

**Reserved paths.** The kernel, not settings, reserves `.cairn/**`,
`docs/spec/**`, `docs/decisions.jsonl` and `AGENTS.md`. No `outside`, `source`,
`interfaces` or `data` entry may match them, and no mechanism may declare them
as an input. `network_exclude` may match them only to add an egress restriction.

Reserved does not mean immutable. It separates two kinds of authority:

- **Developer-owned protected paths** are `.cairn/settings.json`,
  `docs/spec/**` except `docs/spec/roadmap.md`, and `AGENTS.md`. The roadmap
  is edited by the kernel at start and promote, so it is bound structurally
  rather than by digest: lint passes, a section names only Agreed
  requirements, and the start record freezes the set. After project initialization, an accepted
  version of one needs a developer authorization that names its before and
  after digests. Between commitments an agent may prepare uncommitted Draft or
  Observed spec proposals, but one `cairn authorize` at start must bind their
  final digests, with the working agreement's and settings', and `cairn start`
  refuses without that authorization. An active commitment's frozen Agreed
  requirement text is not amended in place; changing it requires closing or
  superseding that commitment and opening a new one.
- **Kernel-managed paths** are `.cairn/mechanisms` and
  `docs/decisions.jsonl`. Only the command assigned to a schema-valid mutation
  may write them. That exact mutation is not a scope breach. A direct edit, an
  extra byte, deletion, reordering, or a write by another command is a breach.
- `.cairn/output/` is kernel-written runtime output, ignored by Git. Any other
  path under `.cairn/**` is refused unless this specification names it.

This split is a kernel invariant. Cairn's own valid bookkeeping cannot create a
Cairn violation merely because it wrote bookkeeping.

Every repository path in settings, mechanisms, records and evaluator drafts is
a UTF-8, slash-separated Git path relative to the worktree. The kernel rejects
absolute paths, a `.git` root, empty components, `.`, `..`, NUL, backslash and
a path that escapes after resolution. Globs match entry paths, never symlink
targets. Only a
requirement header's `Host paths:` field may name an absolute or home-relative
path, and Cairn never copies that target into a snapshot or model request.

### The hand-written tree

**Specification.** The files under `docs/spec/`. The **keystone**
(`docs/spec/overview.md`) says what the software is, the problem it solves, and
what it is not, and holds the **spec map**, one row per **domain** file with its
identifier prefix. The **glossary** (`docs/spec/glossary.md`) holds the
project's terms. The **roadmap** (`docs/spec/roadmap.md`) holds a `Current:` line
naming the current commitment's slug and one section per commitment: a heading
with the slug, a `Requirements:` line, and prose saying what it delivers and
when it is done.

**Requirement.** One block in a domain file: an identifier `[PREFIX-nnn]`, one
obligation with the actor named, a `Falsifier:` line naming the observable state
in which it is violated, a `Mechanism:` line naming the declaration that
observes it, and a `Status:` line. The block grammar is in section 4. A domain
file whose header carries `Scope: every commitment` contributes its Agreed
blocks to a commitment's set when that commitment starts. A header's `Host
paths:` line declares absolute or home-relative paths the software's behavior
depends on; Cairn reads the field and never scans block text for paths.

**Status.** One of `Draft`, `Observed`, `Agreed <date>`, or `Retired <date>`.
Observed text is derived from existing code and is never contract. Agreed means
the developer confirmed the block, or a deference decision quotes the
developer's ruling. Retired identifiers are never reused. Only Agreed blocks
are digested and checked. A commitment may name only Agreed requirements.

**Commitment.** One agreed unit of work: a roadmap section, opened by a start
record and closed by a done or superseded record. A commitment is not a Git
commit and normally spans many. At most one is open.

**Settings.** `.cairn/settings.json`, hand-written, tracked and the only
configuration file. `cairn init` creates or adopts its first protected version
after the developer confirms it. Its fields are:

- `schema`: the settings schema the kernel must understand.
- `authority_remote`: the one remote to which the durable Cairn refs travel,
  confirmed by the developer; `null` means the developer explicitly chose
  local-only operation. `origin` may be proposed but is never assumed.
- `outside`: paths that are nobody's input and never a scope breach.
- `source`: source roots under which neither `outside` nor `documents` may lie.
- `interfaces`: paths whose change is a public-interface change.
- `data`: paths whose change is a persisted-data change and therefore the
  developer's decision.
- `network_exclude`: paths whose bytes Cairn must not place in an evaluator
  request, adversary brief or adversary projection. It does not govern the
  project's ordinary Git remotes or the primary coding agent.
- `signing_key`: the developer's public verification key, or `null`. With a
  key, developer-only records must verify. With `null` the project is in
  attested mode: the agent asks the developer in conversation, and the command
  records the developer's answer in their own words, the harness that carried
  the conversation and the Git author; this is evidence, not cryptographic
  authentication. The kernel never prompts. Revised 2026-09-21: previously
  "the command requires an explicit controlling-terminal confirmation", which
  the developer had to type as a command.
- `attribution`: `forbidden` or `allowed`, for the release script.
- `harness`: one entry per supported harness, including the adversary model and
  whether the adversary is local or remote.
- `developer`: `present` or `absent`, default `present`. `absent` declares
  that no human will ever answer an escalation; only the narrow evaluator
  floor in section 10 can still name the developer. When it does, the run
  records that floor decision, wake prints it and exits 4 instead of
  waiting (the exit-code table above; section 5 restates this for Waiting
  generally). This is the setting an autonomous benchmark runs with.
- `typesafeai`: the evaluator policy in section 10. `enabled` chooses the
  measurement's source; it does not turn the measurement off (section 10).

Revised 2026-09-19: added the `developer` field and reworded the `typesafeai`
line. Previously this line read "the optional evaluator policy in section
10," which implied the whole measurement could be switched off. It cannot:
section 10 now measures every Consequential draft from Jev or, when
`typesafeai.enabled` is false, from the harness's review model instead, so
`enabled` only picks the source. The developer said the point of the redesign
was "to give the coding model a gut check or additional evaluation capability
to be able to measure the decision," which only works if the measurement
runs either way.

The settings shape is shown once here:

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
  "developer": "present",
  "harness": {
    "claude_code": {
      "adversary_model": "claude-fable-5-1",
      "adversary_transport": "remote"
    },
    "codex": {
      "adversary_model": "gpt-5.6-sol",
      "adversary_transport": "remote"
    },
    "muse": {
      "adversary_model": "muse-spark-1.3",
      "adversary_transport": "remote"
    }
  },
  "typesafeai": {
    "enabled": false,
    "model": "jev-1.13.0",
    "weights": {
      "evidence": 0.2, "reach": 0.2, "contract": 0.2,
      "surface": 0.2, "ambiguity": 0.2
    },
    "agent_ceiling": 0.35,
    "confidence_floors": {
      "evidence": 0.0, "reach": 0.0, "contract": 0.0,
      "surface": 0.0, "ambiguity": 0.0
    },
    "min_calibration_agent_predictions": 60,
    "request_cap_bytes": 48000
  }
}
```

Revised 2026-09-19: the `typesafeai` block previously carried seven fixed
thresholds (`route_confidence`, `sufficient_threshold`, `outside_threshold`,
`contradicts_ceiling`, `reversible_floor`, `observed_floor` and
`max_false_downgrade`) that fed a gate cascade, and a `mode` field defaulted
to `"shadow"`. `.superpowers/bench/results.md` ran that cascade live: 0 of
12 agent-expected drafts reached the agent (the `sufficient` gate alone
rejected every one), which the developer called ritual assent. This block
now carries the composite's `weights`, `agent_ceiling` and
`confidence_floors` (`.superpowers/bench/composite-design.md`, 0.895 route
accuracy at `agent_ceiling: 0.35`). There is no `mode` field: the composite
only ever produces an advisory suggestion (section 10), never a live/shadow
authority switch, so there is nothing left for a mode to withhold.
`max_false_downgrade` moves to a kernel constant (section 10);
`min_calibration_agent_predictions` and `request_cap_bytes` are unchanged.

The kernel refuses an unknown settings schema or field; an invalid glob; an
`outside` path overlapping `source`, `interfaces`, `data`, a reserved path or a
mechanism input; a reserved path under `source`, `interfaces` or `data`; a
`documents` path below `source`; a
secret-shaped field or value other than the public `signing_key`; an invalid
authority remote; an evaluator `weight`, `agent_ceiling` or confidence floor
outside `[0,1]`; `enabled: true` without a model; `request_cap_bytes` above
64,000; a `typesafeai.mode` field at all; or `developer` set to anything but
`"present"` or `"absent"`. `enabled: true` also requires a versioned model
ID, not an alias, since a calibration record is bound to one resolved
model. Unknown values fail closed. The evaluator's `code_tiers` field stays
refused; `weights`, `agent_ceiling` and `confidence_floors` are now required
fields, not refused ones.

Revised 2026-09-19: previously refused "an evaluator threshold outside
`[0,1]`" and "`mode: route` without a current passing calibration," and said
the evaluator's "removed `weights` and `code_tiers` fields are refused rather
than ignored." Those thresholds and the `route` mode are gone (section 10);
`weights` came back with the composite (decision 56) while `code_tiers`
stayed out, so only `code_tiers` is still refused. A later pass over the
same revision removed `mode` outright, including its interim `"observe"`
value: the composite is advisory only (section 10), so `mode` is now itself
an unknown field and refused like any other.

**Working agreement.** `AGENTS.md` at the repository root, copied from the
template the plugin ships. It states the move for each verdict and action. The
kernel does not parse it. During an open commitment a change requires a
developer-authorized next-feature or supersession decision.

### Kernel-written state

**Mechanism.** An entry in `.cairn/mechanisms`, written only by `cairn declare`
and `cairn review mechanism`. It has two separately digested parts:

- The **definition**: command, working directory, `inputs`, `documents`,
  requirements, `results: per-requirement`, and a declared **execution
  identity**. The identity may contain runtime and tool versions, container or
  image identity, and named non-secret environment values. It records declared
  values verbatim. It never hashes or records undeclared environment values.
- The **review metadata**: for each requirement, the definition digest against
  which it was accepted, the requirement text digest, and the fail receipt for
  its violating example.

A changed definition unbinds its review metadata. Undeclared external state,
including installed tools, services, locale and host configuration, can change
a mechanism without staling its receipt; therefore "current" is not a claim of
hermetic execution.

**Command output.** `.cairn/output/`, ignored by Git, with each file named by
the digest in its receipt.

### Snapshots and refs

**Snapshot.** A commit on `refs/cairn/snapshots` whose tree header is the tree
it preserves and whose parent is the preceding snapshot commit. The commit
payload names one of two kinds:

- An **input snapshot** contains exactly one mechanism's declared repository
  inputs as they exist in the working tree. Only receipts may name it.
- A **workspace snapshot** contains the tracked files plus non-ignored
  untracked files in the repository working tree, excluding `.git/**` and
  `.cairn/output/**`. Start, review, report, resolution, acceptance,
  realization, evaluation and done records must name this kind.

Both kinds include dirty bytes without changing the index. The kind is checked
at every reference; a synthetic input tree cannot be compared with a workspace
tree. A snapshot commit, rather than a hexadecimal tree ID in prose, makes the
tree reachable and checkable out.

An input or workspace snapshot refuses a non-ignored untracked path matched by
`network_exclude` or a built-in credential pattern; it never smuggles such a
file onto the shared snapshot ref. The built-ins are `.env`, `.env.*`, private
key extensions (`*.pem`, `*.p12`, `*.pfx`, `*.key`) and conventional SSH
private-key names. A project with another sensitive path must list it.

**Allowed workspace snapshot.** A start snapshot, a workspace snapshot created
after a clean scope preflight, or the result of an approved keep or successful
restore. The first-observed snapshot on an unresolved scope breach is not an
allowed base. Later scope comparisons use the newest allowed workspace
snapshot, never merely the newest snapshot commit.

**Durable refs.** `refs/cairn/snapshots` and `refs/cairn/log`. The kernel alone
writes them, never rewrites them, and advances each with compare-and-swap: the
expected old OID is required and a mismatch refuses the write. The log is a
chain of record commits whose schema is in section 4. Records reference records
by log SHA and code only by a kind-checked snapshot SHA.

**Action lease.** `refs/cairn/in-progress`, local to the repository and never
pushed. `cairn begin <action> <target>` creates it with compare-and-swap before
the agent changes a declared input, and prints the sha it wrote; `cairn end`
removes it with compare-and-swap after the action is committed, and refuses
when a passed `--lease <sha>` does not name that printed sha, so a stale end
from another session can never close this one's lease. `cairn end --abandon`
removes it and records the action as explicitly abandoned rather than
finished. `cairn begin --touch <path>`
provisionally adds a path to the target's mechanism inputs for the life of the
lease, so the declaration precedes the change; `cairn end` writes the addition
into the definition, which unbinds its review metadata as any definition change
does, or drops it when the path is unchanged. It carries the action, target,
workspace snapshot at start, timestamp and harness session when available.
While it exists, its target's declared inputs are neither `record` nor `commit`
findings. The separate check lock is `cairn-check.lock` below `git rev-parse
--git-path`; `cairn check` holds it only for the run, so a check can nest inside
an implementation action.

The action lease does not coordinate separate clones. Concurrent clones meet at
the authority remote: a non-fast-forward or failed lease push stops the later
writer before its branch is published.

### Records and evidence

**Receipt.** One mechanism run: the definition digest, an input snapshot, the
observed declared execution identity, whether the command ran or errored, and
per requirement its text digest and result. A **fail receipt** for a requirement
has `ran` and result `fail`; `error` never counts.

**Current.** A receipt is current for a requirement when the input snapshot's
tree, definition digest, requirement text digest, observed execution identity
and readable schema equal those computed now.

**Review.** The builder's claims at a workspace snapshot: what was examined,
answers to the fixed questions in section 9, and findings.

**Brief.** The record `cairn brief` writes for a review: the review it names,
the projection and payload digests, the exclusion manifest digest, and the
launch instruction (the detected harness and the adversary model, transport
and projection boundary fixed for that harness).

**Report.** The adversary's attempts against those claims at the same workspace
snapshot. One report is written per commitment.

**Finding.** A numbered entry on a review, report or acceptance. A finding is
answered by a **resolution**, which names the snapshot after a fix and explains
it, or by a **dispute**, which is an escalation naming the finding and resolved
by the developer.

**Acceptance.** The adversary's record at a later workspace snapshot. It
examines the cumulative post-report delta, accepts or rejects each submitted
resolution with a reason, and may raise new findings anywhere in that delta.

**Escalation, answer and reply.** An escalation has five one-line fields:
question, recommendation, because, if wrong, and instead. Wake prints them
verbatim. The agent puts them to the developer in conversation, in plain
prose without a choice widget: the problem, then the recommendation as `ok`,
the cost if wrong and the alternative as `instead`, and discussion as `ask`,
ending with `ok | instead | ask`. The developer answers in their own words. The agent records
`ok`, `instead` or `ask`, quoting those words verbatim, with
`cairn answer <slug> ok|instead|ask --quote <words>`; `ask` stays open until
an agent reply. Developer-only commands use the authentication rule in
Settings. Revised 2026-09-21: previously "The developer writes `ok`,
`instead <text>` or `ask <text>` with `cairn answer`".

**Developer evidence.** Every developer-only record carries evidence of the
developer's decision. `signed` evidence is a signature over the purpose,
subject and nonce that verifies against `signing_key`. `attested` evidence is
the developer's words quoted verbatim by the agent that asked, the name of the
harness that carried the conversation (`claude_code`, `codex`, `muse` or
`none`), and the Git author. Records written before revision 6 may carry
`unsigned-local` evidence; the kernel reads them and never writes one again.

**Direction.** The record `cairn authorize instead|ask --quote <words>`
writes when the developer asks for a change or a question before binding:
the kind, the developer's words, the harness and the Git author. It binds
nothing and wake ignores it; it keeps the developer's words in the log.

**Evaluation intent, call and measurement.** The three record kinds that make
the evaluator recoverable. The intent fixes the draft, pre-write identity,
policy and every constructible request digest before network I/O. Each
attempted model call has its own call record. The measurement holds the draft
digest, the source (`jev` or `review`), the resolved model, each of the five
Score dimensions with its level and confidence, the computed composite, which
veto if any fired, the suggestion and the reason. Section 10 defines them.
The suggestion is advisory (section 10): what actually happened is the
agent's own decision, which the ADR schema's `by` field records separately
on the decision itself.

Revised 2026-09-19: this was "Evaluation intent, call and result"; the result
record "applie[d] deterministic gates and name[d] the actual route" over raw
Noul and Choice answers. Section 10 no longer runs that gate cascade; it
scores five dimensions and computes one composite in code, so the third
record now holds a measurement, not a gate result, and what it names is a
suggestion, not a route: a later pass over this same revision corrected an
early draft that still had the composite deciding. "The optional evaluator"
became "the evaluator" because section 10 measures every Consequential draft
from one source or the other; only the source is optional.

**Calibration.** A record over developer-labelled measurements, bound to one
evaluation-policy digest. It states the conditional sample, error count,
confidence bound and pass or fail result. It tunes the composite's `weights`,
`agent_ceiling` and `confidence_floors` offline, from recorded dimension
levels; it does not gate whether the agent may decide.

Revised 2026-09-19: previously "developer-labelled shadow evaluations."
Shadow is no longer the default source of labelled data (section 10), and a
passing calibration is no longer a precondition for the agent to decide; the
developer's benchmark showed that precondition was why no draft ever reached
the agent under the superseded design.

**Item.** A captured idea of kind `backlog`, `next-feature` or `defect`.
Backlog work is already covered by Agreed requirements. A next-feature item
would change Agreed text or the working agreement and names what. A defect names
an Agreed requirement the code violates. Outside, promotion and fix records
later reference the item.

**Scope breach.** A durable record of the first Cairn observation that a path
differs from the latest allowed workspace snapshot while no then-active
mechanism declared it and `outside` did not list it. It names that snapshot and
the declaration-set digest. A later declaration cannot clear it.

**Start.** Opens a commitment at a workspace snapshot. Its **set** is every
requirement in the roadmap section plus every Agreed `Scope: every commitment`
block, each with the exact text digest at that moment. The set and digests are
immutable for the range. A start following a supersession references that
superseded record.

**Done.** Closes a commitment at its final workspace snapshot.

**Superseded.** Closes a commitment without Done after the developer chooses a
successor slug. It names the old start, the developer decision, a transition
ID, the intended successor slug and every carried open record. It does not name
a future start. The successor start later references the superseded record.
Unanswered escalations, unresolved findings and unfixed defect items carry;
receipts remain usable only by their ordinary identity; other items remain
items. While no successor start exists, wake names the pending transition and
the existing-project skill resumes it.

**Range.** The log after a start through its head or closing record. A receipt
is current by its identities, not its position: review metadata may name a fail
receipt written before the start record, as the spec-phase tail produces. A pending
supersession has no open range.

### ADR and other terms

**ADR.** `docs/decisions.jsonl`, append-only and kernel-managed. Each line is
one canonical JSON object written by `cairn decide`, `cairn escalate` when the
floor or a measurement sends a Consequential draft to the developer, `cairn
answer`, `cairn decisions --read`, `cairn
realize`, `cairn supersede`, or `cairn promote`. Kinds are `decision`,
`realized`, `superseded`, `answered` and `read`.
A decision carries `by`, `rests_on`, `wrong_if`, `body`, the workspace
snapshot from which realization will be measured, and the measurement it
read, or `null` when the narrow floor routed it without one. A realized line
names that base and the realized workspace snapshot. A read line names the
read record on the log, which carries the developer's authentication as an
answer record does.

Revised 2026-09-19: "an evaluation downgrades" described the old gate
cascade converting a Consequential draft to Blocking; that cascade is gone
(section 10). "A decision carries ... and the measurement it read" is new
text making explicit what section 4's ADR schema already stores as
`"evaluation":<sha|null>`, so an autonomous run is scoreable from the
decision record alone, as the developer asked. Section 4's schema table
still names that field and the evaluation-intent/call/result rows in the old
vocabulary; this revision did not touch section 4, so the field name and the
result shape there are stale against this section until a later pass renames
them.

The kernel has two decision levels. A Consequential decision is appended to the
ADR and queued while the agent continues. A Blocking decision is an escalation;
its answered line names the answer record. The working agreement may describe
Routine and Judged guidance, but they leave no record.

**Verdict.** What wake prints. `Resolvable` names an action and its predicate.
`Waiting` prints an unanswered escalation's five fields. `Done` means a done
record exists and no promotion waits. Wake is read-only. Outside a project, on
missing durable refs, during a pending supersession, with an interrupted
transaction, or with no commitment started (`cairn: no commitment started; run
/new-project or /existing-project`), it prints one line naming the command or
skill that continues and exits 3; none is a verdict.

| Exit code | When | Is it a verdict? |
|---|---|---|
| 3 | No project, missing durable refs, a pending supersession, an interrupted transaction, or no commitment started | No; wake names the command or skill that continues instead |
| 4 | `developer: absent` and the narrow evaluator floor or a veto (section 10) names the developer for a Consequential decision | Yes; a real Waiting verdict this run cannot answer, so it stops there (section 5) |

Revised 2026-09-19: new table. Wake had only ever needed one non-zero exit
code (3, for a state that is not a verdict at all); `developer: absent`
(section 5) adds a second, for a real Waiting verdict nobody in this run can
answer.

**Predicate.** The exact record state that completes an action. It is printed
with the action.

**Attempt.** A failing receipt at a product digest not seen among failures
since that requirement's last pass. The product digest is the input tree with
declared `documents` paths excluded, so a change only to a document is never a
new attempt.

**Semantic progress.** One of: a start-set requirement gains a current pass; an
unresolved finding, defect or escalation is closed without an equal-or-higher
priority obligation being created; the loop advances from implementation to
review, report or Done; or the developer explicitly authorizes continuation.
A branch commit, timestamp, snapshot, log record or content-identical rewrite
alone is not progress.

The term `next-feature` replaces 1.x's `next-iteration` everywhere: skill, item
kind and flag.

## 3. The processes

Four entry flows, one shared tail and one work loop.

### Install

`install.dot` begins with Node and Git; if either is missing it stops and names
it. The developer installs the plugin for Claude Code, Codex or Muse, or uses
the skills CLI and `/install-cairn`. Installation links
`~/.local/bin/cairn`, registers hooks where the harness supports them, and
lists the four skills. A harness without hooks is instruction-only.

Installation is global and never asks for a project remote. It is complete when
`cairn --help` prints. Inside an initialized project the session-start hook also
prints the current verdict; elsewhere it names `/new-project` or
`/existing-project`.

### Project initialization

New-project and existing-project run `cairn init` before they need settings,
mechanisms or refs. It initializes Git when the new-project directory has none;
validates or creates settings; takes the developer's answers as flags:
`--remote <name>` or `--local-only` for the authority, `--signing-key <path>`
or `--attested` for developer evidence, and `--quote <words>` in attested
mode; writes the init record; and creates the durable ref roots with
compare-and-swap. The agent asks those questions in conversation before it
runs the command; the command asks nothing itself and refuses, naming the
flag, when an answer is missing. Revised 2026-09-21: previously the command
asked its questions at the controlling terminal. Protection begins at the
settings digest in that record. Initialization makes no evaluator call.

If settings exist but the refs do not, initialization adopts them only with
`--adopt <digest>` naming the digest the developer confirmed in conversation.
If refs exist but settings do not, it refuses and names repair. Re-running
initialization against the same identity is idempotent.

### New project

`new-project.dot` runs only in an empty directory or one holding no source code
or spec (a README, license and Git do not count). Otherwise it switches to
existing-project. After initialization it asks one open question: what is the
software for? It has four developer gates:

1. Restate the answer in the agent's own words; the developer corrects it.
2. Draft five to fifteen glossary terms as one set; the developer corrects by
   exception.
3. Derive the domain partition from the keystone; the developer confirms it.
4. Run the shared spec-phase tail for the requirement blocks.

The keystone states what the software is, its problem and what it is not. Each
domain gets requirements with one actor-named obligation, a falsifier and Draft
status. The roadmap names the first commitment before the shared tail begins.

### Existing project

`existing-project.dot` takes a codebase Cairn has not specified, one whose spec
has drifted, or a pending supersession to one prepared commitment. If wake says
Done, it switches to next-feature. If a commitment is open and the request is
outside it, the developer chooses either to finish it and capture the request,
or to supersede it.

Supersession is two-phase. `cairn supersede <successor-slug>` writes the
developer-quoted Consequential decision and a superseded record that closes the
old range with a transition ID and intended slug. It does not move `Current:`
and cannot name a start that does not exist. Recon and specification then
prepare the successor. The successor's start names the superseded record and
`Current:` moves in the same recoverable start transaction. An interrupted gap
is a pending transition, not a second open commitment.

A Cairn 1.x project (record directories under `.cairn/`, or
`docs/commitments/`) is migrated before initialization, on the developer's ok:
the 1.x record directories are removed, since Cairn 2 reads none of them and
Git history keeps them; the specification is converted in place until
`cairn lint docs/spec` is clean, with no requirement's words changed; each
1.x mechanism's command and inputs are kept in `docs/recon.md` for the tail's
declare step; and after initialization each 1.x item file becomes one item
record. Added 2026-09-22.

Recon precedes questions. Path A, for a repository without a spec, derives the
glossary from code identifiers, writes Observed specs inside the requested blast
radius, and writes one-line rows in the map outside it. Path B reads the current
spec first, then checks every section inside the radius. Both inspect manifests,
entry points, data, tests, CI, scripts, non-spec docs and recent history.
Path B covers every commit since the newest Agreed date.

`docs/recon.md` records every claim as Exists, Documented, Contradicted or
Unverified with a citation and carries unresolved earlier findings. The agent
presents it for correction, asks whether the work is a feature or defect, and
traces modules, tests and spec sections. For each Path B section it records
Holds, Drifted, Still Observed or Missing. Drift presents both sides and the
developer rules: revise the spec, or leave it and create a defect item. Observed
sections the developer confirms become Draft with falsifiers; the rest remain
Observed. A defect commitment names the violated requirement and a mechanism
that reproduces it. The flow then enters the shared tail.

### Next feature

`next-feature.dot` runs only after Done. It reads the spec set, finished roadmap
section, Consequential queue, unpromoted next-feature items and backlog, then
asks one question: the waiting items, a new feature, or both?

For every requested change it traces and cites the blast radius, restates what
changes for whom, quotes any affected Agreed text, gives the alternative and
recommendation, and lets the developer correct the reading. A change already
covered enters the commitment without new text. Otherwise the requirement is
revised under its identifier or added as Draft with at most one Rationale line.
Because no commitment is open, confirmed text can change before the new start.
The flow then enters the shared tail.

### The shared spec-phase tail

`spec-phase.dot` begins with Draft requirements and falsifiers. The agent
proposes the falsifiers as one set and names each mechanism; self-reviews for
contradictions, falsifiers that would miss their violation, and requirements no
mechanism can check; runs `cairn lint docs/spec`; and presents by exception with
an invitation to ask for another explanation. The developer confirms, corrects,
or rules that the recommendation stands. A deference decision quotes that
ruling. Each confirmed block becomes `Status: Agreed <date>`.

The agent writes the roadmap section and moves `Current:`, declares mechanisms
for this commitment's requirements only, demonstrates each on a violating
example, and writes or updates the working agreement. The agent then states
what would be bound: the specification, the working agreement and settings,
each by digest, and what changed in them since the last authorization; asks
the developer for ok, for changes, or for a question; and on ok runs
`cairn authorize --quote <words>`, one command that binds the final digests of
the specification, the working agreement and settings in one authorization
record. A request for changes or a question is recorded with
`cairn authorize instead|ask --quote <words>` as a direction record, binds
nothing, and the agent acts on it and asks again. Revised 2026-09-21:
previously "The developer then runs `cairn authorize`". `cairn start` stages a command intent, commits the prepared contract,
agreement and mechanism bytes, and writes the workspace snapshot and start
record as one recoverable transaction, including the frozen set and optional
supersession link. It installs exact fetch and push
refspecs for `refs/cairn/log` and `refs/cairn/snapshots` on the authority remote
only when one is configured. Wake names the first work-loop action.

### The work loop

`work-loop.dot` begins at wake. Wake names one action and its predicate; the
agent performs that action until the predicate holds, leaves the required code,
snapshot or log record, then wakes again. An unanswered escalation is Waiting
and the agent stops. A pending report or acceptance is the agent's wait and
remains Resolvable.

When the Done rule holds, wake names `done`. `cairn done` writes the done
record. Terminal output is not durable state: the next invocation renders the
unread queue. With a backlog item waiting, the next wake names `promote` rather
than Done.

## 4. The record set

A record exists only if this specification names its reader. The kernel parses
two hand-written inputs: specification grammar and settings. Everything else it
uses for authority or Done is either a Git object it wrote or canonical JSON it
wrote.

### Canonical encoding

Every log record is an empty commit with subject `cairn: <kind> <target>`. Kind
and target are restricted ASCII tokens; arbitrary text and paths never appear
in the subject. The commit body is the record: one UTF-8 RFC 8785 canonical
JSON object, readable in `git log`. The commit has exactly two trailers:

```
Cairn-Schema: 1
Cairn-Digest: sha256:<hex of the body bytes>
```

The trailers carry only the schema and the digest; content never lives in a
trailer. Each kind has a closed object schema: required keys, no unknown or duplicate keys,
fixed scalar types, ordered arrays where order is meaningful, and lowercase
hex of fixed length for SHAs and digests. Arbitrary strings live only as JSON
strings. The parser rejects invalid UTF-8, control characters outside JSON
escapes, noncanonical JSON, a body whose digest does not match the trailer,
wrong field counts and out-of-range numbers. It never delegates content
parsing to `git interpret-trailers`.

The same rules apply to snapshot payloads. ADR lines are canonical JSON written
directly as one line, with embedded newlines escaped. `cairn show` renders
records with their references resolved. The commit is the authority-bearing
form.

### Logical record schemas

The table names logical payload fields. `<ws>` is a workspace snapshot SHA,
`<input>` an input snapshot SHA, and `<sha>` a log record SHA.

| Kind | Required logical fields | Read at |
|---|---|---|
| `init` | settings digest, authority remote or local-only, developer-auth mode | every project command |
| `authorization` | spec digest, agreement digest, settings digest, developer-auth evidence, optional decision ID, intent SHA or null, results | start and protected writes |
| `command-intent` | transaction ID, command, complete input identity, expected pre-identities, ordered planned writes and digests | wake and `recover` until finalized |
| `command-abort` | intent SHA, failure class, verified restored identities | wake and `recover` |
| `start` | slug, `<ws>` roadmap snapshot, repeated `{requirement,text_digest}`, optional `from_superseded:<sha>`, intent SHA or null, results | every wake; opens the range |
| `receipt` | mechanism, definition digest, `<input>`, `ran|error`, observed declared environment, repeated requirement text digest and `pass|fail|unverified`, output digest, exit code or signal | freshness and attempts |
| `review` | slug, `<ws>`, examined entries, one answer for every fixed question and target, findings | brief, report and Done |
| `brief` | slug, review SHA, launch instruction (harness, model, transport, boundary), projection digest, payload digest, exclusion manifest digest | report validation |
| `report` | slug, `<ws>`, brief SHA, model, projection digest, one attempt per question, findings, interface attempts | Done and resolution |
| `resolution` | source record SHA, finding number, `<ws>`, explanation | acceptance and Done |
| `acceptance` | slug, report SHA, `<ws>`, cumulative-delta digest, accepted and rejected resolution SHAs with reasons, new findings | subsequent resolution, acceptance and Done |
| `escalation` | slug, five fields, concern reference, optional evaluation SHA | every wake until answered |
| `answer` | escalation SHA, `ok|instead|ask`, the developer's words, optional owner label, developer-auth evidence | wake, ADR and calibration |
| `direction` | `instead|ask`, the developer's words, harness, Git author | nothing; the log keeps it |
| `reply` | escalation SHA, text | wake after `ask` |
| `read` | decision ID, developer-auth evidence | queue and ADR |
| `evaluation-intent` | draft digest, `<ws>`, pre-write log head, ADR digest, settings digest, policy digest, source `jev|review`, nullable request digest, session, launch (harness, model, transport, boundary) | measurement recovery |
| `evaluation-call` | intent SHA, source `jev|review`, request digest, `response|failure|indeterminate`, resolved model, transport and session (review source only), raw response bytes or failure class, parsed answers when valid, reported usage | measurement and audit |
| `measurement` | intent SHA, nullable call SHA, draft digest, source `jev|review`, resolved model, the five Score levels with their confidences, composite, veto or null, `suggested: agent|developer` or null, outcome `floor|unavailable|veto|composite|indeterminate`, reason | escalation, decision, calibration |
| `calibration` | policy digest, labelled-through log head, predicted-agent count, false-downgrade count, one-sided confidence bound, criterion, `pass|fail` | policy validation over labelled measurements |
| `item` | `backlog|next-feature|defect`, slug, source requirement or changed contract, body | capture, Done and next-feature |
| `outside` | item SHA, reason, optional evaluation SHA | capture gate |
| `promotion` | item SHA, decision ID, intent SHA or null, results | after Done |
| `fix` | item SHA, `<ws>` | Done |
| `scope-breach` | path as JSON string, first-observed `<ws>`, allowed-base `<ws>`, declaration-set digest | every wake until disposition |
| `scope` | breach SHA, `keep|restore`, resulting `<ws>`, escalation and answer SHAs when kept | scope predicate |
| `done` | slug, final `<ws>` | closes the range |
| `superseded` | slug, old start SHA, developer decision ID, transition ID, successor slug, carried record SHAs, intent SHA or null, results | closes old range; successor start |

`docs/spec/roadmap.md` is exempt from scope breaches only outside an open
commitment range: the developer and agent write its next section, and
`cairn start` and `cairn promote` edit it, between commitments. Inside an
open range it is an undeclared change like any other.

An evaluation's raw response is stored byte-for-byte inside its encoded payload;
the parsed answer is separate. Missing, malformed or noncanonical responses
cannot be reconstructed from parsed values. A logical byte string, including a
raw response, is represented inside canonical JSON as unpadded base64url.

### ADR schema

One canonical JSON object per line in `docs/decisions.jsonl`:

- `{"kind":"decision","id":<ulid>,"ts":...,"level":"Consequential","by":"agent|developer|joint","title":...,"rests_on":[...],"wrong_if":...,"body":...,"base_snap":<ws>,"evaluation":<sha|null>,"interfaces":[...]}`
- `{"kind":"realized","id":<ulid>,"ts":...,"of":<id>,"base_snap":<ws>,"snap":<ws>,"subject":...,"interfaces":[...]}`
- `{"kind":"superseded","id":<ulid>,"ts":...,"of":<id>,"by":<id>,"cause":"the stated condition occurred|an unforeseen condition occurred|it was wrong when it was made|the premise was false"}`
- `{"kind":"answered","id":<ulid>,"ts":...,"escalation":<sha>,"answer":<sha>}`
- `{"kind":"read","id":<ulid>,"ts":...,"of":<id>,"record":<sha>}`

`cairn decisions` renders the file. The queue is every decision without a later
read line. `cairn decisions --read <id>` is a developer-only command. A line
written outside its assigned command, a duplicate ID, a noncanonical line, an
unknown key, or a reference to a missing record is a breach.

### Requirement and roadmap grammar

A requirement block begins at `[PREFIX-nnn]` at the margin and ends at the next
blank line. In order it contains the identifier and first text, continuation
text until `Falsifier:`, one-line `Falsifier:`, `Mechanism:` outside the digest,
optional one-line `Rationale:` outside the digest, and `Status:`. Its text digest
is the identifier, obligation text and falsifier after the specified whitespace
normalization. File headers before the first block carry `Prefix:`, optional
`Scope: every commitment`, and optional `Host paths:`. Other prose is ignored.

`cairn lint docs/spec` refuses broken order, duplicate or reused identifiers,
references to absent identifiers, missing falsifiers, an Agreed block without a
mechanism, noncanonical status dates, and a spec map that
does not match domain prefixes. That refusal is the falsifier for this grammar.

The roadmap parser reads only `Current: <slug>` and, below the matching heading,
`Requirements: <identifiers>`. The rest is prose. `cairn start` resolves the
whole set and digests it before writing anything.

### Commands and crash recovery

`cairn begin` and `cairn end` manage the local action lease. `cairn check`
writes receipts. `cairn review`, `brief`, `report`, `resolve` and `accept` write
the review chain. `cairn escalate`, `answer` and `reply` write the decision
chain. `cairn item`, `outside` and `fix` manage items. `cairn decide`, `realize`,
`decisions --read` and `promote` manage the ADR. `cairn authorize` binds the
protected digests in one record; a settings change is a new authorization
naming the new digest; `cairn authorize instead|ask` writes one direction
record and nothing else. `cairn start`, `done` and `supersede` bound commitments. Wake writes
nothing. No command edits a record.

Four commands write to more than one store: `start`, `promote`, `supersede`
and `authorize`. Every other command writes one store and needs no intent. A
multi-store command holds a repository-local transaction lock, first stages
exact bytes, commit metadata and
pre-identities below the Git directory, appends a command-intent, performs the
ordered writes, and appends a terminal domain record naming that intent. Each
step is idempotent on the transaction ID and expected old identity; atomic rename
prevents partial files. Wake names `recover <transaction>` for a nonterminal
intent before any ordinary action. `cairn promote`'s promotion record is one
of these ordered writes, a `plan.writes` log descriptor inside the same
transaction that writes its `start` record, not that transaction's terminal
record.

Recovery completes forward after any planned append-only write beyond the
intent or any external effect has occurred. It may instead restore staged
pre-identities and append a command-abort only when neither has occurred. It
never rewrites an append-only ref. If a conflicting writer makes forward
completion impossible, recovery preserves the intent and records or names the
exact repair before a Blocking escalation; it never asks a human to infer what
happened.

An evaluator intent is written before network I/O. If the process may have sent
a request but no response record exists, recovery writes an `indeterminate`
call and routes to the developer. It never silently calls again and pretends the
new nondeterministic answer was the lost one.

Terminal output is never a completion fact. A done record means done; a later
invocation can render the queue again.

### Travel with the code

Only `refs/cairn/log` and `refs/cairn/snapshots` travel. When
`authority_remote` is non-null, `cairn start` installs their exact fetch and
push refspecs on that remote only. The working
agreement's push command atomically pushes the branch and both refs where the
remote supports atomic push.

Without remote atomicity, Cairn pushes snapshots first, log second and branch
last. A failure stops the sequence. Snapshots ahead of the log and a log ahead
of the branch are safe and retried; the branch is never intentionally advanced
without the records it needs. A bypassing ordinary Git push can still create a
mismatch. After fetch, wake validates all cross-references and names the exact
fetch or push repair; it never guesses. The durable refs are append-only and a
push uses the expected remote OID as a lease.

A clone without the durable refs exits 3 and names:

```
git fetch <authority> 'refs/cairn/log:refs/cairn/log' \
  'refs/cairn/snapshots:refs/cairn/snapshots'
```

Records from 1.x are not read.

## 5. Verdicts, actions, predicates and precedence

Wake prints a verdict, the action or party, one line of reason and the action's
predicate. The table is normative.

| Action | Complete when |
|---|---|
| `repair PATH` | the named hand-written file reads under its grammar and no unrelated byte changed |
| `recover TRANSACTION` | the intent has one terminal domain or abort record and every store matches its resulting identity |
| `reconcile ACTION` | the local action lease is gone and the action it named finished or was explicitly abandoned |
| `scope PATH` | every scope-breach record for the path has a developer-approved keep disposition or a restore snapshot equal to its allowed base; an unanswered escalation that concerns the breach is Waiting instead (added 2026-09-22) |
| `fix ITEM` | a fix record names the item and a workspace snapshot that changes no protected contract; its requirement has a current pass at or after it |
| `record PATH` | the action lease covers the path through its target's declared inputs, or the path is clean |
| `commit PATH` | the path is clean, or the action lease covers it; `docs/decisions.jsonl` is named here whenever it has uncommitted lines (added 2026-09-22) |
| `declare REQ` | a mechanism definition names the requirement and no pre-existing undeclared delta was legalized |
| `run REQ` | a current receipt carries a result for the requirement |
| `implement REQ` | a current receipt says pass and review metadata binds the requirement to the current definition and text digests with a fail receipt |
| `escalate REQ` | after three distinct attempts without a pass, an escalation concerns the requirement before a fourth; a receipt where another requirement of the commitment also failed is not an attempt |
| `review mechanism REQ` | review metadata binds the requirement to the current definition and text digests with a fail receipt |
| `capture ITEM` | an outside record names the item, or an escalation concerns it |
| `review SLUG` | a review names the current workspace snapshot and answers every fixed question for every target |
| `report SLUG` | a current brief and report name the reviewed snapshot and projection; every question and interface obligation has an attempt |
| `resolve SLUG N` | a resolution names finding N of its exact source record, or an escalation disputes it |
| `accept SLUG` | an acceptance at the current workspace snapshot examines the cumulative post-report delta and gives a verdict on every submitted resolution; new findings may remain for the next `resolve` action |
| `build DECISION` | a realized ADR line names the decision's base and resulting snapshots and the realization check passed |
| `done SLUG` | a done record names the commitment and final workspace snapshot |
| `promote` | no commitment is open; one promotion names a backlog item and decision; `Current:` and a one-item successor start were written transactionally |
| `reply SLUG` | a reply record names the open `ask` escalation |

A Consequential decision carries one more requirement this table does not
list as a row, because wake never queues it as a next action the way it
queues `declare` or `run`: before the agent writes the decision, `cairn
measure` runs on the exact draft and writes a current measurement record
(section 2). `cairn decide --consequential` refuses a draft whose
measurement is missing, stale, or built from a different draft digest.
Waiting for a Consequential decision arises only two ways: the narrow floor
in section 10 sends it to the developer before any call is made, or the
agent, having read the measurement, chooses to escalate anyway. A
measurement whose suggestion is `agent` is information, not consent; the
agent may still escalate past it toward the developer, but nothing routes a
floor-caught or vetoed draft to the agent.

Revised 2026-09-19: new. Section 10 replaces a deterministic gate cascade
with one composite measurement the agent itself reads and acts on; this
paragraph is where the decision predicate picks that up, since the
Consequential decision row was never in the action table to begin with.

### Scope is monotonic

Before any state-changing command, the kernel compares the current workspace
with the latest allowed workspace snapshot and the declarations active at that
log head. If it observes an undeclared, non-outside changed path, it records a
scope breach before doing the requested work. `cairn declare` performs this
preflight before it can add an input. Thus a declaration legalizes only future
changes. A path touched under a lease is declared from `cairn begin`, so
implementing a requirement in a new file is not a breach and needs no
developer disposition.

The breach survives rebases and squashes because it is a log fact tied to a
workspace snapshot and declaration-set digest, not a claim about mutable
first-parent chronology. It closes only when the developer approves keeping the
captured bytes or a workspace snapshot restores the path to its allowed base.
If a change is removed before Cairn ever observes it, no built work remains and
there is no breach to preserve.

### Precedence

Wake tests in this order and names the first unmet predicate: unreadable
hand-written input (`repair`); incomplete transaction (`recover`); stale action
lease (`reconcile`); scope breach (`scope`); unanswered escalation (`Waiting`,
or `reply` after `ask`); unfixed defect (`fix`); uncovered dirty input (`record`,
`commit`); missing declaration (`declare`); missing or failing receipt (`run`,
`implement`, or `escalate` after three attempts); stale mechanism review
(`review mechanism`); uncaptured item from the commitment (`capture`); missing
current review (`review`); missing report (`report`); unresolved finding or
rejected resolution (`resolve`); post-report resolutions not examined at the
current snapshot (`accept`); unrealized Consequential decision (`build`); Done
rule satisfied without a done record (`done`); closed range with a backlog item
(`promote`); Done.

### Done

Done requires all of the following:

- Every requirement in the start record's frozen set has a current passing
  receipt whose review metadata binds the current mechanism definition to that
  frozen text digest.
- A review and report exist at the reviewed workspace snapshot.
- The latest acceptance examines the cumulative delta at the final workspace
  snapshot; every resolution is accepted; every finding on the review, report
  or any acceptance is resolved or developer-disputed.
- No escalation is unanswered, scope breach undisposed, defect unfixed,
  transaction incomplete, action lease stale, Consequential decision
  unrealized, or administrative-cycle escalation unresolved.

Backlog items are not in the rule. When the rule holds, wake names `done`;
`cairn done` writes the record. The next wake renders the queue or names one
promotion, so one commitment is open at a time.

The report is written once at the candidate snapshot. Every later fix is a
resolution. Each acceptance examines the whole delta from that reported
snapshot to the current one, not only the named fix, and may add findings.
There is no unreviewed final mutation because Done requires the latest
acceptance at the final snapshot. A second rejection of a resolution for the
same finding escalates.

### Waiting and liveness

Waiting begins when an escalation exists without a final answer. Wake prints
the five fields verbatim; the agent adds nothing. Hooks print the same state and
do not nag.

Settings' `developer` field states whether a human can ever answer that
Waiting. `developer: absent` is what an autonomous benchmark runs with: the
narrow floor in section 10 is the only path left to the developer, since the
agent's own choice to escalate past a `suggested: agent` measurement would
have no one to answer it either. Under `developer: absent` every escalation
is recorded on the log exactly as it would be with a developer present, wake
prints its five fields exactly as Waiting always prints them, and the run
then exits 4 instead of sitting at Waiting for an answer that cannot come:
the floor, a veto, the agent's own escalation after three failed attempts, a
cycle bound, a breach, all alike.
Exit 4 is distinct from wake's exit 3 for a non-verdict state (section 2,
exit-code table): a floor hit or a veto in absent mode is a real Waiting
verdict, just one this run cannot resolve, so it stops there rather than
looping on wake. A veto counts because section 5 says nothing routes a vetoed
draft to the agent, so its Waiting is as unanswerable as the floor's.

Revised 2026-09-19: new. This states what section 5's own Waiting rule does
in the one mode where nobody can end it, which the developer's stated reason
for the evaluator redesign, "The reason I wanted this design was to be able
to use Cairn in an autonomous benchmark," requires: a benchmark run cannot
sit at Waiting forever.

Revised 2026-09-22: previously only the floor or a veto exited 4. An
escalation the agent files after three failed attempts, a cycle bound or a
breach had no one to answer it either and left the run at an exit-0 Waiting
forever, which the purpose above rules out.

The kernel also prevents administrative cycling. It counts each completed
administrative action (`repair`, `recover`, `reconcile`, `scope`, `record`,
`commit`, `declare`, `review mechanism` or `capture`) in a local file below the
Git directory, keyed by action class and target and reset on semantic
progress. The count never travels, because a cycle belongs to one session's
loop; the escalation it produces is a log record and does. A fourth occurrence of the same action class and target, or a
twenty-eighth administrative transition of any class, without semantic progress
creates one Blocking cycle escalation and preserves every pending obligation.
The second bound is three occurrences of each of the nine administrative
classes: the same three-attempt rule the loop applies everywhere, summed over
the classes, so a cycle that rotates targets is caught as soon as one that
repeats them.
Three acceptance rounds after the report without reaching Done create the same
kind of escalation, even when each round raises a newly numbered finding; the
developer's ok or instead answer restarts that count. These constants are in
the kernel, not settings.

Before committing a kernel-managed mutation, the kernel evaluates the
post-state. If its specified bookkeeping alone would create a new Cairn
violation of equal or higher precedence, it refuses the mutation, names the
violation and its cause, and counts the refusal as one administrative
occurrence of that action class and target toward the cycle bounds above; the
bounds, not the refusal, write the cycle escalation. This is the liveness
invariant. Revised 2026-09-22: previously "it refuses the mutation and writes
the cycle escalation instead", so one pre-existing untracked file cost the
developer an answer per refusal while nothing had cycled; the developer ruled
"ok" on the change. A synthetic fixture
that repeats administrative actions without semantic progress is a required
regression test.

## 6. Hooks

Where a harness has a per-turn hook, it runs wake before every agent turn and
prints the verdict, action, reason and predicate. A skipped step is therefore in
front of the model. The stop hook prints the same line and is only the fallback
for a harness without a per-turn hook. The session-start hook prints the current
state and, in one line, any missing command link, PATH entry or durable ref. It
writes nothing: `cairn brief` reads the harness from its environment when it
runs, or from `--harness <name>` naming a settings entry.

No hook refuses a stop, counts refusals, creates a record, edits a file, commits,
pushes, calls a model, or completes an action. The install skill makes the link
and registers hooks once. A harness without hooks relies on the working
agreement.

## 7. Requirements policy

- A requirement describes something a Cairn user can observe: a verdict,
  refusal, record or command output. Kernel internals are tests, not contract.
  The action predicates, precedence, Done rule and schemas replace most of the
  1.x loop requirements.
- A block holds its identifier, obligation, falsifier, mechanism, one optional
  rationale line and status. Git holds its history.
- A falsifier names a mechanism that could observe it before the requirement is
  Agreed. The mechanism counts only after review metadata names a fail receipt
  from the violating example: the check was seen to fail before it was trusted
  to pass.
- Agreement is per block, by direct developer confirmation or a deference
  decision quoting the developer. Promotion never Agrees text.
- A requirement must not restate a record encoding or an internal algorithm.
  Those are tested against the feature behavior and security invariants they
  support.

## 8. What each kept process does

### Freshness

A receipt is current only by the identities in section 2: input snapshot tree,
mechanism definition digest, frozen requirement text digest, observed declared
execution identity and readable schema. A kernel release does not itself stale
evidence. A changed definition unbinds review metadata. A mechanism reused for
a revised requirement in a later commitment needs `review mechanism` before its
evidence counts.

A `documents` path must also be an input and must not lie below a `source` root;
`cairn declare` refuses otherwise. Changes only to documents cost a check, not
a mechanism review. A receipt remains current when its ignored output file is
absent on a clone; the output digest lets Cairn report the absence.

### Scope and protected state

Scope uses the monotonic rule in section 5, not branch chronology. Valid
kernel-managed mutations are exempt only for the assigned command and exact
schema. Protected paths need developer authorization. `outside` cannot exempt
either class because the reservation is compiled into the kernel.

An active commitment's frozen contract does not change under it. If the
developer decides Agreed text or the working agreement must change, the current
commitment is finished or superseded and the change is made before the successor
start. Settings may change during a commitment only by a new authorization
naming the new digest, committed with the file; the new digest immediately invalidates any
evaluation policy or calibration that depended on the old one.

### Deferral and attempts

An item captured from the commitment's own requirement needs an outside record
or an escalation. A defect against that commitment's requirement is worked
under it and blocks Done; it is not deferred.

After three distinct failing attempts without a pass, a fourth implementation
attempt requires an escalation first. A fail receipt in which another
requirement of the same commitment also failed is not an attempt at this one
(added 2026-09-22: a requirement whose gate includes other requirements'
falsifiers cannot pass until they do). Attempts are counted from the open
commitment's start record; the fail receipts that bind mechanisms during the
spec phase precede it and are not attempts (revised 2026-09-22; previously
every fail receipt in the log counted). Attempts are keyed on product digest,
not input snapshot; a rerun at a seen product digest and a change only to
documents or outside paths are not new attempts. Captured output may be
truncated at a fixed byte cap; the truncation marker lives in the output
bytes themselves, not in a separate receipt field.

### Decisions and realization

Consequential decisions enter the ADR queue and the agent continues. Blocking
decisions are escalations and the developer's answer is the decision. A later
ADR supersession names one of four causes; supersession analytics are never
treated as evaluator labels.

Each Consequential decision names a base workspace snapshot. `build DECISION`
compares that base with the proposed realized workspace snapshot before it
accepts the realized line. A delta touching a `data` path, frozen Agreed text,
the working agreement, protected settings, or any other reserved path stops and
escalates regardless of the evaluation. Named paths in the draft do not limit
the comparison: every changed path in the actual delta is classified.

An interface hit does not automatically make the decision Blocking. The kernel
records it on the decision and on the realized delta, and the adversary must
attempt the changed interface explicitly in the report or next acceptance.

The realization check is a postcondition. A measurement only informs the
agent's own decision on a draft; neither the measurement nor the agent's
decision can authorize a privileged realization the code actually performs.

Revised 2026-09-19: previously "The evaluator judges a draft." Section 10 no
longer has the evaluator itself judge or decide anything; it measures, and
the agent decides. This sentence's guarantee is unchanged either way: no
route, high or low, waives the realization check below.

### Escalation

`cairn escalate` and `cairn decide --consequential` accept the same canonical
draft. Only a Consequential draft is measured; every other level uses the
kernel level directly. `cairn measure` (section 5) runs first, from `jev`
when `typesafeai.enabled` or otherwise the harness's review model (section
10); when neither source can be reached the draft is `unavailable <class>`
and routes to the developer like any other technical no-call. Otherwise the
agent reads the measurement, including its advisory `suggested: agent |
developer`, and decides, except at the narrow floor or a veto, or when the
agent itself chooses to escalate anyway; no other level is measured.

The agent runs `cairn answer`, `cairn decisions --read` and `cairn authorize`
only after the developer has answered in conversation, and never asks the
developer to run a command. With a signing key their records must verify. In
attested mode the developer's quoted words, the harness name and the Git
author are evidence only; Cairn says so wherever it reports the decision.
With `developer: absent`, none of this paragraph's questions has anyone to
answer it; section 5 states what the floor does instead. Revised
2026-09-21: previously "The developer runs `cairn answer` and `cairn
decisions --read`; the agent never does", with a controlling-terminal
confirmation as the unsigned evidence. The developer ruled that nobody is
ever asked to run a command; the answer is given in conversation and the
agent records it.

Revised 2026-09-19: previously "With evaluation disabled or outside its
envelope, the requested command uses the kernel level. In shadow mode the
developer still decides. In calibrated route mode section 10 may convert a
Consequential escalation into a queued agent decision or a capture." That
described the superseded design, where shadow was the default and only a
passing calibration let any draft reach the agent; the developer's benchmark
showed that gate never opened (0 of 12 agent-expected drafts routed to the
agent). The evaluator is no longer something a draft can fall "outside": it
always measures a Consequential draft, from one source or the other, and
"capture" is no longer an automatic evaluator outcome, only something the
agent may still choose to do with what the measurement told it.

### Capture and promotion

A backlog item is work the Agreed requirements already cover. After Done, the
agent may promote one backlog item by a Consequential decision. Promotion,
roadmap change and successor start form one recoverable transaction, and the
new roadmap section may name only Agreed requirements. A next-feature item waits
for the developer. Defect items are fixed before promotion.

Model-recommended capture is fallible. Cairn does not claim a passing mechanism
proves a captured change unnecessary. The item remains visible, the frozen
requirements remain binding, and the adversary can challenge the omission.

### Review and evidence

The builder answers the fixed questions and lists findings. The adversary
attacks every answer and lists its own findings. Each finding is resolved or
developer-disputed, and the adversary examines every post-report realization at
the final tree. Receipts live on the log; ignored output lives in
`.cairn/output/` and is addressed by digest.

## 9. Self-evaluation and one adversarial review

The loop takes the builder's word at three points: that a falsifier is
observable, that a mechanism failed for the right reason, and that a change
makes its falsifier unreachable. The builder records claims at each point; one
adversary attacks them at Done.

### Builder claims

Each question is answered `observed` with a command, path or output, or
`not-checked`. The kernel checks coverage and shape, not truth.

- Q1, per mechanism: which violating example failed the check, which fail
  receipt records it, and what the check printed.
- Q2, per mechanism: why that failure was the stated violation rather than a
  setup error.
- Q3, per implemented requirement: why its falsifier is now unreachable.
- Q4, per implemented requirement: what else the change touched that no check
  covers.
- Q5, per commitment: what could still be wrong while every check passes.
- Q6, per commitment: what was not tested.

### Brief and projection

When the review exists, wake names `report SLUG`. `cairn brief <slug>` writes a
brief record and renders the roadmap section, frozen requirements and
falsifiers, mechanism definitions, builder claims and findings, interface
obligations, exclusion manifest and brief digest.

Before any remote adversary starts, Cairn creates an **adversary projection**:
a materialized export of the reviewed workspace snapshot with every
`network_exclude` path and built-in credential path omitted. It contains no
`.git` directory, Git object store, host path, evaluator key, built-in credential
path, or command-output body. The built-ins are the credential patterns named
in section 2. The exclusion manifest names omitted
path classes and paths but never their contents. Experiments may initialize a
new throwaway Git repository inside the projection. Projection reads Git object
bytes, never live filesystem targets: it preserves safe relative symlinks as
link text without following them, and refuses absolute or out-of-tree symlinks,
special files and unresolved gitlinks.

A remote adversary receives only the brief and projection. Where the harness
can restrict the adversary's filesystem tools to that projection, the adapter
does so and denies the original repository and host paths. Where it cannot,
the brief names the projection as the only path the adversary may read and the
report records `boundary: unenforced`; Cairn does not refuse the report, because
no supported harness can confine a subagent and every configured adversary is
remote. A local adversary still receives the projection by default; the
developer may explicitly authorize broader local access. The report records the
projection digest, transport and whether the boundary was enforced.

This is a Cairn egress boundary, not an information-flow proof. It prevents
Cairn from directly sending excluded file bytes. It cannot detect a secret a
person or primary coding agent copied into ordinary prose, and it does not
govern normal Git pushes. The brief warns about that limitation.

### Adversary work

The agent starts an adversary with none of the builder's conversation context
and waits. For each mechanism (Q1 and Q2), the adversary tries to make it pass
without the behavior, make it fail for a setup reason, and find an input it
reads but does not declare. For each Q3 it tries to reach the falsifier with an
input. For each Q4 it finds touched paths the claim omitted. For Q5 and Q6 it
looks where the builder said not to. Every changed interface gets a caller-level
attempt whether or not the builder raised it.

`cairn report` refuses a report whose snapshot differs from the review, whose
brief or projection is stale, whose model or transport does not match the
brief record's own launch instruction, or which leaves a required question or
interface unattempted. The comparison reads the brief record, never the
report's own body. Where the harness reports the builder's model, the report
records it beside the adversary model. A matching model is recorded, not
refused: the developer chose the adversary model in settings.

### Post-report delta

Every fix after the report gets a resolution at a new workspace snapshot. At
acceptance the adversary receives the report, all resolutions since it, and the
entire cumulative delta from the reported snapshot to the current one. It
accepts or rejects each submitted resolution and may add a finding anywhere in
the delta, related to an old finding or not. New findings are resolved; the next
acceptance examines the cumulative delta again. Done requires the last
acceptance at the final snapshot. A resolution rejected twice for the same
finding escalates, and the three-round liveness bound in section 5 prevents an
unbounded stream of newly numbered findings.

### Model identity and limits of proof

Settings name the exact adversary model each harness accepts and whether it is
local or remote. `cairn brief` detects the harness adapter from its environment or `--harness`. `cairn
brief` passes the model string through; it never maps aliases. A null or unknown
entry means any model and any transport, subject to the projection boundary;
`cairn brief` prints this state explicitly, as `model: any` and `transport:
any`. The report records the actual model and transport. Where a harness
reports session identity, the report refuses the session that wrote the review.

The kernel cannot prove that a reported model has different blind spots, or
that a human did not relay extra context. The report's shape, model field,
session evidence, brief digest and isolated projection are the available
evidence.

The cost is one adversary per commitment plus bounded acceptance rounds. A
mechanism that passes without the behavior may survive until Done; the
fail-receipt rule and Q1 output reduce, but do not remove, that gap.

## 10. The evaluator: a composite measurement at Consequential

At a Consequential decision the agent drafts its choice. The evaluator is a
measurement the agent takes of that draft to check its own judgment before it
decides. It is not a second decision-maker, an advisor the agent must obey, or
a review queue: the agent still decides, informed by the measurement, except
at the narrow floor below, when a veto fires, or when the agent itself chooses
to escalate after reading the measurement (section 5). Code owns every
authority boundary in both measurement paths this section defines below.

Revised 2026-09-19: this section previously ran up to two model calls per
draft, an option-gate Noul cascade and then a separate owner Choice call, and
defaulted to shadow mode, where authority never left the developer even when
every gate passed. `.superpowers/bench/results.md` ran that design live: 0 of
12 agent-expected drafts reached the agent, because the `sufficient` gate
alone rejected every one; the developer called this ritual assent and said
the evaluator's point was "to give the coding model a gut check or additional
evaluation capability to be able to measure the decision." This revision
replaces the gate cascade with the composite scoring in
`.superpowers/bench/composite-design.md` (0.895 route accuracy in the same
benchmark), makes the agent's own judgment, checked by the measurement, the
decision by default, and adds a second measurement source so the design still
works with `typesafeai.enabled: false`, which is what the developer wants
"to be able to use Cairn in an autonomous benchmark."

### The narrow floor

Before any call, code checks a floor that needs no model judgment: a draft
whose recommended option would change an Agreed requirement's text or its
falsifier, would change the working agreement, or touches data that cannot be
regenerated routes to the developer without a call. Reserved and
protected-path writes, the fourth-attempt rule and scope rulings are
unaffected: they are already enforced by section 2 and section 5 independent
of this floor, so narrowing the floor to these three does not relax them.

A draft code cannot build a request for also gets no call: a missing
recommendation, an incomplete authority projection, a request over
`request_cap_bytes`, a failed call, or an invalid answer route to the
developer as `unavailable <class>`.

### Score dimensions and the composite

One request per draft answers all five Score questions below, each naming a
concrete state field. `evidence` and `ambiguity` read the whole draft;
`reach`, `contract` and `surface` read only the recommended option,
`draft.options[draft.recommendation]`.

| Dimension | State field | Levels 0-4 |
|---|---|---|
| evidence | `draft.because` | 0 none; 1 a claim; 2 names a command or file; 3 quotes output or a diff; 4 quotes output and names the test that fails and the falsifier it maps to |
| reach | recommended `draft.options[n]` | 0 wording or message text; 1 internal structure, nothing visible; 2 behavior inside an agreed requirement; 3 output or flags existing callers depend on; 4 data that cannot be regenerated, a migration, or a rewrite of user files |
| contract | recommended `draft.options[n]` | 0 implements the cited requirement as written; 1 chooses between readings the text allows; 2 adds behavior no requirement names; 3 conflicts with a cited decision; 4 changes a requirement's text or falsifier |
| surface | recommended `draft.options[n]` | 0 no new surface; 1 a new file or module; 2 a new flag or output; 3 a new dependency; 4 a network call, credential, or external service |
| ambiguity | `draft.question` | 0 one reading, the draft names it; 1 two readings, the draft picks one with a reason; 2 two readings, no reason; 3 the question asks the developer to choose a policy; 4 the question cannot be answered without facts the draft lacks |

Code, not the model, computes what happens next from the five levels and
confidences:

- Veto: `reach >= 4`, `contract >= 3` or `surface >= 3` on the recommended
  option forces the developer regardless of weights; the three are checked
  in that order and the measurement records which one decided it. The floor
  above is code-certain and needs no call; the veto is what the model
  itself flags after scoring, so the two catch different risks and neither
  substitutes for the other.
- Otherwise, composite is the weighted mean of the five levels over 4, with
  evidence counted as `(4 - level)` so more evidence lowers the composite:
  `composite = sum(weight_d * level_d / 4)` over evidence, reach, contract,
  surface and ambiguity.
- The composite feeds one suggestion, `suggested: agent | developer`:
  `agent` when `composite <= agent_ceiling` and every dimension's
  confidence meets its `confidence_floors` entry, `developer` otherwise.
  The suggestion is advisory, not a route: only the floor above and a veto
  force the developer. In every other case the agent decides, informed by
  the suggestion and the five raw levels beside it, and the agent may still
  escalate toward the developer at its own judgment after reading the
  measurement, whatever the suggestion says.
- `weights`, `agent_ceiling` and `confidence_floors` live in
  `typesafeai` settings and in the policy digest (section 2); a change to
  any of them resets calibration.
- The decision record names the measurement and the agent's own decision
  beside the suggestion it read, so an autonomous run is scored on where
  the two agree or disagree.
- The five raw levels, their confidences and the suggestion are the
  evaluator assistance the agent sees; none of them is a verdict, which is
  decision 51's original transparency intent carried into the composite it
  once excluded.

### Two sources

The measurement comes from one of two sources, chosen by settings, both
answering the same five dimensions in the same shape:

- `jev`: when `typesafeai.enabled`, `bin/typesafeai.mjs` is the one file that
  sends the request. It reads `TYPESAFEAI_API_KEY` from the environment and
  never stores it. It retries a `408`, `429` or `5xx` response up to two
  extra attempts, with exponential backoff from a 500ms base capped at 5s
  and 25% jitter, honoring a `Retry-After` response header capped at 60s;
  every request carries a default timeout, classified as its own failure
  class distinct from a network failure. A request that exhausts its
  retries or times out is one failed call, `unavailable <class>`, never a
  silent retry past that bound.
- `review`: otherwise, the agent starts the harness's configured review
  model, the adversary model named in `settings.harness` for the running
  harness, exactly as `cairn brief` starts the adversary: through the
  harness, with none of the agent's own conversation context, answering the
  same five dimensions in the same shape as `jev` would. The launch
  instruction and the resolved model are recorded the way a report already
  records them. When no harness can be detected, the draft is
  `unavailable <class>` and routes to the developer like any other
  technical no-call.

State sent to either source carries no policy prose: every question in the
table above names one concrete field, never a paraphrase of a setting or an
explanation of what a route means.

### State sent to the model

The draft is unchanged: `D := <commitment, concerns, question,
recommendation, because, if_wrong, instead, options, named_paths,
cited_decisions>`. The measurement state is `M(D) := <D's five narrative
fields, every option's text with the recommended option and its code, C(c),
A(D)>`, where `C(c)` is the start keystone, commitment and glossary, frozen
requirements, and developer-written cited decisions (`by: developer`), and
`A(D)` is the closed JSON authority projection of validated IDs, enums,
booleans and counts the old owner call used. Beyond `D`, `C(c)` and `A(D)`,
no agent prose, code, paths, outputs, findings or agent-authored ADR bodies
reach either source: a cited decision the agent wrote reaches the call only
as an id and a read flag in `A(D)`, whether or not the developer has read
it. The five narrative fields are untrusted; the floor and veto run on code-
known facts and on the model's own dimension answers, never on prose the
model was asked to trust. If `A(D)` is incomplete, no call occurs (the
narrow floor's technical case above).

Revised 2026-09-20: previously the recommended option only. The committed
live run through `cairn measure` (tests/bench/results.md) showed the losing
options' text is what lets the model separate reach, contract and surface
(22/24 against 16/24 before the change; an isolated in-tree experiment
measuring this change alone scored 21/24), and the options are part of `D`,
so no new class of input reaches the model.

The recommended option's code is the snapshot's action-lease diff and
complete touched files in path order; reads do not follow symlinks. The
input identity is `(workspace tree, log head, ADR digest, draft digest,
settings digest)`, anchored by a workspace snapshot. Equal identity and
policy digest must yield byte-identical requests to either source; answers
may differ.

### Limits and failure

`jev-1.13.0` permits 64k request tokens and 32k for state plus the longest
question; the kernel enforces `request_cap_bytes`, estimates three bytes per
token, and refuses above 75% of either limit before sending. The review
source's request is the harness's own message; the no-policy-prose and
named-field rules above still bind it, and Cairn does not separately cap its
size beyond the state it sends.

Requests omit `network_exclude`, credential and host bytes, keys and command
output regardless of source. A would-be inclusion is not sent; only
`unavailable excluded` and its path class are recorded.

Every measured draft gets an intent before any call; the intent precedes
network I/O and fixes request digests, so a crash can be recovered (section
4). Each attempted call records its digest, resolved model, raw outcome,
parsed answer and usage before routing. An unknown crash outcome becomes
`indeterminate`, is not retried, and routes to the developer.

### Record and calibration

The final measurement names its intent and call, the five dimension levels
and confidences, the computed composite, which veto if any fired, the
suggestion and the reason. The resulting record points back to both.

There is one operating mode, not a live/shadow choice: the agent always
decides, informed by the measurement, except when the floor or a veto forces
the developer; the measurement record is what makes an autonomous run
scoreable afterward. The developer labels a recorded measurement's outcome
`agent`, `developer` or `unknown`; only the first two calibrate. Calibration
data comes from live records alone: the measurement's suggestion, the
agent's own decision, and the developer's later label when one exists.
`developer: absent` does not change any of this; it only removes the
developer as a destination once the floor or a veto names one (section 5).

The policy digest covers model, schemas, questions, request construction,
the narrow floor, the veto rule, `weights`, `agent_ceiling`,
`confidence_floors`, caps and egress; a change to any of them resets
calibration. `cairn calibrate` uses matching valid measurements labelled by
the developer. Its denominator is labelled cases whose suggestion was
`agent`; a false downgrade is one the developer labelled `developer`. The
one-sided 95% exact binomial upper bound on the false-downgrade rate is a
kernel constant, not a setting, fixed at 5%; the sample floor is
`min_calibration_agent_predictions` (default 60) predicted-agent cases.
Calibration tunes `weights`, `agent_ceiling` and `confidence_floors`; it does
not gate whether the agent may decide, because gating live routing behind a
calibration pass is what produced zero agent routing under the superseded
design. Supersessions are not labels.

Revised 2026-09-19: previously "Unread Consequential decisions at Done
disable the evaluator next commitment until read, routing every draft to the
developer without editing settings." Removed: there is no off switch in this
design and nothing routes; section 5's Done rule already holds an unread
Consequential decision for the developer before the next commitment can
open, so the evaluator needs no second lock.

### Falsifiers

The contract is falsified by: a missing measurement, prior intent or call
record for a measured draft; untrusted state reaching either source; policy
prose, rather than a named state field, reaching a question; nondeterministic
requests at equal identity and policy digest; an `agent` suggestion or a
`developer` suggestion treated as anything but advisory; an agent decision
on a draft the narrow floor should have caught; an agent decision on a draft
carrying a veto; a composite computed anywhere but code, from anything but
the recorded dimension levels; a retried or invented ambiguous result; Cairn
egress of excluded bytes to either source; an accepted protected
realization; or a calibration record whose denominator is not cases whose
suggestion was `agent`.

## 11. Distribution

Cairn ships as one plugin: the command, hooks, four skills (`install-cairn`,
`new-project`, `existing-project`, `next-feature`) and the optional evaluator
module. Claude Code, Codex and Muse manifests share one version. The skills also
install through the skills CLI. The runtime is Node and Git, with no build,
package dependency or service. Linux and macOS are supported.

The evaluator is opt-in and makes zero, one or two POSTs per admitted draft from
one file. The adversary is started through the current harness, subject to the
projection boundary. Two durable refs travel to one confirmed authority remote;
the action lease, transaction staging and cycle counter remain local.

How this repository develops and releases Cairn, including its attribution
check and source-size norms, belongs in its own roadmap rather than this product
specification.

## 12. Removed from 1.x

- The record directories `.cairn/evidence`, `.cairn/reviews`,
  `.cairn/escalations`, `.cairn/backlog`, `.cairn/next-iteration`,
  `.cairn/stops`, `.cairn/queue`, `docs/decisions/`, `docs/commitments/` and
  `docs/audit`. Records are a log ref plus one ADR JSONL file.
- The autonomy and former Jev modes that were Agreed but never built.
- Stop-hook refusal, refusal counts, stop records and `explain`.
- The `Escalate` verdict and `present` action. Waiting prints the recorded fields
  without an agent paraphrase.
- Markdown record parsing, findings sweeps and record formatting rules.
- Copying report findings into a review by number. A resolution references the
  exact source record and finding number.
- A second full report after fixes. Cumulative acceptance replaces it.
- `Revised <date>` history paragraphs inside requirement blocks. Git is history.
- Agreement by promotion. Promotion never Agrees text.
- Decision files at Judged and reversals as an authority label.
- The `reword` action. Attribution is checked at release.
- Kernel release digests as receipt freshness inputs. Schema and declared
  execution identity replace them.
- Command output in Git.
- Naked tree OIDs as durable code references. Typed snapshot commits replace
  them.
- Commit SHAs of the working branch as evidence identity. The branch remains
  rewriteable.
- The shared in-progress/check-lock slot. The action lease and check lock are
  separate.
- Terminal output such as "queue printed" as a completion condition.
- Free-form Git trailers as an authority-bearing serialization.
- The evaluator's composite score, weights and configurable code tiers.
- Product requirements for this repository's release process, attribution
  policy or kernel line ceiling.
- Requirements that expose a kernel internal instead of observable behavior.
  Their identifier-by-identifier cut list is produced with the v2 requirements.

## 13. Decisions in this draft the developer may reverse

1. A defect against the current commitment's requirement is worked, not
   captured.
2. Hooks prompt and never block or write.
3. The kernel has two decision levels; guidance may describe four.
4. `next-iteration` is renamed `next-feature`, including its item kind and flag.
5. Cairn 1.x records are not read; migration happens at a v2 Done.
6. Command output is ignored local data; a receipt can be current without it.
7. This repository develops v2 on its v2 branch and archives 1.x at cutover.
8. One adversarial report per commitment, plus bounded cumulative acceptance;
   there is no per-spec, per-mechanism or per-commit report.
9. Promotion never Agrees text and promotes one backlog item at a time.
10. Verdicts are Resolvable, Waiting and Done; Waiting alone is the developer's
    turn.
11. The developer answers in conversation and the agent records the answer
    with `cairn answer`, `cairn decisions --read` and `cairn authorize`; a
    quoted answer with the harness and Git author is evidence, not
    authentication.
12. Global install makes the command link and hooks. Project initialization,
    not install, configures a repository.
13. The spec-phase self-review is performed but not recorded.
14. Non-decision records are commits on `refs/cairn/log`; decisions are
    canonical lines in `docs/decisions.jsonl`.
15. Code references are typed commits on `refs/cairn/snapshots`; the working
    branch may be rebased, squashed or amended.
16. The report is written once; resolutions and acceptances cover the cumulative
    post-report delta.
17. `docs/commitments/` is gone; a roadmap section and start/close records define
    a commitment.
18. The optional Jev evaluator applies only at Consequential and may make an
    option-gate call and a separate owner call. (Superseded by 53.)
19. `.cairn/settings.json` is the only settings file; the TypeSafe key is
    `TYPESAFEAI_API_KEY` in the environment.
20. The adversary model and transport are selected per harness and recorded.
21. Backlog items do not block Done; the next wake promotes at most one.
22. Wake is read-only. Start, done and other commands write state.
23. `cairn escalate` writes the evaluation route it selected; evaluation is its
    own intent/call/result chain.
24. Reading the queue is a developer-authenticated act.
25. The working agreement is protected and changes between commitments or after
    supersession.
26. Deterministic code establishes the evaluator envelope before model judgment;
    every gate fails closed. (Superseded by 54.)
27. Shadow is the evaluator default and route mode requires project-specific,
    policy-matched calibration. (Superseded by 55.)
28. Snapshot commits, not trailer text, keep code trees reachable.
29. The local action lease and check lock are separate and use compare-and-swap.
30. Reserved paths are kernel constants, not settings-derived exemptions.
31. A later declaration never legalizes an earlier observed scope breach.
32. A commitment may close by a superseded record with explicit carry-over.
33. Acceptance examines the whole cumulative delta and may create findings.
34. Realization checks the actual delta against protected categories.
35. Start freezes requirement-set membership and text digests.
36. Mechanism review binds to the exact definition digest.
37. Execution identity contains only declared, non-secret values; undeclared
    external state weakens freshness.
38. One authority remote is developer-confirmed; pushes are atomic when
    supported and safely ordered otherwise.
39. `network_exclude` bounds Cairn's model egress, not all network activity.
40. Developer-owned protected paths and kernel-managed mutable paths are
    different authority classes.
41. A superseded record names a transition and successor slug; the later start
    points backward to it, avoiding a future-SHA dependency.
42. Calibration is a first-class record bound to an evaluation-policy digest and
    uses a one-sided confidence bound over predicted-agent cases.
43. A remote adversary receives a Git-less, excluded-path projection; the
    report records whether the harness isolated it.
44. First-observed undeclared work is a log fact, so branch rewriting cannot
    erase it.
45. Evaluator intent precedes network I/O; calls are recorded separately and an
    ambiguous lost response fails closed without retry.
46. Authority-bearing records are canonical JSON in the commit body with a
    digest trailer; arbitrary strings never become trailers.
47. Input and workspace snapshots are distinct kinds and record schemas accept
    only the kind they need.
48. `cairn init` establishes settings, developer-auth mode and remote before a
    project enters the shared spec tail.
49. An active commitment's frozen contract is not amended; a contract change
    requires finish or supersession.
50. Administrative recurrence and acceptance rounds have fixed escalation
    bounds counted locally, and valid Cairn bookkeeping may not generate its
    own violation.
51. Composite option scores, weights and code tiers are absent; raw gate answers
    are the only evaluator assistance shown. (Superseded by 56.)
52. Only log and snapshots refs travel; the action lease remains local and
    cross-clone conflicts stop at leased push.
53. The evaluator measures every Consequential draft, from Jev when
    `typesafeai.enabled` or the harness's review model otherwise, in one
    composite-scored call, not an option-gate call and a separate owner
    call. Supersedes 18. The developer's reason: "the point was to give the
    coding model a gut check or additional evaluation capability to be able
    to measure the decision."
54. Code still establishes a floor and a veto that fail closed before any
    model judgment, but between them the agent applies one composite
    measurement itself; no gate cascade decides by elimination anymore.
    Supersedes 26. The developer's reason: "the goddamn evaluator was to
    reduce ritual assent."
55. Live composite measurement, not shadow, is the only mode; there is no
    `typesafeai.mode` setting, since the composite never withholds or
    grants authority for a setting to gate, and calibration data comes
    from those same live records, not a separate observation mode.
    Supersedes 27. The developer's reason: "the goddamn evaluator was to
    reduce ritual assent," and the recorded benchmark showed a shadow
    default plus a calibration-gated route mode produced zero agent
    routing at the shipped gates.
56. Composite option scores and weights are back, scored across five
    dimensions with a computed ceiling and confidence floors, because the
    raw-gate-answers-only design in 51 never let a draft reach the agent;
    `code_tiers` stays absent. The composite is advisory, not a router: it
    yields a `suggested: agent | developer` shown beside the five raw
    levels, only the floor and a veto force the developer, and the agent
    decides in every other case. Supersedes 51. The developer's reason:
    "The reason I wanted this design was to be able to use Cairn in an
    autonomous benchmark."

## 14. Next steps

1. The developer reviews this revision by invariant: authority, path ownership,
   record canonicality, evidence identity, snapshot kind, scope monotonicity,
   commitment exclusivity, adversary coverage, crash recovery, egress and
   liveness.
2. The requirements are derived from this document, each with a falsifier and
   observing mechanism, alongside the 1.x cut list.
3. The record commands and kernel are implemented against those requirements on
   the v2 branch.
4. A synthetic fixture that repeats administrative actions without semantic
   progress must trigger the cycle escalation no later than the twenty-eighth
   administrative transition, and a same-target fixture no later than the
   fourth occurrence.
5. At the first v2 Done, the 1.x line is archived and v2 becomes main.
