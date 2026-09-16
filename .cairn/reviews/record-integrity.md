commitment: record-integrity
commit: 52921b0
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
findings:
  - open: decider() calls trim() on the raw field, and fields() yields an array when Decided by: is written as a list, so cairn reversals crashes on a shape main tallied (reproduced: exit 3, "trim is not a function").
  - open: the realization of record-integrity-on-the-developer-s-direction replaced every occurrence of the placeholder string, so the Decision body now says decide writes the 72743f9 commit line under Realized by; the sentence that explains why DEC-021 exists is false.
  - open: a superseded record is skipped before its Realized by section is read, so the placeholder above a resolving entry passes validation there; DEC-021's falsifier names no exemption and a reversal is never deleted (DEC-010).
  - open: tests/helpers.mjs realize() replaces the first occurrence of the placeholder anywhere in the file, the same hazard that corrupted the record above; it should anchor to the Realized by section, and the placeholder literal should be one exported constant rather than three spellings.
  - open: the help text still reads --decided-by NAME and lists Levels but not deciders, so it documents a shape decide now refuses.
  - open: decide() re-implements the trim and lowercase that decider() already does, so the write and read normalizers can drift; they already differ on internal whitespace.

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
