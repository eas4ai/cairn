# Roadmap

Status: Agreed 2026-09-04. Not normative.

Order lives here. Filenames carry meaning, never sequence. Each section
states the contract as it stood on its date; where a later commitment
revised it, the section says so in one line.

Current: the-scope-history-reads-current-as-the-wake-does

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
discarded, promoted only by the developer (revised 2026-09-14 by LOOP-029:
the loop promotes backlog items by a recorded decision), and a commit outside the
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

Delivers: scripts/link.sh (retired 2026-09-14; the session-start hook is
the install), which links the kernel onto the path and the
skills into any agent's skill directories; the README's install
section; and a test that runs the script into a temporary home and
runs the linked cairn. Covers PKG-014, PKG-005, and PKG-006.

## Drafted from the first adoptions, 2026-09-05

Two live projects ran the loop under existing-project on 2026-09-04
and 2026-09-05. Their agents' reports, and a review of the kernel
against what they needed, are in [the original PoC report](https://github.com/eas4ai/cairn/blob/a161d4907afa23e5c89ceca8ff00ee45e54130f6/docs/issues-from-the-poc.md) and in
twenty backlog items. The five commitments below carry the fixes.
Each names requirements drafted the same day, which the developer
confirms by exception before the commitment is named Current.

## 10. The verdict is per requirement

Delivers: a mechanism reports a result per requirement on its standard
output and check records each from its own line; a targeted check
records every requirement the mechanisms it ran speak for; an attempt
is a failing record at a digest not yet in the failing streak (as
DEC-018 later put it), and the first record is the baseline; a failure no change in
the footprint can address is an escalation, and the wake says so; an
escalation concerns every identifier it names. Covers LOOP-037
through LOOP-040, LOOP-052, LOOP-053, DEC-017 through DEC-019, and
revisits LOOP-034 and DEC-016.
[Commitment](../commitments/the-verdict-is-per-requirement.md).

First because both live projects are running against it today: one
collapsed thirteen falsifiers into one bit to fit the kernel, and the
other reached the developer with a Judged decision marked Blocking
after two real attempts.

## Checks stay tied to their requirements

Named by the developer on 2026-09-05 after commitment 10 reached Done.
Delivers: freshness tied to requirement and falsifier text; review of a
check before evidence for revised text; duplicate ID and broken reference
checks; safe violating examples when creating checks; preserved recon
findings; a human walkthrough; and complete Git reads for large inputs.
Also delivers explicit per-requirement reporting and separate execution
diagnostics from the developer's live-project report.
Covers LOOP-058 through LOOP-062, SPEC-020 through SPEC-023, PKG-016,
and revisits LOOP-023 and LOOP-024.
[Commitment](../commitments/checks-stay-tied-to-their-requirements.md).

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
committed; two declarations for one requirement are refused by name
(withdrawn by LOOP-056's revision, which lets two mechanisms prove one
requirement); the kernel's run record carries a process id and a dead one is
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

## Human documentation

Requested by the developer on 2026-09-05. Explain Cairn in plain language
through an expanded README, loop diagrams, a human manual grounded in the
source, and the existing executable walkthrough.
[Commitment](../commitments/humans-can-understand-and-use-cairn.md).

## Host paths are part of the contract

Requested by the developer on 2026-09-05. Correct placeholder path
findings and allow explicitly declared host paths in specification files.
Covers SPEC-019 and SPEC-024.
[Commitment](../commitments/host-paths-are-part-of-the-contract.md).

## Command help is always available

Requested by the developer on 2026-09-06. Add --help and -h, available
without a project checkout and without running a command. Covers PKG-017.
[Commitment](../commitments/command-help-is-always-available.md).

## Skills can be installed with the skills CLI

Requested by the developer on 2026-09-06. Document installation through
the Vercel skills CLI in the README and human manual. Covers PKG-014.
[Commitment](../commitments/skills-can-be-installed-with-the-skills-cli.md).

## Evidence remains tied to the checked state

Requested by the developer on 2026-09-06 after an end-to-end review.
Repair changing candidates, mode-blind freshness, missing output acceptance,
overlapping checks, malformed declarations, and submodule crashes. Share
repeated input reads within a wake. Covers LOOP-063 through LOOP-069.
[Commitment](../commitments/evidence-remains-tied-to-the-checked-state.md).

## Records preserve order and meaning

Requested by the developer after five audit passes. Repair evidence ordering,
record parsing, escalation serialization, Git conversion, historical path
reading, and supporting files in evidence directories. Audit the repairs again.
Covers LOOP-070 through LOOP-075.
[Commitment](../commitments/records-preserve-order-and-meaning.md).

## Evidence explains its freshness

The developer confirmed the direction and the exact requirement and falsifier
set on 2026-09-07.

Delivers LOOP-076 through LOOP-080: identify the affected receipt, explain
changed declared paths where recorded facts support it, show honest limits
for older records, and state the next action. Deterministic event-sequence
tests preserve the existing freshness and action-priority rules.
[Commitment](../commitments/evidence-explains-its-freshness.md).

## Scope breaches have a recovery path

Requested by the developer on 2026-09-07 after reporting the empty-footprint
declaration gap, incomplete breach reports, and ineffective scope escalations.
Delivers LOOP-081 through LOOP-083 and revisits LOOP-035.
[Commitment](../commitments/scope-breaches-have-a-recovery-path.md).


## Correct work can be kept after a scope breach

Requested by the developer on 2026-09-07 to complete the recovery path for
correct work committed in the wrong scope window. Delivers LOOP-084 and
LOOP-085 and revisits LOOP-035 while preserving LOOP-083 restoration.
[Commitment](../commitments/correct-work-can-be-kept-after-a-scope-breach.md).


## Freshness and scope guidance agree

Requested by the developer on 2026-09-07 after the documentation audit.
Reconciles LOOP-024, the LOOP-035 rationale, and the manual with the existing
retention behavior under LOOP-084 and LOOP-085. No runtime behavior changes.
[Commitment](../commitments/freshness-and-scope-guidance-agree.md).


## Malformed review findings cannot complete work

Developer-requested repair for silently discarded review findings.
Delivers LOOP-086 while preserving LOOP-020 and LOOP-033.
[Commitment](../commitments/malformed-review-findings-cannot-complete-work.md).

## The loop continues past Done

Requested by the developer on 2026-09-14. Done stops the loop only when
nothing remains the agent may decide: backlog items are promoted by a
recorded decision, next-iteration items wait for the developer and are
asked for once with a recommendation (revised the same day by the-loop-
stops-at-done: the loop never asks), and neither directory is deferral.
Delivers LOOP-087 through LOOP-093 and revisits LOOP-029 and SPEC-002.
[Commitment](../commitments/the-loop-continues-past-done.md).

## The skill matches the lint on MAY

Promoted from the backlog by the agent on 2026-09-14, the first
promotion under LOOP-087. Delivers SPEC-025: every Agreed requirement
carries a Falsifier: line, a MAY included, and the new-project skill
says so.
[Commitment](../commitments/the-skill-matches-the-lint-on-may.md).

## Check runs only what is stale

Promoted from the backlog by the agent on 2026-09-14 under LOOP-087.
Delivers LOOP-094: `cairn check --stale` runs once each mechanism whose
requirement has missing or stale evidence, and nothing else.
[Commitment](../commitments/check-runs-only-what-is-stale.md).

## Hooks keep the agent in the loop

Specified on the developer's ok to escalation loop-091, 2026-09-14.
Delivers PKG-018 and PKG-019, the stop and session-start hooks; revisits
LOOP-091 so an answered escalation names the specification of the chosen
item (revised the same day by the-loop-stops-at-done); retires the link
script; supersedes the no-hook decision.
[Commitment](../commitments/hooks-keep-the-agent-in-the-loop.md).

## Evidence names the kernel that wrote it

Specified on the developer's ok to escalation loop-091-2, 2026-09-14.
Delivers LOOP-095 and LOOP-096 and revisits LOOP-023 and LOOP-024: every
evidence record carries the kernel's digest, a record from another kernel
is stale with the reason named, and the working agreement says the kernel
is upgraded at Done.
[Commitment](../commitments/evidence-names-the-kernel-that-wrote-it.md).

## One receipt per run

Specified on the developer's ok to escalation loop-091-3, 2026-09-14.
Delivers LOOP-097 and LOOP-098: one receipt per mechanism run with a
result line per requirement, read in execution order beside every
receipt written before. Revisits LOOP-040, LOOP-041, LOOP-070, and
LOOP-075 by name only; their text stands.
[Commitment](../commitments/one-receipt-per-run.md).

## The loop stops at Done

Ruled by the developer on 2026-09-14: next-iteration is the next feature
specification and the loop never pulls from it. Revises LOOP-091 so Done
is reported with items waiting, and removes the escalation and specify
paths. [Commitment](../commitments/the-loop-stops-at-done.md).

## The next iteration starts from the specification

Specified 2026-09-14 from the next-iteration item
prepare-a-next-iteration-without-repeating-project-adoption, on the
developer's advance deference to the agent's recommendation. Delivers
SPEC-026 and SPEC-027, the next-iteration skill and the stamp that
ends an item's wait, and revises SPEC-012 so a later commitment is
specified at Done, by promotion or in the phase the developer opens.
[Commitment](../commitments/the-next-iteration-starts-from-the-specification.md).

## Two mechanisms can prove one requirement

Specified 2026-09-14 from the next-iteration item
two-mechanisms-that-both-prove-one-requirement, on the developer's
advance deference, in the first run of the next-iteration skill.
Revises LOOP-056 so a requirement with several mechanisms is met only
when each passes, and delivers LOOP-099 and LOOP-100: a named check
runs every mechanism that speaks for the requirement, and attempts
count within one mechanism's records.
[Commitment](../commitments/two-mechanisms-can-prove-one-requirement.md).

## The contract says what the kernel does

Requested by the developer on 2026-09-15 after the audit
(docs/audit/2026-09-15-audit.md), the first of five remediation
commitments (docs/audit/2026-09-15-remediation-plan.md). Revises
DEC-016, LOOP-026, PKG-004 and SPEC-002 to say what the kernel does,
adds LOOP-101 so the working agreement names a move for every action
wake prints, stamps the six deferred requirements, and stops the
kernel writing a derivable status on escalations (LOOP-028).
[Commitment](../commitments/the-contract-says-what-the-kernel-does.md).

## The kernel refuses bad records and leaves no trap

Requested by the developer on 2026-09-15 after the audit, the second
remediation commitment. Delivers LOOP-102 through LOOP-113: list-form
fields, record directories read by kind, a duplicate Current: line,
declaration refusals for the three loop traps, declare ahead of
evidence actions, unreadable records as repairs, the review and
decision fields the gates read, the write-ahead record asked for,
file modes under core.filemode false, project roots below the Git
toplevel, and shallow clones.
[Commitment](../commitments/the-kernel-refuses-bad-records-and-leaves-no-trap.md).

## The hooks and gates judge by records

Requested by the developer on 2026-09-15 after the audit, the third
remediation commitment. Delivers PKG-021, PKG-022, and LOOP-114
through LOOP-117: the hooks resolve their path as a file system path,
run the kernel the command link resolves to, and never exit nonzero;
the LOOP-090 escalation and the LOOP-088 promotion record are read by
their fields; the activation commit enters the LOOP-089 comparison;
the footprint exempts Cairn's records only.
[Commitment](../commitments/the-hooks-and-gates-judge-by-records.md).

## This repository declares and lints what it reads

Requested by the developer on 2026-09-15 after the audit, the fourth
remediation commitment. Delivers SPEC-028, SPEC-029, and PKG-023
through PKG-027: the checker treats mentions as mentions and flags
drive paths and file URLs; the package lint reads commands from help,
scans shipped files only, and matches wrapped steps; every declared
requirement is named by a test and every path the tests read is
declared.
[Commitment](../commitments/this-repository-declares-and-lints-what-it-reads.md).

## Consumers can run the lint and open the skills

Requested by the developer on 2026-09-15 after the audit, the fifth
and last remediation commitment. Delivers PKG-028 through PKG-032:
`cairn lint`, the skills naming it, the README invoking the phase
skills by name and stating versions and platforms, the deferral scan
over the human documents; and the stale sentences the audit listed,
corrected in place.
[Commitment](../commitments/consumers-can-run-the-lint-and-open-the-skills.md).

## Record-writing commands run only in a Cairn repository

Promoted from the backlog by the agent on 2026-09-15 under LOOP-087,
from the audit's finding A11. Delivers LOOP-118: decide, escalate,
answer, backlog, supersede and reversals refuse to run outside a Cairn
repository with the message wake and check give.
[Commitment](../commitments/record-writing-commands-run-only-in-a-cairn-repository.md).

## The capture gate reads the Concerns line

Promoted from the backlog by the agent on 2026-09-15 under LOOP-087,
from the audit's finding B10. Delivers LOOP-119: the one escalation the
LOOP-090 route raises also satisfies the capture gate for the moved
item, through its Concerns line.
[Commitment](../commitments/the-capture-gate-reads-the-concerns-line.md).

## The gates bind to the commitment

Requested by the developer on 2026-09-15 after the second audit
(docs/audit/2026-09-15-audit-2.md), the first of five remediation
commitments. Delivers LOOP-120 through LOOP-123 and revises the
LOOP-090 and LOOP-092 falsifiers: the footprint includes the
activation commit, a demoted or removed requirement is a contract
change, the include files are observable and compared, and a reversed
promotion is seen.
[Commitment](../commitments/the-gates-bind-to-the-commitment.md).

## Records in every shape

Requested by the developer on 2026-09-15 after the second audit, the
second remediation commitment. Delivers LOOP-124 through LOOP-131
and repairs eight behaviors under their existing requirements: every
record shape is read or named, no state exits raw or traps the loop.
[Commitment](../commitments/records-in-every-shape.md).

## The hooks find the kernel and the project

Requested by the developer on 2026-09-15 after the second audit, the
third remediation commitment. Delivers PKG-033 through PKG-036 and
revises PKG-004: the hooks judge with the command the agent runs, keep
a link whose target exists, find a project below the toplevel, report
a kernel that prints no verdict, and the ceiling is 1600 lines.
[Commitment](../commitments/the-hooks-find-the-kernel-and-the-project.md).

## Lints and tests observe what they name

Requested by the developer on 2026-09-15 after the second audit, the
fourth remediation commitment. Revises PKG-025, PKG-026 and SPEC-028;
the lints catch the violations their requirements name, the coverage
scan sees every read shape, fourteen test titles say what their
bodies observe, and the two lint declarations say what they read.
[Commitment](../commitments/lints-and-tests-observe-what-they-name.md).

## The documents say what the code does

Requested by the developer on 2026-09-15 after the second audit, the
fifth remediation commitment. Revises LOOP-088 (promotions at
Consequential), LOOP-105, LOOP-108, PKG-022, LOOP-118, PKG-028,
SPEC-029 and LOOP-026; stamps the requirements agreed under the first
remediation's ruling; corrects the working agreement, the manual, the
README, the walkthrough, the install skill, the glossary and this
roadmap where they said what the code no longer does.
[Commitment](../commitments/the-documents-say-what-the-code-does.md).

## The verifiers' findings are closed

Requested by the developer on 2026-09-15 after the second audit, the
sixth remediation commitment: what two independent verifications of
the five commitments found. Revises LOOP-104, LOOP-126, PKG-022 and
PKG-034; adds LOOP-132; corrects the PKG-004 and PKG-026 rationales,
the manual's Get unstuck table, and the plan's Result table.
[Commitment](../commitments/the-verifiers-findings-are-closed.md).

## The plugin installs from a marketplace

Requested by the developer on 2026-09-15: Cairn installs as a plugin
from a marketplace, in Claude Code and in Codex, with the command, the
skills and the hooks in one install. Adds PKG-037 and PKG-038; ships
the manifest, the marketplace listing and the hooks file; the README,
the manual and the install skill say so.
[Commitment](../commitments/the-plugin-installs-from-a-marketplace.md).

## Releases are versioned

Requested by the developer on 2026-09-15 after the plugin install: one
version source that the kernel prints, a changelog, and a release
script that cuts one tagged commit at Done. Adds PKG-039 and PKG-040;
the first tagged release follows.
[Commitment](../commitments/releases-are-versioned.md).

## Record integrity

Requested by the developer on 2026-09-16, after an audit of three
downstream projects found the records themselves drifting: seven
spellings of three deciders in one project, and three decisions in
another that read as unbuilt above the commits that built them. Adds
DEC-020 and DEC-021; existing records are not rewritten, and the
report makes their drift visible rather than hiding it.
[Commitment](../commitments/record-integrity.md).

## A value followed by list items keeps the value

Promoted on 2026-09-17 from the kernel review the developer requested:
the field grammar dropped a key line's value when list items followed
it, so a commitment could name a requirement the wake never checked.
Adds LOOP-133; the value becomes the first item of the list.
[Commitment](../commitments/a-value-followed-by-list-items-keeps-the-value.md).

## The scope history reads Current as the wake does

Promoted on 2026-09-17 from the kernel review: the walk through
roadmap history read Current: raw, so a fenced example that LOOP-104
allows could start the footprint late and hide scope breaches. Adds
LOOP-134; one reader serves the wake and the history.
[Commitment](../commitments/the-scope-history-reads-current-as-the-wake-does.md).
