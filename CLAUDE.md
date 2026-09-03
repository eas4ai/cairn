# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AGENTS.md is a symlink to this file, so other agents read it too.

## What this repo is

Same Page is an Agent Skills package: /new-project scaffolds a cooperative
spec set (ara2-style numbered domain specs behind a 00-overview keystone)
through a staged, confirm-back conversation; /existing-project adopts an
agent onto a codebase that already exists, from evidence, producing the
same spec set with Observed sections kept distinct from Agreed ones;
/next-iteration captures mid-development ideas as next-iteration specs
instead of scope creep. Two dependency-free scripts ship inside the
new-project skill: the spec-drift completion gate, which audits sessions
against the iteration contract, and the language check, which verifies
Same Page Technical English (SPTE) and the evidence map. Beside them
ships the engine, Same Page Conformance, as TypeScript under
scripts/engine/: `elaborate` projects Agreed requirements and their
confirmed falsifiers into committed obligation files under .same-page/,
`trust`, `run`, and `attest` produce evidence records under execution
trust, and `verify` reports each obligation's verdict against the
policy.

Four normative specs in docs/superpowers/specs/ govern this package; read
the relevant one before a structural change:

- 2026-08-10-same-page-design.md: the package, the three skills, the spec
  set, the drift gate.
- 2026-09-01-same-page-technical-english.md: the language (LANG-nnn).
- 2026-09-01-same-page-conformance.md: the language check and the evidence
  map (CONF-nnn).
- 2026-09-02-same-page-conformance-engine.md: the engine, Same Page
  Conformance (ENG-nnn), generated at stage 8 from the feature spec in
  reference/ with the developer's rulings. Layers L1 (the obligation
  store, iterations/001.md) and L2 (validators, evidence records, the
  verdict lattice, iterations/002.md) are built; layers L3 through L6
  follow as further contracts. Never describe any layer
  as absent, deferred, or optional. Sequencing is the developer's, and
  so is any deferral.

## Commands

    bun test                                          # every suite in tests/; must pass before commit
    bun test tests/language-check.test.mjs            # one suite
    bun test -t "CONF-045"                            # one test by name substring
    node skills/new-project/scripts/language-check.mjs docs/specs/same-page docs/superpowers/specs
                                                      # self-hosting check; must report no findings
    claude plugin validate . --strict                 # after touching .claude-plugin/ or hooks/hooks.json
    bunx tsc --noEmit -p skills/new-project/scripts/engine
                                                      # the engine's type check; typescript is not a dependency
    node --disable-warning=ExperimentalWarning skills/new-project/scripts/engine/same-page.ts elaborate
    node --disable-warning=ExperimentalWarning skills/new-project/scripts/engine/same-page.ts run
    node --disable-warning=ExperimentalWarning skills/new-project/scripts/engine/same-page.ts verify
                                                      # the engine on this repository (bun runs the same file);
                                                      # run needs the bun-test validator trusted: same-page trust bun-test
    grep -rnP '[^\x00-\x7F]' --include='*.md' --include='*.mjs' --include='*.json' --include='*.sh' .
                                                      # ASCII gate (excluding .git, .remember, reference); must return nothing
    ./scripts/link-skills.sh                          # symlink skills into ~/.claude/skills and ~/.agents/skills

Tests spawn the scripts and the engine with node (and the engine with
bun) against temp directories, so a change to either script is exercised
only through its CLI contract (stdin, env, exit code, stderr); the
engine's YAML subset is also unit-tested by import. Live-install verification goes through the plugin
CLI: uninstall, `claude plugin marketplace add` the local path, install,
then confirm the cached copy under ~/.claude/plugins/cache/ carries the
change before trusting the version label.

## Architecture

The package is markdown plus two scripts; the architecture is the set of
conventions that tie the files together.

Distribution is three channels over one tree. The skills CLI installs
skills/*/ as-is; the Claude Code plugin (.claude-plugin/plugin.json +
marketplace.json, hooks/hooks.json) adds automatic gate registration;
Codex gets .codex/hooks.json. Both scripts and the engine live under
skills/new-project/scripts/ precisely so every channel carries them
(ADR 0004). Hook registrations invoke node, never bun (ADR 0003).

The engine (scripts/engine/) is TypeScript in erasable syntax only,
run directly by node 22.18+ (type stripping) and by bun; the directory
carries its own package.json ({"type": "module"}) so tsc and node agree
it is ES modules, and node-builtins.d.ts declares the exact builtin
surface it uses because @types/node is not a dependency. Modules:
yaml.ts (the YAML subset it reads and writes), digest.ts (canonical
text, sha256), specs.ts (Agreed requirements and Falsifier lines, with
section-level Agreed: markers honored), policy.ts (.same-page/policy.yaml:
spec directories, profiles, defaults, domain overrides; strength
comparison by implication for downgrades), obligations.ts (one file
per requirement; profile and validators survive re-elaboration via
profile_from; `required` is the downgrade baseline), snapshot.ts
(git:<sha> or workspace:<digest>; .same-page/ is not a source input),
validators.ts (definitions, digests, argv execution), trust.ts (grants
under $SAME_PAGE_HOME or ~/.same-page, never inside the repository),
evidence.ts (records, runs, disproofs, acknowledgments under
.same-page/evidence/), adapters.ts (the capability registry: command
and manual, no capabilities), evaluate.ts (L2 freshness and the
verdict lattice), same-page.ts (elaborate, verify, trust, run, attest,
acknowledge, policy confirm; exit 0 clean, 1 findings or verdicts
below SUFFICIENT, 2 usage).

The scaffolded spec set (docs/specs/<project>/ in a consumer repo) is the
contract between the skills and the scripts. Both scripts locate it by
that path (SAME_PAGE_SPECS_DIR overrides) and recognize it by
00-overview.md. Each spec carries a status header: a Status: line
(Normative design specification, Draft, Observed, Scope contract) and,
for domain specs, a Prefix: line declaring its requirement-identifier
prefix. The templates in skills/new-project/templates/ define this shape;
the language check parses it; the drift gate reads iterations/ for the
current contract.

The language check (pass one) scans only normative text: the canonical
headings Capabilities, Acceptance criteria, Cross-cutting requirements,
In, Out, Definition of done, Expected behavior, plus any section whose
first line is "Normative.". Backticks, quotes, and fences are mentions,
not uses, so a rule can name `MUST` without stating an obligation. It
reads glossary.md `_Avoid_:` lines to flag banned terms, compares the
glossary's Working vocabulary entries with the template beside the script
(the standard dictionary: identical in every project unless an entry
carries a developer's `_Ruling_:` line), uses git history
to detect removed identifiers, and validates conformance.md, the evidence
map: four columns Requirement | Coverage | Method | Evidence, one meaning
each, with the Asserted/inspected and Uncovered/"-" locks (CONF-045..049).
Pass two (semantic judgment) is the model's job in-session. Pass one never
writes.

The drift gate fires once per session (marker file in SAME_PAGE_STATE_DIR
or tmpdir), exits 2 with the audit prompt on stderr, and fails open on
anything unexpected. Its audit items are numbered in auditPrompt(); item 6
points at the language check and the evidence map.

Self-hosting is an interlock: the SPTE and conformance specs are written
in SPTE and the test suite runs the check against them, so an edit to
either spec or to the checker's rules can fail the suite on that seam.
docs/specs/same-page/glossary.md supplies the Avoid terms for that run,
so the suite also fails if CONF-006 is ever skipped there. Fix forward.

Agreement points across the three skills ask one falsifier question per
confirmed MUST or MUST NOT requirement ("What observable state would
violate this agreed requirement?"). The question lives in the SKILL.md
workflows, not in the language rules.

Decisions live in .agents/adr/ (package-level) and in each spec's
"Decisions and revisions" section (spec-level). Invocation modes are
recorded in .agents/invocation.md and in SKILL.md frontmatter.

## Rules of this repo

- ASCII only everywhere: no em dashes (use --), no arrows (use ->), no icon
  glyphs. This applies to replies, files, and commit messages.
- No deferral language: no "v2", "phase 2", "later", "MVP". The spec is the
  scope.
- Templates in skills/*/templates/ never contain bracketed placeholders;
  they ship working defaults, structure, and worked examples.
- The sibling package /home/shawn/workspace/best-practices-agent-package/
  is never modified from here; it has live users.
- The scripts must stay dependency-free (node: builtins only) and run under
  both node and bun.
- reference/ is gitignored source material (the ASD-STE100 standard, the
  Same Page Conformance feature spec, a Verus release). Nothing in it is
  shipped, and the feature spec's queued SHOULDs are resolved only in a
  generation session with the developer ruling each one.
- Every edit to normative spec text is followed by the self-hosting check
  and a "Decisions and revisions" entry in the spec that changed.
- docs/MANUAL.md explains; the specs legislate. The manual cites LANG and
  CONF identifiers, and tests/manual-identifiers.test.mjs fails if a cited
  identifier is undefined or withdrawn, so a change to a rule's identifier
  or meaning is followed by a manual update in the same change.

## Sync rules (three-file rule)

When a skill is added, renamed, or behavior-changed, update together:
1. its SKILL.md, 2. README.md's skill index, 3. .claude-plugin/plugin.json
skills array, plus its docs/ page. Install commands are copied verbatim
from .agents/install-block.md wherever they appear. A version bump touches
package.json and .claude-plugin/plugin.json together.

## Working agreement (Same Page)

This package governs its own build with a spec set at
docs/specs/same-page/ and the four normative specs at
docs/superpowers/specs/. Both are normative: 00-overview.md is the
keystone and spec map; the LANG, CONF, and ENG specs own their
domains; glossary.md owns vocabulary -- when a term there conflicts
with your prior, the glossary wins.

Baselines: ~/.claude/DEVELOPMENT_PRACTICES.md (defaults accepted) and
~/.claude/BEST_PRACTICES.md (the 14-rule floor). Read both before
working.

## Repo layout

| Path | Role |
|---|---|
| docs/specs/same-page/ | The spec set that governs the build: keystone, glossary, conventions, contracts, evidence map, recon |
| docs/superpowers/specs/ | The four normative specs (design, LANG, CONF, ENG) |
| skills/<name>/ | The three skills and their templates |
| skills/new-project/scripts/ | The drift gate, the language check, and engine/ (Same Page Conformance) |
| tests/ | The suites; scripts and the engine are exercised through their CLI |
| .agents/adr/ | Package-level decisions |

## Scope and re-anchor rules

- The current iteration contract is docs/specs/same-page/iterations/003.md
  (the CONF revision); 001 (L1) and 002 (L2) are closed. Work outside it is captured via /next-iteration --
  surfaced and staged, never implemented ad hoc, never silently dropped.
- When incoming direction contradicts a confirmed spec, return to the spec
  and confirm the change deliberately before acting.
- New or collided terms go to glossary.md the moment they surface.
- Still Observed: docs/specs/same-page/recon.md (by nature). Still Draft:
  every section of the engine spec without an `Agreed:` line, and the
  design, LANG, and CONF specs as files (recon.md Gaps). Observed and
  Draft sections are not contract.

## Verification

Copied from docs/specs/same-page/conventions.md:

    bun test
    node skills/new-project/scripts/language-check.mjs docs/specs/same-page docs/superpowers/specs
    bunx tsc --noEmit -p skills/new-project/scripts/engine
    grep -rnP '[^\x00-\x7F]' --include='*.md' --include='*.mjs' --include='*.ts' --include='*.json' --include='*.sh' . --exclude-dir=.git --exclude-dir=.remember --exclude-dir=reference --exclude-dir=node_modules
    claude plugin validate . --strict
