commitment: the-verifiers-findings-are-closed
commit: a48acdb
examined:
  - mechanism review, LOOP-104 revised (the Current: line is read outside fences): tests/records.test.mjs observes a fenced example before the real line only. Violating example, a fenced `Current: other` after `Current: first`, reproduced in a scratch project: the kernel names a repair for `other` with the closing fence appended, because currentCommitment reads the raw text. Mismatch, recorded as the open finding below.
  - mechanism review, LOOP-126 revised (an input is resolved against the project root): tests/records.test.mjs observes `.cairn/*` and `*` at the toplevel. Violating example, input `..` in a project at packages/app, reproduced in a scratch project: the first check ends with `commit packages/app/.cairn/evidence/` (LOOP-063), and the covers test compares the spelling, not the resolved path. Mismatch, recorded as the open finding below.
  - mechanism review, PKG-022 revised (the third falsifier case is git that cannot run): tests/hooks.test.mjs runs both hooks with PATH=/nonexistent and observes exit 0 and one stderr line. The removed case, a kernel that cannot be found, has no test and no code path, since the hook falls back to its own kernel (PKG-033). No mismatch.
  - mechanism review, PKG-034 revised (a link whose target is not a regular file is replaced): tests/hooks.test.mjs observes a wrapper kept and a dangling link replaced. Violating example, a link to a directory named cairn.mjs, reproduced in a scratch home: the link is kept, the hook judges with its own kernel, and no line says so. Mismatch, recorded as the open finding below.
  - LOOP-132 is new and no mechanism speaks for it; the node-test declaration gains it with its test in the same commit as the fix.
findings:
  - open: a fenced Current: example after the real line selects the commitment (LOOP-104); currentCommitment reads the raw roadmap text.
  - open: an input spelled `..` from a project below the Git toplevel is not refused, and the check's message names .cairn/evidence/ from the Git toplevel (LOOP-126, LOOP-132); the covers test compares spellings, and dirtyInputs returns Git's toplevel-relative paths.
  - open: the session-start hook keeps a link to a directory and judges silently with its own kernel (PKG-034).
  - open: cairn lint with a --root that is not a directory blames the checker (PKG-028); the pkg-lint count is one line high per file (PKG-004).

## Mechanism reviews at a48acdb, 2026-09-15

Recorded before any code change in this commitment. Each violating
example is a scratch project or home outside the repository; the
corrected cases are the tests named above, which pass on this kernel.
