commitment: record-integrity
commit: f41859a
examined:
  - the decider vocabulary at the point of writing: each of developer, agent and joint is accepted and stored lowercase; Developer, AGENT, Joint and a padded "  agent  " normalize to the same three; Codex, Shawn, "Shawn and Codex", agents, dev and a whitespace-only value are each a usage error naming all three and DEC-020, with nothing written to docs/decisions/. An empty --decided-by is still the missing-field error, not the vocabulary one, so the two diagnostics do not collide.
  - supersede reaches decide, so it takes the same vocabulary. Attacked: cairn supersede --decided-by Codex exits 3, writes no new record, and leaves the old record unstamped, so a refused decider cannot half-apply a reversal. --decided-by Joint stores joint.
  - the reading path, on records written by another kernel or another project: Agent and "  agent  " tally as agent 2, Codex as "unrecognized: Codex 1", and a record with no Decided by line as "unrecorded 1". Nothing is dropped and nothing is guessed, so the drift the audit found stays visible in the report that found it (DEC-011). No existing record is rewritten by any command.
  - the placeholder check, in both orders an agent produces it: the placeholder above the entries, the placeholder below them, and the placeholder above two entries. Each is Resolvable, action repair with the record's path, and the reason says to remove the placeholder line and cites DEC-021.
  - the two unchanged shapes: a section holding only the placeholder is still build, with no mention of a placeholder in the reason; resolving entries with no placeholder are not named at all and the wake moves on to the requirement.
  - attack: precedence against LOOP-113. The placeholder check tests for an entry that resolves, which a shallow clone by definition does not have, so the shallow repair is reached first. Demonstrated on a real depth-1 clone carrying both the placeholder and an unresolvable identifier: the verdict is the shallow repair citing LOOP-113, and the word placeholder does not appear.
  - attack: a record whose Decision body quotes the placeholder inside a fenced example, above a genuinely realized section. The record is not named at all. The section is read through withoutFences and sliced from the single ## Realized by heading to the next heading, so a quoted field cannot change whether a decision is built, which is what the manual already promises.
  - the failure demonstration for the new checks, on a copy of the tree at a224f09 with the three guards removed (the write guard, the read normalizer, the placeholder test): the four new tests fail and the other thirty-four pass. Restored, all pass. The checks observe the behavior rather than the code's presence.
  - the kernel's own records: the new check found two, acknowledge-restored-scope-history-without-exempting-future-changes and keep-exact-approved-scope-history-without-granting-future-permission, each carrying the placeholder directly above its realizing commit. Repaired as their own actions before this review. Cairn's own history carried the defect the audit found downstream.
  - the writer and the reader share one placeholder string, UNBUILT, so decide cannot change what it writes without changing what the wake looks for. The line pattern tolerates leading and trailing whitespace and nothing else.
  - the build action now says the resolving entry replaces the placeholder rather than sitting under it, and cites DEC-006 and DEC-021; the manual says the same where it already discussed the Realized by section. The test helper realize() does what the wake asks, so the fixtures stop reproducing the defect.
  - the package: 471 tests run with none failing, spec-lint clean, pkg-lint clean at 1557 kernel lines against the 1600 ceiling.
  - a second pass after the first review, reading the diff against main rather than the commitment: three defects the first pass missed and three cleanups, below.
  - a production-readiness pass, asked for by the developer because the plugin is installed in three projects: what an upgrade does to a repository that already holds records, and what a downstream agent is told when the new refusal reaches it.
  - measured: wake on a fixture of 100 decision records, 40 of them superseded and built, against the kernel at main, at this commit, and with entry resolution skipped for superseded records that carry no placeholder. 260ms, 340ms, 259ms. The 31% is one git rev-parse per entry of every superseded record, which this commit added by reading the section before the Superseded by skip. It grows with the project's reversal history and the hooks run wake at every session start and every stop.
  - simulated: a downstream project on the old kernel carrying three records whose placeholder survived realization, as suprnova-directory-starter does. The first wake after the upgrade names a repair rather than the work, once per record. Correct under DEC-021 and undocumented anywhere the developer or the agent would read it.
  - read for the decider vocabulary: docs/manual.md, docs/walkthrough.md, README.md, AGENTS.md, every skill, and the template working agreement new-project writes into a consumer repository. None of them names --decided-by at all, before or after this commit. The vocabulary exists in cairn --help and in the specification only.
findings:
  - resolved: this commit resolves every Realized by entry of every superseded record, which main skipped, so wake costs one git rev-parse per entry more than it did and the cost grows with the reversal history; measured 260ms to 340ms on 100 records with 40 superseded. Resolved: a superseded record with no placeholder is skipped before its entries are resolved, so it costs no git at all; re-measured on the same fixture, 345ms to 252ms against main's 249ms (f41859a)
  - resolved: the refusal names the three deciders and not where the real name goes, so an agent called Codex is told what it may not write without being told that its name belongs in --body. Resolved: the refusal reads "name the person or tool in --body" after the three values (f41859a)
  - resolved: no document a developer or an agent reads names the decider vocabulary; the manual's decision section covers levels and the queue and not this field. Resolved: the manual's decision section names the three, says they are counted rather than read, says a name or product is one of the three wearing a different word, and says existing records keep what they were written with (f41859a)
  - resolved: nothing tells a project upgrading the kernel that its first wake may name record repairs and that --decided-by has narrowed; CHANGELOG.md has no entry for this work. Resolved: CHANGELOG.md carries the 0.4.0 entry and a paragraph saying what an upgrade does to a repository that already holds records: nothing is rewritten, a surviving placeholder is named one record per wake, a decider outside the three is refused only at the next write, and every mechanism re-runs once (f41859a)
  - resolved: UNBUILT_LINE escapes parentheses alone, so a future placeholder text containing a regex metacharacter would build a pattern that matches the wrong thing. Resolved: replaced by a line comparison, hasUnbuilt(), which needs no escaping and drops a CRLF checkout's CR. The escaping attempt itself was wrong and silent: the class [\\] closed early, so nothing was escaped and the pattern matched nothing; two existing DEC-021 tests caught it (f41859a)
  - resolved: realize() finds its section with indexOf("## Realized by"), which would match the heading quoted inside a fenced example before the real one. Resolved: realize() uses an anchored /^ {0,3}## Realized by[ \t]*$/m search, so a heading quoted in a fenced example is not mistaken for the section (f41859a)
  - resolved: decider() calls trim() on the raw field, and fields() yields an array when Decided by: is written as a list, so cairn reversals crashes on a shape main tallied (reproduced: exit 3, "trim is not a function"). Resolved: decider() reads the field through asList and joins it, so a list-shaped Decided by tallies as the flat form does; tested (0b9582a)
  - resolved: the realization of record-integrity-on-the-developer-s-direction replaced every occurrence of the placeholder string, so the Decision body now says decide writes the 72743f9 commit line under Realized by; the sentence that explains why DEC-021 exists is false. Resolved: the body sentence is restored to quote the placeholder; only the Realized by line names the commit (0b9582a)
  - resolved: a superseded record is skipped before its Realized by section is read, so the placeholder above a resolving entry passes validation there; DEC-021's falsifier names no exemption and a reversal is never deleted (DEC-010). Resolved: the section and its entries are read before the Superseded by skip, and a built record with the placeholder is a repair whether or not it was reversed; an unbuilt superseded record is still never named build; tested (0b9582a)
  - resolved: tests/helpers.mjs realize() replaces the first occurrence of the placeholder anywhere in the file, the same hazard that corrupted the record above; it should anchor to the Realized by section, and the placeholder literal should be one exported constant rather than three spellings. Resolved: realize() slices from the Realized by heading and replaces only there; UNBUILT is exported from helpers and records.test.mjs uses it; tested with a body that quotes the placeholder (0b9582a)
  - resolved: the help text still reads --decided-by NAME and lists Levels but not deciders, so it documents a shape decide now refuses. Resolved: the help reads --decided-by WHO and lists Deciders beside Levels, both interpolated from the constants (0b9582a)
  - resolved: decide() re-implements the trim and lowercase that decider() already does, so the write and read normalizers can drift; they already differ on internal whitespace. Resolved: decide writes const who = decider(...), the same normalizer the tally reads with (0b9582a)

## Commitment review at 52921b0, 2026-09-16

Both deliverables have current passing evidence. DEC-020 is enforced
where the value is written and normalized where it is read, and the two
paths are deliberately different: writing refuses, reading reports. That
split is what lets history stay as recorded while the report stops
lying about it.

DEC-021 is a narrow test on purpose. It fires only when an entry
actually resolves, which is what keeps it from stealing the shallow
clone's repair and what keeps a recorded-and-not-yet-built record valid.
Attacked as listed under examined, including a real depth-1 clone and a
fenced example.

What this does not do: it does not migrate records in other projects,
and it does not rewrite this project's decider values, both of which the
direction placed outside the commitment. Downstream records keep their
spellings until someone changes them by hand, and the report names them
as unrecognized until then.

No open finding.

## Commitment review at 0b9582a, 2026-09-17

The second pass read the diff against main rather than against the
commitment, and that is where the first pass went wrong: it attacked
the new behavior and never asked what old behavior the change removed.
The list-shaped Decided by is exactly that, a shape main handled and
the new normalizer dropped. The over-replaced record body is a defect
in how the record was realized, not in the kernel, and the helper that
was written the same evening carried the same hazard. All six are
resolved as one piece of work above, each with a test where a test can
hold it. No open finding.

## Commitment review at f41859a, 2026-09-17

The developer asked whether this is ready for three projects that run
it. The pass that answers that question is not the one that attacks the
new behavior: it asks what an upgrade does to a repository that already
holds records, and what the new refusal tells an agent that meets it.
Both had gaps, and the latency regression was mine, introduced by the
previous round's own fix.

One of these findings is worth remembering past this commitment. The
escaping I wrote to make the placeholder pattern robust was itself
broken, and broken silently: the regex compiled, matched nothing, and
disabled DEC-021 entirely. Only the two tests written a round earlier
failed. A pattern built from a string is a liability the kernel does not
need; the line comparison that replaced it cannot fail that way.

No open finding.
