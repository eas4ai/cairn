# Checks stay tied to their requirements

Requirements: LOOP-058, LOOP-059, LOOP-060, LOOP-061, LOOP-062, SPEC-020, SPEC-021, SPEC-022, SPEC-023, PKG-016, LOOP-023, LOOP-024

## What this delivers

The developer accepted all five comparison recommendations and explicitly
added the large-input Git defect. This commitment carries the five recommendations and both live-project repairs.
The developer then supplied the live-project reporting failure; explicit
per-requirement reporting and separate execution diagnostics are included.
The existing commitments remain in the roadmap in their existing order.

## Implementation and footprint

- bin/cairn.mjs: requirement text digests, mechanism review before revised
  evidence, review freshness, unlimited Git output and failed-read guard.
- scripts/spec-lint.mjs: unique definitions and resolvable references.
- skills/: safe violating examples and preservation of recon findings.
- README.md and docs/walkthrough.md: one linked, executable example.
- tests/: CLI regression fixtures and executable walkthrough verification.
- docs/spec/ and docs/decisions/: the contract and reasons for the change.
- .cairn/mechanisms/ and .cairn/reviews/: declarations and review records.

## Verification

Run the Node suite, specification lint, and package lint. Regression
fixtures cover tightening a requirement without changing code; falsifier
changes; unchanged neighboring requirements; old receipts; dirty specs;
review before rerun; duplicate IDs across files; missing references;
examples excluded from lint; large blobs; and failed Git reads.

Exercise the walkthrough's commands in a temporary repository. Review
the two skill changes for practical failure demonstrations and retention
of unresolved findings. Automated checks do not establish agent judgment
or human comprehension.

## Done when

The regression cases pass, the guide's commands work, explicit reporting never guesses missing verdicts, all inherited
package checks pass, and the recorded review has no open finding.
