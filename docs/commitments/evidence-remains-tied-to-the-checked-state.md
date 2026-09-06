# Evidence remains tied to the checked state

Slug: evidence-remains-tied-to-the-checked-state
Requirements: LOOP-063, LOOP-064, LOOP-065, LOOP-066, LOOP-067, LOOP-068, LOOP-069

## Goal

Repair all six verified findings from the developer-requested end-to-end
review and remove the repeated input reads measured there. Requested by
the developer on 2026-09-06: "let's remediate them all".

## Deliverables

- Reject a changing check candidate while retaining its diagnostic output.
- Include Git entry mode and kind in evidence and review freshness.
- Refuse missing or corrupt captured evidence and identify the rerun.
- Serialize checks per working tree with explicit interruption recovery.
- Validate declaration fields and reject unsupported submodules by name.
- Reuse input reads within wake without carrying caches across execution.
- Regression tests, safe failure demonstrations, and updated human guidance.

The review's proposed evidence browser, JSON interface, and other feature
ideas are not part of this repair. No new public command is needed.

## Verification

Run each reproduction as a regression test against the old behavior and
observe its failure. Check the corrected behavior and ordinary successful
runs. Include mode-only and kind-only changes, candidate edits and commits,
missing and corrupt logs, concurrent checks, lock recovery, missing fields,
populated and unpopulated gitlinks, and a Git-call-count scaling check.
Run the full suite and package/specification mechanisms, then review what
these checks could miss before Done.
