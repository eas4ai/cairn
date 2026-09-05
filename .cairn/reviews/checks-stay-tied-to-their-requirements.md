commitment: checks-stay-tied-to-their-requirements
commit: ec42cd5
examined:
  - mechanism review for LOOP-024: the unchanged-input tests still pass; requirement-freshness tests separately reject revised text, while separate rationale and status dates preserve evidence
  - mechanism review for LOOP-039: legacy exit-zero and exit-one tests retain aggregate behavior; explicit reporting tests require unverified results when zero lines arrive, with startup and output-limit errors kept separately
  - the tightened response fixture rejects rerunning the old check before its review; the corrected check fails against 200 ms and passes against 50 ms under the revised 100 ms requirement
  - the large-input test failed before the Git change and passes after it; a removed empty-blob object no longer produces a digest, and a listing over 1 MiB retains the last path
  - direct local verification before this record: all 139 Node tests passed, including the executed walkthrough; specification and package lints passed
findings:
  - open: mechanism-review guidance says to correct the check before recording the review; it must preserve LOOP-032 by recording a finding before a separate implementation action

