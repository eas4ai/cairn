# wake names only first breaching path

Surfaced from: LOOP-035
Promoted to: scope-breaches-have-a-recovery-path (2026-09-07, on the developer's word; stamped 2026-09-11 after the commitment reached Done)
Captured: 2026-09-07T15:59:36.848Z

Observed in suprtui: commit 21e1015 changed two breaching paths (src/buffer/mod.rs and tests/buffer_core.rs) but cairn.mjs does const [breach] = breaches(...), so wake named only the first alphabetically. Declaring it then surfaced the second. A multi-file breach reads as a one-file fix; wake should name every breaching path.

Captured by Muse in the production checkout; preserved in development for scope-breaches-have-a-recovery-path.
