# Same Page -- Recon report

Status: Observed (as-built; unconfirmed)
Captured: 2026-09-02
Work this session prepares for: iteration 001 of the engine, Same Page
Conformance -- construction layer L1 (obligation store and lifecycle)

<!-- Written in Stage 0 of /existing-project. Every row cites a path.
This spec set governs the build of the package itself: the four
normative specs stay in docs/superpowers/specs/ and are listed in the
overview's spec map; this directory holds the keystone, the glossary,
the conventions, the contracts, and the evidence map. -->

## Stack

Markdown skills plus two dependency-free scripts. Scripts are ES modules
run by node (hooks/hooks.json:8, .codex/hooks.json:8) and by bun in
development (package.json:12). No lockfile: the package has no
dependencies (package.json has no dependencies field). Distribution
manifests: .claude-plugin/plugin.json, .claude-plugin/marketplace.json,
skills.sh.json. Node 24.1.0 and bun 1.4.0 on this machine.

## Exists

| Capability | Evidence |
|---|---|
| /new-project: staged confirm-back scaffolding of a spec set | skills/new-project/SKILL.md |
| /existing-project: adoption from evidence, Path A and Path B | skills/existing-project/SKILL.md, .agents/adr/0006 |
| /next-iteration: scope-creep valve, model-invocable | skills/next-iteration/SKILL.md, .agents/invocation.md |
| Drift gate: fires once per session, exit 2 with audit prompt, fails open | skills/new-project/scripts/spec-drift-gate.mjs:106-137 |
| Drift gate locates the spec set by 00-overview.md; SAME_PAGE_SPECS_DIR overrides | spec-drift-gate.mjs:12-26 |
| Drift gate reads the highest-numbered iteration contract | spec-drift-gate.mjs:29-38 |
| Language check pass one: CONF-001..014 on normative text only | skills/new-project/scripts/language-check.mjs:373-583 |
| Language check: standard dictionary compare with rulings (CONF-014) | language-check.mjs:842-948 |
| Language check: removed-identifier detection from git history | language-check.mjs:584-644 |
| Language check: evidence map integrity (CONF-040..049) | language-check.mjs:669-822 |
| Language check accepts several directories as one corpus with one glossary and one map | language-check.mjs:950-984 |
| Draft or Observed identifiers are not required in the map | language-check.mjs:436, 674 |
| Templates ship working defaults, no placeholders | skills/new-project/templates/, skills/existing-project/templates/ |
| Plugin channel registers the gate on TaskCompleted and Stop | hooks/hooks.json |
| Codex channel: Stop hook that fails open when the script is absent | .codex/hooks.json |
| Engine, Same Page Conformance: specified, prefix ENG, 190 requirements; layers L1 and L2 built under iterations 001 and 002 | docs/superpowers/specs/2026-09-02-same-page-conformance-engine.md; skills/new-project/scripts/engine/ |
| Engine storage model: .same-page/ with committed obligations, validators, policy; derived evidence and cache | engine spec, Storage (ENG-186..194) |
| Engine construction layers L1..L6, order fixed, timing by contract | engine spec, Construction layers (ENG-240, ENG-241) |

## Documented

| Capability | Where documented | Currency |
|---|---|---|
| The package, skills, spec set, drift gate | docs/superpowers/specs/2026-08-10-same-page-design.md | Matches code |
| The language (LANG) | docs/superpowers/specs/2026-09-01-same-page-technical-english.md | Matches the check |
| The language check and the evidence map (CONF) | docs/superpowers/specs/2026-09-01-same-page-conformance.md | Matches the check |
| The engine (ENG) | docs/superpowers/specs/2026-09-02-same-page-conformance-engine.md | No code to compare |
| How it all works, on one example | docs/MANUAL.md; identifiers interlocked by tests/manual-identifiers.test.mjs | Matches |
| Commands, architecture, repo rules | CLAUDE.md (AGENTS.md is a symlink) | Matches |
| Package decisions | .agents/adr/0001..0006 | Matches |
| Implementation plan | docs/superpowers/plans/2026-08-10-same-page.md (deleted 2026-09-02, see Gaps) | Was contradicted |

## Contradicted

| Claim in docs | What the repository does | Evidence |
|---|---|---|
| CLAUDE.md calls the four specs "normative" | Every one carries `Status: Draft for review`; the language check therefore treats all LANG, CONF, and ENG identifiers as draft and requires no evidence map for them | CLAUDE.md "What this repo is"; head of each docs/superpowers/specs/2026-*.md; language-check.mjs:436, 674 |
| The plan names two skills with underscores (`/new_project`, `/next_iteration`) | Three skills, hyphenated; the plan never mentions existing-project | docs/superpowers/plans/2026-08-10-same-page.md:5; .claude-plugin/plugin.json:6 |

## Unverified

- Type stripping in node: node 24.1.0 runs a .ts file directly with an
  ExperimentalWarning on stderr (probe run 2026-09-02). Whether a
  consumer's node prints that warning into hook output depends on their
  node version; the default floor is 22.18. Not checked on any other
  machine.

## Tests and checks

- `bun test` -- 46 tests across 4 files (run 2026-09-02): drift gate
  (tests/spec-drift-gate.test.mjs), Codex adapter command string
  (tests/spec-drift-gate.codex.test.mjs), language check and map
  (tests/language-check.test.mjs), manual identifier interlock
  (tests/manual-identifiers.test.mjs).
- `node skills/new-project/scripts/language-check.mjs docs/superpowers/specs`
  -- self-hosting; reports no findings (CLAUDE.md "Commands").
- ASCII gate: the grep in CLAUDE.md "Commands"; returns nothing.
- `claude plugin validate . --strict` -- after manifest or hook edits.
- No continuous integration pipeline; the developer ruled none is wanted
  (2026-09-02). Every check runs on the developer's machine.
- No type check exists yet; the engine is the first TypeScript in the
  repository.

## Blast radius of this session's work

Confirmed with the developer in Stage 0. For iteration 001, engine
layer L1:

- New: skills/new-project/scripts/engine/ -- TypeScript modules, run by
  node and bun without a build step, no dependencies; entry
  `same-page.ts`. Layer L1 owns the requirement locator and digest, the
  falsifier lifecycle, YAML obligation artifacts, policy defaults, and
  workflow integration (engine spec, Construction layers).
- New: tests/engine-*.test.mjs, exercised through the CLI contract like
  the two existing scripts.
- New: docs/specs/same-page/ -- this spec set (recon, glossary, overview,
  conventions, iterations/001.md, conformance.md).
- Changed: the engine spec's L1 sections move from Draft to Agreed with
  a `Falsifier:` line under each MUST and MUST NOT requirement
  (LANG-070 block): Requirement authority, Obligation, Falsifier,
  Assurance profile defaults (ENG-075..079), Requirement and falsifier
  revision handling, Storage, Obligation lifecycle, Developer surfaces,
  Workflow integration, Construction layers.
- Changed: skills/new-project/SKILL.md, skills/existing-project/SKILL.md,
  skills/next-iteration/SKILL.md, docs/WORKFLOW.md -- the stage-close
  step that elaborates obligations (ENG-206, ENG-225, ENG-231).
- Changed: CLAUDE.md (working agreement block, commands), package.json
  (typecheck script), .gitignore (.same-page/evidence/,
  .same-page/cache/), docs/superpowers/specs/glossary.md (one glossary
  for both spec directories).
- Outside the radius, left as documented: the drift gate, the language
  check, the templates, the manual, the three distribution manifests,
  and engine layers L2 through L6.

## Gaps

Filled in Stage 3.

| Gap | Kind | Evidence | Decision |
|---|---|---|---|
| The checker does not recognize a section-level Agreed: line; an Agreed section inside a Draft or Observed file is not held to the map by machine, though the skill convention promises it | contradicted | skills/existing-project/SKILL.md Stage 2 status convention vs language-check.mjs:436, 674 | recorded 2026-09-02; closes in iteration 003, the CONF revision (a CONF rule and a checker change together), per the 001 close |
| The four specs say Draft for review while CLAUDE.md calls them normative and the LANG and CONF rules are enforced by tests | contradicted | head of each docs/superpowers/specs/2026-*.md; tests/language-check.test.mjs | recorded 2026-09-02; confirming LANG and CONF section by section with falsifiers is its own pass |
| The implementation plan names two underscored skills and never mentions existing-project | contradicted | docs/superpowers/plans/2026-08-10-same-page.md:5 | closed 2026-09-02: the plan is deleted; the specs and CLAUDE.md are the record |
| No test runs a script under bun as well as node, and no test asserts package.json has no dependencies | untested | PKG-001, PKG-002 rows in conformance.md | recorded 2026-09-02; the map rows say Uncovered, which is the truth |
| The plugin hook registration is not tested; only the Codex one is | untested | hooks/hooks.json; tests/spec-drift-gate.codex.test.mjs | promoted into iteration 002 at the 001 close: a test over both hook registrations |
| No check verifies that a MAY requirement carries no Falsifier line, or that an Agreed MUST carries one | untested | LANG-070, LANG-073; ENG-024, ENG-025 | recorded 2026-09-02 as a candidate rule for iteration 003, the CONF revision |
