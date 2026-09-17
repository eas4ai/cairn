# Every wake spawns one git process per Realized-by entry

Surfaced from: DEC-021
Outside because: found by the kernel review the developer requested on 2026-09-17 after this commitment reached Done; every mechanism of the commitment passes, the case lies outside its falsifiers, and the developer directed that review findings enter the backlog
Captured: 2026-09-17T11:59:29.208Z

decisionVerdict at bin/cairn.mjs line 342 runs git rev-parse --verify for every Realized-by entry of every non-superseded record, eagerly, before .some() can short-circuit: about 70 spawns per wake today, growing with every decision, and the stop hook runs wake on every stop. gitObjectsAvailable at line 528 already shows the one-spawn git cat-file --batch-check pattern that would resolve all entries at once. Kernel review 2026-09-17, finding 9.
