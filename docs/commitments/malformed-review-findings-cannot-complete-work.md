# Malformed review findings cannot complete work

Slug: malformed-review-findings-cannot-complete-work
Requirements: LOOP-020, LOOP-033, LOOP-086
Status: Agreed 2026-09-07

## Authorization and scope

The developer reported the DemonCoder REM-002 finding being silently
ignored and requested validation and regressions. Validate supported review
finding entries before Done, name malformed entries and the repair format,
and preserve valid open, resolved, and empty findings. Update documentation
for the supported format. Do not edit DemonCoder or its review records.

## Verification

Reproduce the exact reported finding and Status field in a committed
review with current passing evidence. Cover valid open, resolved, empty,
malformed scalar, and empty-description cases. Run existing review tests,
full committed mechanisms, and review the final change before Done.
