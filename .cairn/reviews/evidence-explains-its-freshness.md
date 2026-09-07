commitment: evidence-explains-its-freshness
commit: 7708f90fffecfe145e6f2203fb00f14904644843
examined:
  - Draft LOOP-076 through LOOP-080 against existing freshness and action-priority requirements.
  - Whether changed-path explanations can be reconstructed from Git-normalized historical blobs.
  - Missing and damaged optional details, old receipts, and unavailable requirement history.
  - Falsifiers, planned mechanisms, path escaping, output bounds, and deterministic event-sequence tests.
findings:

## Specification review before agreement

This is review of a draft, not implementation acceptance. No source code
changed. The developer confirmed the direction; the exact falsifier set
remains Draft under SPEC-002 until confirmed.

Attacked LOOP-024, LOOP-059, LOOP-065, LOOP-070, and LOOP-073 for conflicts.
The proposal keeps existing verdict priority and raw input identity. An
explanation cannot bypass mechanism review or an escalation. Changed raw
bytes under Git-clean conversion require retained run facts; historical
Git blobs alone cannot support that claim.

Attacked the upgrade path: making absent optional details a new freshness
failure would invalidate otherwise current receipts solely to improve prose.
The draft instead preserves their existing standing and reports limited
detail honestly. Malformed optional details cannot fabricate changed paths.
An ordinary new check can provide the detail without rewriting old evidence.

Attacked output completeness against readability: more than 20 changes are
explicitly counted, control characters are escaped, and a rename is reported
as addition/deletion rather than guessed. File contents never enter the
explanation. The exact formatting can be decided routinely after agreement.

Attacked test soundness: each requirement has a named existing mechanism and
concrete negative cases. The current CLI provides the safe violating example
for missing path, receipt, and rerun details. Other cases need controlled
faults where the old implementation already satisfies the preservation rule.
The sequence model must describe fixture facts independently of the runtime
assessment and print a reproducible event prefix on failure. The generator
is limited to the transitions relevant to freshness and existing priorities.

The scope includes existing wake/check output and tests. It excludes a new
command, a model-driven runtime, a next-iteration skill, and release changes.
No unresolved contradiction was found in this draft review. Implementation,
format selection, failing/passing demonstrations, and completion review
remain work for the proposed commitment after agreement.

## Agreement and implementation verification

The developer confirmed the five requirements and falsifiers on 2026-09-07.
They are now Agreed and the roadmap names this commitment. The earlier
specification review above is preserved as the record before confirmation.

Before implementation, 28 new integration cases failed against the existing
CLI for the expected missing receipt, path, rerun, or truthful-cause details.
After implementation all 28 passed, and the complete suite passed 312 tests.
A test-fixture correction selected the latest receipt by sequence rather
than filename after clock rollback; the initial fixture had damaged an older
output and therefore expected a rerun incorrectly. The runtime was unchanged
for that correction.

The three deterministic seeds (7, 42, 913) run 27 events each, with two fresh
wake processes after each event. Their independent model stores fixture
values and check results, not runtime digests or assessment calls. Additional
sequences cover revised agreement, mechanism review, completion review, and
imported receipt history.

A disposable copy of the kernel was changed to conceal input staleness. The
seed-7 model failed at the first edit: it expected run R-001, but the faulty
copy selected review first. Restoring the copy made the same sequence pass.
This demonstrates detection of the wrong action, not merely a process error.
The development kernel was not modified by that fault demonstration.

Ripwire found two new helper-complexity warnings. Splitting attachment
validation from I/O and change classification from formatting removed both.
Remaining warnings are existing-function revision churn plus minor assess
complexity and wake length increases. Its test gate named 16 test files, all
run in the complete suite; its unmatched rows are documentation sections.
The internal revisionVerdict arity changed from three to four arguments, and
edit-check found both callers compatible. Final committed evidence and the
post-implementation review remain outstanding.

A follow-up negative case distinguished a malformed list-valued inputs_detail
field from a legacy receipt that never had the field. It failed on the
misleading legacy message, then passed with an explicit invalid-path message.
This adds one case to the initial 28.

One full-suite rerun failed the existing duplicate-decision test. That test
ignored whether its first command successfully created a record, so the log
cannot establish why the precondition was absent. The decision-writing code
was unchanged. The test now asserts successful setup and verifies that the
original bytes survive refusal; its eight-test file passes. No cause for the
first command's unrecorded result is claimed.

## Final review of the committed implementation

All five requirements have current passing committed node-test evidence.
The captured run reports 313 tests, 313 passes, and zero failures. Package
and specification evidence is current and passing. The new requirement
identifiers were corrected to their three-digit spelling in the declaration
before the successful evidence run; no result was attributed to the earlier
misspelled identifiers.

No code changed during this review. Twelve additional adversarial probes ran
in fresh disposable repositories. Nine corrupt attachment shapes (null,
unknown version, non-array entries, null entry, list-valued digest or mode,
traversing or list-valued path, and reversed ordering) preserved current
evidence and produced an unavailable explanation after input changes. A run
that originally checked CRLF bytes correctly identified a later LF change
and returned to Done when the CRLF bytes were restored. A simultaneous
content and executable-mode change reported both reasons. Three failed
attempts retained escalation priority with malformed optional details and
a subsequently changed input. All twelve probes passed.

Inspected attachment serialization and validation, the captured candidate
identities, lazy explanation of the selected requirement, path escaping and
the 20-path limit, and mechanism-review instructions. Optional detail is
checked against the existing input digest; it never replaces the facts used
by assessment. The full suite covers the adjacent candidate, history, review,
and output-integrity boundaries. No further finding was established.

The production-rule self-audit covered scoped changes, format compatibility,
error handling, persistence and interrupted writes, reuse of input caches,
test soundness, documentation, and the runtime ceiling (1102 lines). Changes
remain local to this development checkout. Verification was on Linux with
Git conversion fixtures; native macOS and Windows runs were not performed.

## Review of the Muse install notes

Examined tree: 821c4da. The work under review is a docs-only change:
README.md and docs/manual.md gain Muse install guidance. No shipped
code, skill, template, or mechanism changed.

Attacked the one documented claim no mechanism observes. PKG-014 fails
when a README install step leaves a skill unreachable, and neither
node-test nor pkg-lint runs the install commands. In isolated homes,
skills 1.5.24 rejects `--agent muse` as invalid, `--agent universal
--global` installs all three skills into `$HOME/.agents/skills`, and
`muse skills list` shows all three. A skill directory placed in
`$HOME/.agents/skills` is listed by Muse, including the symlinked Cairn
skills in the live home. `muse skills install <path> --scope user`
copies into `~/.config/muse/skills` and is listed. `muse init`
scaffolds `AGENTS.md`, the working agreement the project skills write,
so no vendor-specific agreement file is needed.

Not established: template files under a universal install were not
inspected one by one; their inclusion relies on the installer's shared
code path already verified for codex. Combined agent selections and
non-Linux homes were not exercised. The violating example (an invalid
`--agent muse`) and the corrected case (`--agent universal`) were both
demonstrated. No code changed during this review. No finding.
