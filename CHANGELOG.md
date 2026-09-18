# Changelog

Every release is one tagged commit; the tag is v<version>, and
scripts/release.mjs cuts it, as docs/releasing.md describes. Versions
follow semantic versioning below 1.0: a patch changes no verdict,
record shape or document meaning; a minor adds or revises
requirements, verdicts or record shapes and still reads earlier
records; a major changes what earlier records mean.

## 0.7.0 - 2026-09-18

Five fixes the developer confirmed after asking what made Cairn a
frustration, and a raised kernel ceiling to give them room.

- The kernel ceiling is 2000 lines, raised from 1900 (PKG-004). The
  files under bin/ stood at exactly 1900, so every fix of the last
  twelve review rounds was paid for by trimming comment; the new
  ceiling leaves room to write the reader plainly.
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
  of never losing one (escalation loop-020).

## 0.6.0 - 2026-09-17

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

## 0.5.0 - 2026-09-17

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

## 0.4.0 - 2026-09-17

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

## 0.3.0 - 2026-09-15

- `cairn --version` prints the version from package.json.
- scripts/release.mjs cuts a release as one tagged commit, after
  checking the tree, the version, this file, the tag and the loop.
- This changelog, and docs/releasing.md.

## 0.2.0 - 2026-09-15

- Cairn installs as a plugin from a marketplace, in Claude Code and
  in Codex: the manifest, the marketplace listing and hooks/hooks.json
  register the session-start and stop hooks from the plugin.
- The second audit's remediation: the gates bind to the commitment,
  every record shape is read or repaired by name, the hooks find the
  kernel and the project, the lints and tests observe what they name,
  the documents say what the code does, and the verifiers' findings
  are closed.
- The kernel ceiling is 1600 lines.

## 0.1.0 - 2026-09-04

- The kernel, the four skills, and the hooks registered by hand.
