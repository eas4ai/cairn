commitment: the-two-views-of-an-input-agree
commit: 673382d
examined:
  - the new test against the kernel as it was, from git history in a scratch copy: it fails at the Done assertion with the review stale on its own commit, so the test reproduces the defect
  - readlinkSync against git show for a link blob: git stores the target path with no trailing newline, and readlink returns the same string
  - inputFiles and dirtyInputs on a link: git ls-files and git status treat it as a path, unchanged
  - a link whose target is outside the repository: its blob is still the path, and the target's content is nobody's input, as before
  - the kernel's line count after the change, 417 of 1500
  - this repository's own declarations: no link is declared, and CLAUDE.md stays an include
  - a mechanism that reads through a link and declares only the link: a change to the target leaves its evidence current; the decision record states that the target is declared too, as LOOP-006 already requires for any file a mechanism reads
findings:
