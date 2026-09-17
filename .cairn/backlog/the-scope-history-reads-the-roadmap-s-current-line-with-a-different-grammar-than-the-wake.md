# The scope history reads the roadmap's Current line with a different grammar than the wake

Surfaced from: LOOP-104
Outside because: found by the kernel review the developer requested on 2026-09-17 after this commitment reached Done; every mechanism of the commitment passes, the case lies outside its falsifiers, and the developer directed that review findings enter the backlog
Captured: 2026-09-17T11:59:29.006Z

currentCommitment strips fenced code and refuses more than one Current line. scopeHistory at bin/cairn.mjs line 158 reads each historical roadmap with raw fields(), where the last Current wins and fences are not stripped. A fenced example below the real line, which LOOP-104 allows, stops the history walk early: the activation commit lands later than it should and every commit between the true activation and that point falls outside the footprint, so scope breaches (LOOP-035) and promoted contract changes in those commits are never reported. Kernel review 2026-09-17, finding 2.
