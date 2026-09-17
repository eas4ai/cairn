# Changelog

Every release is one tagged commit; the tag is v<version>, and
scripts/release.mjs cuts it, as docs/releasing.md describes. Versions
follow semantic versioning below 1.0: a patch changes no verdict,
record shape or document meaning; a minor adds or revises
requirements, verdicts or record shapes and still reads earlier
records; a major changes what earlier records mean.

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
