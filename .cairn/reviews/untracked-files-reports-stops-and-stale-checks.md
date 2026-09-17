commitment: untracked-files-reports-stops-and-stale-checks
commit: c0f00d63
examined:
  - completion review at c0f00d63: every requirement passes on fresh evidence and the full suite passes at 490. Each new test failed on the kernel and hook at 8c5c087 and passes now, except the LOOP-138 test, which reads the template committed with the agreement.
  - this morning's situation, rerun on a scratch clone of this repository: an untracked folder of drafts under docs/ and an untracked image leave the wake at the commitment's real next action; the stop hook blocks the first stop with that verdict and, given stop_hook_active true, prints the verdict and returns no decision. A tracked edit to docs/manual.md still makes the wake name record, and the hook blocks it once and gives way on the second stop.
  - check --stale when the held mechanism is not stale: it still prints the skip line naming the requirement and DEC-016, then the wake's escalate verdict. Nothing would have run either way; the line tells the agent the same next action the wake does, so it is accepted as information rather than a defect.
  - named checks: cairn check R-001 still runs a mechanism at the attempt limit. The requirement binds --stale only, as the developer approved; DEC-016 still makes the next decision Blocking, and the wake names escalate first.
  - limits: Codex's stop_hook_active is inferred from its binary, not observed at runtime; if Codex does not send it, a Codex stop is blocked as before, which is PKG-018's first clause. LOOP-138 is a static proxy on the template: whether an agent captures a report's findings is not observable by a test.
  - the package: bin/ is 1590 lines against the 1600 ceiling, ten to spare; pkg-lint and spec-lint clean; the manual's stop hook paragraph and the record row say what the code does.
  - mechanism review of node-test for LOOP-110 as revised: tests/robustness.test.mjs line 92 and tests/records.test.mjs lines 107 and 117 edit a tracked declared input and expect record, which the revised text keeps; line 166 stages a rename and expects check to refuse, which LOOP-030 keeps. No test places an untracked file under a declared input, so the new clause, that such a file never makes the wake name record, has no observation. The corrected case cannot be demonstrated before the kernel changes; the red run will be the failure demonstration.
  - mechanism review of node-test for LOOP-094 as revised: tests/check-stale.test.mjs covers the green no-op, a single stale mechanism, a shared mechanism, the implement skip and the refusal of named requirements. None builds three attempts with no escalation, so the new clause, that --stale holds such a mechanism back and names the requirement, has no observation.
  - mechanism review of node-test for PKG-018 as revised: tests/hooks.test.mjs line 33 passes stop_hook_active false and expects a block, which the revised falsifier keeps; line 42 covers Done, Escalate and a non-repository. No test passes stop_hook_active true, so the new clause has no observation.
  - LOOP-138 is new and has no test; the template sentence exists at 8c5c087 and nothing reads it.
findings:
  - resolved: node-test has no test for LOOP-110's new clause: an untracked file under a declared input must leave the wake at its next action, and check must still refuse beside it with the .gitignore way out named. Resolved: the wake's record verdict reads git status with untracked files excluded; check's refusal is unchanged and names .gitignore for each untracked path; tests/records.test.mjs adds a report under a declared folder that leaves the wake at run, is refused by check with .gitignore named and no receipt, and is named record once added (e62b2757)
  - resolved: node-test has no test for LOOP-094's new clause: check --stale must skip a mechanism whose requirement has three attempts and no escalation since, name that requirement, and record nothing. Resolved: --stale collects each mechanism whose requirement has three attempts and no escalation since, removes it from the run set, and prints the skip naming the requirement and DEC-016; tests/check-stale.test.mjs builds a baseline and three attempts, makes the input stale, and asserts the skip line and an unchanged receipt count (e62b2757)
  - resolved: node-test has no test for PKG-018's new clause: the stop hook given stop_hook_active true must print the verdict and return no block decision. Resolved: bin/hook.mjs reads stop_hook_active and, when it is true on a Resolvable verdict, prints the verdict with no block decision; tests/hooks.test.mjs asserts exit 0, the verdict on stdout, and no decision field (e62b2757)
  - resolved: node-test has no test for LOOP-138: the working agreement template must carry the report sentence. Resolved: tests/skills.test.mjs reads the template for the three parts of the sentence; it passed before the kernel change because the template was committed with the agreement, which is the static proxy the requirement names (e62b2757)

## Mechanism review at 8c5c0873, 2026-09-17

The revised texts each add one clause, and the existing tests all
observe the parts that did not change. The four findings are the new
clauses, which nothing observes yet, and the kernel does not implement
three of them. They are resolved as one implementation action after
this record, each test red on the kernel at this commit and green after.

## Commitment review at c0f00d63, 2026-09-17

The four changes do what the developer approved, and the probe that
matters most was the morning's own situation, rerun: a drafts folder
nobody added to Git no longer holds the session, and a stop refused
once is let go with the verdict printed. What the loop still guards is
unchanged: evidence is never recorded beside an untracked file, and a
tracked edit still needs its record.

The kernel is now ten lines from its ceiling. The next change that adds
behavior will need to make room first.

No open finding.
