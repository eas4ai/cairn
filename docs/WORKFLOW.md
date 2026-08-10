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

## During development

Work stays inside the current iteration contract. New ideas -- the
developer's or the model's -- are captured as staged specs under
iterations/next/ with full context (what they touch, conflict with, depend
on), never implemented ad hoc. Direction that contradicts a confirmed spec
is re-anchored: return to the spec, confirm the change deliberately, then
act. Closing an iteration promotes, carries, or cuts staged specs into the
next numbered contract; cutting is the developer's verdict.
