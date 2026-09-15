commitment: the-next-iteration-starts-from-the-specification
commit: 09ceee3
examined:
  - node-test against the revised SPEC-012: the proxy in tests/skills.test.mjs, the sentence it reads in skills/new-project/SKILL.md, and the red and green runs of the suite around the implementation commit.
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
