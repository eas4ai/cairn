# Evidence names the kernel that wrote it

Slug: evidence-names-the-kernel-that-wrote-it
Requirements: LOOP-023, LOOP-024, LOOP-095, LOOP-096
Inherits: every PKG requirement
Status: Agreed 2026-09-14

## Goal

Every evidence record says which kernel wrote it, a record from another
kernel is stale with a reason that says so, and the working agreement
says the kernel is upgraded only at Done. An agent that meets an
upgraded referee re-runs what the old one recorded, once, and never
guesses which records to trust.

## Authorization and scope

The developer answered ok to escalation loop-091-2 on 2026-09-14, which
recommended this item. Item:
.cairn/next-iteration/evidence-names-the-kernel-that-wrote-it.md. The
change is inside the kernel's record writer and freshness assessment,
the working agreement, and the documentation of why checks re-run.
Reviews are not stamped.

## Decisions to record

- The kernel digest covers bin/cairn.mjs and bin/spec.mjs, the files
  that decide verdicts and write records, and not bin/hook.mjs, which
  writes none. Judged.

## Deliverables

- bin/cairn.mjs: a KERNEL_DIGEST computed at startup from the two files;
  recordEvidence writes `kernel_digest:` beside `mechanism_digest:`;
  assess adds the stale reason "the kernel changed" when the latest
  record's kernel digest is missing or differs; the freshness
  explanation carries the reason like any other.
- AGENTS.md and the template: one sentence in the developer's section,
  "The kernel is upgraded at Done, never inside a commitment; a
  commitment starts and finishes on one referee."
- README "Upgrading an existing Cairn project" and the manual's "Why
  passing checks sometimes need to run again": the kernel reason, and
  that an upgrade re-runs every mechanism once.
- tests/evidence-integrity.test.mjs: the cases below; tests/skills.test.mjs:
  the working-agreement sentence.

## Tests

- a fresh record carries kernel_digest equal to the digest of the two
  kernel files (LOOP-023)
- a record whose kernel_digest is edited, and a record with the field
  removed, make wake name run with a reason that names the kernel; a
  new check restores Done (LOOP-095, LOOP-024)
- an unrelated file change still leaves evidence current (LOOP-024)
- the working agreement and the template carry the upgrade sentence
  (LOOP-096)

## Verification

Reproduce the failure: at the commit before the change, a record from
a different kernel is indistinguishable from a current one. Run the
full suite, both lints, full committed mechanisms, and review before
Done. Expect every mechanism to re-run once after the kernel change,
since no existing record carries the field.

## Done when

- Every requirement listed above has current passing evidence from
  node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, specify, or Done.
