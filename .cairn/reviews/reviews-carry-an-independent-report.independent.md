commitment: reviews-carry-an-independent-report
commit: b2a1ea27
reviewer: an independent subagent given the commitment, LOOP-020 and the commit range, with no build context
examined:
  - docs/commitments/reviews-carry-an-independent-report.md and LOOP-020 in docs/spec/loop.md, including its falsifier and the Revised 2026-09-17 note
  - the commit range b365c2c4..b2a1ea27: bin/cairn.mjs, docs/walkthrough.md, tests/independent.test.mjs, tests/helpers.mjs, tests/robustness.test.mjs, tests/continuation.test.mjs
  - independentGap in bin/cairn.mjs, where wakeVerdict calls it (after the moved and open-finding checks), and the parsers it uses: recordFields, fields, asList
  - the AGENTS.md "Review before Done" paragraph on starting the reviewer, compared with the walkthrough and the code
  - probes in a scratch clone at b2a1ea27 (with TMPDIR set to scratch), each building a repository whose checks pass and which has a clean review, then committing a crafted independent report and running wake
  - the touched test files, run in the scratch clone: independent, robustness and continuation, 39 tests, all passed
findings:
  - An independent report with no findings: field reaches Done, so a report holding only "commitment:" and "commit:" is taken as a clean report. The review record gets a repair for the same problem (LOOP-086), but the report is never checked for it. Reproduced.
  - Findings that sit under a Markdown heading (for example "## Findings" followed by a findings list), or that follow "findings:" after a blank line, are not read, and wake reports Done even though the report raises a defect. Reproduced.
  - Wake reports Done when the report file exists in the working tree but was never committed, because the file's existence is checked on disk, not in the commit. This does not meet the falsifier's "at the review's commit". Reproduced with an untracked report.
  - Findings are matched by prefix (the review's finding starts with the report's text), so a short report finding counts as carried by an unrelated review finding. The report finding "the" was carried by "resolved: the walkthrough typo, fixed", and Done followed. Reproduced.
  - A report finding that wraps onto an indented second line keeps only its first line, because the parser drops continuation lines of list items. With the prefix match, the finding "the / kernel lets an empty report reach Done" was carried by an unrelated review finding starting with "the", and wake reported Done. Reproduced.
  - The commit match only asks that one value be a prefix of the other and be at least 7 characters long. A report commit of "<review sha>zzzz-not-a-sha" is accepted, and the value is never checked to be a real commit. Reproduced.
  - The commit match is case-sensitive, so a report that names the right commit in uppercase is refused with "the report must be at the review's commit". Reproduced.
  - The report's commitment: field is never checked, so a report written for another commitment (commitment: someone-else) at the same commit lets Done through. Reproduced.
  - A report finding written as "open: X" is refused even when the review carries "open: X". The kernel strips open:/resolved: from the review's findings but not from the report's, and AGENTS.md says to keep the report verbatim, so a reviewer copying the review format gets a refusal that is hard to understand. Reproduced.
  - A scalar report line such as "findings: none" is read as one finding named "none". The refusal "finding is not in the review as open or resolved: none" does not tell the developer that the report is malformed, and nothing asks for the report to be repaired. Reproduced.
  - When the report is missing or not carried, the action named is "review <slug>", the same action as a stale review. A developer reading the refusal cannot tell from the action alone that the builder's review is fine and only the independent report needs work. This comes from reading the code; it is a wording issue, not a wrong verdict.
  - The Done message still says "the review at <commit> is clean" and does not mention the independent report, so the success message does not show that LOOP-020's new condition was checked. This comes from reading the code.
  - tests/independent.test.mjs covers only well-formed reports. None of the cases above is tested (missing or misplaced findings, uncommitted report, prefix or wrapped findings, bad commit value, other commitment, open: prefix).
