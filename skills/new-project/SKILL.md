---
name: new-project
description: Builds a specification with the developer for software that does not exist yet -- keystone, glossary, domain specs with falsifiers, roadmap, and the first commitment -- through a staged confirm-back conversation that resolves what it can and asks only what it must. Ends when the first commitment is Agreed; the loop takes over from there. For a codebase that already exists, use /existing-project.
disable-model-invocation: true
---

# /new-project -- the specification phase

You are building a specification with a developer for software that does
not exist yet. The model's information and the developer's experience
meet as equals: you draft, the developer corrects, and nothing is Agreed
until the developer confirms it and its falsifier.

The phase ends at the keystone, the glossary, and the first commitment
(SPEC-011). Later commitments are specified during the loop (SPEC-012).
Everything you write is a cairn: a marker for the agent that arrives next
with no memory of this conversation.

## Standing rules

1. Resolve, then state. When you meet an ambiguity that the
   specification, the conventions, or common practice can resolve,
   resolve it and state the reading in the artifact you write (SPEC-005,
   SPEC-007). Ask the developer only when the answer is a preference, a
   priority, or a fact outside the repository (SPEC-006). A question the
   specification already answers is the failure this rule prevents. A
   choice at Judged or above -- a domain partition, a depth call, a
   reading with a real alternative -- is recorded with `cairn decide`
   (DEC-003), so the next agent inherits why and not only what.
2. Restate before you write. State your understanding in your own words
   before writing any artifact (SPEC-003). Parroting hides
   misunderstanding; restating exposes it. Before the conversation,
   read "Writing for the developer" in the
   [working-agreement template](templates/AGENTS.md). Apply it to the
   explanations and questions that lead to agreement, as well as to
   the artifacts you write. Include its invitation to ask for another
   explanation when presenting a decision or asking for agreement.
3. Vocabulary at first occurrence. When a term carries different meanings
   for you and the developer, add it to glossary.md at that moment
   (SPEC-010).
4. Nothing Agreed without a falsifier. A requirement is Draft until the
   developer confirms its text and its falsifier (SPEC-002). Propose the
   falsifiers for a whole domain as one set and ask the developer to
   correct only the wrong ones (SPEC-004). Record the set as Agreed
   only after the developer confirms it, keeping the proposed wording
   for items they do not change. Silence alone is not confirmation.
5. A falsifier names a mechanism. Before a requirement goes Agreed, name
   a mechanism that could observe its falsifier: a test, a check, a
   script (SPEC-013). A falsifier nothing can observe is not finished
   being written.
6. One obligation per sentence, the actor named (PKG-007, PKG-010). Run
   the spec lint before any stage that wrote normative text closes:
   `node scripts/spec-lint.mjs docs/spec`. Resolve findings through the
   confirm-back loop.
7. Review before agreement. Before presenting a domain's requirements
   for agreement, examine them for contradictions, for falsifiers that
   would not catch their requirement's violation, and for requirements
   no mechanism can check (SPEC-014). Record what the review attacked,
   not only what it found (SPEC-015).
   Check that the explanation names the behavior and consequences in
   language the developer can understand. Passing the spec lint checks
   structure; it does not establish that the prose is clear.
8. Depth and domains come from the project. Infer documentation depth;
   never ask the developer to choose it before any domain is specified
   (SPEC-008). Derive the domains from the project; never impose a fixed
   set (SPEC-009). Create no spec file you have no requirements for
   (SPEC-001).

## Stage 0 -- Orientation

Look at the directory. If it already holds a codebase or a spec set
(docs/spec/overview.md), stop and switch to /existing-project: this
workflow designs software that does not exist yet. Otherwise ask the
developer what the software is for, in their words, and restate it in
yours. That is the one question this stage asks.

## Stage 1 -- The keystone -> docs/spec/overview.md

What the software is, the problem it solves, and what it is not. No
requirements: the keystone holds a spec map that names each domain spec
and its prefix. Restate, confirm, write.

Where the system has meaningful component boundaries, describe the
components, what each owns, and how they communicate. Record the reasons
for technology choices beside them, linking decision records where a
choice warrants one. Link cross-cutting constraints to the requirements
in their owning domain specs; the overview does not duplicate them.

## Stage 2 -- The glossary -> docs/spec/glossary.md

Propose the terms you expect to matter, five to fifteen, each defined in
this project's sense. Present them as one set; the developer corrects the
wrong ones. A term enters when confirmed. The glossary wins over your
prior when they conflict.

When terms collide, record the rejected synonyms and why they mislead.
Explain relationships between terms when definitions alone leave their
use ambiguous. Add these entries as needed by the project.

## Stage 3 -- Domains and requirements -> docs/spec/<domain>.md

Examine the following where they affect the project's requirements:

- Interaction: how users or callers enter a capability, the actions
  available on each screen, command, or API, and the system's responses.
  Trace journeys across domains, branches on user choice or system
  state, errors and recovery, and relevant platform differences. Keep
  feature-level detail in its owning domain; use a shared interaction
  spec only when cross-domain behavior needs requirements of its own.
- Implementation conventions: error handling, logging, state management,
  naming, and module organization where consistency matters. State the
  reason for each choice. Name the verification commands and when they
  run, referencing the scripts or mechanism declarations that own them.

These are prompts for relevant content, not a fixed set of documents.
Use existing sections where they fit, and create a domain spec only
when it has requirements to own (SPEC-001, SPEC-009).

Derive the domains from the keystone: what the software does, decomposed
where the decomposition is real. Confirm the partition, then write each
domain spec through the confirm-back loop:

- Status: Draft, and Prefix: <PREFIX>.
- Requirements as [PREFIX-nnn], one obligation per sentence, the actor
  named. Every MUST and MUST NOT carries a Falsifier: line. A
  permission-only MAY carries none, because permitted behavior is not
  obligatory; when a limit on it matters, write the limit as its own
  MUST or MUST NOT with its own falsifier.
- Propose the domain's falsifiers as one set, and for each name the
  mechanism that could observe it. Review the draft (rule 7) and record
  the review. Present for agreement by exception.
- When the developer confirms, the file's Status becomes Agreed with the
  date.

Filenames carry meaning, never sequence: loop.md, not 02-loop.md. The
order of reading lives in the keystone's spec map.

## Stage 4 -- The roadmap and the first commitment

Write docs/spec/roadmap.md: the ordered commitments, each a unit of scope
named for its goal, with a Current: line naming the first. Order lives in
this file. Then write docs/commitments/<slug>.md for the first commitment
only: its requirements by identifier, what it delivers, where its records
live, its formats, the tests that will prove it, and its done-when. A
commitment must be able to reach Done under LOOP-017 with only what it
and its predecessors deliver.

For each requirement in the first commitment, write its mechanism under
.cairn/mechanisms/<name>: the command, the paths it reads, and the
requirements it speaks for.

For a command that reports individual requirement results, declare
`results: per-requirement`. Its stdout uses `cairn: REQ-001: pass` or
`cairn: REQ-001: fail` for each result it establishes. Missing results stay
unverified, even if the command stops before printing any result. Omit
the field only when the command's aggregate exit result is appropriate
for every requirement it declares.

When implementing a new or revised mechanism, demonstrate that it catches
a safe example of the stated violation, then that it accepts the corrected
case (SPEC-022). Use a disposable fixture or controlled fault; check that
it failed for the expected reason, not a setup error or crash. Record the
example and result in the existing review. If no safe demonstration is
practical, record why and what remains untested. Do not delay agreement
merely because the mechanism has not been built yet.

Write the working agreement: AGENTS.md at the repository root, by
copying templates/AGENTS.md beside this skill verbatim (LOOP-036). It
states the agent's move for each verdict and the developer's move for
an escalation and for a queued decision. A harness that reads a
differently named instructions file gets a one-line file of that name
that includes it. Nothing else is scaffolded.

## Closing

Run the spec lint over docs/spec. Summarize what exists and where. The
loop takes over under the working agreement: `cairn wake` names the
next action from the repository alone, and AGENTS.md says what to do
with it. An idea outside the current commitment goes to `cairn backlog`,
and enters a commitment only when the developer writes it into the
specification and names it there.

A mechanism that repeats a command labels each repetition and its result
in its output, so a failure in one run can be found without repeating
the experiment. Track .cairn/evidence/ and commit new receipts and logs
after check; do not add that directory to .gitignore.
