commitment: the-kernel-refuses-bad-records-and-leaves-no-trap
commit: 16daec6
examined:
  - The build at 8a1ac76: the record readers (files, read, currentCommitment, requirementSet, mechanisms, decisions, escalations, captureVerdict, the wake ending), declarationFieldsError and declarationError, decisionVerdict, reviewOf, the wake order around declare and the record action, fileIdentity and its callers, the Git path forms for a root below the toplevel, recordEvidence's exit field, and the --stale summary.
  - tests/robustness.test.mjs against LOOP-102 through LOOP-113, one test per requirement, each run red at 49c8f38 and green at 8a1ac76; the six existing tests whose fixtures or expectations the new rules changed.
findings: []

## Commitment review at 16daec6, 2026-09-15

Every requirement has current passing evidence: LOOP-102 through
LOOP-113, LOOP-101, and the inherited package set. The suite is 403
passing, both lints clean, the kernel at 1442 of 1500 lines, thirty-
seven lines heavier.

Safe violating examples: all twelve new tests failed at the agreement
commit 49c8f38 on the old kernel, each on the fault it names and not
on setup, and pass at 8a1ac76.

Attacked:

- Records are now the slug-named .md files of their directories. A
  consumer who hand-names a decision with an uppercase letter or a
  space no longer has it read; the commands never write such a name,
  and the audit's README case is exactly what the rule excludes. Spec
  files keep the wider .md rule, since a consumer names those freely.
- The declare order stayed as it was: a mechanism-backed requirement's
  evidence action still precedes a mechanism-less requirement's
  declare, which the existing step-6-before-step-7 test asserts;
  LOOP-106 only stops the mechanism-less requirement's own history
  from selecting implement or escalate. The LOOP-106 test was
  narrowed to that.
- LOOP-110 changed what a wake mid-edit says: with a dirty declared
  input and no record it names record, and with a record it names
  reconcile, so wake no longer prints a stale explanation for an
  uncommitted edit. Two tests that wake on uncommitted edits now
  commit first, which is what their falsifiers say (a committed
  change). This is the discipline LOOP-022 and LOOP-027 describe.
- LOOP-111 removed the mode variant of the LOOP-063 test: under
  core.filemode false a chmod is not a change Git can see, so it is
  not a hidden change either. The content variant stands.
- The Git path forms for a root below the toplevel were probed by
  hand before the change: hash-object reads from the toplevel and
  needs the prefix, ls-tree with a directory pathspec and show with
  rev:./path are relative to the cwd, diff-tree takes --relative. The
  LOOP-112 test runs check from packages/app.
- decisionVerdict now walks every record on every wake, running
  rev-parse for entries that do not resolve; the cost is one git call
  per unresolved entry, as before. A record missing a header field
  from before this rule would surface as a repair; every record in
  this repository carries all four (checked by the audit).
- The read helper tags the path on failure and main prints a repair;
  a read failure inside history() is still caught there and reported
  as a receipt error, so evidence handling is unchanged.
- The record action is in the working agreement, so the LOOP-101
  test that reads the kernel's action verbs still passes; that was
  the one agreement change and it is byte-identical in the template.

Self-audit against the production rules: the deliverables the
commitment lists, twelve tests added, six adjusted with the reason
recorded here; every check reported here ran and passed. No open
finding.
