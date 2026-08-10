<!-- Same Page working agreement: Stage 6 writes this block into the
target project's CLAUDE.md / AGENTS.md, filled with real paths and
commands. It is the few-hundred-token map every future session loads. -->

## Working agreement (Same Page)

This project is spec-driven. The spec set lives at docs/specs/project-name/
and is normative: 00-overview.md is the keystone and spec map; numbered
specs own their domains; ux.md owns interaction; glossary.md owns
vocabulary -- when a term there conflicts with your prior, the glossary
wins.

Baselines: DEVELOPMENT_PRACTICES.md (the developer's rules of the road)
and, when installed, BEST_PRACTICES.md (universal production discipline).
Read both before working.

## Repo layout

| Path | Role |
|---|---|
| docs/specs/project-name/ | The normative spec set |
| src/ | Replace with this project's real top-level map |

## Scope and re-anchor rules

- The current iteration contract is docs/specs/project-name/iterations/NNN.md.
  Work outside it is captured via /next-iteration -- surfaced and staged,
  never implemented ad hoc, never silently dropped.
- When incoming direction contradicts a confirmed spec, return to the spec
  and confirm the change deliberately before acting. Scope-affecting
  directives that arrive in the heat of a moment are captured and decided
  calmly.
- New or collided terms go to glossary.md the moment they surface.

## Verification

The exact check commands for this project, copied from conventions.md.
