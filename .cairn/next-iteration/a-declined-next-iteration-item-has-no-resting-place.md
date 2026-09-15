# A declined next-iteration item has no resting place

Changes: LOOP-091
Captured: 2026-09-15T02:38:39.088Z

Found on 2026-09-14 while reviewing one-receipt-per-run. When the backlog is empty and next-iteration holds items, wake names an escalation, and an answer chooses an item by its slug (LOOP-091). No answer form says none of these, not now. An ok whose recommendation names no waiting slug, or an instead naming none, makes wake name the escalation again, forever, and the only way out is to move the files out of next-iteration by hand, which is not a record. Proposal: an answer of instead none, or an equivalent the developer confirms, makes the current completion Done and leaves the items waiting for a later specification phase; the working agreement says so. Changes LOOP-091's text and its falsifier.
