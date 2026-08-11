# 0005: The drift gate carries the rule 13 self-evaluation

Date: 2026-08-11

Same Page's audit was scope-and-spec only; the rule 13 release gate ("do
not deliver work you know to be deficient") arrived solely via the sibling
package's hook, so a Same Page user without the sibling never got it. The
drift gate's audit now includes rule 13 as its fourth item, referencing
the nearest BEST_PRACTICES.md (repository copy first, then
~/.claude/BEST_PRACTICES.md -- the sibling's own precedence) and embedding
the rule's text when no ruleset exists. The sibling stays untouched and
authoritative for the full 13 rules; when both hooks are registered the
audits overlap harmlessly (each fires once per session). Rejected:
bundling the sibling's todo_complete_gate.py (duplicates a live hook) and
detecting the sibling's registration to suppress item 4 (fragile across
three registration surfaces).
