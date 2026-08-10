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
| [new-project](skills/new-project/SKILL.md) | Staged, confirm-back workflow that scaffolds a complete spec set: glossary, keystone overview, ux spec, numbered domain specs, conventions, iteration contract. Onboards your development practices once. User-invoked. |
| [next-iteration](skills/next-iteration/SKILL.md) | Scope-creep valve: captures new ideas as staged next-iteration specs instead of expanding the current build; negotiates iteration close. Model-invocable by design. |

Human-facing guides: docs/new-project.md, docs/next-iteration.md. The
tool-neutral process (for agents without skills): docs/WORKFLOW.md.

## The drift gate

hooks/spec-drift-gate.mjs audits each session once at completion, in any
project with a spec set: did work stay inside the iteration contract, was
out-of-contract work surfaced and captured, do touched specs and the
glossary still hold. Registered automatically by the Claude Code plugin;
.codex/hooks.json covers Codex; dependency-free, runs under node or bun.

## Relationship to best-practices-agent-package

Same Page is the sibling of
best-practices-agent-package:
that package is universal production discipline (the 13-rule floor and its
completion gate); this one is spec development and scope fidelity. They
compose; each works alone.

## Development

    bun test                             # drift-gate suite
    claude plugin validate . --strict    # plugin manifests
    ./scripts/link-skills.sh             # local symlink install

Design spec: docs/superpowers/specs/2026-08-10-same-page-design.md.
License: MIT.
