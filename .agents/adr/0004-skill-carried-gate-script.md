# 0004: The gate script ships inside the new-project skill

Date: 2026-08-11

The core Agent Skills specification defines no hooks frontmatter, so a
skill cannot declare hook registration declaratively. To make every
install channel carry the drift gate, the script lives at
skills/new-project/scripts/spec-drift-gate.mjs (the spec's scripts/
convention) and /new-project's first-run setup offers merge-safe
registration -- the pattern proven by the exemplar repo's
git-guardrails-claude-code skill. The Claude Code plugin and
.codex/hooks.json reference the same single file; there is exactly one
copy of the gate. Rejected: a repo-root hooks/ location (the skills CLI
would install the skill without its gate) and duplicating the script per
channel (drift between copies).
