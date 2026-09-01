# Evidence map

The map from Agreed requirement identifiers to implementation
evidence. One table per prefix, one row per identifier. Each column
carries exactly one meaning.

Coverage is Covered (cited evidence beyond implementation inspection
addresses the requirement's falsifier), Asserted (implementation is
cited and no evidence mechanism addresses the falsifier), or
Uncovered (no evidence is claimed).

Method names the mechanism that produced the evidence: formal, model,
property, integration, test, static, inspected, manual, or - on an
Uncovered row. The list is not a rank. An Asserted row always carries
method inspected, because inspection addresses no falsifier.

Evidence cites a repository path, with an optional ::identifier
locator. The map is a claim register: a false Covered entry is drift
like any other. The language check verifies the map's integrity.

## DOM

| Requirement | Coverage | Method | Evidence |
|---|---|---|---|
| DOM-001 | Uncovered | - | |
| DOM-002 | Uncovered | - | |
