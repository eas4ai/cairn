# Roadmap

Status: Agreed 2026-09-04. Not normative.

Order lives here. Filenames carry meaning, never sequence.

Current: the-verdict-is-per-requirement

LOOP-020, review before completion, and every PKG requirement apply to
every commitment rather than to one.

Cairn bootstraps on itself: its own specification is the input to its
own loop, so the loop is built before the specification phase is ported.

Every commitment must be able to reach Done under LOOP-017 with only
what it and its predecessors deliver. The first draft split evidence
from the wake and left the first commitment unable to finish; see
docs/decisions/check-belongs-to-the-first-commitment.md.

## 1. The record, the wake, and the check

The loop's happy path, end to end: know where you are, decide and
record, run mechanisms against a committed tree, record evidence with
receipts, review, and report Done only when LOOP-017 holds.

Delivers: `cairn wake`, `cairn decide`, `cairn check`. Covers LOOP-001
through LOOP-008, LOOP-017 through LOOP-025, LOOP-027, LOOP-028,
LOOP-030 through LOOP-034, DEC-001 through DEC-007, and DEC-013 through
DEC-016.

First because nothing else works without it, and because a commitment
that can complete itself is the proof that the loop exists.

## 2. Escalation

Delivers: `cairn escalate` and `cairn answer`. One escalation at a time,
format-checked, durable on disk, resolvable by an agent that did not
raise it, and never able to suppress a Blocking decision. Covers
LOOP-009 through LOOP-014 and LOOP-026.

## 3. Scope and the backlog

Delivers: `cairn backlog`, and the footprint check in `check` and
`wake`. Out-of-commitment work captured rather than implemented or
discarded, promoted only by the developer, and a commit outside the
commitment's declared footprint made visible. Covers LOOP-015,
LOOP-016, LOOP-029, and LOOP-035.

## 4. Supersession and the experience log

Delivers: `cairn supersede` and `cairn reversals`. Reversals classified
by cause and never deleted, reversal rate by decider, and every new
decision in a reversed domain accounting for that history. Covers
DEC-008 through DEC-012.

The threshold moves by the agent's recorded judgment, per decision, with
the history in front of it. A formula that moves it from a rate is not
in the specification.

## 5. The specification phase

The skills apply four rules: ambiguity resolved and
recorded rather than asked, falsifiers confirmed by exception, depth
inferred, and the phase ending at the first commitment. Delivers the
skills, and a spec-lint mechanism for PKG-007 and PKG-010. Covers
SPEC-001 through SPEC-017.

Last because the specification phase already works. It needs its
over-asking removed, not a redesign.

## 6. Every commitment satisfies the package

Promoted from the backlog on the developer's word, 2026-09-04.

Delivers: the PKG requirements folded into every commitment's set, so
Done means the package holds too (PKG-011); `scripts/pkg-lint.mjs`, a
mechanism for the PKG requirements a program can observe; and PKG-003
revised to name what a concept is, so it can be observed at all. Covers
PKG-001 through PKG-013.

## 7. The working agreement

Promoted from the backlog on the developer's word, 2026-09-04, with the
review queue's exit folded in.

Delivers: the working agreement, one vendor-neutral file at the
repository root that states the agent's move for each verdict and the
developer's move for an escalation and for a queued decision; both
skills write it; and Cairn's own copy, so the loop that builds Cairn
runs by the file Cairn ships. Covers LOOP-036 and DEC-014.

## 8. The two views of an input agree

Promoted from the backlog on the developer's word, 2026-09-04.

A defect against LOOP-023 and LOOP-024: a declared input that is a
symbolic link digests as its content in the tree and as its target
path at a commit, so a review that examined it is stale forever.
Delivers the test that reproduces it and the kernel reading a link the
same way in both views. Covers LOOP-023 and LOOP-024.

## 9. Cairn installs by one script

Promoted from the backlog on the developer's word, 2026-09-04.

Delivers: scripts/link.sh, which links the kernel onto the path and the
skills into any agent's skill directories; the README's install
section; and a test that runs the script into a temporary home and
runs the linked cairn. Covers PKG-014, PKG-005, and PKG-006.

## Drafted from the first adoptions, 2026-09-05

Two live projects ran the loop under existing-project on 2026-09-04
and 2026-09-05. Their agents' reports, and a review of the kernel
against what they needed, are in docs/issues-from-the-poc.md and in
twenty backlog items. The five commitments below carry the fixes.
Each names requirements drafted the same day, which the developer
confirms by exception before the commitment is named Current.

## 10. The verdict is per requirement

Delivers: a mechanism reports a result per requirement on its standard
output and check records each from its own line; a targeted check
records every requirement the mechanisms it ran speak for; an attempt
is a failing record at inputs the previous failing record did not
see, and the first record is the baseline; a failure no change in
the footprint can address is an escalation, and the wake says so; an
escalation concerns every identifier it names. Covers LOOP-037
through LOOP-040, LOOP-052, LOOP-053, DEC-017 through DEC-019, and
revisits LOOP-034 and DEC-016.
[Commitment](../commitments/the-verdict-is-per-requirement.md).

First because both live projects are running against it today: one
collapsed thirteen falsifiers into one bit to fit the kernel, and the
other reached the developer with a Judged decision marked Blocking
after two real attempts.

## 11. The output is evidence

Delivers: the command's complete output kept beside every record,
captured without a size bound; evidence tracked in the repository;
the working agreement and the ignore file counted as Cairn's own
records by the footprint; the skills asking repeated runs to make
each repetition's result findable.
Covers LOOP-041, LOOP-042, LOOP-043, and revisits LOOP-025, LOOP-031,
and PKG-002.
[Commitment](../commitments/the-output-is-evidence.md).

## 12. The wake names an action or refuses

Delivers: a declared input that matches nothing is refused; a declared
input missing from the tree is uncommitted change, not a crash;
outside git the kernel refuses; the footprint begins at the commit
that wrote the exact Current: line and covers the loop's own commits
on the first-parent line; review freshness digests a commit in one
git process; a realized-by line carries its subject; a stale
in-progress record whose base is behind a clean HEAD is named as
committed; two declarations for one requirement are refused by name;
the kernel's run record carries a process id and a dead one is
removed by the wake. Covers LOOP-044 through LOOP-047, LOOP-054
through LOOP-056, and revisits LOOP-024, LOOP-027, LOOP-032,
LOOP-035, and DEC-006.
[Commitment](../commitments/the-wake-names-an-action-or-refuses.md).

## 13. The answer reaches the agent

Delivers: a reply is one of three forms; an `ask` reply hands the
escalation to the agent and the agent's reply hands it back; a wake
that names a requirement with a fresh answer carries the answer.
Covers LOOP-048 through LOOP-051, and revisits LOOP-014.
[Commitment](../commitments/the-answer-reaches-the-agent.md).

## 14. Agreed per requirement, inherited by declaration

Delivers: a requirement's own Status: line read ahead of its file's,
by the kernel, the spec lint, and both skills; inheritance into every
commitment declared by the spec file and not by prefix; paths in
specification text relative to the repository, checked by the spec
lint; the route for a failing inherited requirement stated once in
the working agreement. Covers SPEC-018, SPEC-019, PKG-015, LOOP-057,
and revisits SPEC-002, SPEC-016, PKG-011.
[Commitment](../commitments/agreed-per-requirement-inherited-by-declaration.md).

Last because it changes contract, and the developer's ruling on the
grain should stand before the kernel reads it.
