# Retain command output and evidence history

Level: Consequential
Decided by: agent
Rests on: LOOP-041 LOOP-042 LOOP-043 PKG-002
Would be wrong if: A complete run can be lost to a capture limit, or another checkout cannot recover its evidence history.
History: The earlier LOOP and PKG reversals favor inspectable records over inferred state. Rebuilding one pass cannot rebuild a history, so the evidence directory is durable and this choice remains Consequential.

## Decision

Stream stdout and stderr into one .out output file in .cairn/evidence under the first requirement. All receipts from the run reference that file. A companion .err output file preserves stderr independently without buffering it in memory; receipts name stderr_output. Hash the completed combined file. Track evidence and logs, ignoring only the working-tree in-progress record. Existing receipts remain unchanged; previously discarded output cannot be reconstructed. Package checks reject ignored evidence. Agent guidance commits evidence after check and makes each repeated result findable. A signal is retained separately and in the exit description, while explicit reporting continues to leave missing verdicts unverified.

## Realized by

- 9815f69 Stream and retain command output and commit evidence history
