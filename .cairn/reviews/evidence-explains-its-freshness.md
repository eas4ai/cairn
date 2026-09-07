commitment: evidence-explains-its-freshness
commit: a97d238265cb8402655a6e08ba6cdf09c859d4e4
examined:
  - Draft LOOP-076 through LOOP-080 against existing freshness and action-priority requirements.
  - Whether changed-path explanations can be reconstructed from Git-normalized historical blobs.
  - Missing and damaged optional details, old receipts, and unavailable requirement history.
  - Falsifiers, planned mechanisms, path escaping, output bounds, and deterministic event-sequence tests.
findings:

## Specification review before agreement

This is review of a draft, not implementation acceptance. No source code
changed. The developer confirmed the direction; the exact falsifier set
remains Draft under SPEC-002 until confirmed.

Attacked LOOP-024, LOOP-059, LOOP-065, LOOP-070, and LOOP-073 for conflicts.
The proposal keeps existing verdict priority and raw input identity. An
explanation cannot bypass mechanism review or an escalation. Changed raw
bytes under Git-clean conversion require retained run facts; historical
Git blobs alone cannot support that claim.

Attacked the upgrade path: making absent optional details a new freshness
failure would invalidate otherwise current receipts solely to improve prose.
The draft instead preserves their existing standing and reports limited
detail honestly. Malformed optional details cannot fabricate changed paths.
An ordinary new check can provide the detail without rewriting old evidence.

Attacked output completeness against readability: more than 20 changes are
explicitly counted, control characters are escaped, and a rename is reported
as addition/deletion rather than guessed. File contents never enter the
explanation. The exact formatting can be decided routinely after agreement.

Attacked test soundness: each requirement has a named existing mechanism and
concrete negative cases. The current CLI provides the safe violating example
for missing path, receipt, and rerun details. Other cases need controlled
faults where the old implementation already satisfies the preservation rule.
The sequence model must describe fixture facts independently of the runtime
assessment and print a reproducible event prefix on failure. The generator
is limited to the transitions relevant to freshness and existing priorities.

The scope includes existing wake/check output and tests. It excludes a new
command, a model-driven runtime, a next-iteration skill, and release changes.
No unresolved contradiction was found in this draft review. Implementation,
format selection, failing/passing demonstrations, and completion review
remain work for the proposed commitment after agreement.
