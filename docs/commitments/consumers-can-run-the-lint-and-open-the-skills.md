# Consumers can run the lint and open the skills

Slug: consumers-can-run-the-lint-and-open-the-skills
Requirements: PKG-028, PKG-029, PKG-030, PKG-031, PKG-032, PKG-016, LOOP-087
Inherits: every PKG requirement
Status: Agreed 2026-09-15

## Goal

A consumer's agent can run the specification checker on any machine
with the command on the path, a user can open the phase skills the way
their agent application invokes skills, the README says what Cairn
needs and where it runs, and every document says what the code does.

## Authorization and scope

Requested by the developer on 2026-09-15 after the audit, applying the
plan's recommendation R4. Findings closed: C1, C4, C5, C6, C7, C9,
C10, C12, C13, C14, C16, C18, C20, E3 (the PKG-013 half), F1, F3.

## Deliverables

- bin/cairn.mjs: `cairn lint [DIR]`, which runs scripts/spec-lint.mjs
  from this checkout with DIR defaulting to docs/spec; a Node minimum
  named at start; the help entry and header line.
- skills: new-project, existing-project and next-iteration run
  `cairn lint docs/spec`; existing-project says a consumer's own
  instructions live in a separate file that includes the template.
- README.md: the phase skills invoked by name; Node 18, Git 2.5,
  Linux and macOS, Windows unsupported; the stop hook refused up to
  the harness's cap.
- docs/manual.md: the backlog sentence, the receipt path and suffix,
  and the mechanism sentences.
- docs/walkthrough.md: the backlog sentence; evidence committed inside
  the blocks, and its test asserts a clean tree at the end.
- docs/spec: LOOP-091's rationale loses the escalation sentences; the
  draft.md routing sentence goes and docs/spec/draft.md is retired;
  the verdict table drops Proceed and completes Done; LOOP-024 keeps
  one Status line; specification.md lists what else is scaffolded;
  the glossary's Falsifier entry and the keystone's Draft sentence
  name the decision routes; the roadmap gets a top note and four
  pointers.
- docs/recon.md: a resolution section naming the commitments that
  closed its two open findings (SPEC-023).
- scripts/pkg-lint.mjs: PKG-013 scans README.md, docs/manual.md and
  docs/walkthrough.md.
- tests: the help test lists lint; tests/lint-command.test.mjs runs it
  in a fixture; skills and document proxies for the wording; the
  walkthrough test's clean-tree assertion; a pkg-lint fixture for the
  README scan.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
