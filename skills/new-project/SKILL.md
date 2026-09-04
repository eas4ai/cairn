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
   specification already answers is the failure this rule prevents.
2. Restate before you write. State your understanding in your own words
   before writing any artifact (SPEC-003). Parroting hides
   misunderstanding; restating exposes it.
3. Vocabulary at first occurrence. When a term carries different meanings
   for you and the developer, add it to glossary.md at that moment
   (SPEC-010).
4. Nothing Agreed without a falsifier. A requirement is Draft until the
   developer confirms its text and its falsifier (SPEC-002). Propose the
   falsifiers for a whole domain as one set and ask the developer to
   correct only the wrong ones (SPEC-004). Silence on the rest means
   right.
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

## Stage 2 -- The glossary -> docs/spec/glossary.md

Propose the terms you expect to matter, five to fifteen, each defined in
this project's sense. Present them as one set; the developer corrects the
wrong ones. A term enters when confirmed. The glossary wins over your
prior when they conflict.

## Stage 3 -- Domains and requirements -> docs/spec/<domain>.md

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
requirements it speaks for. Nothing else is scaffolded.

## Closing

Run the spec lint over docs/spec. Summarize what exists and where. The
loop takes over: `cairn wake` names the next action from the repository
alone. An idea outside the current commitment goes to `cairn backlog`,
and enters a commitment only when the developer writes it into the
specification and names it there.
