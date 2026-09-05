commit: b2874ee
examined: SPEC-019 mechanism review before implementation. Read scripts/spec-lint.mjs, shared header and fence grammar, and existing path tests.
verification:
  - The unchanged linter reports all 25 findings from the adopting project. A disposable fixture also reports a placeholder suffix as an absolute path.
initial finding:
  - SPEC-019: the preceding-character class accepts a closing angle bracket, and no declaration can distinguish required host paths from checkout citations. Implement the requested exception and demonstrate strict defaults and boundary handling before recording the revised mechanism digest.

mechanism finding resolution:
  - Implemented at a0687c2. Four new tests failed against the old linter; all 18 lint tests and 18 skill tests now pass.
  - Explicit declarations cover exact paths and descendants with a slash boundary. Files do not inherit another file's declarations; requirement bodies and fenced examples cannot grant exceptions. Malformed declarations are findings. Existing machine-local citation tests still fail as intended.
  - The adopting project copy drops from 25 to 15 findings with the parser fix alone. Adding the requested declarations in nine copied files produces a clean lint. No adopting-project files were edited.
  - SPEC-019 mechanism mismatch resolved; reviewed against the revised requirement and falsifier. The full commitment review remains after committed-tree checks.

final review:
  - Examined b2874ee after the committed-tree check: all 174 tests and both lints passed, including SPEC-019 and SPEC-024. The check requested this refreshed review; no mechanism failed.
  - Read header extraction against the shared parser: fenced examples keep line positions, the first real requirement ends the header, and files without requirements can still declare host paths.
  - Checked exact and descendant matching, trailing directory slashes, file isolation, undeclared paths, malformed entries, and both fence styles. The linter cannot judge whether a declared host path is legitimate product behavior; the specification, skills, and manual leave that decision to review.
  - Verified local document links. Reviewed the final source, regression tests, specification, skills, and human explanation against the production coding rules. No further revision identified.
findings:
  - none
