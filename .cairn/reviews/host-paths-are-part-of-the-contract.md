commit: 44b90e4
examined: SPEC-019 mechanism review before implementation. Read scripts/spec-lint.mjs, shared header and fence grammar, and existing path tests.
verification:
  - The unchanged linter reports all 25 findings from the adopting project. A disposable fixture also reports a placeholder suffix as an absolute path.
findings:
  - SPEC-019: the preceding-character class accepts a closing angle bracket, and no declaration can distinguish required host paths from checkout citations. Implement the requested exception and demonstrate strict defaults and boundary handling before recording the revised mechanism digest.

mechanism finding resolution:
  - Implemented at a0687c2. Four new tests failed against the old linter; all 18 lint tests and 18 skill tests now pass.
  - Explicit declarations cover exact paths and descendants with a slash boundary. Files do not inherit another file's declarations; requirement bodies and fenced examples cannot grant exceptions. Malformed declarations are findings. Existing machine-local citation tests still fail as intended.
  - The adopting project copy drops from 25 to 15 findings with the parser fix alone. Adding the requested declarations in nine copied files produces a clean lint. No adopting-project files were edited.
  - SPEC-019 mechanism mismatch resolved; reviewed against the revised requirement and falsifier. The full commitment review remains after committed-tree checks.
