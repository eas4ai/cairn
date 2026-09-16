commitment: the-verifiers-findings-are-closed
commit: b4960bc
examined:
  - mechanism review, LOOP-104 revised (the Current: line is read outside fences): tests/records.test.mjs observes a fenced example before the real line only. Violating example, a fenced `Current: other` after `Current: first`, reproduced in a scratch project: the kernel names a repair for `other` with the closing fence appended, because currentCommitment reads the raw text. Mismatch, recorded as the open finding below.
  - mechanism review, LOOP-126 revised (an input is resolved against the project root): tests/records.test.mjs observes `.cairn/*` and `*` at the toplevel. Violating example, input `..` in a project at packages/app, reproduced in a scratch project: the first check ends with `commit packages/app/.cairn/evidence/` (LOOP-063), and the covers test compares the spelling, not the resolved path. Mismatch, recorded as the open finding below.
  - mechanism review, PKG-022 revised (the third falsifier case is git that cannot run): tests/hooks.test.mjs runs both hooks with PATH=/nonexistent and observes exit 0 and one stderr line. The removed case, a kernel that cannot be found, has no test and no code path, since the hook falls back to its own kernel (PKG-033). No mismatch.
  - mechanism review, PKG-034 revised (a link whose target is not a regular file is replaced): tests/hooks.test.mjs observes a wrapper kept and a dangling link replaced. Violating example, a link to a directory named cairn.mjs, reproduced in a scratch home: the link is kept, the hook judges with its own kernel, and no line says so. Mismatch, recorded as the open finding below.
  - LOOP-132 is new and no mechanism speaks for it; the node-test declaration gains it with its test in the same commit as the fix.
  - completion review, the dirty-path mapping: a nested project with a directory input and a rename under it names record src/renamed and commit src/renamed, src/other, both from the project root; a toplevel project prints what it printed before, since the prefix is empty. The LOOP-069 budget test passes, so the one extra Git process runs only when a path is dirty and is cached with the input selection.
  - completion review, the covers test: an absolute path inside the project and ../app/.cairn/evidence/runs from a nested project are refused before the run; :(top) is not, and reaches the post-run branch as before; /etc, outside the repository, ends in the one-line Git error the loop already printed for it. None is a trap.
  - completion review, the hook: the stop hook still falls back to its own kernel when the link resolves to no file, as PKG-033 says; session-start now replaces such a link and says so. The verifier's other observation, that session-start links this checkout while another cairn is on PATH, is what PKG-019 requires, and the judge line names the other kernel.
  - completion review, the lints: pkg-lint reports 1510 lines, which is wc -l over bin/; spec-lint still flags a regex literal with no metacharacter and a ~user path, as SPEC-028 defines, and the plan's F1 row says so.
  - the review examined the code without changing it; the attacks ran in scratch projects and homes outside the repository.
  - re-examined at b4960bc: the only change since 6d83fe7 is the .gitignore line docs/video/, added on the developer's direction; PKG-002's lint restricts .cairn/ lines and evidence only, the pkg-lint evidence was rerun and passes, and no code changed.
findings:
  - resolved: a fenced Current: example after the real line selected the commitment (LOOP-104); currentCommitment reads the roadmap without fences (1d0b743), and the test covers a fence before and after the line.
  - resolved: an input spelled `..` from a project below the Git toplevel was not refused, and the check's message named .cairn/evidence/ from the Git toplevel (LOOP-126, LOOP-132); the covers test resolves each input against the root, and dirtyInputs maps Git's paths to the root (1d0b743), with a test for each.
  - resolved: the session-start hook kept a link to a directory and judged silently with its own kernel (PKG-034); a link whose target is not a regular file is replaced and reported (1d0b743), with a test.
  - resolved: cairn lint with a --root that is not a directory blamed the checker (PKG-028), and the pkg-lint count was one line high per file (PKG-004); the lint names the root in one line, and the count sums each file's lines as wc -l does (1d0b743), with tests red on the old code.

## Mechanism reviews at a48acdb, 2026-09-15

Recorded before any code change in this commitment. Each violating
example is a scratch project or home outside the repository; the
corrected cases are the tests named above, which pass on this kernel.

## Commitment review at 6d83fe7, 2026-09-15

LOOP-104, LOOP-126, LOOP-132, LOOP-105, LOOP-063, PKG-004, PKG-022,
PKG-026, PKG-028, PKG-034, PKG-019, PKG-033 and PKG-036 have current
passing evidence; 454 tests pass, both lints clean, the kernel at
1510 of 1600 lines. Attacked as listed under examined. No open
finding.

## Commitment review at b4960bc, 2026-09-15

One ignore line added since 6d83fe7; pkg-lint rerun and passing. No
open finding.
