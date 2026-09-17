commitment: a-supersession-names-one-live-record-by-its-slug
commit: 4f03737
examined:
  - the failure demonstration before the fix: with both tests in place and the kernel at 56b80db's parent, supersede ../../outside stamped outside.md at the repository root and wrote new-one.md, and a second supersede of old-one wrote newer-one.md above a second stamp; with the change, each of ../../outside, Old-One, "old one" and old-one.md exits 3 naming the slug rule and DEC-022 with the outside file untouched and no record written, and the second supersession exits 3 naming new-one, leaving the old record byte-identical. Full suite 481.
  - a leading hyphen, -old-one, is refused earlier by the option parser as an unknown flag; it never reaches the slug check, so the test does not claim it.
  - the order of refusals inside decide: the slug check comes before the path is built, so no argument outside the alphabet touches the filesystem; the existence check and the already-superseded check come before the new record is written, so a refusal writes nothing.
  - the already-superseded check against the wake's own reader: decisionVerdict reads a record through recordFields over the fence-stripped text, header fields only; the new check read fields() over the raw text. Probed on a record whose Decision body quotes "Superseded by: some-other" inside a fenced example: supersede refused it as already superseded by "some-other ```". The wake would judge that record as live. Finding, below.
  - the check during the loop: the first check --stale after the declaration commit refused with "candidate changed before node-test; no evidence recorded" and recorded nothing; the tree was clean and the rerun a minute later recorded every mechanism. Observed once, not reproduced, and the refusal is the kernel doing what LOOP-024 asks when the candidate is not stable; noted so a repeat is recognized.
  - the documents: the manual names supersede once, as the way to reverse a promotion, and describes no argument shape; nothing there needs the rule.
  - the package: every mechanism re-run after the kernel change, every requirement pass; bin/ is 1576 lines against the 1600 ceiling.
findings:
  - open: the already-superseded check reads the old record with fields() over the raw text while the wake reads it with recordFields over the fence-stripped header, so a record that only quotes a Superseded by: line in a fenced example is refused as already superseded; the check should read the record exactly as the wake does

## Commitment review at 4f03737, 2026-09-17

The fifth promotion out of the kernel review. Both parts of DEC-022
hold under attack, and the one finding is a disagreement between two
readers of the same record, the same shape as the LOOP-134 defect this
review series already fixed once. The rule to carry: when a command
judges a record the wake also judges, it reads it through the wake's
reader.
