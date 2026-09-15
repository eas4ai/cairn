commitment: two-mechanisms-can-prove-one-requirement
commit: 2f8ec1d
examined:
  - node-test against the revised LOOP-056: the three tests in tests/two-mechanisms.test.mjs, the LOOP-044 test that lost its duplicate-owner half, and the red and green runs of the suite around the implementation commit.
  - The build at 882e9d8: mechanisms, declarationError, breaches, the mode check, assess and standing, ownRecords, the wake loop over flattened standings, runChecks under --stale and with named requirements, runMechanism's revision gate, and the manual's section on one command checking several requirements.
findings:
  - open: docs/manual.md says a check selects the requirement's mechanism and describes one command checking several requirements; it does not say that several mechanisms can now check one requirement, that each must pass, or that a named check runs all of them (LOOP-056, LOOP-099)

## LOOP-056 mechanism review, 2026-09-14

Revised text: when more than one mechanism speaks for a requirement,
the loop treats it as met only when each has current passing
evidence. Falsifier: two declarations claim one requirement, one has
current passing evidence, the other has failing, stale, unverified,
or no evidence, and wake does not name the requirement.

node-test speaks for LOOP-056 through tests/two-mechanisms.test.mjs.
The first test builds a fixture with two declarations for R-001,
checks it, reaches Done, then makes one mechanism fail while the
other keeps passing and asserts that wake names R-001 with that
mechanism as a regression: the falsifier's failing case. The second
changes the input of one mechanism only and asserts that wake names
R-001 as stale with that mechanism and that --stale runs it alone:
the falsifier's stale case. The no-evidence case is the first wake of
the first test, before any check. The unverified case is not exercised
by name; it takes the same branch as a failing latest record in the
wake loop, and the reporting-mode suite covers unverified records for
one mechanism.

Safe violating example: at 9bc5cef, the agreement commit, the kernel
still mapped a requirement to one mechanism and refused the second
declaration. The three new tests failed there, 3 of 16 in the two
files, each on the refusal and not on a setup error. Corrected case:
at 882e9d8 the full suite ran 387 passing, and the old duplicate-owner
assertion, which asserted the falsifier state of the revised text,
left tests/recovery.test.mjs in the agreement commit. No mismatch
found. No code changed during this review.

## Commitment review at f921803, 2026-09-14

Every requirement has current passing evidence: LOOP-056 revised,
LOOP-099, LOOP-100, and the inherited package set. The suite is 387
passing, both lints clean, the kernel at 1403 of 1500 lines by the
package lint's count, three lines heavier than before the change.

Attacked:

- ownRecords partitions by the mechanism name a receipt carries only
  when the requirement has several mechanisms; with one, the whole
  history is that mechanism's, as before, so a renamed mechanism keeps
  its passes and its streak. With several, a record naming a former
  mechanism falls in no partition and stays in the full history, where
  the order and repair checks read it. Every receipt in this repository
  and every receipt the kernel writes carries a mechanism name.
- Sequences and prior-history digests are per requirement across all
  of its receipts and did not change; the third test writes eight
  records for R-001 from two mechanisms and wake reads them in order,
  or it would have named a rerun instead of the escalation.
- A requirement with no mechanism yields one standing with a null
  mechanism, as before: the wake loop skips it and names declare.
- The wake's run action for a requirement whose one mechanism of two
  has no evidence says which mechanism, and the working agreement's
  route, cairn check with the requirement, runs both (LOOP-099);
  --stale is the route that runs only the one that needs it. The
  message could name --stale; it names the requirement, which the
  agreement already routes.
- --stale builds one context for all requirements instead of one per
  requirement; the context holds read caches and the escalation list,
  and a check reads fresh state at each candidate boundary, so the
  shared context cannot hide a change.
- The check's revision gate reads the mechanism's own latest record
  when the requirement has several, matching what wake assesses; with
  the full history it could have let the second mechanism run without
  its own review after a revision.
- The refusal's test half in tests/recovery.test.mjs asserted the
  falsifier state of the revised text and left with the agreement
  commit; the LOOP-044 half stands.
- The manual describes one command checking several requirements and
  not the mirror case this commitment adds. Recorded as the open
  finding above, to be resolved as its own work.

Records: the decision waits in the queue; the item carries
Promoted to: this slug; the roadmap's Current: line moved in the
agreement commit, where the footprint began; next-iteration holds no
waiting item.

Self-audit against the production rules: one kernel change of nine
lines across six places, three tests added and one narrowed, and a
documentation gap found and recorded rather than patched during the
review; every check reported here ran and passed. One open finding.
