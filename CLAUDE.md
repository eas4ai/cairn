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
Same Page Technical English (SPTE) and the evidence map.

Three normative specs in docs/superpowers/specs/ govern this package; read
the relevant one before a structural change:

- 2026-08-10-same-page-design.md: the package, the three skills, the spec
  set, the drift gate.
- 2026-09-01-same-page-technical-english.md: the language (LANG-nnn).
- 2026-09-01-same-page-conformance.md: the language check and the evidence
  map (CONF-nnn). "Same Page Conformance" names the evidence engine that
  comes next: its feature spec is in reference/, its specs are generated
  at stage 8 with the developer ruling each open SHOULD, and it is built
  on the check and the map. Never describe it as absent, deferred, or
  optional. Sequencing is the developer's, and so is any deferral.

## Commands

    bun test                                          # every suite in tests/; must pass before commit
    bun test tests/language-check.test.mjs            # one suite
    bun test -t "CONF-045"                            # one test by name substring
    node skills/new-project/scripts/language-check.mjs docs/superpowers/specs
                                                      # self-hosting check; must report no findings
    claude plugin validate . --strict                 # after touching .claude-plugin/ or hooks/hooks.json
    grep -rnP '[^\x00-\x7F]' --include='*.md' --include='*.mjs' --include='*.json' --include='*.sh' .
                                                      # ASCII gate (excluding .git, .remember, reference); must return nothing
    ./scripts/link-skills.sh                          # symlink skills into ~/.claude/skills and ~/.agents/skills

Tests spawn the scripts with node against temp directories, so a change
to either script is exercised only through its CLI contract (stdin, env,
exit code, stderr). Live-install verification goes through the plugin
CLI: uninstall, `claude plugin marketplace add` the local path, install,
then confirm the cached copy under ~/.claude/plugins/cache/ carries the
change before trusting the version label.

## Architecture

The package is markdown plus two scripts; the architecture is the set of
conventions that tie the files together.

Distribution is three channels over one tree. The skills CLI installs
skills/*/ as-is; the Claude Code plugin (.claude-plugin/plugin.json +
marketplace.json, hooks/hooks.json) adds automatic gate registration;
Codex gets .codex/hooks.json. Both scripts live under
skills/new-project/scripts/ precisely so every channel carries them
(ADR 0004). Hook registrations invoke node, never bun (ADR 0003).

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
docs/superpowers/specs/glossary.md supplies the Avoid terms for that run,
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
