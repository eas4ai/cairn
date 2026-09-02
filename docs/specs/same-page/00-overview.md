# Same Page -- System Overview

Status: Agreed
Agreed: 2026-09-02
Prefix: PKG
Last revised: 2026-09-02

<!-- The keystone of the package's own spec set, written by
/existing-project Path A on 2026-09-02 from the repository as it is.
The four normative specs stay under docs/superpowers/specs/ and are
listed in the spec map; this directory holds what governs the build:
glossary, conventions, contracts, and the evidence map. -->

## Purpose

Same Page is an Agent Skills package that puts a coding agent and a
developer on the same page before code is written, and keeps them there
while it is. The developer is the source of truth about what the
software should do; the model is the source of truth about what the
code does; the spec set is where the two agree, in a controlled
language, with a confirmed falsifier on every agreed requirement and an
honest evidence map under it.

The package is complete when a project scaffolded or adopted with it
can answer, from its repository alone, why it currently believes each
Agreed requirement conforms, and can say `BLOCKED` when it cannot
(engine spec, Definition of success).

## Design principles

1. The spec is the scope. No deferral language, no phase two; an idea
   that arrives mid-build is staged for the next iteration, never
   dropped and never slipped in.
2. Evidence or question. A statement about code carries a path; a
   statement without one is a question for the developer.
3. Observed is not agreed. The code says what the system does; only the
   developer says that is what it should do.
4. One surface per fact. Vocabulary lives in the glossary, obligations
   in the specs, decisions next to what they justify; nothing is
   copied where it can drift.
5. Zero install for the consumer. Everything that runs in a consumer
   repository uses node builtins only and rides every distribution
   channel unchanged.
6. The model proposes; the developer rules. Sequencing, deferral, and
   every judgment call are recorded as the developer's, never the
   model's.
7. Fail open at the gate. Anything unexpected in a completion hook
   lets the session finish; the audit is a prompt, never a wall.
8. Mention is not use. Backticks, quotes, and fences name a word
   without stating an obligation, so a rule can name the keyword it
   governs.

## System architecture

Three markdown skills, two scripts, one engine, three channels.

- Skills: skills/new-project (scaffold from conversation),
  skills/existing-project (adopt from evidence), skills/next-iteration
  (the scope valve; the only model-invocable one). Why markdown: the
  Agent Skills format is what every agent host reads.
- Scripts: skills/new-project/scripts/spec-drift-gate.mjs (the
  once-per-session completion audit) and language-check.mjs (pass one
  of the language, the standard dictionary, and the evidence map).
  Why under the skill: every channel carries the skill directory, so
  every channel carries the scripts (ADR 0004). Why .mjs with builtins
  only: node is present wherever the skills CLI works (ADR 0003).
- Engine: Same Page Conformance, under skills/new-project/scripts/engine/
  as TypeScript run directly by node and bun, no build step, no
  dependencies. Why TypeScript: the verdict lattice and the evidence
  axes are closed unions, and a checker catches an unrepresentable
  state before a test does. Why not a compiled language: nothing the
  engine does needs one, and a second toolchain costs the zero-install
  property.
- Channels: the skills CLI installs skills/ as-is; the Claude Code
  plugin adds automatic gate registration through hooks/hooks.json;
  Codex gets .codex/hooks.json. One tree, three manifests.
- The contract between skills and scripts is the spec set at
  docs/specs/<project>/, recognized by 00-overview.md, with
  SAME_PAGE_SPECS_DIR as the override.

## Cross-cutting requirements

[PKG-001] The package MUST NOT declare a runtime dependency.
Falsifier: package.json carries a dependencies entry, or a script or
engine module imports a package that is not a node builtin.

[PKG-002] Every script and the engine MUST run under node and under
bun without a build step.
Falsifier: on a clean checkout, a script or engine entry invoked with
node or with bun exits with an error before doing its work.

[PKG-003] Every tracked file outside reference/ MUST contain only
ASCII characters.
Falsifier: the ASCII gate in conventions.md returns a line.

[PKG-004] A shipped template MUST NOT contain a bracketed placeholder.
Falsifier: a file under a templates/ directory contains a phrase a
scaffold is meant to replace, such as [project name].

[PKG-005] A hook registration MUST invoke node.
Falsifier: a registration in hooks/hooks.json or .codex/hooks.json runs
the gate with a program other than node.

[PKG-006] The drift gate, the language check, and the engine MUST live
under skills/new-project/scripts/.
Falsifier: one of them exists at another path, or is absent from that
one.

[PKG-007] A scaffolded spec set MUST pass the language check with no
findings.
Falsifier: the check, run on a spec set /new-project just scaffolded,
reports a finding.

## Spec map

Reading order is dependency order. Paths are relative to this
directory.

| Spec | Prefix | Owns |
|---|---|---|
| glossary.md | - | The standard dictionary and the package's own terms |
| ../../superpowers/specs/2026-08-10-same-page-design.md | - | The package: the three skills, the spec set, the drift gate |
| ../../superpowers/specs/2026-09-01-same-page-technical-english.md | LANG | The language every requirement is written in |
| ../../superpowers/specs/2026-09-01-same-page-conformance.md | CONF | The language check and the evidence map |
| ../../superpowers/specs/2026-09-02-same-page-conformance-engine.md | ENG | Same Page Conformance, the evidence engine, in six construction layers |
| conventions.md | - | Verification commands, layout, and implementation standards |
| iterations/NNN.md | - | The scope contract per iteration |
| conformance.md | - | The evidence map for every Agreed identifier in the corpus |

Domains outside the current blast radius, documented by the design
spec and observed as built: the three skills, the drift gate, the
language check, the templates, the three distribution manifests.

## Supported and excluded scope

Supported:

- Claude Code (plugin with the gate registered; or skills CLI plus
  the gate offered at first run).
- Any agent host that reads Agent Skills, through the skills CLI.
- Codex, through .codex/hooks.json and a vendored gate script.
- Engine layers L1 through L6, each under an iteration contract.

Excluded, by decision:

- A continuous integration pipeline for this repository; every check
  runs on the developer's machine, and the repository's verification
  authority is `local` (developer ruling, 2026-09-02).
- Per-project configuration of the language check's rules; only
  standard-dictionary entries take a per-project ruling (developer
  ruling, 2026-09-01).
- A database as the authoritative obligation store (ENG-192).
- A compiled implementation language for the engine (developer
  ruling, 2026-09-02).

## Revision policy

Revisions are made in place, dated, and logged in the affected spec's
Decisions and revisions section. An identifier is permanent: a
withdrawn requirement keeps its identifier with a Withdrawn: line. A
change to a normative sentence is followed by the self-hosting check
in the same change.

## System completion criteria

- The three skills scaffold, adopt, and stage as their SKILL.md files
  describe, on a consumer repository, with the gate and the check
  registered by the channel used.
- The engine's six construction layers are built and each layer's
  ENG requirements carry evidence in conformance.md.
- The self-hosting check reports no findings across both spec
  directories.
- `bun test` passes.

## Decisions and revisions

- 2026-09-02 -- Overview confirmed Agreed by the developer with the
  seven PKG falsifiers as written.
- 2026-09-02 -- The package governs its own build with a spec set at
  docs/specs/same-page/, written by /existing-project Path A. The four
  normative specs stay under docs/superpowers/specs/ and the language
  check scans both directories as one corpus, so one glossary and one
  evidence map cover everything. Rejected: moving the normative specs
  (churn in every reference for no gain); a second glossary (drift).
- 2026-09-02 -- The engine is TypeScript run directly by node and bun,
  erasable syntax only, no build step, no dependencies; type checking
  through `bunx tsc --noEmit` with nothing added to package.json.
  Rejected: Rust (developer: overkill; a second toolchain for nothing
  the engine needs); rewriting the two shipped scripts (they work and
  are the zero-install floor).
- 2026-09-02 -- No continuous integration for this repository
  (developer ruling). The repository's verification authority is
  `local`, explicit under ENG-158.
