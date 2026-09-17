# Receipts record an abbreviated commit id

Surfaced from: LOOP-024
Captured: 2026-09-17T11:59:29.142Z

headSha at bin/cairn.mjs line 85 uses git rev-parse --short, unique only at write time. When a later commit shares the prefix, git ls-tree on the receipt's id fails as ambiguous, the old requirement text becomes unavailable, and wake demands a mechanism review for a requirement whose text never changed; retentionChanged and the review's inputsDigestAt fail the same way. Receipts should carry the full id, and readers should accept both forms for old receipts. Kernel review 2026-09-17, finding 6.
