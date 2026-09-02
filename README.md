![Same Page -- cooperative spec workflow for coding agents](assets/card.jpg)

# Same Page

Cooperative spec workflow for coding agents. Models contain information;
developers carry experience. Same Page levels the two into agreement on
terms, direction, and goals, written into specs that every future session
inherits and that the tooling holds to.

The loop: agree on vocabulary before anything is specified; write each
requirement in a controlled language so it says exactly one checkable
thing; confirm every agreed requirement with the state that would violate
it; record what the code proves about each requirement, honestly; and
audit every session against the current scope contract before it ends.
docs/MANUAL.md explains each step in detail on one worked example.

## Install

    npx skills add eas4ai/same-page

Global install (available in every project):

    npx skills add -g eas4ai/same-page

Claude Code (plugin, includes the drift gate):

    /plugin marketplace add eas4ai/same-page
    /plugin install same-page@same-page

Details and Codex setup: docs/INSTALLATION.md.

## Skills

| Skill | What it does |
|---|---|
| [new-project](skills/new-project/SKILL.md) | Staged, confirm-back workflow that scaffolds a complete spec set: glossary, keystone overview, ux spec, numbered domain specs, conventions, iteration contract, evidence map. Every agreed requirement gets a confirmed falsifier, and stage close elaborates it into an obligation file for the engine. Onboards your development practices once. User-invoked. |
| [existing-project](skills/existing-project/SKILL.md) | Gets an agent up to speed on a codebase that already exists: cited recon report, glossary from the code's own names, observed specs for the work's blast radius (or verification of an existing spec set against the code), documentation gap list, and the session's work prepared as one feature or one defect -- a first contract, or a staged spec through /next-iteration when a contract exists. Observed stays distinct from agreed. User-invoked. |
| [next-iteration](skills/next-iteration/SKILL.md) | Scope-creep valve: captures new ideas as staged next-iteration specs instead of expanding the current build; negotiates iteration close, confirming a falsifier for each promoted requirement. Model-invocable by design. |

## What ships with them

- **The spec set.** Plain markdown under docs/specs/<project>/: a
  glossary, a keystone overview, a ux spec, numbered domain specs,
  conventions, iteration contracts, and the evidence map. Manual,
  chapter 2.
- **Same Page Technical English.** The controlled language for
  requirements: exactly one of MUST, MUST NOT, or MAY per sentence, the
  actor named, the condition first, permanent identifiers. Manual,
  chapter 4.
- **The standard dictionary.** The vocabulary where model priors and
  developer intent split, identical in every project unless the
  developer records a ruling on an entry. Manual, chapter 3.
- **The language check.** skills/new-project/scripts/language-check.mjs
  reads a spec set, reports every deterministic language finding and
  every evidence-map inconsistency, and never writes. Manual, chapter 7.
- **The evidence map.** conformance.md: for each agreed requirement, its
  coverage, the method that produced the evidence, and the evidence
  itself, or an honest Uncovered. Manual, chapter 6.
- **The drift gate.** skills/new-project/scripts/spec-drift-gate.mjs
  audits each session once at completion against the iteration
  contract, the specs, the glossary, the language, and the map. Manual,
  chapter 7.
- **The engine, Same Page Conformance.**
  skills/new-project/scripts/engine/same-page.ts, TypeScript run by
  node or bun with no install: `elaborate` turns every agreed
  requirement and its confirmed falsifier into a committed obligation
  file under .same-page/; `trust`, `run`, and `attest` produce evidence
  records under execution trust; and `verify` answers, per requirement,
  FAILING, BLOCKED, INSUFFICIENT, or SUFFICIENT, with what the policy
  requires and what exists. Layers L1 and L2 of six are built. Manual,
  chapter 10.

## Read next

- docs/MANUAL.md -- how Same Page works, in detail, on one worked
  example.
- docs/new-project.md, docs/existing-project.md, docs/next-iteration.md
  -- one page per skill.
- docs/WORKFLOW.md -- the process as plain instructions, for agents
  without a skill system.
- docs/superpowers/specs/ -- the normative specs: the package design,
  the language (LANG rules), the language check and evidence map
  (CONF rules), and the engine, Same Page Conformance (ENG rules).

## Relationship to best-practices-agent-package

Same Page is the sibling of best-practices-agent-package: that package is
universal production discipline (the 14-rule floor and its completion
gate); this one is spec development and scope fidelity. They compose; each
works alone.

## Development

    bun test                             # every suite in tests/
    claude plugin validate . --strict    # plugin manifests
    ./scripts/link-skills.sh             # local symlink install

Design spec: docs/superpowers/specs/2026-08-10-same-page-design.md.
Language and evidence-map specs:
docs/superpowers/specs/2026-09-01-same-page-technical-english.md,
docs/superpowers/specs/2026-09-01-same-page-conformance.md.
License: MIT.
