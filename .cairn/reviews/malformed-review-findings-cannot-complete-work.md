commitment: malformed-review-findings-cannot-complete-work
commit: 5d7988794
examined:
  - reviewOf, wakeVerdict, existing record header parsing, and the DemonCoder reproduction.
findings:
  - resolved: Validate finding entries instead of silently discarding unknown prefixes.

## Failure demonstration and implementation

Before the fix, the exact REM-002 finding and Status: in progress returned
Done with current passing evidence. Eleven new cases ran: four valid
controls passed and seven malformed cases failed their expected repair
verdict. After validation, all eleven pass. Both wake and check return an
actionable repair naming the review, offending entry, and supported format.
Check can still produce evidence before returning its review repair verdict;
the test correctly matches that verdict after the evidence output.

Valid open, resolved, empty, and mixed findings preserve their behavior.
Unknown prefixes, empty descriptions, scalar findings, and terminal control
characters are covered. The existing record header parser is unchanged.
The focused combined run passed all existing review and record-boundary
cases; its sole failure was the corrected output-position assertion.

Ripwire shows one unchanged-signature caller of reviewOf. Quality-delta
reports a change-frequency warning and one additional minor wake guard;
test-gate does not model subprocess CLI tests and flags documentation
sections. Neither is claimed clean. Committed full checks and final review
remain required.

## LOOP-086 mechanism review after wording correction

Reviewed the revised requirement, falsifier, node-test declaration, and all
twelve review-finding regressions. Splitting two obligations into sentences
does not change their meaning. The mechanism exercises every stated outcome,
including the exact REM-002 and Status reproduction through wake and check.
The original violating implementation failed seven malformed cases; the
corrected implementation passes all twelve. The added explicit empty-list
case failed before normalization and passes after it. All 31 focused tests,
including spec lint and the executable walkthrough, pass. No mismatch found.
No code changed during this mechanism review.
