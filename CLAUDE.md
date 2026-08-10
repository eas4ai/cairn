# CLAUDE.md

Conventions for agents working on the Same Page package itself.

## What this repo is

Same Page is an Agent Skills package: /new-project scaffolds a cooperative
spec set (ara2-style numbered domain specs behind a 00-overview keystone)
through a staged, confirm-back conversation; /next-iteration captures
mid-development ideas as next-iteration specs instead of scope creep. A
spec-drift completion gate (hooks/spec-drift-gate.mjs) audits sessions
against the iteration contract. Design spec:
docs/superpowers/specs/2026-08-10-same-page-design.md -- it is normative;
read it before structural changes.

## Rules of this repo

- ASCII only everywhere: no em dashes (use --), no arrows (use ->), no icon
  glyphs. This applies to replies, files, and commit messages.
- No deferral language: no "v2", "phase 2", "later", "MVP". The spec is the
  scope.
- Templates in skills/*/templates/ never contain bracketed placeholders;
  they ship working defaults, structure, and worked examples.
- The sibling package /home/shawn/workspace/best-practices-agent-package/
  is never modified from here; it has live users.
- The hook must stay dependency-free (node: builtins only) and run under
  both node and bun.

## Verification

- bun test                          (drift-gate suite; must pass before commit)
- claude plugin validate . --strict (after touching .claude-plugin/ or hooks/hooks.json)
- grep -rnP '[^\x00-\x7F]' --include='*.md' --include='*.mjs' --include='*.json' --include='*.sh' .
  (excluding .git and .remember; must return nothing)

## Sync rules (three-file rule)

When a skill is added, renamed, or behavior-changed, update together:
1. its SKILL.md, 2. README.md's skill index, 3. .claude-plugin/plugin.json
skills array, plus its docs/ page. Install commands are copied verbatim
from .agents/install-block.md wherever they appear.
