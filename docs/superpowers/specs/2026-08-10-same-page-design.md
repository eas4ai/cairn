# Same Page -- Design

**Date:** 2026-08-10
**Status:** Draft for review
**Working name:** Same Page (slug: `same-page`)

## Why this exists

Models contain more information than the users they assist; users carry
experience that no training run contains. Information is not experience -- users
regularly present solutions a model had not considered, because those solutions
come from having lived the problem. This asymmetry of *kind* leaks into
language from both sides: terms drawn from the model's breadth of information
land as ambiguous to a reader standing on different footing, and documentation
written from the model's priors gets labeled "slop" -- often not because it is
wrong, but because writer and reader were never on the same page. In the other
direction, a user's term ("UX/UI specification") can mean something narrower or
different than the model's default reading, and the model drifts confidently in
the wrong direction.

The fix is not better templates. It is a **cooperative documentation workflow**
that levels understanding in both directions *before* anything is specified --
the model's information and the user's experience meeting in mutual agreement
on terms, direction, and goals from the beginning, recorded in artifacts that
every future session inherits.

The written artifacts also serve both parties in a way live conversation
cannot. Human communication quality fluctuates under pressure -- finances,
fear, fatigue, the argument that happened an hour before the session -- and a
model reading a volatile message has no reliable way to separate the
instruction from the weather around it. Confirmed specs are a stable third
thing both sides can anchor to when the conversation itself is having a bad
day: the user is protected from their hardest moments becoming silent
contracts, and the model is protected from mistaking weather for direction.

Evidence this works: Suprnova (`/home/shawn/workspace2/suprnova/`) -- a
Laravel-inspired Rust framework taken to production quality by spec'ing
everything first. Its organically-grown patterns (working-agreement CLAUDE.md,
spec/plan pairs, `REMAINING-WORK.md` backlog, vendored `reference/` docs) are
the proven shapes this package generalizes.

Secondary driver: scope creep. It is addressed two ways --
1. **Complete specifications from the beginning** (the `/new-project` workflow).
2. **A pressure valve for new ideas**: specifications for the *next* iteration,
   written context-aware of the current project, instead of ad-hoc expansion of
   the current build (`/next-iteration`).

## Goals

- A standard, repeatable way to document a project at its start, and to keep
  guiding development after the start.
- Put model and developer on the same page: shared vocabulary, confirmed
  understanding, explicit scope.
- Establish a per-developer baseline on the first `/new-project` run:
  `BEST_PRACTICES.md` (universal discipline, from the sibling package) plus
  `DEVELOPMENT_PRACTICES.md` (the developer's rules of the road), loaded by
  every project's working agreement thereafter.
- Produce a *set* of specs (keystone overview, interaction, numbered domain
  specs, conventions, iteration contract) -- not a single design doc, and
  ingestible for large projects: each spec one coherent read, routed by the
  overview's spec map.
- Work for greenfield projects and existing codebases.
- Multi-assistant, full coverage in one release, delivered by the Agent
  Skills standard rather than hand-authored adapters: the workflows ship as
  spec-compliant skills installable into ~75 agents via the skills CLI
  (`npx skills add`), plus a tool-neutral workflow document any agent can
  follow.
- Stay light: markdown skills, one dependency-free JavaScript hook, no
  installer of our own. Authored and tested with Bun; the hook itself runs
  under Bun or Node unchanged, so consumers need only what they already have.

## Non-goals

- **Not a replacement for `best-practices-agent-package`.** That package and
  its hook stay untouched; users currently depending on it feel nothing. This
  package is a sibling that references it as the companion for coding
  standards.
- **Not an implementation planner.** Specs say *what* and *why*. Turning an
  iteration contract into an implementation plan remains the job of existing
  tools (e.g. superpowers writing-plans) or the assistant's native planning.
- **Not a visual design system.** UX here means how the user interacts with
  the software -- journeys, surfaces, flows -- not typography and color. Visual
  design language belongs to dedicated tooling (e.g. ui-craft).
- **The drift gate is not a file-to-feature verifier.** Deterministically
  mapping changed files to spec'd features is not attempted; like the
  sibling's todo gate, the hook enforces a mandatory anchored self-audit, and
  deterministic guarantees remain the job of tests, lint, and CI.

## Package identity

Sibling to `best-practices-agent-package`: same philosophy, independently
installable, the sibling untouched. Built in the repository formerly named
`project_documentation_templates` (renamed `same-page`, GitHub
`eas4ai/same-page`), which this package supersedes -- the year-old
templates are raw material and remain in git history.

Structured as an Agent Skills repository, distributed with the skills CLI
(skills.sh). One skill set installs into every supported agent (~75,
including Claude Code, Codex, Cursor, Copilot, Windsurf, Cline, and Gemini)
at each agent's native path -- no hand-authored per-tool adapters, no
installer of our own.

```text
same-page/
  README.md                      What it is, install block, skill index
  CLAUDE.md                      Repo conventions for agents working here
  AGENTS.md -> CLAUDE.md         Symlink (exemplar convention)
  LICENSE
  package.json                   Changesets tooling; private
  skills.sh.json                 Groupings for the repo's skills.sh page
  skills/
    new-project/
      SKILL.md                   The guided documentation workflow (/new-project),
                                 including the baseline check + onboarding stage
      templates/                 development-practices seed, glossary,
                                 00-overview, ux, domain-spec (numbered),
                                 conventions, iteration, evidence map,
                                 working agreement
                                 (index block); ADR entry format embedded in
                                 the overview and domain-spec templates
    existing-project/
      SKILL.md                   The adoption workflow (/existing-project):
                                 recon from evidence, observed specs,
                                 documentation gap, one-feature or
                                 one-defect contract
      templates/                 recon report, defect record (the spec set
                                 reuses new-project's templates)
    next-iteration/
      SKILL.md                   The scope-creep valve (/next-iteration);
                                 carries inline fallback structure if
                                 new-project's templates are not co-installed
  skills/new-project/scripts/spec-drift-gate.mjs      Spec-anchored completion gate (Bun or Node)
  skills/new-project/scripts/language-check.mjs       Deterministic SPTE language + conformance-map check
  tests/spec-drift-gate.test.mjs Gate test suite (run with bun test)
  tests/language-check.test.mjs  Language check suite (run with bun test)
  .claude-plugin/
    plugin.json                  Claude Code plugin: 3 skills + hook
    marketplace.json             Single-plugin marketplace fallback
  .codex/hooks.json              Drift-gate registration for Codex
  .agents/
    install-block.md             Canonical install commands, copied verbatim
    invocation.md                User-invoked vs model-invoked conventions
    adr/                         Package-level decision records
  scripts/link-skills.sh         Symlink skills into local harness dirs
  docs/
    WORKFLOW.md                  Tool-neutral statement of the staged workflow
    INSTALLATION.md              Channels + hook registration notes
    <skill-name>.md              Human-facing page per skill (4-section template)
```

Templates ride inside their skill's directory so the skills CLI delivers
them wherever the skill installs; both skills install per-project or
globally (`npx skills add -g`) as the user prefers.

## Onboarding -- the two baseline documents

Onboarding is not a separate skill. It is a conditional stage inside
`/new-project`, triggered by a **modification check**: the
`DEVELOPMENT_PRACTICES.md` seed ships with a `status: default` marker in its
frontmatter, and `/new-project` reads it at Stage 0.

- **Absent or `status: default`** -> the onboarding conversation runs first
  (harvest and confirm, below). Completing it flips the marker to
  `status: personalized` with a date.
- **User declines** -> the marker records `status: defaults-accepted`; the
  defaults function as-is (see "Functional by default") and no future
  `/new-project` run re-asks.
- **`status: personalized` or `defaults-accepted`** -> the baseline stage is
  skipped entirely; the workflow proceeds straight to the project stages.

One entry point, self-configuring, asked at most once per developer. The
baseline it establishes is two documents with distinct jobs:

1. **`BEST_PRACTICES.md`** -- universal production discipline. Already exists
   as the sibling package's 14-rule ruleset; onboarding installs or references
   it, never authors a competing copy.
2. **`DEVELOPMENT_PRACTICES.md`** -- the rules of the road. The developer's own
   accumulated working rules, portable across all their projects: scope
   philosophy (no MVPs; no deferring features -- everything in spec ships in
   version 1), communication rules (ASCII only -- no em dashes, arrows, or icon
   glyphs), workflow gates (clean clippy before proceeding to the next task),
   and whatever else the developer has learned to demand. Personal where best
   practices are universal.

The onboarding conversation harvests candidate rules from evidence that
already exists -- per-project memory stores, CLAUDE.md working agreements,
remembered corrections -- and runs each through the confirm-back loop before it
enters the document. (Motivating case: the no-MVP, no-deferring, no-em-dash,
and clippy-gate rules all existed before this package was designed, but were
scattered across three different projects' memory stores and loaded only
there. A rule followed "typically" instead of always has a delivery problem,
not a discipline problem.)

`DEVELOPMENT_PRACTICES.md` lives globally (`~/.claude/DEVELOPMENT_PRACTICES.md`
plus the Codex equivalent) with per-repo override, mirroring the sibling
package's precedence model. The Stage 6 working agreement references both
baseline documents, so every scaffolded project loads them from day one.

### Functional by default, improved by onboarding

The old templates' central flaw was that every line was a `[placeholder]` --
useless until filled. The baseline documents invert that: they ship with
defensible defaults that function for a user who declines or never reaches
the onboarding stage; onboarding personalizes rather than initializes.

**`DEVELOPMENT_PRACTICES.md` default template** -- five sections plus addenda:

1. **Scope** -- the spec is the scope. No unilateral cuts; "out of scope" and
   "deferred" are developer verdicts, never model verdicts -- the model
   surfaces, the developer decides. New ideas route to next-iteration capture.
2. **Completeness** -- no MVP-scoping unless the developer asks for it.
   Features ship whole; "done" means implemented *and* verified.
3. **Communication** -- open-ended questions in plain text, one at a time. No
   decorative glyphs in code, commits, or docs. (Personalization example: this
   package's author tightens to ASCII-everywhere, no em dashes.)
4. **Verification gates** -- leave each task with the project's checks passing
   before starting the next. (Generalized: lint/type/test clean.
   Personalization example: clippy clean between tasks for Rust work.)
5. **Pacing and re-anchor** -- one item in progress at a time; direction that
   contradicts a confirmed spec is re-anchored and confirmed before action.
6. **Personal addenda** -- where onboarding-harvested rules land.

**`glossary.md` default template** -- format adopted from the exemplar repo's
`CONTEXT.md` and `GLOSSARY-FORMAT.md` (proven in production): each entry is
`**Term**:` plus a tight one-or-two-sentence definition of what the term IS,
followed by `_Avoid_:` listing the rejected synonyms -- opinionated
anti-vocabulary that blocks synonym sprawl. Sections for **Relationships**
(how terms compose) and **Flagged ambiguities** (an append-log of term
collisions and their resolutions) join the two content parts. The exemplar's
rules carry over: a term enters only after confirmed understanding (the
confirm-back loop, verbatim); definitions use the glossary's own terms;
entries are revised in place as understanding deepens, never left stale.
Two content parts:

- **Working vocabulary (pre-seeded, ships in every copy)**: the terms where
  model priors and developer intent most reliably split, defined once:
  *done* (implemented and verified, not "code written"); *complete* (nothing
  remaining, not "mostly"); *defer* (a developer verdict, never a model
  verdict); *MVP* (not used in this methodology -- the spec is the scope);
  *refactor* (behavior-preserving by definition -- behavior change is a
  feature or a fix); *spec* (the agreed contract, not a suggestion);
  *iteration* (the current scope contract); *drift* (any divergence between
  artifact and behavior). This section levels the most common frictions
  before a single project term exists.
- **Project terms (written in Stage 1)**: entry format plus one worked
  example seeded in the template's Flagged ambiguities section: "*UX
  specification* -- collided between visual design language and interaction
  design; resolved: how the user interacts with the software (flows,
  surfaces, journeys). _Avoid_: UI design, design language." A real friction
  case, resolved in one entry, demonstrating the both-directions leveling.

Boundary: this principle applies fully to the baseline documents and the
glossary. The per-project specs (overview, ux, features, architecture) cannot
have universal defaults -- their content *is* the project -- so their version
of the principle is structure plus worked examples, never bracketed
placeholders.

## The guided workflow -- `/new-project`

The heart of the package. Not "interview, then fill templates" -- a staged
conversation with binding rules, where each stage ends in a confirmed artifact
before the next begins. The old `model-instructions.md` is reborn as this
workflow definition inside the skill, where it actually gets loaded and
followed.

### Standing rules (all stages)

1. **Surface interpretations, never silently resolve ambiguity.** When the
   model meets an ambiguous or loaded term, it states its reading and asks --
   in plain conversational text, one question at a time.
2. **Confirm understanding in the model's own words** before writing any
   artifact. Parroting the user back hides misunderstanding; restating in
   different words exposes it.
3. **New terms get glossary entries** the moment they emerge, at any stage.
4. **A stage never closes on unconfirmed understanding.**
5. **Depth is calibrated, not assumed** -- a weekend CLI and a product get
   different documentation depth, decided explicitly in Stage 0.
6. **Agreement carries a falsifier.** When a requirement becomes Agreed,
   the model asks what observable state would violate it, states its own
   reading, and the developer confirms. The question is a comprehension
   test: a model that cannot name the violating state has not understood
   the requirement it just wrote. A permission-only MAY requirement has no
   falsifier; a limit worth enforcing becomes its own MUST or MUST NOT.

### Stages

**Stage 0 -- Orientation.**
Runs the baseline modification check first (see Onboarding above), inserting
the onboarding conversation when the developer's baseline is absent or still
default. Then: if the directory already holds a codebase or a spec set,
hand off to `/existing-project` (below); this workflow designs software
that does not exist yet, and must not overwrite agreed specs. Otherwise:
what kind of project; what documentation depth is warranted.

**Stage 1 -- Shared vocabulary -> `glossary.md`.**
Name and define the domain's terms in the project's sense, before they are
used to specify anything. This is the level-playing-field mechanism. Future
sessions inherit definitions instead of re-deriving them from priors -- drift
prevention at the vocabulary level, where drift starts. The template arrives
pre-seeded with the working vocabulary (see "Functional by default" under
Onboarding), so leveling begins before the first project term is defined.

**Stage 2 -- Direction -> `00-overview.md`, first pass.**
Purpose, design principles, users, success criteria, supported and excluded
scope -- the keystone spec opened in the ara2-bridge shape, completed in
Stage 5 once the domains exist.

**Stage 3 -- Interaction -> `ux.md`.**
How the user interacts with the software (see spec set below).

**Stage 4 -- Domains and features -> `NN-<domain>.md`.**
Enumerate candidate features; partition them into bounded domains and confirm
the partition; then write each numbered domain spec, one at a time, with the
confirm-back loop. Features live inside their domain, each carrying its
acceptance criteria. Three health rules travel with the pattern: a domain
spec that outgrows a single coherent read is a signal to split the domain; a
feature spanning domains is spec'd in its primary domain and cross-referenced
from the other, with `ux.md` holding the map; a small project is
`00-overview` plus one or two numbered specs -- fewer numbers, same shape
(Stage 0 depth calibration).

**Stage 5 -- Technical shape -> `00-overview.md` completed + `conventions.md`.**
The overview's second pass, now that domains exist: system architecture, tech
choices and their rationale, cross-cutting requirements, the spec map,
revision policy, and completion criteria. Plus `conventions.md` --
implementation standards and patterns. Then **reference leveling, on by default**: vendor
authoritative upstream docs for the chosen stack into a `reference/`
directory, so future sessions consult sources, not memory. (Pattern proven in
Suprnova's `reference/` of vendored Laravel docs.) The developer can decline
for a given project -- recorded in the overview's decisions log -- but the
workflow's default is to vendor, because a leveling step that must be
remembered is a leveling step that silently never happens.

**Stage 6 -- Scope contract -> `iterations/001.md` + index block.**
Which domain specs (or sections within them) are IN iteration one, an
explicit OUT list, and definition of done. Then the workflow writes the index block into the project's
`CLAUDE.md`/`AGENTS.md`: a working agreement (Suprnova pattern) pointing at
the spec set, the standing instruction that out-of-scope work is captured via
`/next-iteration` rather than implemented ad hoc, and -- if the project has
them -- the concrete verification commands. The working agreement references
both baseline documents from onboarding -- `DEVELOPMENT_PRACTICES.md` and, when
the sibling package is installed, `BEST_PRACTICES.md` -- and works standalone
when either is absent.

The working agreement also carries the **re-anchor rule** for every future
session: when incoming direction contradicts a confirmed spec, return to the
spec and confirm the change deliberately before acting on it. Scope-affecting
directives that arrive in the heat of a moment are captured (decision log or
`/next-iteration`) and decided calmly, never absorbed reactively. This
protects both parties: the user from decisions made in their worst moments,
the model from steering by signals that were never really direction.

## The adoption workflow -- `/existing-project`

The same spec set, reached from the other direction. `/new-project` once
claimed to cover existing codebases through its Stage 0 evidence-first
rule, but what it then ran was the full spec-writing conversation: it
documented the whole project before any work could start, and it wrote
retro-documentation in the voice of design intent, which misstates a
codebase nobody specified. It also left the drift gate inert exactly
where scope discipline matters most, since the gate activates only when
`00-overview.md` exists. Adoption is therefore its own user-invoked skill
(ADR 0006).

Two sources of truth, kept apart: the code says what the system does; the
developer says what it should do. The model drafts from the first and the
developer corrects. Standing rules are `/new-project`'s five plus three:
every statement about the codebase carries a path (a claim without
evidence is a question, not a finding), observed is not agreed, and drift
is a finding, never a quiet fix.

Two entry paths, decided in Stage 0. Path A, no spec set: write observed
specs and the first contract. Path B, a spec set exists: verify it
against the code, record the drift, extend where the work needs, and
route the work through `/next-iteration`. On Path B the valve is not
opened until Stages 0 through 3 are done -- a staged spec written before
recon is written from priors, not from the project.

**Stage 0 -- Baseline and recon.** The baseline check; on Path B, the spec
set read before the code so its vocabulary governs. Then reading before
asking: manifests, entry points, schema, tests, CI, other docs, recent
history (on Path B, every commit since the specs were last revised -- the
window where drift lives). Output is `recon.md` in the spec set, four
cited buckets: exists, documented (on Path B, the spec and section),
contradicted (docs or specs versus code, both sides cited -- the bucket
that pays for the exercise), unverified. Depth is calibrated by the work,
not the codebase: the developer names the feature or defect, the model
traces its blast radius, and only that radius is documented or verified
to domain depth. Documenting everything first is the failure mode the
stage exists to prevent.

**Stage 1 -- Vocabulary from the code.** Path A: glossary terms drafted
from the identifiers that exist. Path B: the existing glossary wins;
only renames, missing terms, and collisions are drafted. The code's names
win over the model's synonyms; collisions are logged as flagged
ambiguities.

**Stage 2 -- Observed specs, or verification.** Path A: `00-overview.md`
and one domain spec per domain in the radius, written in the designed
shape (normative language, acceptance criteria) so that confirmation is a
status change rather than a rewrite, and marked
`Status: Observed (as-built; unconfirmed)`. Path B: each spec section in
the radius is reported as holds, drifted (raised with both sides cited;
the developer rules whether the spec is revised in place and logged, or
the code is wrong and a defect record follows), still observed from a
previous pass, or missing (written as observed). Both paths: the
developer confirms observed sections one by one; confirmed sections carry
`Agreed: date`. When the developer says the code is wrong, the observed
text stays as the record of what is, and the intent becomes a defect
record or a staged next-iteration spec. Inferred intent is never written
as agreed. Only Agreed sections may enter an iteration contract's In list,
and the drift gate's audit asks whether Observed text was relied on as
contract.

**Stage 3 -- The documentation gap.** Undocumented behavior, contradicted
docs, untested behavior the work depends on, and (Path B) staged specs
the code has since overtaken, listed in `recon.md` under Gaps with
evidence; the developer decides which close now. Gaps outside the radius
are recorded, never closed in-session; the list is documentation debt,
promoted or cut at iteration close like staged specs. `conventions.md` is
written from (Path A) or verified against (Path B) the checks the project
actually runs.

**Stage 4 -- The work.** With no contract: `iterations/001.md` (In: the
Agreed sections the work changes; Out: every other domain; done:
acceptance criteria plus the project's own checks green). With a
contract: work already in its In list proceeds under it; anything else --
the usual case for a feature or defect that arrived after the contract
was agreed -- goes through `/next-iteration`, whose capture now has the
recon and verified specs as context and whose iteration-close step
promotes it into the next contract. A defect on either branch gets a
first-class artifact: `defects/<slug>.md` with reproduction, evidence,
the Agreed section it violates, root cause when known, and the regression
test the fix ships with -- failing before, passing after, as part of
done. Then the working agreement block, naming which specs are still
Observed and that Observed sections are not contract.

## The spec set

All plain markdown, written into the target project's
`docs/specs/<project-name>/` (ara2-bridge convention; location confirmable in
Stage 0). Sized for agent consumption: each spec a single coherent read,
declarative, normative, no ceremony. The structure follows the pattern proven
in `/home/shawn/workspace2/ara2-bridge/docs/specs/ara2-bridge/`: numbered
domain specs behind a keystone overview, decisions distributed into the specs
they affect.

| File | Owns |
|---|---|
| `glossary.md` | Pre-seeded working vocabulary (the common model/developer divergence terms) plus project terms defined during Stage 1. Entry format: `**Term**:` tight definition, `_Avoid_:` rejected synonyms; with Relationships and Flagged-ambiguities sections. Revised in place, never left stale. |
| `00-overview.md` | The keystone, ara2 shape: purpose, design principles, system architecture with tech choices *and why*, cross-cutting requirements (performance, security, scalability, integration), the spec map, supported and excluded scope, revision policy, completion criteria, and its own decisions log. Absorbs the old overview + tech-stack templates; dependencies get no inventory doc -- lockfiles are ground truth. |
| `ux.md` | **How the user interacts with the software**: interaction model (screens/commands/API call sequences by product type), end-to-end user journeys (first contact -> onboarding -> core loop -> recurring use), surface map (which actions live where, so new features attach instead of sprawling), decision points and branching, error and recovery flows, platform-specific divergences. |
| `NN-<domain>.md` | Numbered domain specs, one per bounded subsystem, features spec'd within their domain. Shared skeleton: status header (Status / Baseline / Last revised), Scope, domain content (capabilities with acceptance criteria, domain flow detail deferring to `ux.md`), Acceptance criteria, Decisions and revisions. Absorbs the old features + functional-requirements + per-feature-flow templates. |
| `conventions.md` | Implementation standards, naming, file-organization rules, patterns, verification commands. |
| `iterations/NNN.md` | Scope contract per iteration: IN list (domain spec/section refs), explicit OUT list, definition of done. |
| `conformance.md` | The evidence map: from Agreed requirement identifiers to implementation evidence, one row per identifier, with coverage (Covered / Asserted / Uncovered), method (the mechanism that produced the evidence), and cited repository paths as three separate columns. Scaffolded all-Uncovered at Stage 6; its integrity is verified by the language check. Defined by the language check and evidence map spec (2026-09-01). Same Page Conformance names the evidence engine specified above that pair. |
| `iterations/next/` | Staged specs for the next iteration (see below). |
| `recon.md` | Written by `/existing-project` only: the cited recon report (exists, documented, contradicted, unverified) plus the Gaps list that is the project's documentation debt. |
| `defects/<slug>.md` | Written by `/existing-project` for a remediation: observed behavior with reproduction, expected behavior with the Agreed section it violates, root cause when known, the regression test the fix ships with. |

`ux.md` owns the map; domain specs own the streets. There is no central
`decisions.md`: every spec carries its own "Decisions and revisions" log
(shared ADR entry format), cross-cutting decisions land in the overview's,
and rationale lives next to what it justifies.

## The scope-creep valve -- `/next-iteration`

When a new idea surfaces mid-development -- from the user or the model -- it
does not enter the current build. The skill:

1. Reads the glossary, current specs, iteration contract, and relevant code.
2. Runs the same confirm-back loop in miniature: states its understanding of
   the idea in its own words; the user corrects.
3. Writes it as a properly-formed spec under `iterations/next/`, shaped to
   slot into its target domain spec at promotion,
   context-aware: which existing components it touches, what it conflicts
   with, what it depends on.

Closing an iteration is a `/new-project`-lite conversation: promote and
negotiate `next/` specs into `iterations/002.md`, carry or cut, re-confirm
scope. (This formalizes the pattern that grew organically as Suprnova's
`REMAINING-WORK.md`.)

## The drift gate -- `skills/new-project/scripts/spec-drift-gate.mjs`

Ships in v1, modeled on the *behavior* of the sibling's
`todo_complete_gate.py` but written as dependency-free JavaScript that runs
under Bun or Node unchanged. Registered on completion events: `TaskCompleted`
and `Stop` for Claude Code (registered by the plugin at install, or offered
by /new-project's first-run setup for skills-CLI installs -- the gate script
ships inside the new-project skill's scripts/ directory, since the core
Agent Skills spec defines no hooks frontmatter), `Stop` for Codex via
`.codex/hooks.json`.
One-time per session via a state marker so it cannot loop.

When a session reaches completion in a project that has a spec set, the hook
blocks once (the sibling's exit-2 pattern) and requires an anchored
self-audit before finishing:

1. Does the session's work stay within the current iteration contract
   (`iterations/NNN.md`)?
2. Was any out-of-contract work performed? If so, it must be surfaced to the
   user and captured (decision log or `iterations/next/`) -- never silently
   shipped, never silently discarded.
3. Did the work make any touched spec untrue (drift check), and did new terms
   enter the conversation that belong in the glossary?
4. Was any spec section still marked Observed relied on as contract? If so,
   confirm it with the developer and mark it Agreed, or keep that work out
   of the contract.
5. The rule 13 self-evaluation: you are delivering production software --
   do not deliver work you know to be deficient. The prompt references the
   nearest `BEST_PRACTICES.md` (repository copy first, then
   `~/.claude/BEST_PRACTICES.md`, mirroring the sibling's precedence) and
   embeds the rule's own text when no ruleset is found, so the
   self-evaluation happens even without the sibling installed.
6. Did normative text written or revised this session pass the language
   check (`scripts/language-check.mjs`, beside this gate), and does
   the evidence map (`conformance.md`) still tell the truth for the
   requirements this session touched? The language and the check are
   defined by the Same Page Technical English spec and the language
   check and evidence map spec (2026-09-01).

If the project has no spec set, the hook does nothing (mirroring the
sibling's no-todo-list behavior). When the sibling package's own hook is
also registered, the audits overlap harmlessly -- each gate fires once per
session; the sibling audits its full ruleset on todo completion, this one
audits scope, spec fidelity, and the release gate.

## What does not carry forward from the old templates

- XML `<DocumentationFunctions>` maps, Creator/Critic/Defender/Judge cycles,
  Windsurf memory-system references, tool-era references
  (`brave_web_search`, `search_files`) -- workflow discipline now lives in
  skills and stage gates.
- The standalone dependencies inventory and dependency-automation helper --
  agents read package manifests directly.
- The monolithic user-flow document -- reborn as `ux.md` (interaction-focused)
  plus per-feature flow sections.

## Delivery and installation

Modeled on `mattpocock/skills` (local exemplar:
`/home/shawn/workspace2/skills/`), which has proven this shape in
production.

- **Primary channel -- the skills CLI**: `npx skills add <owner>/<repo>`
  installs the skill set into any of ~75 supported agents at their native
  paths; `-g` for global. The canonical install commands live in
  `.agents/install-block.md` and are copied verbatim wherever they appear
  (exemplar convention).
- **Claude Code plugin channel**: `.claude-plugin/plugin.json` ships the
  three skills, and Claude Code loads the repository's `hooks/hooks.json`
  on its own (the manifest must not reference it a second time, or the
  hook fails to load as a duplicate), so plugin installation registers
  the drift gate automatically; `marketplace.json` makes the repo its own
  single-plugin marketplace as a fallback route. `claude plugin validate .
  --strict` gates manifest changes.
- **Local development**: `scripts/link-skills.sh` symlinks skills into the
  local harness directories so a `git pull` keeps installs current.
- Skills double as slash commands: `/new-project`, `/existing-project`,
  `/next-iteration`.
- **Invocation discipline** (exemplar convention): `/new-project` and
  `/existing-project` are user-invoked only
  (`disable-model-invocation: true`).
  `/next-iteration` is also model-invocable on purpose: when the model
  detects out-of-contract work mid-session, it can open the valve itself --
  the conversational counterpart of the drift gate.
- **Hook boundary, stated honestly**: the drift gate registers where hook
  systems exist -- Claude Code (via the plugin, or /new-project's offered
registration for skills-CLI installs),
  Codex (`.codex/hooks.json`), and other hook-capable agents per the Agent
  Skills spec. Everywhere else, the working agreement and specs carry the
  contract unassisted, with `docs/WORKFLOW.md` as the tool-neutral statement
  of the staged workflow.
- **Docs pages**: each skill gets a human-facing page under `docs/`,
  following the exemplar's four-section template -- What it does, When to
  reach for it, Common questions, It's working if.
- **Versioning**: changesets, with a CHANGELOG and a version-sync check for
  the plugin manifest (exemplar convention), run under Bun.
- **Package tests**: the drift-gate suite and the language-check suite
  (`bun test`), each built around the two
  ways a completion gate goes wrong -- a false pass that lets out-of-contract
  work finish unaudited, and a false block that wedges the agent in a loop.

## Success criteria

- A new project can go from empty directory to a complete, mutually-confirmed
  spec set in one guided session, with the developer never having to know the
  taxonomy in advance.
- An agent opened in an existing codebase can, in one session, produce a
  cited recon report, observed specs for the work's blast radius, a
  documentation gap list, and a contract for one feature or one defect --
  without documenting the whole codebase first and without any observed
  text being mistaken for agreed intent.
- Mid-development ideas reliably land in `iterations/next/` instead of the
  current build.
- A session in a spec'd project cannot complete without passing the drift
  gate's anchored self-audit: out-of-contract work never finishes silently.
- A fresh session in a documented project can load the index block and
  glossary and act consistently with prior sessions' understanding -- no
  vocabulary re-derivation, no re-litigated decisions.
- Rules the developer taught in one project load in every project: the
  baseline documents centralize what per-project memory stores previously
  fragmented (the no-MVP, no-deferring, no-em-dash, and clippy-gate rules
  being the motivating cases).
- `best-practices-agent-package` is untouched and both packages co-install
  cleanly.

## Open questions

None. Name: Same Page (`same-page`). Reference leveling: vendors by default,
declinable per project.

## Revisions

- 2026-09-01 -- Withdrawn wording. The entry that follows calls
  engine-shaped artifacts "absent by design" and their absence "not a
  defect". That was the model's phrasing, never a developer verdict,
  and it reads as deferral, which this package forbids: defer is a
  developer verdict only. The developer's ruling was sequencing: the
  engine's specs are generated at stage 8, with the developer ruling
  each open "SHOULD", after the language, the check, and the map. Same
  Page Conformance is committed work that comes next. The entry that
  follows stands as history; this one governs.
- 2026-09-01 -- Remediation against the round-five Feature Spec
  consensus: the evidence map's single status column splits into
  coverage and method; the table is named the evidence map, and Same
  Page Conformance is reserved for the evidence engine specified
  separately; the falsifier question joins the confirm-back loop in
  all three skills (standing rule 6). Engine-shaped artifacts --
  obligations, validators, assurance policy, evidence records,
  verdicts, trust anchors, `.same-page/` -- are absent by design until
  that engine's specifications are generated; their absence is not a
  defect in this package.
- 2026-09-01 -- Added Same Page Technical English and the language
  check and evidence map spec (sibling specs of this date): normative spec text is a
  controlled language with requirement identifiers, checked by
  `skills/new-project/scripts/language-check.mjs` (pass one) and by the
  model in-session (pass two); `conformance.md` joins the spec set as
  the requirement-to-evidence map; the drift gate audit gains item 6;
  the glossary template gains the standard dictionary; the domain and
  iteration templates carry worked SPTE examples.
- 2026-08-25 -- Added `/existing-project` as the adoption workflow (ADR
  0006), with two entry paths: no spec set (observed specs, first
  contract) and spec set exists (verify against the code, then route the
  work through `/next-iteration`). `/new-project` hands off to it when it
  finds a codebase and no longer claims to retro-document;
  `/next-iteration` points back to it for a first session in an unread
  codebase. Added the Observed / Agreed status convention to the
  glossary's working vocabulary, `recon.md` and `defects/<slug>.md` to
  the spec set, and item 4 (Observed text relied on as contract) to the
  drift gate's audit.
