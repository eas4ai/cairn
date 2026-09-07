# LOOP-035 scope action has no answered-escalation resolution path

Surfaced from: LOOP-035, LOOP-048, LOOP-049, LOOP-050, LOOP-051
Captured: 2026-09-07T15:59:36.871Z

LOOP-035 remedy text says to escalate so the developer can resolve the scope, but an answered escalation only annotates run|implement|declare|escalate|review mechanism <REQ> actions. A scope <path> action (Resolvable: scope <path>) has no resolution path in the checker at all: there is nothing to answer that clears it except declaring the path, rewinding, or waiting for the window to advance.

Captured by Muse in the production checkout; preserved in development for scope-breaches-have-a-recovery-path.
Predecessor: an-answered-escalation-is-invisible-to-the-next-wake.md (2026-09-05) drafted LOOP-048 through LOOP-051. That implementation annotates requirement actions but omits scope actions.
