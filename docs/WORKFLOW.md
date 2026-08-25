# The Same Page workflow (tool-neutral)

For agents without a skill system: this is the /new-project and
/next-iteration process as plain instructions. Agents with skills installed
follow their SKILL.md; this document states the same contract.

## Principles

Models contain information; developers carry experience. Neither
substitutes for the other. The workflow levels understanding in both
directions before anything is specified: interpretations are surfaced,
never silently resolved; understanding is confirmed in the model's own
words before an artifact is written; ambiguous terms are defined in the
project's glossary the moment they surface; no stage closes unconfirmed.

## Creating a project's spec set

- Stage 0, baseline and orientation: check DEVELOPMENT_PRACTICES.md
  (onboard once if absent or default -- see the development-practices
  template); read existing code and docs before asking anything; calibrate
  documentation depth with the developer.
- Stage 1, vocabulary: seed glossary.md; define project terms together.
- Stage 2, direction: 00-overview.md first pass -- purpose, principles,
  supported and excluded scope.
- Stage 3, interaction: ux.md -- interaction model, journeys, surface map,
  decision points, error and recovery flows, platform divergences.
- Stage 4, domains: partition features into bounded domains; write each
  NN-<domain>.md with acceptance criteria per feature.
- Stage 5, technical shape: complete the overview (architecture,
  cross-cutting requirements, spec map, revision policy, completion
  criteria); write conventions.md; vendor upstream reference docs by
  default (declinable, logged).
- Stage 6, contract: iterations/001.md (in, out, definition of done); write
  the working agreement block into CLAUDE.md or AGENTS.md.

## Adopting an existing codebase

The same spec set, reached from the other direction. The code is the
source of truth about what the system does; the developer is the source
of truth about what it should do. Two entry paths: no spec set yet (write
observed specs), or a spec set exists (verify it against the code first).
Either way, getting up to speed precedes any new scope: /next-iteration
is not opened until recon and verification are done.

- Stage 0, baseline and recon: the DEVELOPMENT_PRACTICES.md check as
  above. If a spec set exists, read it before the code -- glossary,
  overview, conventions, current contract, staged specs -- and use its
  vocabulary from then on. Then read manifests, entry points, schema,
  tests, CI, other docs, and recent history (with a spec set: every commit
  since the specs were last revised) before asking anything, and write a
  recon report (docs/specs/<name>/recon.md) with every claim cited: what
  exists, what is documented, where docs or specs and code contradict
  each other, what could not be verified. Calibrate depth by the work:
  trace the blast radius of the feature or defect the session is for;
  only that radius is documented or verified to domain depth.
- Stage 1, vocabulary from the code: with no glossary, draft terms from
  the identifiers that exist; with one, check its terms against the code
  and draft only renames, missing terms, and collisions. The code's names
  win; the developer corrects.
- Stage 2, observed specs or verification: with no spec set,
  00-overview.md and one domain spec per domain in the radius, written in
  the designed shape but marked "Status: Observed (as-built;
  unconfirmed)". With one, each spec section in the radius is reported as
  holds, drifted (raised with both sides cited; the developer rules
  whether the spec or the code is wrong), still observed, or missing
  (written as observed). The developer confirms observed sections one by
  one; confirmed sections become "Agreed: date". When the developer says
  the code is wrong, the observed text stays as the record of what is and
  the intent becomes a defect record or a staged spec -- inferred intent
  is never written as agreed.
- Stage 3, the documentation gap: undocumented behavior, contradicted
  docs, untested behavior the work depends on, and staged specs the code
  has since overtaken, listed in the recon report; the developer decides
  which gaps close now. conventions.md is written from, or verified
  against, the checks the project actually runs.
- Stage 4, the work: with no contract, iterations/001.md whose In list
  holds only Agreed sections. With a contract, work already in its In
  list proceeds under it; anything else goes through /next-iteration,
  now with the recon and verified specs as its context, and is promoted
  at iteration close. A remediation gets a defect record
  (docs/specs/<name>/defects/<slug>.md) with reproduction, expected
  behavior, root cause when known, and the regression test the fix ships
  with, referenced from the contract or the staged spec. Then the working
  agreement block, naming which specs are still Observed and that
  Observed sections are not contract.

## During development

Work stays inside the current iteration contract. New ideas -- the
developer's or the model's -- are captured as staged specs under
iterations/next/ with full context (what they touch, conflict with, depend
on), never implemented ad hoc. Direction that contradicts a confirmed spec
is re-anchored: return to the spec, confirm the change deliberately, then
act. Closing an iteration promotes, carries, or cuts staged specs into the
next numbered contract; cutting is the developer's verdict.
