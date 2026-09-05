# The specification phase

Status: Agreed 2026-09-04
Prefix: SPEC

Normative.

## What this phase produces

The keystone, the glossary, one domain spec per domain the project has,
the roadmap, the first commitment, and the working agreement
(LOOP-036). Nothing else is scaffolded.

[SPEC-001] The agent MUST NOT create a domain spec it has no
requirements for.
Falsifier: a file declaring a requirement prefix contains no requirement.

## Agreement

[SPEC-002] The agent MUST NOT record a requirement as Agreed before the
developer confirms its falsifier.
Falsifier: a requirement carries an Agreed marker and no confirmed
falsifier.

[SPEC-013] The agent MUST NOT record a requirement as Agreed unless it
can name a mechanism that could observe the falsifier.
Falsifier: a requirement is Agreed and no mechanism could produce
evidence for or against it.

A requirement whose falsifier no mechanism can observe cannot produce
evidence. Find that defect while writing the requirement, before the
developer agrees to it.

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

[SPEC-012] The agent MUST specify a later commitment during the loop.
The agent MUST NOT require the whole roadmap to be specified before
work starts.
Falsifier: a documented step tells the developer that every commitment
must be specified before implementation begins.

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
