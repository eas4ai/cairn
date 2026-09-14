# Cairn ships two harness hooks and the session-start hook is the install

Level: Consequential
Decided by: agent
Supersedes: cairn-installs-by-one-link-script-with-no-plugin-and-no-hook
Cause: the stated condition occurred
Rests on: PKG-018, PKG-019, PKG-014, PKG-012, PKG-006, LOOP-091
Would be wrong if: a harness the developer uses cannot run a command hook at session start or at stop, or a hook blocks a stop when wake did not print Resolvable, or the hookless path stops being documented
History: PKG carries a reversal from a deferral framing, and the superseded record is now the second: it named the developer's ruling that a stop hook does not manage execution as what would make it wrong, and the developer so ruled on 2026-09-14 after reporting that agents skipped wake, ignored verdicts, and stopped mid-commitment. Consequential because the install skill writes hook entries into the developer's harness settings and the link script every README reader ran is retired.

## Decision

One file, bin/hook.mjs, with two modes. stop: when the harness asks whether the agent may stop, run this checkout's wake for the repository at the harness cwd; while the verdict is Resolvable, answer with a block decision that carries the verdict; at Escalate, at Done, outside a Cairn repository, or on any error, answer nothing and exit 0 (PKG-018). session-start: link $HOME/.local/bin/cairn to this checkout's kernel when nothing is there, leave anything already there alone, and in a Cairn repository print the wake output as plain text so the verdict is in front of the agent before it acts (PKG-019). One contract serves Claude Code and Codex, both verified on 2026-09-14: JSON on standard input, plain or JSON text on standard output. The install skill registers both hooks once, in ~/.claude/settings.json and ~/.codex/hooks.json, and the session-start hook then installs the command on the next session, so scripts/link.sh and its test are removed. The hooks are optional: the working agreement is the path an agent takes without them (PKG-006), and a hook that answers the harness with the verdict starts, stops, and retries nothing (PKG-012). The file lives under bin/ so the package lint counts it toward the PKG-004 ceiling.

## Realized by

(none yet: recorded, not built)
