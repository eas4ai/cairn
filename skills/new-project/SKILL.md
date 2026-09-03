---
name: new-project
description: Guided documentation workflow that puts model and developer on the same page -- scaffolds a complete ara2-style spec set (glossary, keystone overview, ux, numbered domain specs, conventions, iteration contract) through a staged, confirm-back conversation. Use at the start of a new project. For a codebase that already exists, use /existing-project instead.
disable-model-invocation: true
---

# /new-project -- the Same Page workflow

You are guiding a developer through creating a complete spec set. The goal
is mutual agreement on terms, direction, and goals -- the model's
information and the developer's experience meeting as equals. Templates for
every artifact are in this skill's templates/ directory.

## Setup -- the drift gate

This skill ships Same Page's completion gate at scripts/spec-drift-gate.mjs
(inside this skill's installed directory). It audits each session once, at
completion, in any project with a spec set -- scope, spec fidelity, and the
rule 13 production self-evaluation. Before Stage 0, check that it
is registered:

- Installed as the Claude Code plugin: the plugin already registers it;
  skip this section.
- Installed via the skills CLI into Claude Code: if the project's
  .claude/settings.json does not already register spec-drift-gate.mjs,
  offer to add it -- create the file if absent, append to existing hooks
  arrays, never overwrite unrelated entries. Use this shape, replacing
  SKILL_DIR with this skill's installed directory as an absolute path:

  {"hooks": {"TaskCompleted": [{"hooks": [{"type": "command", "command":
  "node \"SKILL_DIR/scripts/spec-drift-gate.mjs\"", "timeout": 15}]}],
  "Stop": [{"hooks": [{"type": "command", "command":
  "node \"SKILL_DIR/scripts/spec-drift-gate.mjs\"", "timeout": 15}]}]}}

This skill also ships the language check at scripts/language-check.mjs
-- pass one of the deterministic check. It is not a hook; run it on
demand against the spec directory (node SKILL_DIR/scripts/
language-check.mjs docs/specs/<project-name>) at the points the stages
name below. It reads, reports, and exits nonzero on findings; it never
writes.

This skill also ships the engine, Same Page Conformance, at
scripts/engine/same-page.ts: TypeScript run directly by node (22.18 or
later) or by bun, no install, no dependencies. Its two commands are
`elaborate` (run at stage close: writes .same-page/policy.yaml on first
use and one obligation file per Agreed MUST or MUST NOT requirement from
the confirmed requirements and falsifiers) and `verify` (reports
obligations whose requirement or falsifier changed, Agreed requirements
with no obligation, and each obligation's verdict against the policy).
Invocation: node --disable-warning=ExperimentalWarning SKILL_DIR/scripts/engine/same-page.ts elaborate, from the project root.

Once implementation exists, four more commands carry the evidence:
`trust <validator>` grants execution trust to a validator definition
under .same-page/validators/, recorded outside the repository under
the developer's home directory; `run` executes trusted validators as
argv and writes one evidence record per obligation that lists them,
each with its identity block and the environment fingerprint the
definition declares;
`attest <REQ-ID>` records manual evidence by a named human with an
expiry; `acknowledge <REQ-ID>` records the developer's acknowledgment
of a revision that clears a standing disproof; `challenge` runs the challenges a validator declares and records what
they demonstrated about noticing the falsifier; `sync-map` writes the
machine view of coverage into the evidence map, and is the only engine
command that writes it. `verify` then reports,
per requirement, the verdict (FAILING, BLOCKED, INSUFFICIENT,
SUFFICIENT), what the policy requires, the evidence present with its
freshness, the authority and snapshot, the boundary, the dependency
chain, the environment fingerprint, the residual risk, and the
assumptions. Freshness is `current`, `stale` (an identity input such
as the snapshot, the validator definition, or a declared environment
input is known to differ: INSUFFICIENT, re-run named), or `unknown`
(one cannot be computed: BLOCKED). A validator definition declares
`environment:`, the inputs its result depends on (`- command: [argv]`
whose output is the fingerprint, `- file: path` whose digest is, or
[] for none); without it the validator produces no record, and
`verify` re-runs a declared command only under the validator's trust
grant or `verify --as-developer`. Trust is the developer's act: run `same-page trust` or
`run --as-developer` only when the developer says so, naming the
validator; never as part of scaffolding. A policy downgrade
(`same-page verify` reports it) is confirmed by the developer with
`same-page policy confirm` and recorded in the affected spec's
Decisions and revisions; a disproof-clearing revision is acknowledged
by the developer, then `same-page acknowledge` and the same log entry.
The policy names the authority whose evidence counts (`ci`, `local`,
or a named environment the developer trusted with `same-page trust
--environment <name>`); the first `elaborate` writes `ci` when the
repository carries CI configuration, else `local`. Evidence of another
authority is shown with its authority named and never passes as
authoritative. `verify` also reports every evidence-map row that
disagrees with the machine view; resolve each one by correcting the map
in the confirm-back loop, or by running `same-page sync-map` when the
machine view is right, and never by editing a row to hide a
disagreement.

A challenge is the one question a passing validator cannot answer:
whether the mechanism notices the violating state. A validator
definition declares `challenges:` -- a mechanism (mutation,
fault-injection, negative-fixture, double, counterexample-search,
adversarial-input, harness), a reviewable `artifact` that exists, a
`command` that realizes the violating state and runs the validator, and
`from_falsifier` with the `requirement` it realizes. Ask the developer
before adding one, name the falsifier it realizes, and never claim
challenged sensitivity by hand. A challenge the validator passes is
weak sensitivity: report it as a finding about the mechanism, never as
a fault in the requirement.

Layers L1 through L5 are built; ecosystem adapters with boundaries
narrower than the repository are the next layer, under its own
iteration contract.

- Codex: offer the same command on Stop in .codex/hooks.json.
- If the developer declines, continue without it and note the decline in
  the working agreement at Stage 6: the workflow functions unassisted, the
  contract carried by instructions alone.

## Standing rules (all stages)

1. Surface interpretations; never silently resolve ambiguity. When you meet
   an ambiguous or loaded term, state your reading and ask -- plain text,
   open-ended, one question per message.
2. Confirm understanding in your own words before writing any artifact.
   Parroting hides misunderstanding; restating exposes it.
3. New terms get glossary entries the moment they emerge, at any stage,
   under Project terms. The Working vocabulary section is the standard
   dictionary, identical in every project by default; a project changes
   an entry only by a recorded ruling (a _Ruling_: line on the entry),
   and the language check reports any change without one.
4. A stage never closes on unconfirmed understanding.
5. Depth is calibrated in Stage 0, never assumed.
6. Normative spec text is written in Same Page Technical English: one
   obligation per sentence, exactly one of "MUST", "MUST NOT", or
   "MAY", the actor named, the condition first, requirement
   identifiers where the spec declares a prefix. Before any stage that
   wrote or revised normative text closes, run the language check;
   findings resolve through the confirm-back loop -- propose the
   rewrite, never apply it silently.
7. Every requirement confirmed Agreed carries a confirmed falsifier.
   When the developer confirms a MUST or MUST NOT requirement, ask:
   "What observable state would violate this agreed requirement?"
   State the proposed falsifier in your own words and have the
   developer confirm it; the question doubles as a comprehension
   test, so a wrong guess is the point of asking. A permission-only
   MAY requirement has no falsifier, because permitted behavior is
   not itself obligatory -- when a limit on that behavior matters,
   write the limit as its own MUST or MUST NOT requirement with its
   own falsifier.

## Stage 0 -- Baseline and orientation

First, the baseline modification check. Locate DEVELOPMENT_PRACTICES.md
(project root, then the user-level agent directory, e.g.
~/.claude/DEVELOPMENT_PRACTICES.md). Then:

- Absent, or frontmatter says "status: default": offer onboarding. If
  accepted: harvest candidate rules from evidence (existing CLAUDE.md
  working agreements, per-project memories, corrections the user has given
  you), confirm each rule in your own words before it enters the document,
  write the personalized copy from templates/development-practices.md, set
  "status: personalized" plus today's date. If declined: copy the template
  as-is with "status: defaults-accepted" -- the defaults function; never
  re-ask on any future run.
- "status: personalized" or "status: defaults-accepted": skip onboarding
  entirely.

Note whether BEST_PRACTICES.md exists (sibling package); reference it in
Stage 6 only if present.

Then orientation. First look at the directory: if it already holds a
codebase (source, manifests, tests) or a spec set (docs/specs/<name>/
00-overview.md, or the SAME_PAGE_SPECS_DIR location), stop here and
switch to /existing-project, which adopts the code from evidence and
verifies an existing spec set against it -- this workflow designs
software that does not exist yet; over existing code it documents intent
nobody specified, and over an existing spec set it overwrites agreed
specs. Otherwise: what kind of project (app,
CLI, library, service); what documentation depth is warranted (a weekend
tool gets 00-overview plus one domain spec; a product gets the full set).
Confirm the calibration.

## Stage 1 -- Shared vocabulary -> glossary.md

Copy templates/glossary.md to docs/specs/<project-name>/glossary.md (create
the directory; confirm the location with the user). The default docs/specs/
path is what the drift gate reads; if the developer chooses a different
location, tell them the gate needs SAME_PAGE_SPECS_DIR set to that path in
its hook environment, and record the choice in the working agreement. The
working vocabulary arrives pre-seeded: it is the standard dictionary,
and the developer agrees to it before anything is built on it. Present
it as a whole and ask which terms they would rule differently for this
project; record each ruling as a _Ruling_: line on that entry (date --
reason). If a standard term is ambiguous in this project -- it collides
with a domain term, or its definition does not fit -- say so before
proceeding, and record the resolution under Flagged ambiguities. The
language check reports any change to a standard entry that carries no
ruling. Then name the project's own terms:
propose the 5-15 terms you expect to matter, define each in the project's
sense TOGETHER, one at a time, and record them in the exemplar format (bold
term, tight definition, Avoid line). Terms enter only after confirmed
understanding.

## Stage 2 -- Direction -> 00-overview.md, first pass

From templates/00-overview.md. Fill Purpose, Design principles, and
Supported and excluded scope. State your understanding of the project's
purpose in your own words first; write only after the developer confirms.
Leave System architecture, Cross-cutting requirements, Spec map, Revision
policy, and Completion criteria for Stage 5.

## Stage 3 -- Interaction -> ux.md

From templates/ux.md. How the user interacts with the software --
interaction model, journeys, surface map, decision points, error and
recovery flows, platform divergences. For products without a human
interface, the interaction model is its API or CLI surface; scale the
document, do not skip it unless the developer agrees it has no user at all.

## Stage 4 -- Domains and features -> NN-<domain>.md

Enumerate candidate features with the developer. Partition them into
bounded domains; confirm the partition before writing anything. Then write
each numbered spec from templates/domain-spec.md, one at a time, each
through the confirm-back loop. Features carry their acceptance criteria.
Health rules: a spec outgrowing a single coherent read means split the
domain; a cross-domain feature lives in its primary domain and is
cross-referenced from the other, ux.md holding the map; small projects use
fewer numbers, same shape. Capabilities and acceptance criteria are
normative text: identified SPTE requirements as the domain template
shows. As each requirement is confirmed, ask the falsifier question
(standing rule 7) and record the confirmed falsifier on a Falsifier:
line directly under the requirement, in plain English with no
normative keyword. Run the language check on the spec directory before this
stage closes.

## Stage 5 -- Technical shape -> overview completed + conventions.md

Complete 00-overview.md now that domains exist: System architecture (tech
choices with the why), Cross-cutting requirements, the Spec map table,
Revision policy, System completion criteria. Write conventions.md from its
template, including the project's exact verification commands. Then
reference leveling, ON BY DEFAULT: vendor authoritative upstream docs for
the chosen stack into reference/ so future sessions consult sources, not
memory. The developer can decline for this project; record the decline in
the overview's Decisions and revisions.

## Stage 6 -- Scope contract -> iterations/001.md + working agreement

From templates/iteration.md: negotiate which domain specs (or sections) are
IN iteration one, the explicit OUT list, and the definition of done. Then
scaffold the evidence map, docs/specs/<project-name>/conformance.md,
from templates/conformance.md: one table per prefix, one row per
requirement identifier, every row Uncovered with method "-" -- the
honest starting claim for a project with no code yet. Coverage and
method are separate columns; neither is read out of the other. Run the
language check once more over the whole spec set; it verifies the
map's integrity along with the language.

Then elaborate. Run the engine (Setup section) from the project root:
`same-page elaborate`. On first use it writes .same-page/policy.yaml
with the project default profile and the spec directory, then one
obligation file per Agreed MUST or MUST NOT requirement under
.same-page/obligations/, each carrying the requirement locator, the
requirement and falsifier digests, the confirmed falsifier, and the
profile. Nothing in it is hand-authored, and the developer is not asked
to confirm a digest, a locator, or a YAML field. The default profile
applies without a question; ask only when a requirement needs a profile
that differs from it, and record that as a domain override in
policy.yaml or on the obligation. Commit .same-page/ (its own
.gitignore keeps evidence/ and cache/ out). A finding from elaborate --
an Agreed MUST with no Falsifier line, a MAY carrying one -- goes back
through the confirm loop before the stage closes.

Then
write the working agreement block (templates/working-agreement.md, filled
with real paths, the repo layout table, and verification commands) into the
project's CLAUDE.md or AGENTS.md -- create the file if absent, append the
block if the file exists, never overwrite unrelated content. Reference
DEVELOPMENT_PRACTICES.md always, BEST_PRACTICES.md only if present.

## Closing

Summarize what exists and where. Remind the developer: new ideas go through
/next-iteration; the drift gate will audit sessions against
iterations/001.md; `same-page verify` answers, per requirement, what
evidence the policy requires and what exists.
