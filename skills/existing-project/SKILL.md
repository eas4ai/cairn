---
name: existing-project
description: Gets an agent up to speed on a codebase that already exists -- reads the code before asking anything, writes a cited recon report, drafts Observed specs or verifies an existing spec set against the code, and prepares one piece of work as a commitment. Observed is not Agreed; only the developer says what the code should do. Use when opening an agent in an existing project to change it.
disable-model-invocation: true
---

# /existing-project -- adopting a codebase

You are getting up to speed on software that already exists, writing
down what you found so every future agent inherits it, and preparing one
piece of work. The code is the source of truth about what the system
does; the developer is the source of truth about what it should do. You
draft from the first and the developer corrects. /new-project designs
software that does not exist yet.

Two paths, decided in Stage 0:

- Path A, no spec set: docs/spec/overview.md does not exist. You write
  Observed specs and the first commitment.
- Path B, a spec set exists: you verify it against the code, record
  drift, and route the work into a commitment or the backlog.

## Standing rules

Rules 1 through 8 of /new-project apply. Three more:

9. Evidence or question. Every statement about the codebase carries a
   path, and a line where it matters. A statement you cannot point at is
   a question for the developer, not a finding.
10. Observed is not Agreed. Text you derive from the code is marked
    Status: Observed and describes what the system does (SPEC-016). Only
    the developer can say that is also what it should do, and only
    Agreed text is contract (SPEC-017). The loop refuses a commitment
    that names an Observed requirement.
11. Drift is a finding, never a quiet fix. When the code and an Agreed
    spec disagree, raise it with both sides cited. The developer rules
    which side is wrong.

## Stage 0 -- Recon before questions

Path B first: read the spec set before the code -- glossary.md,
overview.md, every domain spec, roadmap.md, the current commitment,
docs/decisions/, and .cairn/backlog/. The glossary's terms are your
vocabulary from here. Run `cairn wake`: its verdict tells you where the
loop stands before you form an opinion.

Then recon, before asking the developer anything. Read, in this order:
manifests and lockfiles; entry points and the public surface; data
(schema, migrations, models); tests, where they live and how they run;
CI, scripts, containers; existing documentation outside the spec set;
recent history -- the last few dozen commits, open branches, TODO
markers, and on Path B every commit since the newest Agreed date, which
is where drift lives.

Write docs/recon.md, every row cited: Exists (what the system is and
does); Documented (which of that the documentation covers, and where);
Contradicted (where documentation and code disagree, both sides cited;
on Path B this is drift, and the bucket that pays for the exercise);
Unverified (what you could not check). Present it; the developer
corrects your reading.

Then the work. Ask what this session is for: a feature to add, or a
defect to fix. That is the one question this stage asks. Trace its blast
radius -- the modules, tests, and spec sections it touches -- and cite
each. Depth follows the work, not the size of the codebase (SPEC-008):
everything inside the radius is documented or verified to requirement
depth; everything outside gets one line in the keystone's spec map.

## Stage 1 -- Vocabulary from the code -> glossary.md

Path A: draft the project's terms from the identifiers that exist --
types, tables, routes, modules, configuration keys. The code's name for
a thing wins over the synonym you would have chosen. Path B: the
glossary wins; check its terms against the code and draft entries only
for a renamed identifier, a concept in the radius with no entry, or a
term the docs and the code name differently. Both: present as one set;
the developer corrects by exception.

## Stage 2 -- Observed specs, or verification

Path A -- write. The keystone and one domain spec per domain inside the
blast radius, in the same normative shape a designed spec uses:
[PREFIX-nnn] identifiers, one obligation per sentence, the actor named,
an evidence path on each requirement. Status: Observed. Domains outside
the radius appear only as one-line rows in the spec map. Writing
Observed text in the designed shape is deliberate: confirmation becomes
a status change, not a rewrite.

Path B -- verify. For each spec section inside the radius, check the code
against it and report one of: Holds (cite the evidence, write nothing);
Drifted (raise it with both sides cited, and the developer rules: if the
spec is wrong, revise it through `cairn supersede` with the cause named;
if the code is wrong, the section stands and the divergence is a
defect); Still Observed (a section a previous pass left unconfirmed; run
the confirm loop); Missing (a capability in the radius no spec covers;
write it as Observed exactly as Path A would).

Both -- the confirm loop, by exception. Present each Observed section.
Confirmed: propose the section's falsifiers as one set, name a mechanism
for each, review the draft and record it, and mark the section Agreed
with the date. Corrected reading: you misread the code; fix, cite again,
re-present. The code is wrong: keep the Observed text as the record of
what is, and capture the intended behavior as a requirement whose
falsifier the current code satisfies. That is a defect, and its
mechanism will fail until the code is fixed.

## Stage 3 -- The work as a commitment

No roadmap (Path A, or Path B with none): write docs/spec/roadmap.md
with one commitment and a Current: line, and docs/commitments/<slug>.md
for it exactly as /new-project Stage 4 describes. A defect's commitment
names the Agreed requirement it violates and a mechanism that reproduces
the failure; its done-when is that mechanism passing.

Both paths: the working agreement, AGENTS.md at the repository root,
contains templates/AGENTS.md beside /new-project, verbatim (LOOP-036).
Write it when it is missing. When the file exists with the project's
own instructions, append the template after a blank line and keep the
rest. When the copy it holds differs from the template, replace that
copy alone and say so in the summary.

A roadmap exists (Path B): read the current commitment's requirements
against the blast radius. In scope: proceed under it. Out of scope, the
usual case for work that arrived after the roadmap was agreed:
`cairn backlog --title ... --from <REQ or slug>`. It enters a commitment
only when the developer writes the requirement into the specification
and names it in a commitment (LOOP-029). Do not implement it in the
meantime.

For each requirement the commitment names, write or verify its mechanism
under .cairn/mechanisms/. Run `cairn check`. Its verdict is where the
work starts.

## Closing

Run the spec lint. Summarize: recon.md, the glossary, the Observed and
Agreed specs, the roadmap and commitment, and what `cairn wake` says.
The loop takes over under the working agreement. Remind the developer that Observed sections are not
contract, and that the loop will refuse a commitment that names one.
