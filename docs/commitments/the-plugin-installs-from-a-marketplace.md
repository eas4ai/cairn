# The plugin installs from a marketplace

Slug: the-plugin-installs-from-a-marketplace
Requirements: PKG-037, PKG-038, PKG-014, PKG-018, PKG-019, PKG-021, PKG-033, PKG-005, PKG-006, PKG-024
Inherits: every PKG requirement
Status: Agreed 2026-09-15 by deference the-plugin-installs-from-a-marketplace-on-the-developer-s-direction

## Goal

One plugin install, in Claude Code or in Codex, puts the command, the
four skills and the two hooks in place, and the documents say so.

## Authorization and scope

Requested by the developer on 2026-09-15 in conversation, recorded in
docs/decisions/the-plugin-installs-from-a-marketplace-on-the-
developer-s-direction.md. The repository held no plugin manifest, so a
marketplace install was not possible and the hooks were registered by
hand. The skills-CLI install and the checkout install stay as they
are, for a harness without a marketplace.

## Deliverables

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and
  `.codex-plugin/plugin.json`, agreeing with package.json on the name
  and version, the marketplace listing the repository root as the
  plugin (PKG-037).
- `hooks/hooks.json` registering session-start and stop against the
  plugin's own bin/hook.mjs through the plugin root variable, with a
  test that runs both commands from a copy of bin/ elsewhere
  (PKG-038).
- The README's install section leads with the marketplace install for
  both harnesses; the manual and the install skill describe it and
  keep the other paths.

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
