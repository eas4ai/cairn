# fields drops a scalar value when a list item follows it

Surfaced from: unstated
Outside because: found by the kernel review the developer requested on 2026-09-17 after this commitment reached Done; every mechanism of the commitment passes, the case lies outside its falsifiers, and the developer directed that review findings enter the backlog
Captured: 2026-09-17T11:59:29.076Z

bin/cairn.mjs line 44: a '- item' line under a key that already holds a string starts a fresh list and discards the string. Verified: 'Requirements: LOOP-001' followed by '- LOOP-002' yields only LOOP-002. Wake never checks LOOP-001 and the commitment can reach Done with a named requirement that was never verified. The same grammar reads inputs, examined, findings and reviewed, so a dropped first input silently narrows a footprint. The kernel should either keep the scalar as the first item or refuse the mixed form with a repair verdict. Kernel review 2026-09-17, finding 4.
