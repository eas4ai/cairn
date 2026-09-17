commitment: a-value-followed-by-list-items-keeps-the-value
commit: bd205ae
examined:
  - the failure demonstration before the fix: with the test in place and the kernel at 398a65c's parent, a commitment written as Requirements: R-001 followed by - R-002 made wake name run R-002, the first requirement gone; after the one-expression change at bin/cairn.mjs line 44, wake names run R-001 and the full suite passes at 475.
  - the grammar on edge shapes, probed directly: a value then items yields [value, items]; a value with a continuation line then items yields [value continued, items]; an empty key line then items yields the items alone, as before; a comma list on the key line then an item yields both, and currentCommitment joins and re-splits on commas, so all three ids are read (LOOP-102); trailing whitespace on the value and padding inside the item are trimmed as before.
  - a blank line between the value and the item ends the key, so the item after it is dropped silently. That is the grammar as written (blank lines and headings end continuation) and predates this commitment; it is the same shape as before for every record type, and not this requirement's case.
  - every list-bearing field goes through the one fields() function; no other list parser exists in bin/. The declaration case is tested through the footprint: a mixed inputs line keeps its key-line input, and an edit to it makes wake name record for it.
  - what nothing documents: no manual, README or skill text describes the key-line grammar, only the templates in the working agreement, so there is no sentence to bring into line.
  - the package: node-test, pkg-lint and spec-lint re-run after the kernel change, every requirement pass; bin/ is 1560 lines against the 1600 ceiling.
findings: []

## Commitment review at bd205ae, 2026-09-17

The first promotion out of the kernel review. The fix is the smallest
that satisfies LOOP-133: a string already under the key becomes the
first item, and an empty string does not, so the list form everyone
writes today is unchanged. Attacked on the shapes above without
changing code. The one behavior left as it was, an item after a blank
line, is the grammar's own rule and would need its own requirement to
change.

No open finding.
