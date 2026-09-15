# The specification phase

Status: Agreed 2026-09-04
Prefix: SPEC

Normative.

## What this phase produces

The keystone, the glossary, one domain spec per domain the project has,
the roadmap, the first commitment, the working agreement (LOOP-036),
and a mechanism declaration for each requirement the first commitment
names; an adoption also leaves docs/recon.md. Nothing else is
scaffolded.

[SPEC-001] The agent MUST NOT create a domain spec it has no
requirements for.
Falsifier: a file declaring a requirement prefix contains no requirement.

## Agreement

[SPEC-002] The agent MUST NOT record a requirement as Agreed before the
developer confirms its falsifier, a promotion decision under LOOP-088
names it, or a recorded deference by the developer covers it.
Falsifier: a requirement carries an Agreed marker with no confirmed
falsifier and neither a promotion nor a deference decision on its
status line.
Status: Agreed 2026-09-15

Revised 2026-09-15 on the developer's direction after the audit. A
deference is the developer's recorded ruling, in their own words, that
the agent's recommendation stands for a named scope of work unless
review changes it substantively. A requirement agreed that way carries
`Status: Agreed <date> by deference <decision slug>`, where the
decision is the record of the phase that drafted it and quotes the
ruling. The kernel and the spec lint resolve the marker as they do
`by promotion`, so one search for `by ` lists every requirement the
developer did not read line by line. The six requirements agreed on
2026-09-14 under such a ruling carry the marker.

[SPEC-013] The agent MUST NOT record a requirement as Agreed unless it
can name a mechanism that could observe the falsifier.
Falsifier: a requirement is Agreed and no mechanism could produce
evidence for or against it.

A requirement whose falsifier no mechanism can observe cannot produce
evidence. Find that defect while writing the requirement, before the
developer agrees to it. A requirement about the agent's conduct in a
conversation, SPEC-003 through SPEC-017, is observed two ways: the
skill text that instructs the conduct, read by a test, and the review
of each phase, which records what the agent did. That pair is the
mechanism such a requirement names. Stated 2026-09-15 on the
developer's direction after the audit.

[SPEC-003] The agent MUST state its understanding in its own words
before it writes an artifact.
Falsifier: the agent writes a spec section whose content the developer
has not seen restated.

[SPEC-004] The agent MUST propose the falsifiers for a domain as one set.
The agent MUST ask the developer to correct only the ones that are
wrong.
Falsifier: the agent asks the developer to approve falsifiers one at a
time.

## Ambiguity

The rule this replaces made asking the only response to ambiguity, which
produced an interrogation. Recording is the third option.

[SPEC-005] When the agent meets an ambiguity it can resolve from the
specification, the conventions, or common practice, the agent MUST
resolve it without asking the developer.
Falsifier: the agent asks the developer a question whose answer its own
recorded reasoning already determined.

[SPEC-006] The agent MUST ask the developer about an ambiguity only when
the answer is a preference, a priority, or a fact outside the
repository.
Falsifier: the agent asks a question that the specification already
answers.

[SPEC-007] When the agent resolves an ambiguity without asking, the
artifact it writes MUST state the reading it chose.
Falsifier: a specification sentence rests on a reading the agent chose
and no artifact states that reading.

Recording every resolved ambiguity in a separate log reproduces the
volume failure this workflow exists to prevent. The specification text
is where a reading belongs, because that is what the developer reads.

## Depth and shape

[SPEC-008] The agent MUST infer documentation depth from the project.
The agent MUST NOT ask the developer to choose it before any domain is
specified.
Falsifier: the agent asks how much documentation is warranted before the
project's domains are known.

[SPEC-009] The agent MUST derive the set of domains from the project.
The agent MUST NOT impose a fixed set.
Falsifier: a project's spec set contains a domain the project has no
content for.

## Existing code

[SPEC-016] Specification text the agent derives from an existing
codebase MUST be marked Observed.
Falsifier: text describing existing behavior carries no Observed marker
and no confirmation.

[SPEC-017] The agent MUST NOT treat Observed text as contract.
Falsifier: the loop works against a requirement whose only status is
Observed.

## Vocabulary

[SPEC-010] When a term carries different meanings for the developer and
the agent, the agent MUST add the term to the glossary at its first
occurrence.
Falsifier: a term appears with two meanings across the specification and
the glossary does not define it.

## Review

Measured on this specification's own first draft: eight defects in
forty-eight requirements, found by the agent that wrote them, minutes
later, with no information it did not already have.

[SPEC-014] Before the agent presents a domain's requirements for
agreement, the agent MUST examine them for contradictions between
requirements, for falsifiers that would not detect their requirement's
violation, and for requirements no mechanism can check.
Falsifier: requirements are presented for agreement and no record names
what the review examined.

[SPEC-015] The record of a review MUST state what the review attacked,
not only what it found.
Falsifier: a review record reports no findings and does not say what was
examined.

A review that reports nothing is the same shape as a review that did not
happen. Stating the attack is what separates them.

## Ending the phase

The loop does not wait for the whole specification. It waits for one
commitment.

[SPEC-011] The specification phase MUST end when the developer has
confirmed the keystone and the glossary and every requirement in the
first commitment is Agreed.
Falsifier: the loop starts while a requirement inside the first
commitment has no confirmed falsifier.

[SPEC-012] The agent MUST specify a later commitment at Done, by
promotion from the backlog or in a phase the developer opens from the
specification that exists. The agent MUST NOT require the whole
roadmap to be specified before work starts.
Falsifier: a documented step tells the developer that every commitment
must be specified before implementation begins, or that a later
commitment needs the codebase adopted again.
Status: Agreed 2026-09-14 by deference cairn-ships-a-next-iteration-skill-for-the-phase-between-loops

Revised 2026-09-14. The first text said "during the loop". The loop
now stops at Done (LOOP-091): a bounded item is promoted there by the
agent (LOOP-088), and a change to the contract is specified between
loops, by the developer and the agent, from the specification that
exists rather than from the code. The developer deferred to the
agent's recommendation for this revision in advance on 2026-09-14,
unless the review changed it substantively; the review changed the
draft to name both routes, promotion and the phase, and the developer
reads that in the queued decision
cairn-ships-a-next-iteration-skill-for-the-phase-between-loops.

## Drafted from the first adoptions

Drafted 2026-09-05. Each carries its own Status: line; see loop.md.

[SPEC-018] The loop MUST read a requirement's own Status: line ahead of
its file's Status: line.
Falsifier: a requirement marked Draft inside an Agreed file is treated
as Agreed.
Status: Agreed 2026-09-05

The adoption skill marks a section Agreed; the keystone says a later
requirement is Draft until confirmed; the kernel read one status per
file. The grain the skills promise is the grain the kernel reads.

[SPEC-019] The agent MUST cite a path in specification text relative to
the repository root unless the file declares it as software behavior on
a Host paths: header line.
Falsifier: a file under docs/spec contains a path beginning with `/` or
`~` that its Host paths: header does not declare.
Status: Agreed 2026-09-05

A cairn is for someone with no memory. An absolute path on one machine
is dead for them; the first adoption wrote five. A host path required by
the software is part of its contract, not a citation to a checkout.
A slash after a placeholder continues that template.

[SPEC-024] A spec file MUST declare on a Host paths: header line every
absolute or home-relative path its text states as the software's own behavior.
Falsifier: a spec names a required host binary at an absolute path that
its Host paths: header does not declare.
Status: Agreed 2026-09-05

Host paths: is a comma-separated list in the file header, before the
first requirement and outside fenced examples. A declaration covers
the exact path and paths beneath it, using a slash boundary. It applies
only to that file. Use the narrowest path that describes the behavior.
The linter checks declarations; a reviewer checks whether each declared
path belongs to the software contract. Confirmed from the developer's
reported false positives and proposed declaration rule on 2026-09-05.

## Checks and findings that survive a session

Confirmed 2026-09-05 from the developer's accepted recommendations.

[SPEC-020] The specification checker MUST reject duplicate requirement
identifiers across the scanned specification.
Falsifier: two requirement definitions use one identifier and the checker
reports clean.

[SPEC-021] The specification checker MUST reject unresolved references
to identifiers in a prefix declared by the scanned specification.
Falsifier: a spec declaring prefix APP references APP-999, no requirement
defines it, and the checker reports clean.

Definitions and references inside fenced examples, inline code, and
quoted mentions do not count. References may cross spec files. The
checker names the identifier and source location in each finding.

[SPEC-022] When a safe violating example is practical, the agent MUST
demonstrate that a new or revised mechanism detects its intended violation.
Falsifier: the agent relies on a passing check without trying an available
safe example that violates the requirement.

Use a disposable fixture, reproduction, or controlled fault. Establish
that failure came from the intended violation, not setup or a crash.
Then check the corrected case. When this cannot be done safely, record
the reason and the untested limit in the existing review; do not claim
that a passing result demonstrates detection.

[SPEC-023] When refreshing a recon report, the agent MUST preserve each
unresolved finding or link it to an existing backlog entry.
Falsifier: a previously unresolved finding disappears from recon without
a resolution supported by evidence or a link to its backlog entry.

## Promoted from the backlog

[SPEC-025] The specification skills MUST require a Falsifier: line on
every requirement they record as Agreed, including one whose only
keyword is `MAY`.
Falsifier: a skill states that any Agreed requirement carries no
Falsifier: line, or the spec lint accepts an Agreed block without one.
Status: Agreed 2026-09-14 by promotion promote-the-may-falsifier-mismatch-the-skill-matches-the-lint

Promoted 2026-09-14 under LOOP-087. The new-project skill said a
permission-only MAY carries no Falsifier: line while the spec lint
reported every Agreed block without one. A requirement with no
observable falsifier cannot produce evidence (SPEC-013); a MAY whose
limit matters is written as the MUST that bounds it.

## Between loops

Drafted 2026-09-14 from the next-iteration item
prepare-a-next-iteration-without-repeating-project-adoption. The
developer noted on 2026-09-07 that no skill opened the next iteration
and ran existing-project, which reads the whole codebase before it
asks anything and writes a cited recon report. On 2026-09-14 the loop
stopped at Done with items waiting and the same phase was run by hand.
The phase between loops starts from the specification, not from the
code: the code is read only where an item's blast radius touches it.

[SPEC-026] Cairn MUST ship a skill that specifies a later commitment
from the existing specification without repeating the adoption of the
codebase.
Falsifier: no shipped skill starts from an Agreed specification and
ends by naming the next commitment, or the one that does requires a
recon report or Observed specification text before it can end.
Status: Agreed 2026-09-14 by deference cairn-ships-a-next-iteration-skill-for-the-phase-between-loops

[SPEC-027] When the phase between loops writes a next-iteration item
into the specification, the agent MUST stamp the item with a
Promoted to: line naming the commitment that carries it.
Falsifier: a commitment file carries a Specified from: line naming a
next-iteration item with no Promoted to: line, and wake names an
action other than repairing the item.
Status: Agreed 2026-09-14 by deference cairn-ships-a-next-iteration-skill-for-the-phase-between-loops

The commitment file's Specified from: line names each next-iteration
item it carries, the way Promoted from: names a backlog item
(LOOP-088). It is not a promotion: the developer confirmed the
requirement, so LOOP-089 does not bind the commitment, and the
commitment may change the Agreed text the item names. The stamp is
what makes wake stop counting the item as waiting (LOOP-091). The
developer deferred to the agent's recommendation for both
requirements in advance on 2026-09-14; the review before agreement is
recorded in the commitment file.

## The checker reads mentions as mentions

Specified 2026-09-15 on the developer's direction after the audit,
the fourth remediation commitment. The checker's path scan ran over
raw lines, so a regex literal in backticks was an absolute path, and
it stripped every scheme before matching, so a file URL passed.

[SPEC-028] The specification checker MUST NOT report a slash-led
token that carries a regular expression metacharacter other than the
dot as a host path.
Falsifier: a backticked regex literal beginning with a slash and
carrying a class, group, quantifier, anchor, or alternation is
reported as an absolute path.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

Revised 2026-09-15 on the developer's direction after the second
audit (F1): the checker exempted `^ $ * | ? \\` only, so a class or a
quantifier was still a path; the set is now `^ $ * | ? \\ [ ] ( ) { }
+`, and the dot stays out because real paths carry it.

Revised 2026-09-15, the same day: the first text excluded every
backticked and quoted token, which SPEC-024 forbids, since a host
path the software needs is written in backticks and must be a finding
until the file declares it. The false positive the audit found is the
regex literal, and that is what the rule now names.

[SPEC-029] The specification checker MUST report a Windows drive
path or a file URL as a host path.
Falsifier: a drive-letter path or a file URL in specification text,
outside backticks and quotes, passes the check.
Status: Agreed 2026-09-15

A skill's slash name is not a path; the checker reads the names under
skills/ in the checkout it runs from. In the obligation checks, a
mention keeps a placeholder word, so a backticked actor still counts
as one (PKG-010).
