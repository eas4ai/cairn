commitment: two-mechanisms-can-prove-one-requirement
commit: 2f8ec1d
examined:
  - node-test against the revised LOOP-056: the three tests in tests/two-mechanisms.test.mjs, the LOOP-044 test that lost its duplicate-owner half, and the red and green runs of the suite around the implementation commit.
findings: []

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
