# Changelog

Every release is one tagged commit; the tag is v<version>, and
scripts/release.mjs cuts it, as docs/releasing.md describes. Versions
follow semantic versioning: a patch changes no verdict, record shape,
or document meaning; a minor adds or revises requirements, verdicts, or
record shapes and still reads earlier records; a major changes what
earlier records mean.

## 2.1.6 - 2026-09-22

- `cairn <command> --help` (or `-h`) prints that command's usage line and runs nothing. Before, the first argument was passed to the command, so `cairn push --help` pushed.

## 2.1.5 - 2026-09-22

- `cairn end` handles a `--touch` path that is a directory: the outcome compares the listing of files below it, before and after, instead of failing to hash the directory and leaving the touch unwritten.
- The working agreement tells the agent to run tools that rewrite `AGENTS.md` (GitNexus keeps a block there) with their skip option while a commitment is open, or to restore the file; such a rewrite is a scope breach on a protected path, not a Cairn defect.
- The command at `~/.local/bin/cairn` is a shim, `bin/cairn.sh`, that runs the newest installed Cairn at run time: `$CAIRN_ROOT` when set, else the newest Claude Code or Codex plugin cache entry or the checkout at `~/.local/share/cairn`, by version. A symlink into a versioned plugin cache was stranded by every marketplace update. `/install-cairn` installs the shim, replacing only a symlink an earlier Cairn made or an older shim; the hooks print the one command that installs it when they find a stale `cairn`, and still write nothing.

## 2.1.4 - 2026-09-22

- While a scope breach's own escalation is unanswered, wake says Waiting and prints it, instead of naming `scope PATH`. Scope outranks Waiting so that an unrelated escalation cannot hide captured work, but when the open escalation is about that breach the developer's answer is the next step; naming scope read as "act now" and produced a second escalation.

## 2.1.3 - 2026-09-22

- A refused kernel write no longer escalates on its own. It names the violation it would create and its cause, tells the agent to resolve that and run the command again, and counts as one administrative occurrence toward the cycle bounds; the fourth refusal of the same write, or the twenty-eighth administrative transition, writes the one cycle escalation, which now says what was refused and why. Before, every refusal wrote a "the loop is cycling" escalation and cost the developer an answer (spec section 5, "Waiting and liveness", revised on the developer's ruling).
- The liveness guard skips Waiting when it looks for the first violation a kernel write would create. An open cycle escalation used to outrank and hide a record violation, so the same refused declare went through once the escalation existed.
- Wake names `commit docs/decisions.jsonl` whenever the decisions file has uncommitted lines, including under a gitignored `docs/`; the kernel appends it and never committed it, and nothing said so.
- A fail receipt in which another requirement of the same commitment also failed is not an attempt: a requirement whose gate includes its siblings' falsifiers no longer burns three attempts and an escalation while they are being fixed (spec section 5, "Deferral and attempts").
- The hooks print the exact `ln -sfn` command that fixes a stale `~/.local/bin/cairn` link.
- The working agreement says that `docs/decisions.jsonl` is appended but not committed by the kernel, so the agent commits it with its next commit, and that a path must be committed or leased before a declaration covers it.

## 2.1.2 - 2026-09-22

- The existing-project skill migrates a Cairn 1.x project: on the developer's ok it removes the 1.x record directories (Git history keeps them), converts the specification in place until `cairn lint docs/spec` is clean without changing a requirement's words, keeps each 1.x mechanism's command for the declare step, and after `cairn init` files one item record per 1.x item. Spec section 3, the diagram and the manual say the same.

## 2.1.1 - 2026-09-22

Fixes from the first project run on 2.1.0; no record shape change.

- `cairn start` and `cairn authorize` work when `docs/` is gitignored: the branch write lists ignored paths and force-adds them. Before, the commit failed with "pathspec did not match" and the transaction needed `cairn recover`.
- The hooks compare the `cairn` they find with the plugin's own version and use the plugin's copy on a mismatch, printing one line that says so. A marketplace update used to leave the old `~/.local/bin/cairn` link running the old kernel.
- Wake prints full record SHAs in its reasons, since every command that takes one refuses a prefix.
- Attempts are counted from the open commitment's start record. The fail receipts that bind mechanisms during the spec phase no longer count, so a requirement no longer escalates on its first real attempt (spec section 5, "Deferral and attempts", revised).
- `cairn check` says why a per-requirement result is unverified: the exact line it expected and the output lines that name the requirement.
- The liveness refusal on a kernel write names the violation it would create, not only its class.
- `cairn --version` prints the version.
- `cairn scope <breach-sha> keep` now accepts the escalation `cairn escalate` writes. It looked for a concern spelled `scope-breach:<sha>`, which the concern parser refuses, while the parser and the command store `breach:<sha>`; no keep written through the command line could ever succeed. The refusal names the `breach:<sha>` token, and the manual shows the flag. Found by a project running 2.1.0 (reported 2026-09-22).

## 2.1.0 - 2026-09-21

The developer is never asked to run a command.

- The agent asks in conversation and records the answer. Escalations, decision reads and authorizations are answered in the developer's own words; the agent quotes them: `cairn answer <slug> ok|instead|ask --quote "<words>"`, `cairn decisions --read <id> --quote "<words>"`, `cairn authorize --quote "<words>"`. No choice widget: a sentence and a wait is the prompt.
- Attested evidence replaces the terminal confirmation. With `signing_key: null`, a developer-only record holds the quoted words, the harness name (`claude_code`, `codex`, `muse` or `none`) and the Git author; Cairn says "evidence, not authentication" wherever it reports it. The kernel never opens a terminal. Records written by 2.0.x with `unsigned-local` evidence still read.
- `cairn authorize instead|ask --quote "<words>"` writes a `direction` record, a new kind that keeps the developer's change request or question in the log and binds nothing.
- `cairn init` takes its former questions as flags: `--remote <name>` or `--local-only`, `--signing-key <path>` or `--attested`, `--adopt <digest>` for settings that exist without refs, and `--quote`. It refuses, naming the flag, when an answer is missing.
- Spec revision 6, the working-agreement template, the three skills, the manual, the README and the diagrams say the same thing.

## 2.0.2 - 2026-09-20

Documentation; no kernel change.

- README: a full section on the evaluator under "What Cairn does": the five dimensions, the two sources, jev set up in three steps, what the agent sees, what can go wrong and who decides.
- Manual: a Settings reference listing every key in `.cairn/settings.json` with its default and meaning, and "Turn on the TypeSafe evaluator".
- Mermaid versions of the six process diagrams in the manual, and the work loop in the README, rendered by GitHub; the Graphviz sources stay under docs/diagrams.
- The work-loop diagram shows the measure step at a Consequential decision, the floor-or-veto branch, the agent's own decide, and exit 4 when the developer is absent; the old routing sentence is gone.
- The kernel spec carries a Prefix header and a spec map, so `cairn lint docs/spec` is clean on this repository.

## 2.0.1 - 2026-09-20

Documentation and install fixes; no kernel change.

- Codex: ship `.agents/plugins/marketplace.json`, the manifest Codex reads a marketplace from, so `codex plugin marketplace add eas4ai/cairn` and `codex plugin add cairn@cairn` work as the README says (proven against the public repository with Codex 0.155.1).
- Muse: the install text follows the official Muse Code docs: `muse plugins install <checkout>`, per-hook approval with `muse plugins approve cairn:hook:session-start` and `cairn:hook:stop`, `muse plugins update cairn` to refresh; no experimental flag.
- Skills CLI: `--agent universal` installs into the project's `.agents/skills/`, which Muse reads; with `--global` it goes to `$HOME/.config/agents/skills`, which Muse does not.
- README: the link to the 1.x video is gone; "Cairn calls no AI model on its own" now names the TypeSafe evaluator as the exception; Claude Code updates with `claude plugin update cairn@cairn`.

## 2.0.0 - 2026-09-20

Cairn 2 is a rewrite of the kernel. It keeps the seven ideas that
matter (agreement by falsifier, one commitment at a time, checked
evidence, freshness, independent review, captured scope, developer
authority over the contract) and replaces almost everything else. A
1.x project is not upgraded in place; see the note at the end of this
entry.

- **The kernel reads and writes Git records, not markdown files.**
  Evidence, reviews, escalations, decisions, and every other durable
  fact are now commits on `refs/cairn/log` and `refs/cairn/snapshots`,
  two refs local Git history never touches. Each record is a canonical
  JSON object in an empty commit's body, with a schema and a digest
  trailer. Nothing under `.cairn/evidence`, `.cairn/reviews`,
  `.cairn/escalations`, `.cairn/backlog`, `.cairn/next-iteration`,
  `.cairn/stops`, `.cairn/queue`, `docs/decisions/`, `docs/commitments/`,
  or `docs/audit` exists any more. Decisions live in one file,
  `docs/decisions.jsonl`, appended one canonical JSON line at a time.
  `cairn show <sha>` prints any record with its references resolved.
- **Hooks only read and print.** The session-start, per-turn, and stop
  hooks print the current verdict and never refuse a stop, count
  refusals, write a file, commit, or call a model. The working
  agreement in `AGENTS.md` is what an agent follows either way; a
  harness without hooks is unaffected.
- **The evaluator is the agent's gut check at a Consequential decision.**
  `cairn measure` scores a draft on five dimensions -- evidence, reach,
  contract fit, new surface, ambiguity -- from `jev`
  (`typesafeai.enabled: true`) or, otherwise, the harness's own review
  model started with none of the agent's context. Code computes a
  composite and an advisory `suggested: agent | developer` from the five
  numbers; the agent decides either way, except at a fixed code floor
  (an Agreed requirement, the working agreement, or unrecoverable data)
  or the measurement's own veto, which always go to the developer. There
  is no shadow mode and no off switch: every Consequential draft is
  measured, because a shadow default that never let a draft reach the
  agent was tried and measured at zero agent routing out of twelve
  expected cases.
- **The action lease is explicit.** `cairn begin <action> <target>`
  claims a declared input before you change it and prints a lease sha;
  `cairn end --lease <sha>` releases it after the commit, so a stale
  end can never close another session's lease. `cairn begin --touch
  <path>` declares a new file for the life of the lease.
- **A project is initialized with `cairn init`,** which did not exist
  in 1.x. It creates or adopts `.cairn/settings.json`, asks you to
  confirm one authority remote or explicit local-only operation, asks
  you to choose a signing key or accept unsigned-local evidence, and
  creates the two durable refs. `cairn authorize` binds the final
  digests of the specification, the working agreement, and settings
  in one record; `cairn start` checks that authorization before it
  opens a commitment.
- **Commands renamed or removed.** `next-iteration` is `next-feature`
  everywhere: the skill, the item kind, and the flag. `reword` is
  gone; attribution is checked once, at release, by
  `scripts/release.mjs`, not by a per-commit kernel command. `explain`
  and the stop record it answered are gone, because the stop hook no
  longer refuses a stop. `cairn --version` and `cairn --root DIR` are
  gone; run commands from the project root. `cairn check` no longer
  takes a `--stale` flag; run `cairn wake` to see which requirement
  needs a check. See `cairn --help` for the exact command and flag
  surface v2 ships.
- **New commands for the record kinds 1.x did not separate.**
  `cairn declare` writes a mechanism definition explicitly.
  `cairn scope <breach-sha> keep|restore` disposes of a scope breach.
  `cairn item --backlog|--next-feature|--defect` replaces 1.x's
  separate `backlog` command and next-iteration file. `cairn decide`,
  `cairn realize`, and `cairn dispute` manage the decision record
  explicitly. `cairn brief`, `cairn report`, `cairn resolve`, and
  `cairn accept` write the review chain one record at a time, in place
  of hand-edited markdown review and report files.
- **Snapshots, not commit SHAs, are the code reference.** A workspace
  or input snapshot is a commit on `refs/cairn/snapshots` whose tree
  is the exact bytes a record refers to; the working branch stays
  rewriteable (rebase, squash, amend) without invalidating any record
  that names one.
- **One adversarial report per commitment, with bounded cumulative
  acceptance,** replaces 1.x's independent-report-per-commit and
  finding-format rules. There is no more `findings:` list grammar to
  get wrong: `cairn report` and `cairn accept` take a file and record
  it.

Upgrading: a 1.x project's records are not read by v2. Migration is a
manual step at a v2 Done, described in the working agreement of the
project doing the migration; it is not part of the kernel.

## 1.x

Every release below shipped as Cairn 1.x, described in the 1.x
documentation. Copied here verbatim for history; 1.x behavior is not
current in this checkout.

### 0.7.0 - 2026-09-18

Five fixes the developer confirmed after asking what made Cairn a
frustration, and a raised kernel ceiling to give them room.

- The kernel ceiling is 2000 lines, raised from 1900 (PKG-004). The
  files under bin/ stood at 1900 on the day it rose, the whole of the old
  ceiling, so no change to the kernel could add a line without removing
  one; the new ceiling leaves room to write the reader plainly.
- The working agreement no longer promises something the loop refuses. A
  heading whose title names findings is refused whatever the record's
  `findings:` list holds, and AGENTS.md and the project template now say
  so; put elaboration under a heading that does not name findings. A
  reviewer briefed from the old text wrote a report the loop rejected
  (LOOP-020).
- `reword` yields to `explain`. Both PKG-045 and LOOP-139 claimed the
  slot ahead of every action but a live check, so a commit that was both
  unexplained and attributed broke one of them whichever the wake named.
  PKG-045 now says it comes after explaining a stop record, which is what
  the kernel already did; the attribution is named on the next wake
  (PKG-045).
- A defect an Agreed requirement already forbids is captured with
  `cairn backlog --defect` and worked under the current commitment:
  wake names `fix <item>`, and the item carries its fixing commit.
- A mechanism declaration may list `documents:`. A change to one of
  them leaves the commitment's review current, so a documentation edit
  costs a check and not a review round. The release script accepts an
  uncommitted CHANGELOG.md and commits it with the release.
- A revised requirement outside the current commitment no longer blocks
  it: the mechanism review the revision asks for is named for the
  commitment's own requirements.
- A project may forbid AI attribution in its own commits. With
  `attribution: forbidden` in `.cairn/policy`, wake names
  `reword <sha>` for an unpushed commit whose message carries it.
- No commitment is Done on the builder's review alone. An independent
  report, written by a reviewer with none of the build's context, sits
  at `.cairn/reviews/<slug>.independent.md`, names the same commit as
  the review, and every finding it raises is answered on one line of
  the review. More than thirty review rounds of this feature hardened
  the record reader, and its rule is now one sentence: a line that says
  `open:` or `resolved:` is a finding wherever it sits in the record,
  whatever marks it up, and only the findings list's own lines are
  exempt. Markers, labels, tags, table cells, headings and fences are
  markup, not cover. A fence still keeps a quoted field out of the
  metadata, as LOOP-071 asks, but hides no finding, because pairing
  fence markers cannot be told from prose that begins with one.
  Limits are recorded rather than hidden: a finding written as ordinary
  prose under a heading that does not name findings is read as a note
  (escalation loop-020-loop-086), a heading whose title names findings
  is refused even when every finding is listed, and an honest line that
  begins with the prefix outside the list is refused, which is the price
  of never losing one (escalation loop-020-2).

### 0.6.0 - 2026-09-17

- The stop hook no longer lets a stop through because the harness says
  it already refused once; that let an agent quit by ignoring one
  refusal. It refuses while the agent can act (PKG-018).
- The stop hook judges with the kernel that wrote the latest evidence
  when that kernel is on disk: the command on PATH, the link, the
  project's own bin/cairn.mjs, or its own. A newer checkout's receipts
  are no longer called stale by an older command on PATH (PKG-033,
  PKG-021).
- The refusal says that an agent that cannot act raises an escalation
  and stops (PKG-044).
- After three refusals of the same verdict in one session with nothing
  committed or edited in between, the fourth stop goes through: the
  harness shows the developer a message naming the verdict, and the
  hook writes a stop record under `.cairn/stops/` (PKG-043).
- The wake names `explain <path>` for a stop record with no
  `Explanation:` line or not yet committed, ahead of every action but
  waiting for a live check (LOOP-139). The working agreement has the
  move.
- Specified, not yet built: autonomous mode and Jev mode
  (docs/spec/autonomy.md, AUTO-001 to AUTO-018). The kernel ceiling
  is 1900 lines (PKG-004).

Upgrading: nothing is rewritten. Copy the template's `explain` move into
a project's AGENTS.md when it is next written. The hook keeps its
refusal count in the Git directory, so a fresh clone starts at zero. The
kernel changed, so every mechanism re-runs once.

### 0.5.0 - 2026-09-17

- A file Git does not track is no longer a change under way: a draft,
  report or image dropped under a declared folder does not make the
  wake name `record`, so it cannot hold a session at the stop hook.
  `cairn check` still refuses to record evidence while one sits in a
  declared input, and now says it can go in `.gitignore` (LOOP-110).
- The stop hook gives way once it has refused: when the harness reports
  that the stop was already blocked (`stop_hook_active`), the hook
  prints the verdict and lets the agent stop (PKG-018).
- `cairn check --stale` holds back a mechanism whose requirement has
  three attempts and no escalation since, and names the requirement to
  escalate, instead of recording a fourth attempt (LOOP-094, DEC-016).
- The working agreement says a report, audit or review the agent did
  not write is not work under way: its findings are captured to the
  backlog, or to next-iteration when the fix would change Agreed text,
  and the report is committed with them (LOOP-138). Copy the template's
  new sentence into a project's AGENTS.md when it is next written.

Upgrading: nothing is rewritten. The kernel changed, so every mechanism
re-runs once, and a revised requirement asks for its mechanism review
before its next check (LOOP-059).

### 0.4.0 - 2026-09-17

- `cairn decide --decided-by` takes `developer`, `agent` or `joint`,
  case-insensitively, and stores the value lowercase. Any other value is
  refused; name the person or tool in `--body` instead. `cairn reversals`
  counts one decider once and reports a value it does not recognize as
  `unrecognized: <value>` rather than dropping it (DEC-020).
- The wake names a decision record as a repair when its `Realized by`
  section holds `(none yet: recorded, not built)` above a commit that
  resolves: the record says it was never built directly over the commits
  that built it (DEC-021). A section holding the placeholder alone is
  unchanged, and a shallow clone still gets its own repair.
- Cairn installs in Muse from `.muse-plugin/plugin.json`, with one hook
  entry file per hook under `bin/hooks/`.
- Eight kernel defects found by a code review of the kernel, each a
  new requirement with its own test:
  - A field line that carries a value followed by `- item` lines keeps
    the value as the first item instead of dropping it (LOOP-133).
  - The footprint's walk through roadmap history reads `Current:`
    through the same fence-stripping reader the wake uses, so a fenced
    example never moves where the commitment began (LOOP-134).
  - While an escalation waits for the agent's reply to an `ask`, an
    answer shaped as the developer's (`ok`, `instead`, `ask`, any case)
    is refused instead of being stored as the agent's reply (LOOP-135).
  - The hooks name a working directory that does not exist or is not a
    directory, a Muse hook entry whose shared hook cannot start prints
    one line and exits 0, and the walk to the Git toplevel ends by
    construction when the toplevel is `/` (PKG-041).
  - `cairn supersede` accepts only a record slug that exists under
    docs/decisions/ and refuses a record already superseded (DEC-022).
  - Evidence receipts record the full commit identifier; receipts with
    the short form are still read (LOOP-136).
  - The wake resolves every `Realized by` entry through one `git
    cat-file --batch-check` call instead of one process per entry,
    and still reports an ambiguous identifier (DEC-023).
  - A git that cannot be started is one line on stderr and exit 3 from
    every command, never a verdict or a receipt (LOOP-137).
- The release script reads a version field in any JSON spacing, so a
  compact manifest no longer blocks a release (PKG-042).

Upgrading a repository that already holds records: existing records are
never rewritten, and nothing is lost. Two things change on the first
wake. A record whose placeholder survived its realization is named as a
repair, one record per wake, until each placeholder line is removed. A
decider outside the three words is refused the next time a decision is
written, and until then it is reported as unrecognized rather than
counted as one of the three. The kernel changed, so every mechanism
re-runs once, as it does at any upgrade.

### 0.3.0 - 2026-09-15

- `cairn --version` prints the version from package.json.
- scripts/release.mjs cuts a release as one tagged commit, after
  checking the tree, the version, this file, the tag and the loop.
- This changelog, and docs/releasing.md.

### 0.2.0 - 2026-09-15

- Cairn installs as a plugin from a marketplace, in Claude Code and
  in Codex: the manifest, the marketplace listing and hooks/hooks.json
  register the session-start and stop hooks from the plugin.
- The second audit's remediation: the gates bind to the commitment,
  every record shape is read or repaired by name, the hooks find the
  kernel and the project, the lints and tests observe what they name,
  the documents say what the code does, and the verifiers' findings
  are closed.
- The kernel ceiling is 1600 lines.

### 0.1.0 - 2026-09-04

- The kernel, the four skills, and the hooks registered by hand.
