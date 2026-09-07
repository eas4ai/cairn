# Keep execution order separate from time and preserve record boundaries

Level: Judged
Decided by: agent
Rests on: LOOP-070 LOOP-071 LOOP-072 LOOP-073 LOOP-074 LOOP-075
Would be wrong if: A later failure is hidden, quoted text changes record state, a raised escalation appears answered, or conversion conceals uncommitted execution state.
History: Earlier LOOP reversals favor explicit repository facts and safe recovery. This repair preserves receipt history, uses the existing exclusive check lock, and keeps Git conversion separate from raw execution identity.

## Decision

Give each new receipt a per-requirement sequence and a digest of all prior recognized receipts. Changed or imported history requires a rerun; legacy receipts remain unchanged and need one new ordered check. Read Markdown metadata only in the header and realization entries only outside fences. Flatten malformed Blocking escalation fields while retaining the escalation for the developer. Compare Git-clean object identities for committed candidates and reviews, and preserve raw content/kind/mode digests for execution freshness and both candidate boundaries. Use NUL-delimited historical specification paths. Ignore supporting files in receipt directories and name malformed recognized receipts as repairs. Reuse Git conversions rather than implementing text normalization. This adds no service or public command.

## Realized by

- 54bcbee Preserve execution order and record metadata boundaries
