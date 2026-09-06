# Verify check candidates and preserve exclusive execution ownership

Level: Judged
Decided by: agent
Rests on: LOOP-063 LOOP-064 LOOP-065 LOOP-066 LOOP-067 LOOP-068 LOOP-069
Would be wrong if: A changed candidate or damaged log is accepted, a live run loses ownership, or a shared read cache hides a new state.
History: Prior LOOP reversals favor repository facts and explicit recovery. This repair keeps the existing shell environment and named transitions; it adds no service, signature system, or new public command.

## Decision

Validate HEAD, declared inputs, declaration, and defining specification before and after each mechanism; preserve output but write no receipt for a changed candidate. Version input identity to include Git kind, executable mode, and content hashes in both current and historical views. Read and hash latest output files once per wake; new receipts digest stderr separately, and unverifiable older evidence needs a rerun without rewriting history. Serialize checks with an exclusive cairn-check.lock file in the Git working-tree administration directory, separate from .cairn/in-progress; live, dead, and incomplete owners are named, and only a finished owner automatically removes its lock. Interrupted ownership needs explicit reconciliation, avoiding unsafe competing stale-lock deletion. Require declaration fields and refuse gitlinks by name until their dependency semantics are supported. Cache input selections and content digests only inside one read of the repository, with fresh state on both sides of command execution. Boundary validation detects persistent mutation, not transient edits restored during execution; isolated checkouts would change host-dependent checks and are outside this repair.

## Realized by

- 68bd2bd Keep evidence tied to committed candidates and serialize checks
