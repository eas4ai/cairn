# A version bump should not cost a new independent report

Changes: LOOP-141
Captured: 2026-09-17T22:43:07.736Z

docs/releasing.md step 4 says the release commit makes the version files' evidence stale, so the loop runs check --stale and records a review again. Since LOOP-020, that review also needs a fresh independent report at the release commit, from a reviewer with none of the build's context, for a commit whose only change is five version strings and the changelog. LOOP-141 already excludes a documents-only change from making a review stale; the same reasoning covers a release commit that changes nothing but the version. Proposed: name the release commit's version files in the freshness rule, or let the release script mark its own commit, so a release costs a check and not a review round. Changes LOOP-141, and the release section of the manual.
