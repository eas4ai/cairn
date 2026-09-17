# The stop hook blocks forever when the harness does not cap consecutive blocks

Changes: PKG-018
Outside because: it changes an Agreed requirement, which a commitment never does (LOOP-093); captured on 2026-09-17 after this commitment reached Done, from the kernel review and the developer's direction, for the next specification phase
Captured: 2026-09-17T11:59:29.237Z

package.md says the harness caps consecutive blocks, so the stop hook keeps no counter. On 2026-09-17 a Claude Code session received more than ten consecutive blocks for one verdict (record docs/Claude outputs/, a folder only the developer could commit or move), so the assumption is false. bin/hook.mjs line 40 reads only cwd from stdin and ignores stop_hook_active, the flag the harness sends when a stop was already blocked by a hook, precisely so hooks can avoid re-blocking. When the named action belongs to the developer, the agent's only ways out are to commit files it should not touch or to write a false in-progress record. Proposed: on stop_hook_active the hook prints the verdict and allows the stop after one refusal. This changes PKG-018, which blocks unconditionally while Resolvable. Kernel review 2026-09-17, finding 11.
