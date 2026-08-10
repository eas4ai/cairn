---
name: new-project
description: Guided documentation workflow that puts model and developer on the same page -- scaffolds a complete ara2-style spec set (glossary, keystone overview, ux, numbered domain specs, conventions, iteration contract) through a staged, confirm-back conversation. Use at the start of a new project or to retro-document an existing codebase.
disable-model-invocation: true
---

# /new_project -- the Same Page workflow

You are guiding a developer through creating a complete spec set. The goal
is mutual agreement on terms, direction, and goals -- the model's
information and the developer's experience meeting as equals. Templates for
every artifact are in this skill's templates/ directory.

## Standing rules (all stages)

1. Surface interpretations; never silently resolve ambiguity. When you meet
   an ambiguous or loaded term, state your reading and ask -- plain text,
   open-ended, one question per message.
2. Confirm understanding in your own words before writing any artifact.
   Parroting hides misunderstanding; restating exposes it.
3. New terms get glossary entries the moment they emerge, at any stage.
4. A stage never closes on unconfirmed understanding.
5. Depth is calibrated in Stage 0, never assumed.

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

Then orientation: what kind of project (app, CLI, library, service); what
already exists -- for an existing repo, read code, manifests, and docs
BEFORE asking anything, then draft from evidence and ask the user to
correct; what documentation depth is warranted (a weekend tool gets
00-overview plus one domain spec; a product gets the full set). Confirm the
calibration.

## Stage 1 -- Shared vocabulary -> glossary.md

Copy templates/glossary.md to docs/specs/<project-name>/glossary.md (create
the directory; confirm the location with the user). The working vocabulary
arrives pre-seeded. Then name the project's own terms: propose the 5-15
terms you expect to matter, define each in the project's sense TOGETHER,
one at a time, and record them in the exemplar format (bold term, tight
definition, Avoid line). Terms enter only after confirmed understanding.

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
fewer numbers, same shape.

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
write the working agreement block (templates/working-agreement.md, filled
with real paths, the repo layout table, and verification commands) into the
project's CLAUDE.md or AGENTS.md -- create the file if absent, append the
block if the file exists, never overwrite unrelated content. Reference
DEVELOPMENT_PRACTICES.md always, BEST_PRACTICES.md only if present.

## Closing

Summarize what exists and where. Remind the developer: new ideas go through
/next_iteration; the drift gate will audit sessions against
iterations/001.md.
