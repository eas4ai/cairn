# Review freshness spawns one git process per declared file

Surfaced from: LOOP-032
Promoted to: the-wake-names-an-action-or-refuses (2026-09-05, on the developer's word; stamped 2026-09-11 after the commitment reached Done)
Captured: 2026-09-05T13:00:12.000Z

inputsDigestAt() runs git show per file; 1500 declared files cost 6.3 s per wake once a review exists. Item 12; a kernel fix under LOOP-032 and LOOP-024.
