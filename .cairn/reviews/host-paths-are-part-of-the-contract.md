commit: 44b90e4
examined: SPEC-019 mechanism review before implementation. Read scripts/spec-lint.mjs, shared header and fence grammar, and existing path tests.
verification:
  - The unchanged linter reports all 25 findings from the adopting project. A disposable fixture also reports a placeholder suffix as an absolute path.
findings:
  - SPEC-019: the preceding-character class accepts a closing angle bracket, and no declaration can distinguish required host paths from checkout citations. Implement the requested exception and demonstrate strict defaults and boundary handling before recording the revised mechanism digest.
