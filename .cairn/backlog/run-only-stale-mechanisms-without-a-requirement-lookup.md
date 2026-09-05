# Run only stale mechanisms without a requirement lookup

Surfaced from: LOOP-023
Captured: 2026-09-05T13:53:39.006Z

Developer adoption feedback: add a defined check stale selection that deduplicates mechanisms and runs only those with missing or stale requirement evidence. Existing check REQ already resolves a requirement to its mechanism. Specify how fresh failures and explicit per-requirement omissions participate before implementing a new CLI selector.
