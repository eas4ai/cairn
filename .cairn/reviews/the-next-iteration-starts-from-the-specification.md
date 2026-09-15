commitment: the-next-iteration-starts-from-the-specification
commit: 09ceee3
examined:
  - node-test against the revised SPEC-012: the proxy in tests/skills.test.mjs, the sentence it reads in skills/new-project/SKILL.md, and the red and green runs of the suite around the implementation commit.
  - The build at 1f3d962: skills/next-iteration/SKILL.md against SPEC-026 and the three standing rules it adds, the kernel's Specified from: reading and its place in the wake order, the edits to new-project, existing-project, install-cairn, the README, the manual, the working agreement and its template, and the two test files.
findings: []

## SPEC-012 mechanism review, 2026-09-14

Revised text: the agent specifies a later commitment at Done, by
promotion from the backlog or in a phase the developer opens from the
specification that exists, and never requires the whole roadmap first.
Falsifier: a documented step tells the developer that every commitment
must be specified before implementation begins, or that a later
commitment needs the codebase adopted again.

node-test speaks for SPEC-012 through the static proxy in
tests/skills.test.mjs: the new-project skill must say "A later
commitment is specified at Done" and name /next-iteration, and must
keep "for the first commitment only" at Stage 4, which is the first
half of the falsifier. The second half, that a later commitment needs
the codebase adopted again, is read by the same suite's two new tests:
the next-iteration skill exists, writes no recon report and no
Observed text, and every document that names the project skills names
it beside them, so no documented step sends the developer back to
adoption.

Safe violating example: at 5ae6fa1, the agreement commit, new-project
still said "Later commitments are specified during the loop" and no
next-iteration skill existed. The suite ran 4 failing of 34 in the two
files, the SPEC-012 proxy among them, for that reason and not for a
setup error. Corrected case: at 1f3d962 the full suite ran 384 passing.
The proxy reads text, not behavior; the phase's behavior is observed
when it runs, and its first run under the shipped skill is the second
waiting item, tonight. No mismatch found. No code changed during this
review.

## Commitment review at 09ceee3, 2026-09-14

Every requirement has current passing evidence: SPEC-012 revised,
SPEC-026, SPEC-027, and the inherited package set. The suite is 384
passing, both lints clean, the kernel at 1400 of 1500 lines by the
package lint's count, three lines heavier for the stamp check.

Attacked:

- The Specified from: check reads the line as a slug list and joins
  each slug under .cairn/next-iteration/. A slug with path separators
  would be joined outside that directory; the check only reads fields
  from a file that exists, and the line is the agent's own record, so
  it is a discipline gap at most. Cairn is not a security boundary.
- The check runs after the LOOP-088 promotion checks and before fold,
  scope, and capture, so an unstamped item is named ahead of any
  evidence action, which is what the test asserts. A commitment with
  no Specified from: line is unaffected: the field is null and the
  filter yields nothing.
- LOOP-089 and LOOP-090 read Promoted from: only, so this commitment,
  which revises SPEC-012, was not refused as a promoted commitment
  that changed Agreed text; wake reaching Done confirms it.
- LOOP-092's capture gate reads files added inside the footprint. The
  stamp edited an existing file and no capture was made, so it did not
  fire; it would still fire on a new capture that names SPEC-012,
  SPEC-026, or SPEC-027 without an Outside because: line.
- The skill's rule 9 says no recon report and no Observed text, and
  the proxy reads exactly those sentences. The skill's behavior is not
  proven by text; its first run is the next phase tonight, and that
  run is the failure demonstration for the skill itself.
- The working agreement and the template are byte-identical, as the
  existing test requires; the old route sentence is gone from both.
- docs/recon.md still lists "no next-iteration skill is shipped" as a
  2026-09-07 observation. It is a dated snapshot and SPEC-023 governs
  refreshing it, which this phase, by rule 9, does not do; the roadmap
  and the commitment carry the resolution.
- The skills CLI discovers SKILL.md files under skills/, so the new
  folder installs with the same command; the README and manual name
  it in that command and the install skill's update line.

Records: the decision waits in the queue; the item carries
Promoted to: this slug; the roadmap's Current: line moved in the
agreement commit, which is where the footprint began.

Self-audit against the production rules: one skill added, one kernel
check of three lines, the documents the commitment lists, four tests
added and one revised; every check reported here ran and passed. No
open finding.
