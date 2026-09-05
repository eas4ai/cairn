commitment: the-verdict-is-per-requirement
commit: 036bf59
examined:
  - the documentation cleanup at 036bf59 against its parent: every normative requirement block is identical; the changes make explanations self-contained
  - the skills test: only its label and checks for obsolete external command names were removed; its checks for unsupported artifacts and all requirement-specific tests remain
  - the kernel, scripts, skills, and working agreement against the prior tree: unchanged, so the implementation examined at 116d2fa below is preserved
  - the full working-file scan, including hidden files and the untracked roadmap copy, for remaining external workflow name references: no matches
  - verification after the cleanup commit: node-test, spec-lint, and pkg-lint all recorded passing evidence; the direct test run passed all 114 tests
  - the result-line form against ordinary output: anchored to a whole line of standard output, identifier and word only; a test prints the form inside a sentence and a near-miss word and neither counts
  - standard error excluded from result lines, as LOOP-037 says standard output; a mechanism that reports on stderr is recorded by its exit code, which LOOP-039 covers
  - a mechanism printing two lines for one identifier: the last line wrote the record; nothing in the specification says which, and the conservative reading is that a fail anywhere is a fail
  - the attempt walk against the first adoption's LIVE-001 history, three fails at three commits with the first the baseline: two attempts, no escalation, which is the case that reached the developer as Blocking
  - the attempt walk when the streak begins after a pass: the pass ends the walk and the record after it is a new attempt whatever its digest
  - a record with no inputs_digest, from a hand-written or older format: compares equal to a neighbor lacking one and folds into its attempt, which errs toward not escalating
  - escalatedSince against the first of the last three attempts rather than the first of the last three records, so an escalation answered before three fresh attempts does not suppress the fourth
  - the first adoption's live-acceptance mechanism under the new check: no result line, so thirteen records still share one result from the exit code, and the per-requirement discrimination waits on verify.py printing lines, which is that project's work, not this one's
  - a targeted check naming a requirement outside the commitment: its mechanism runs and records all it speaks for, as before the change it ran and recorded one
  - the working agreement in both copies, byte for byte, and the skills suite asserting the attempt sentence
  - this repository's node-test: it prints no result lines, so its records keep the exit-code rule; the commitment said it can and did not say it must
  - the developer's corrections after the first review: the five result cases against the code, one branch each, and the transition, a mechanism printing nothing, against the pre-change behavior in the suite's older tests, which pass unchanged
  - unverified against the wake: it is named for implementation because it is not a pass, is transparent to the failing streak and counts as no attempt, and is not a regression after a pass because it is not a fail
  - the attempt count against the developer's four questions: inputs are the record's inputs_digest, the mechanism's declared inputs; the baseline is excluded by digest, so a revert to it counts nothing; a pass resets; a return to a digest in the streak counts once; a documentation change outside the declared inputs changes no digest
  - the first adoption's aborted native run under the new rules, had verify.py printed lines: host passes kept, the unreached assertions unverified, no attempt consumed
  - PKG-015 after confirmation: the kernel folded it into this commitment and demanded a mechanism commitment 14 builds, which is the defect it names; it is held in docs/spec/draft.md, and a block line beginning Status: Agreed there was read as the file's status, so the held form carries Confirmed: instead
  - the second adoption's nine points, each against the code: the marker prefix, so a suite's own line is not a verdict; Concerns as a list in both the DEC-016 check and the DEC-019 hint; the exit code in the unverified reason; three runs at one digest named in the reason without changing the verdict, since the counter cannot tell a rerun from host state and the agent can; the rest routed to commitments 11, 12, and 14 by requirement
  - the DEC-019 hint against the host-cache case: zero attempts by DEC-017, the hint appears on the third run, an answered escalation naming the requirement among others clears it, and nothing manufactures an attempt
  - the transition once more with the marker: a mechanism printing nothing, or printing the old unmarked form, is read by its exit code exactly as before
  - the kernel at 440 lines of the 1500 ceiling
findings:
  - resolved: two result lines for one identifier let the last one write the record; a fail on any line should win
