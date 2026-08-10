# 0001: Sibling package, not an extension of best-practices

Date: 2026-08-10

Same Page complements best-practices-agent-package but never modifies it:
that package has live users and its hook is registered in user-level
settings. We reference BEST_PRACTICES.md when present and function
standalone when absent. Rejected: folding spec workflow into the existing
package (couples release cadences, risks breaking installed hooks).
