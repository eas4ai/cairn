# A mechanism whose output exceeds one megabyte is recorded as a fail it did not produce

Surfaced from: LOOP-034
Promoted to: the-output-is-evidence (2026-09-05, on the developer's word; stamped 2026-09-11 after the commitment reached Done)
Captured: 2026-09-05T13:00:03.000Z

spawnSync's default maxBuffer kills the command; the record says exit -1 and result fail with a digest over truncated output. Item 3; drafted as LOOP-042.
