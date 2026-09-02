# Same Page -- Conventions

Status: Agreed
Agreed: 2026-09-02
Last revised: 2026-09-02

## Implementation standards

- Dependency-free. Scripts and the engine import node builtins only
  (node:fs, node:path, node:crypto, node:child_process, node:util,
  node:os, node:url). Why: zero install for the consumer (PKG-001).
- One runtime contract. Every script and engine entry runs under node
  and under bun unchanged, with no build step. The engine is
  TypeScript in erasable syntax only: no enum, no namespace, no
  parameter properties; unions and `as const` instead. Why: node
  strips types and never checks them, so the syntax has to be what
  node can strip (PKG-002).
- The check never writes; the gate fails open. The language check
  reads and reports (CONF-010). The drift gate exits 0 on anything
  unexpected and exits 2 only to deliver its audit prompt. The engine
  writes only under `.same-page/` and never touches a spec or the
  evidence map without an explicit action (ENG-197). Why: a tool that
  edits the contract it verifies is a second writer.
- Errors carry a path. A finding names file and line; a refusal names
  the rule identifier it enforces. Nothing is swallowed: an unreadable
  input is a finding, not a skip, except where a rule says fail open.
- Tests drive the CLI. tests/*.test.mjs spawn the scripts and the
  engine with node against temp directories and assert on stdout,
  stderr, and exit code. Why: the shipped contract is the CLI, so the
  tests exercise exactly what ships.
- Fixtures come from the shipped templates. The glossary fixture is
  built from the template's Working vocabulary section, so a template
  change is felt by the suite.
- ASCII only, everywhere: files, replies, commit messages (PKG-003).
- Simple technical English in prose; Same Page Technical English in
  normative text. The specs legislate; docs/MANUAL.md explains.

## Naming and organization

| Path | Rule |
|---|---|
| skills/<name>/SKILL.md, templates/ | One skill per directory; templates ship working defaults, never placeholders (PKG-004). |
| skills/new-project/scripts/ | The gate, the check, and engine/ live here so every channel carries them (PKG-006, ADR 0004). |
| skills/new-project/scripts/engine/ | The engine: one entry `same-page.ts`, one module per concern (yaml, digest, obligations, policy, cli). |
| tests/ | `<subject>.test.mjs`; one file per script or engine surface. |
| docs/superpowers/specs/ | The four normative specs, dated filenames, one prefix each. |
| docs/specs/same-page/ | This spec set: the keystone, glossary, conventions, iterations/, conformance.md, recon.md. |
| .agents/adr/ | NNNN-slug.md, package-level decisions. Spec-level decisions live in each spec's Decisions and revisions. |
| .claude-plugin/, hooks/, .codex/ | The three channel manifests. Install commands are copied verbatim from .agents/install-block.md. |

Identifiers are permanent: PREFIX-NNN, three digits, never reused;
a withdrawn requirement keeps its number with a Withdrawn: line.

## Verification commands

    bun test                                   # per change; every suite must pass
    node skills/new-project/scripts/language-check.mjs docs/specs/same-page docs/superpowers/specs
                                               # after any spec edit; must report no findings
    bunx tsc --noEmit -p skills/new-project/scripts/engine
                                               # per engine change; typescript is not a dependency
    grep -rnP '[^\x00-\x7F]' --include='*.md' --include='*.mjs' --include='*.ts' --include='*.json' --include='*.sh' . --exclude-dir=.git --exclude-dir=.remember --exclude-dir=reference --exclude-dir=node_modules
                                               # ASCII gate, before commit; must return nothing
    claude plugin validate . --strict          # after touching .claude-plugin/ or hooks/hooks.json

No continuous integration runs these; the developer's machine is the
verification authority (`local`, ENG-158).

## Decisions and revisions

- 2026-09-02 -- Confirmed Agreed by the developer as written.
- 2026-09-02 -- Written from evidence by /existing-project Path A:
  the commands are the ones CLAUDE.md and the test suite already run,
  plus the type check the engine adds.
