commitment: lints-and-tests-observe-what-they-name
commit: 63e5652
examined:
  - mechanism review, SPEC-028 revised: tests/spec-lint.test.mjs "a regex literal is not a path ..." observes an anchor and a group but neither a class nor a quantifier, which the revised falsifier names; the checker still exempts the old set. Mismatch, recorded as the open finding below and fixed as this commitment's own work.
  - mechanism review, PKG-025 revised: tests/coverage.test.mjs reads the node-test declaration by its filename and scans every test title; it runs under that mechanism, so the file it reads is the declaration of the mechanism running it. No mismatch.
  - mechanism review, PKG-026 revised: tests/coverage.test.mjs matches three read shapes; the revised rationale says every ../ literal and relative import. Mismatch, recorded below and fixed as this commitment's own work.
findings:
  - resolved: the SPEC-028 checker exempted ^ $ * | ? and backslash only; the set now adds [ ] ( ) { } + and a closing bracket after a path is not part of it, with class and quantifier cases in the test (038e748). The PKG-026 scan now matches a URL, a relative import, or a helper call with a plain or template literal, taking a template's static prefix; the scan is not widened to every ../ literal, since fixture paths inside tests carry that prefix too, and the rationale says a spawned process's reads are declared by hand.
  - the package lint reads .cairn/ three ways the footprint cannot express (the tracked set for PKG-002, the listing for PKG-003, git check-ignore for the ignore files); LOOP-105 refuses .cairn as an input, so the reads are recorded in PKG-024's rationale and here, not declared (audit-2 B8).
  - the spec-lint declaration lists skills/, whose names the checker reads for SPEC-019; a consumer cannot declare the checker, which PKG-028's rationale now says (B7).
  - the vendor-step scan collapses whitespace so a wrapped list item matches, adds seven verbs, and matches the product before the verb; the skills stay clean under it (F3, F4). The deferral scan adds five phrases; the commitment file that named them was reworded to keep the phrases out of prose (F5). The ignore probe tries .out and .err names (F6). The kernel count takes every file under bin/ (D10).
  - fourteen titles: six were retitled to the requirement their body observes or dropped a requirement another test names (LOOP-106 for the declare step; LOOP-046, LOOP-096, LOOP-087, PKG-028 and DEC-004 named elsewhere); eight bodies were strengthened to observe their falsifier (LOOP-004 three exit codes; LOOP-001 and LOOP-003 before and after a persisted transition, on a decision fixture that now reads as build; LOOP-021 the record seen by the mechanism; LOOP-025 a pass after a fail; DEC-002 a Consequential decision never yields Escalate; LOOP-026 the five fields consecutive and the reply after a blank line; LOOP-098 both receipts in sequence order); LOOP-019 gained its own test, the current commitment judged and the other not (E2).
  - the branches the audit listed under E3 are covered by the tests of commitments 1 to 3; the LOOP-113 collision branch was verified by hand with a real 7-hex collision and stays untested, since building one takes seconds per run.
  - the new lint cases were run against the scripts before the change: five of six fixtures failed there; the coverage case passed, since no read escapes the old scan today, as the audit said.

## Mechanism reviews at 6fe5e82, 2026-09-15

Recorded before any code change in this commitment. The two
mismatches are the audit's F1 and E1, which this commitment exists to
fix; they are open findings until the fix is committed and checked.

## Commitment review at 63e5652, 2026-09-15

SPEC-028, SPEC-029, PKG-025, PKG-026, PKG-027 and the rest have
current passing evidence; 451 tests pass, both lints clean, the
kernel at 1507 of 1600 lines. Attacked as listed under examined. No
open finding.
