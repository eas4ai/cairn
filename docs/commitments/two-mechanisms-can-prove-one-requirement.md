# Two mechanisms can prove one requirement

Slug: two-mechanisms-can-prove-one-requirement
Requirements: LOOP-056, LOOP-099, LOOP-100
Specified from: two-mechanisms-that-both-prove-one-requirement
Inherits: every PKG requirement
Status: Agreed 2026-09-14

## Goal

A requirement that two commands prove keeps two pieces of evidence. The
kernel assesses each mechanism's evidence on its own, a named check
runs every mechanism that speaks for the requirement, and a failing
mechanism's attempts are not reset by the other one passing.

## Authorization and scope

The developer deferred in advance on 2026-09-14: "I will defer to your
recommendation on all remaining commitments unless review changes them
substantively." This is the first phase run under the next-iteration
skill shipped by the previous commitment. LOOP-056 is revised and
LOOP-099 and LOOP-100 are new. The decision is Consequential and waits
in the review queue.

## The change, restated

Today the kernel maps each requirement to one mechanism and refuses a
second declaration by name. A project with a fast targeted test and a
slow whole-binary run that both prove one requirement must merge them
into one command, which collapses two independent results into one
exit code. After this commitment, both declarations stand: wake names
the mechanism whose evidence needs action, a check named for the
requirement runs both, --stale runs the one that is stale, and three
failures of one mechanism escalate even when the other keeps passing.
For every project with one mechanism per requirement, nothing changes.

## Decisions to record

- two-mechanisms-may-prove-one-requirement-and-each-must-pass,
  Consequential, recorded before this commitment was named.

## Deliverables

- bin/cairn.mjs: the requirement-to-mechanism map holds a list; the
  refusal leaves; assess returns one standing per mechanism, computed
  over that mechanism's own records when the requirement has several
  and over the whole history when it has one; wake flattens the
  standings into its existing priority order; a named check runs every
  speaker and --stale runs the mechanism whose own evidence is missing
  or stale; the check's revision gate reads the mechanism's own latest
  record.
- tests/two-mechanisms.test.mjs: the three tests below.
- tests/recovery.test.mjs: the duplicate-owner refusal leaves the
  LOOP-044 test.

## Review before agreement

Examined on 2026-09-14, before the requirements were marked Agreed:

- Contradictions. LOOP-040 says a check that names requirements records
  evidence for every requirement each mechanism it runs speaks for;
  LOOP-099 adds which mechanisms run, and the two compose. LOOP-094's
  text says --stale runs each mechanism that speaks for a requirement
  whose evidence is missing or stale; with two mechanisms the reading
  is per mechanism, stated in LOOP-056's rationale rather than by
  revising LOOP-094, whose falsifier still holds under it. DEC-017 and
  DEC-018 count a streak by inputs digest, which is a mechanism's own
  quantity; LOOP-100 says the streak is one mechanism's records, so
  they agree. LOOP-070's sequences and prior-history digests are per
  requirement across all receipts, and the change does not touch them.
  LOOP-059's reviewed list is per declaration, so a revised requirement
  with two mechanisms is reviewed twice, once per mechanism, and wake
  names each in turn. LOOP-076 already names the mechanism in every
  stale explanation.
- Falsifiers that would miss their violation. Each is a kernel state in
  a fixture with two declarations for R-001: the missing-evidence case,
  the one-of-two-runs case, and the interleaved-failure case. Each is
  observable by a test that reads receipts and wake output.
- Requirements no mechanism can check. node-test speaks for all three
  through tests/two-mechanisms.test.mjs.
- The single-mechanism reading. Partitioning history by mechanism name
  for every requirement would change what a renamed mechanism sees:
  its earlier passes would leave its streak, so a fail after a rename
  would read as never-passed and a rename would reset attempts. The
  draft therefore keeps the whole history for a requirement with one
  mechanism, and partitions only when there are several. Stated in
  LOOP-056's rationale.

Nothing substantive changed, so the developer's advance deference
stands as the confirmation.

## Tests

- a second declaration for one requirement is accepted, `check R-001`
  records evidence from both, Done needs both, and a failure of one
  names it as a regression (LOOP-056, LOOP-099)
- a change to one mechanism's input names that mechanism as stale, and
  --stale runs only it (LOOP-056, LOOP-094)
- one mechanism failing at three digests while the other passes each
  time escalates (LOOP-100, DEC-016)

## Done when

- Every requirement listed above has current passing evidence,
  recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done, with no next-iteration item waiting.
