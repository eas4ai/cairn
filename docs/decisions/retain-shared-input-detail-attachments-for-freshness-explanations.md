# Retain shared input detail attachments for freshness explanations

Level: Judged
Decided by: agent
Rests on: LOOP-076 LOOP-077 LOOP-078 LOOP-079 LOOP-080 PKG-003
Would be wrong if: An explanation invents changed paths, optional detail changes the next action, or repeated detail work grows with every requirement sharing one run.
History: The prior input-identity and record-integrity reviews established raw execution identity and conservative legacy handling. This decision preserves those facts and extends their explanation only.

## Decision

Add one versioned JSON input-detail attachment beside each mechanism output, referenced by its receipts through inputs_detail. It contains sorted repository-relative paths, modes, and raw content or link-target digests, never contents. Before comparing it, validate its shape and recompute the existing aggregate input digest to match the receipt. Missing or invalid optional detail limits the explanation without changing freshness or action priority. Reuse the per-read input cache and share attachment parsing and comparison across receipts. Add receipt identity and the next permitted action to existing wake explanations, including mechanism-review guidance. Do not introduce a new public command or rewrite old evidence.

## Realized by

- e5bdbac Explain stale evidence with validated input identities and next actions
