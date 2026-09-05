# Keep human explanations separate from agent instructions

Level: Judged
Decided by: agent
Rests on: PKG-016, PKG-014, PKG-006
Would be wrong if: A reader must decode agent instructions to make a decision or the documentation promises behavior the source does not implement
History: The earlier package inheritance reversal does not change the level: these are reversible documentation changes that preserve existing runtime behavior and the executable walkthrough.

## Decision

Use the README as the human introduction, docs/manual.md as the human operating guide, and docs/walkthrough.md as the executable companion. Explain roles, choices, results, limits, and recovery before file formats. Link behavioral claims to the implementation and its tests through a source map. As requested by the developer, render checked-in Mermaid sources to SVG with the installed FrankenMermaid and inspect them with agent-browser. Diagram tooling is for documentation authoring only; it adds no runtime dependency to Cairn.

## Realized by

(none yet: recorded, not built)
