---
name: existing-project
description: Gets an agent up to speed on a codebase that already exists -- reads the code before asking anything, writes a cited recon report, and either drafts observed specs (no spec set yet) or verifies the existing spec set against the code (spec drift). Then prepares the session's work: a contract for one feature or one defect, written directly when no contract exists or routed through /next-iteration when one does. Use when opening an agent in an existing project in order to change it. User-invoked.
disable-model-invocation: true
---

# /existing-project -- adopting a codebase

You are getting up to speed on software that already exists, writing down
what you found so every future session inherits it, and preparing one
piece of work: a feature to add or a defect to fix. The code is the source
of truth about what the system does; the developer is the source of truth
about what it should do; you draft from the first and the developer
corrects. /new-project designs software that does not exist yet -- if
that is your situation, use it instead.

There are two entry paths, decided in Stage 0 and marked at each stage:

- Path A, no spec set: docs/specs/<project-name>/00-overview.md does not
  exist. You write observed specs and the first iteration contract.
- Path B, spec set exists: you verify it against the code, record the
  drift, extend it where the work needs, and route the work through
  /next-iteration. Getting up to speed comes first; do not invoke
  /next-iteration until Stages 0 through 3 are complete, because a staged
  spec written before recon is written from priors, not from the project.

This skill's own templates (recon report, defect record) are in its
templates/ directory. The spec set artifacts -- glossary, 00-overview,
domain specs, conventions, iteration contract, working agreement -- use
the new-project skill's templates when it is co-installed (the skills CLI
installs both); the inline structures below are the fallback.

## Setup -- the drift gate

The Same Page completion gate ships inside the new-project skill at
scripts/spec-drift-gate.mjs. Check registration exactly as /new-project's
Setup section describes (plugin install: already registered; skills-CLI
install: offer to add the TaskCompleted and Stop hooks; Codex: offer the
Stop hook). If new-project is not co-installed, say so and continue
unassisted; record in the working agreement at Stage 4 that the contract
is carried by instructions alone.

## Standing rules (all stages)

1. Surface interpretations; never silently resolve ambiguity. State your
   reading and ask -- plain text, open-ended, one question per message.
2. Confirm understanding in your own words before writing any artifact.
3. New terms get glossary entries the moment they emerge, at any stage.
4. A stage never closes on unconfirmed understanding.
5. Depth is calibrated in Stage 0 by the work, never by the size of the
   codebase.
6. Evidence or question. Every statement about the codebase carries a path
   (and a line where it matters). A statement you cannot point at is a
   question for the developer, not a finding.
7. Observed is not agreed. What you read in the code describes what the
   system does. Only the developer can say that is also what it should do.
8. Drift is a finding, never a quiet fix. When the code and a spec
   disagree, raise it; the developer decides which side is wrong.

## Stage 0 -- Baseline and recon

First, the baseline modification check, identical to /new-project Stage 0:
locate DEVELOPMENT_PRACTICES.md (project root, then the user-level agent
directory); onboard if absent or "status: default"; skip if personalized
or defaults-accepted. Note whether BEST_PRACTICES.md exists.

Decide the path: look for docs/specs/<project-name>/00-overview.md (or the
SAME_PAGE_SPECS_DIR location if the working agreement names one). Absent:
Path A. Present: Path B, and read the spec set before the code --
glossary.md, 00-overview.md, ux.md, conventions.md, the current iteration
contract (highest-numbered iterations/NNN.md), anything in
iterations/next/, and a previous recon.md if one exists. The glossary's
terms are your vocabulary from this point on.

Then recon, before asking the developer anything. Read, in this order:

- Manifests and lockfiles (what the stack is, pinned to what).
- Entry points and the public surface: routes, commands, exported API,
  scheduled jobs.
- Data: schema, migrations, models.
- Tests: where they live, how they run, what they cover.
- CI, scripts, Makefiles, containers: the checks the project actually
  runs.
- Existing documentation outside the spec set: README, docs/, ADRs,
  CLAUDE.md or AGENTS.md, comments that carry design intent.
- Recent history: the last few dozen commits, open branches, TODO and
  FIXME markers. On Path B, also every commit since the spec set's newest
  "Last revised" date -- that window is where drift lives.

Write docs/specs/<project-name>/recon.md from templates/recon-report.md
(Path A: create the directory and confirm the location with the developer;
the default docs/specs/ path is what the drift gate reads, and a different
path needs SAME_PAGE_SPECS_DIR in the gate's hook environment, recorded in
the working agreement). A previous recon.md is replaced; carry its
unclosed Gaps rows forward. The report has four buckets, every row cited:

- Exists: what the system is and does.
- Documented: which of that the existing documentation covers, and where.
  On Path B the spec set is the documentation of record; name the spec
  and section.
- Contradicted: where documentation and code disagree, both sides cited.
  On Path B this is spec drift in the glossary's sense, and the bucket
  that pays for the exercise; treat every row as a finding to raise,
  never as a thing to quietly fix on either side.
- Unverified: claims you could not check (runtime behavior behind a
  service you cannot reach, an environment you do not have).

Present the report and let the developer correct your reading.

Then calibrate depth by the work. Ask what the session is for: a feature
to add, or a defect to remediate. Trace its blast radius -- the modules,
routes, tables, jobs, tests, and (Path B) spec sections it touches -- and
cite each. Everything inside the radius is documented or verified to
domain-spec depth in Stage 2; everything outside it gets one line in the
overview's spec map (Path A) or is left as the spec set already has it
(Path B). Confirm the radius before continuing. Documenting or
re-verifying the whole codebase before the work can start is the failure
mode this stage exists to prevent.

## Stage 1 -- Vocabulary from the code -> glossary.md

Path A: copy the glossary template (new-project templates/glossary.md;
fallback: the shape is a pre-seeded Working vocabulary section, Project
terms, Relationships, Flagged ambiguities, entries as bold term, tight
definition, Avoid line). Draft the project terms from the identifiers that
already exist: type and struct names, table names, route names, module
and package names, configuration keys. The code's name for a thing wins
over the synonym you would have chosen.

Path B: the glossary exists and wins. Check its terms against the code:
a term whose code identifier has been renamed, a code concept inside the
blast radius with no glossary entry, a term the docs and the code name
differently. Draft entries or revisions for those only.

Both paths: present each drafted entry with its evidence and ask the
developer to correct; a term enters only after confirmation. Record
collisions under Flagged ambiguities with the resolution the developer
chose.

## Stage 2 -- Observed specs, or spec verification

The status convention, exact strings, read by the gate and by every
future session:

- `Status: Observed (as-built; unconfirmed)` -- drafted from evidence, not
  yet confirmed by the developer.
- `Status: Agreed` with `Agreed: <date>` -- the developer confirmed the
  text describes both what the system does and what it should do. A spec
  set written by /new-project is Agreed throughout; it needs no marker.
- A file may stay Observed while individual sections carry
  `Agreed: <date>` as their first line; the file becomes Agreed when every
  section has.
- Only Agreed sections may appear in an iteration contract's In list.

Path A -- write. 00-overview.md and one numbered domain spec per domain
inside the blast radius, using new-project's templates (fallback: the
overview's sections are Purpose, Design principles, System architecture,
Cross-cutting requirements, Spec map, Supported and excluded scope,
Revision policy, System completion criteria, Decisions and revisions; a
domain spec's are Scope, Capabilities with acceptance criteria per
feature, Acceptance criteria, Decisions and revisions). Domains outside
the radius appear only as one-line rows in the spec map, marked observed.
Every observed artifact states behavior as it IS, in the same normative
shape a designed spec would use ("shall", acceptance criteria that can be
checked), with an evidence path on each capability. Writing it in the
designed shape is deliberate: confirmation becomes a status change, not
a rewrite.

Path B -- verify. For each spec section inside the blast radius, check the
code against it and report one of:

- Holds: the code does what the section says. Cite the evidence and move
  on; nothing is written.
- Drifted: the code no longer does what an Agreed section says. Raise it
  with both sides cited. The developer rules: if the spec is wrong,
  revise it in place and log the change in that spec's Decisions and
  revisions; if the code is wrong, the section stands and the divergence
  becomes a defect record (Stage 4).
- Still Observed: a section left unconfirmed by a previous adoption pass.
  Run the confirm loop below.
- Missing: a domain or capability in the radius that no spec covers.
  Write it as an observed section exactly as Path A would, into the
  existing domain spec or a new numbered one, and add it to the spec map.

Both paths -- the confirm loop. Walk the developer through each observed
section, one at a time. Three outcomes:

- Confirmed as-is: mark the section Agreed.
- Corrected reading: you misread the code; fix the text, cite again,
  re-confirm.
- The code is wrong: the developer says the code does X and it should do
  Y. That is not a spec correction. Keep the observed text as the record
  of what is, and capture the intended behavior as a defect record (Stage
  4) or a staged next-iteration spec. Never write inferred intent as if
  it were agreed.

## Stage 3 -- The documentation gap -> recon.md Gaps + conventions.md

From the recon buckets and Stage 2, list under a Gaps heading in
recon.md:

- Behavior with no documentation anywhere.
- Documentation the code contradicts (carried from the Contradicted
  bucket, now with the spec section that records the truth, or the
  Drifted ruling from Stage 2).
- Behavior the work depends on that has no test.
- Path B: iterations/next/ entries that the code has since made obsolete
  or already implemented; name them so iteration close can cut or
  promote them with evidence.

For each gap inside the blast radius, propose close-now or record; the
developer decides. Closing means the spec section is written or corrected
and confirmed; recording means the gap stays listed with its evidence, as
documentation debt future sessions can see. Gaps outside the radius are
recorded, never closed in this session.

Path A: write conventions.md from evidence -- the verification commands
the project actually runs (from CI configuration, package scripts,
Makefiles, the README), the naming and layout rules as observed, the
error-handling and testing patterns in use. Mark it Observed until
confirmed. Then reference leveling as in /new-project Stage 5: vendor
authoritative upstream docs for the stack into reference/ by default; the
developer may decline for this project, logged in the overview's
Decisions and revisions.

Path B: verify conventions.md's commands against what CI and the scripts
run today; a command that no longer exists or a check CI runs that the
spec does not name is drift, raised and fixed the same way.

## Stage 4 -- The work

Preparation is complete only now. What happens next depends on whether a
contract exists.

No contract (Path A, or Path B with no iterations/ directory): negotiate
iterations/001.md from new-project's iteration template (fallback: In,
Out, Definition of done). In lists the Agreed sections the work changes or
extends, one line each with what "shipped" means. Out names every other
domain. Definition of done is the work's acceptance criteria,
conventions.md's verification commands green, and the touched specs
current.

A contract exists (Path B): read its In list against the blast radius.

- The work is already in-contract: no new artifact; state which In lines
  cover it and proceed under that contract.
- The work is out-of-contract, which is the usual case for a feature or
  defect that arrived after the contract was agreed: it goes through
  /next-iteration, now that you are up to speed. Invoke it. Its capture
  step writes docs/specs/<project-name>/iterations/next/<slug>.md from
  the recon and the verified specs, not from priors; its iteration-close
  step promotes the staged spec into the next contract when the developer
  says the current iteration is done. Do not implement anything under the
  current contract in the meantime.

For a defect, on either branch: write
docs/specs/<project-name>/defects/<slug>.md from
templates/defect-record.md -- observed behavior with a reproduction and
evidence, expected behavior with the Agreed spec section it violates
(write and confirm that section first if it does not exist), root cause
when known, and the regression test the fix must ship with. The contract
(001.md, or the staged spec that /next-iteration writes) references the
defect record; its definition of done includes the regression test
failing before the fix and passing after, plus the project's verification
commands green.

For a feature whose own section does not exist yet: write it into its
domain spec through the confirm-back loop and mark it Agreed. The observed
section records what is, the feature section records what shall be, and
both stand.

Then the working agreement block (new-project
templates/working-agreement.md, filled with real paths, the repo layout
table from recon, and the verification commands from conventions.md) into
the project's CLAUDE.md or AGENTS.md -- create the file if absent, append
if it exists, update the contract reference if the block is already there,
never overwrite unrelated content. Add two lines the new-project version
does not need: which specs are still Observed, and the rule that Observed
sections are not contract.

## Closing

Summarize what exists and where: recon.md, the glossary, the observed and
Agreed specs, conventions.md, the contract or the staged spec, and any
defect record. Remind the developer: new ideas go through /next-iteration;
recon.md's Gaps list is documentation debt and is promoted or cut at
iteration close the same way staged specs are; the drift gate audits
sessions against the current contract and asks whether any Observed
section was relied on as contract.
