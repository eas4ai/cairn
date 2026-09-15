# The next iteration starts from the specification

Slug: the-next-iteration-starts-from-the-specification
Requirements: SPEC-012, SPEC-026, SPEC-027
Specified from: prepare-a-next-iteration-without-repeating-project-adoption
Inherits: every PKG requirement
Status: Agreed 2026-09-14

## Goal

A project already under Cairn has an Agreed specification. When the
loop stops at Done with items waiting in next-iteration, or when the
developer wants a new feature, the next commitment is specified from
that specification, not by adopting the codebase again. Cairn ships
the skill that opens that phase, and the item it carries is stamped
so wake stops counting it.

## Authorization and scope

The developer deferred in advance on 2026-09-14: "I will defer to your
recommendation on all remaining commitments unless review changes them
substantively." This phase was run by hand under existing-project's
Path B, which is the repetition the item names; the skill below
records what was done so it need not be repeated. SPEC-012 is revised
and SPEC-026 and SPEC-027 are new. The decision that ships the skill
is Consequential and waits in the review queue.

## Decisions to record

- cairn-ships-a-next-iteration-skill-for-the-phase-between-loops,
  Consequential, recorded before this commitment was named.

## Deliverables

- skills/next-iteration/SKILL.md: the phase between loops. Starts at
  `cairn wake`, which must say Done; reads the glossary, the keystone,
  the roadmap, the current commitment, and every waiting item; writes
  no recon report and no Observed text; restates each change; revises
  the named requirement in place with a `Revised <date>` note and
  drafts new requirements with falsifiers as one set, a mechanism
  named for each; reviews before agreement and records the review in
  the commitment file; on the developer's confirmation writes the
  commitment with a `Specified from:` line per item, the roadmap
  section, the `Current:` line, the mechanism declarations, and the
  `Promoted to: <slug>` stamp on each item; runs the spec lint; ends
  by naming the next commitment.
- bin/cairn.mjs: the commitment parser reads `Specified from:`, and
  wake names the item's stamp as a repair while a named item carries
  no `Promoted to:` line (SPEC-027).
- skills/new-project/SKILL.md: says a later commitment is specified at
  Done, by promotion or by /next-iteration.
- skills/existing-project/SKILL.md: Stage 0 routes a project whose
  wake says Done to /next-iteration.
- skills/install-cairn/SKILL.md, README.md, docs/manual.md: the skill
  set is four; the install and update commands and the manual's table
  name next-iteration.
- AGENTS.md and the template: the developer's paragraph says a waiting
  item starts a new loop by running next-iteration.
- tests/skills.test.mjs and tests/continuation.test.mjs: the proxies
  and the kernel test below.

## Review before agreement

Examined, on 2026-09-14, before the requirements were marked Agreed:

- Contradictions. The first SPEC-012 draft said a later commitment is
  specified "in a phase the developer opens at Done", which
  contradicted LOOP-088, where the agent specifies a promoted
  requirement itself at Done. Changed to name both routes. SPEC-027's
  first draft reused `Promoted from:` for the item; LOOP-089 forbids a
  commitment carrying that line from changing Agreed text, which is
  what a next-iteration commitment exists to do. Changed to a separate
  `Specified from:` line, which the LOOP-088 check does not read.
  SPEC-026 and existing-project's Stage 3, which already routes a
  contract change to a specification phase, agree.
- Falsifiers that would miss their violation. SPEC-012's falsifier
  reads documented steps, which the skills are; SPEC-026's reads the
  shipped skills; SPEC-027's is a kernel state. Each is observable in
  the tree.
- Requirements no mechanism can check. node-test speaks for all three:
  static proxies over the skill text for SPEC-012 and SPEC-026, and a
  fixture with a `Specified from:` line for SPEC-027. spec-lint checks
  the shape. The proxies read text, not behavior; the phase's behavior
  is observed when it runs, and its first run is the second item
  waiting tonight.

Nothing substantive changed after the two contradictions were fixed,
so the developer's advance deference stands as the confirmation.

## Tests

- the next-iteration skill exists, starts from the specification,
  writes no recon and no Observed text, names `Specified from:` and
  the `Promoted to:` stamp, and ends by naming the next commitment
  (SPEC-026, SPEC-027)
- every document that names the project skills names next-iteration
  beside them (SPEC-026, PKG-014)
- new-project says a later commitment is specified at Done (SPEC-012)
- a commitment specified from an unstamped next-iteration item makes
  wake name the stamp as a repair; stamped, the loop proceeds
  (SPEC-027)

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done, with one next-iteration item waiting.
