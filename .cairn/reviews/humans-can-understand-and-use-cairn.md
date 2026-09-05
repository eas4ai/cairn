commit: b102b82
examined: README, human manual, executable walkthrough, and diagram sources and SVGs. Checked the behavioral descriptions against wakeVerdict, check, answer, escalationTurn, reconcile, assess, requirementSet, the shared spec parser, link.sh, project skills, and the working agreement. The source map links readers to implementations and tests. No runtime behavior changed.
verification:
  - All 169 tests pass through the committed-tree check; specification and package lint pass; 120 new receipts recorded.
  - The existing walkthrough executes successfully. The manual's exact explanation command was exercised in a disposable Git repository through ask, agent reply, final answer, and refusal to overwrite a closed answer.
  - Both Mermaid sources passed FrankenMermaid strict validation and rendered to valid SVG. The explanation diagram has a layout-cycle warning; its return arrow and direction were inspected visually.
  - agent-browser inspected local Pandoc previews of README and manual. Both SVGs loaded. All 16 local README links and the manual's local links and section anchors resolved among 47 total links. Desktop previews have no horizontal overflow. Narrow previews require horizontal table scrolling by the Markdown viewer; the prose remains available independently of diagrams.
  - Simplified the overview to avoid crowded return arrows and shortened diagram labels for legibility. Kept generation commands and editable sources beside the images.
  - Reviewed plain language, human choice and authority, Done versus deployment, unverified versus failed evidence, inherited requirements, and the distinction between CLI enforcement and agent obligations. Reviewed against the production coding rules; no further revision identified.
findings:
  - none
