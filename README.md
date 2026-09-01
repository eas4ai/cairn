# Same Page

Cooperative spec workflow for coding agents. Models contain information;
developers carry experience -- Same Page levels the two into mutual
agreement on terms, direction, and goals, recorded in specs that every
future session inherits.

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
| [new-project](skills/new-project/SKILL.md) | Staged, confirm-back workflow that scaffolds a complete spec set: glossary, keystone overview, ux spec, numbered domain specs, conventions, iteration contract, evidence map. Every agreed requirement gets a confirmed falsifier. Onboards your development practices once. User-invoked. |
| [existing-project](skills/existing-project/SKILL.md) | Gets an agent up to speed on a codebase that already exists: cited recon report, glossary from the code's own names, observed specs for the work's blast radius (or verification of an existing spec set against the code), documentation gap list, and the session's work prepared as one feature or one defect -- a first contract, or a staged spec through /next-iteration when a contract exists. Observed stays distinct from agreed. User-invoked. |
| [next-iteration](skills/next-iteration/SKILL.md) | Scope-creep valve: captures new ideas as staged next-iteration specs instead of expanding the current build; negotiates iteration close, confirming a falsifier for each promoted requirement. Model-invocable by design. |

Human-facing guides: docs/new-project.md, docs/existing-project.md,
docs/next-iteration.md. The tool-neutral process (for agents without
skills): docs/WORKFLOW.md.

## The drift gate

skills/new-project/scripts/spec-drift-gate.mjs audits each session once at completion, in any
project with a spec set: did work stay inside the iteration contract, was
out-of-contract work surfaced and captured, do touched specs and the
glossary still hold, was any still-Observed spec section relied on as
contract, did normative text pass the language check and does the
evidence map still tell the truth, and the rule 13 self-evaluation from the
best-practices ruleset (referencing the nearest BEST_PRACTICES.md, with
the rule's own text embedded as fallback). The script ships inside the new-project skill, so
every install channel carries it: the Claude Code plugin registers it
automatically, /new-project offers registration on first run for
skills-CLI installs, and .codex/hooks.json covers Codex. Dependency-free,
runs under node or bun.

## The language check

Normative spec text is written in Same Page Technical English: one
obligation per sentence, exactly one of MUST, MUST NOT, or MAY, the
actor named, the condition first, requirement identifiers where the
spec declares a prefix. skills/new-project/scripts/language-check.mjs
is the deterministic half of the check -- it verifies the language
plus the evidence map (conformance.md), which ties every Agreed
requirement identifier to its coverage, the method that produced the
evidence, and the evidence itself, or to an honest Uncovered. Run it
on demand:

    node skills/new-project/scripts/language-check.mjs docs/specs/<project>

It reads, reports, and exits nonzero on findings; it never writes. The
semantic half (terms used in two senses, misleading referents) is the
model's job in-session, with every fix confirmed before it lands.

## Relationship to best-practices-agent-package

Same Page is the sibling of best-practices-agent-package: that package is
universal production discipline (the 14-rule floor and its completion
gate); this one is spec development and scope fidelity. They compose; each
works alone.

## Development

    bun test                             # drift-gate + language-check suites
    claude plugin validate . --strict    # plugin manifests
    ./scripts/link-skills.sh             # local symlink install

Design spec: docs/superpowers/specs/2026-08-10-same-page-design.md.
Language and evidence-map specs:
docs/superpowers/specs/2026-09-01-same-page-technical-english.md,
docs/superpowers/specs/2026-09-01-same-page-conformance.md.
License: MIT.
