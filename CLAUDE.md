# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

A library of Markdown documentation templates for software projects, plus instructions telling AI models how to apply them. There is no build system, no tests, no lint, and no code to run — all work here is editing Markdown. The git repo exists but has no commits yet.

The templates are not documentation *for* this repo; they are products meant to be copied into other projects and filled in.

## Layout

- `README.md` — human-facing catalog of the templates and the recommended fill-out order (overview → features/requirements → tech stack/structure → user flows → implementation standards → iterate).
- `model-instructions.md` — the AI-facing counterpart: per-template guidance, automation approaches (e.g. dependency extraction), and pitfalls to avoid. It embeds a four-phase self-critique cycle (Creator → Critic → Defender → Judge).
- `project-overview-template.md` — the only template that lives at the repo root.
- `templates/` — all other templates, plus two meta files:
  - `documentation-meta-prompt.md` — XML `<DocumentationFunctions>` map defining create/review/revise functions per document (reviews score against 5 criteria, baseline 4/5; revisions limited to 1 retry).
  - `dependency-automation-helper.md` — pseudocode workflow for auto-populating the dependencies template from package files.

## Conventions

- Templates use bracketed placeholders like `[Project Name]` and bracketed instruction blocks describing what to write. Preserve this placeholder style when editing templates; only filled-in copies (in other projects) replace them.
- The XML `<DocumentationFunctions>` block appears in both `README.md` (Getting Started section) and `templates/documentation-meta-prompt.md`. Changes to the function map must be mirrored in both.
- Three files must stay in sync when a template is added, renamed, or removed: the template file itself, README's numbered catalog, and the "Template-Specific Guidance" section of `model-instructions.md`.

## Known Inconsistencies

Fix these deliberately, or at least don't propagate them:

- README's links assume every template sits next to it (`./features-template.md`), but all except `project-overview-template.md` actually live in `templates/`. Most README links are broken.
- README lists a `meta-workflow-integration-template.md` (item 9) that does not exist; the closest real file is `templates/documentation-meta-prompt.md`. README also omits `templates/dependency-automation-helper.md` from its catalog.
- `model-instructions.md` references a `master-meta-workflow-prompt.md` (from the Windsurf memory-system methodology) that is not part of this repo.
