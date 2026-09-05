# Documentation diagrams

These diagrams explain the human workflow. The CLI and working agreement
remain the source of behavior; the diagrams summarize them.

- [Work loop](work-loop.svg), from [work-loop.mmd](work-loop.mmd): the
  Resolvable, Escalate, and Done branches described by `wakeVerdict()` in
  [the CLI](../../bin/cairn.mjs) and the [working agreement](../../AGENTS.md).
- [Explanation loop](explanation-loop.svg), from
  [explanation-loop.mmd](explanation-loop.mmd): the conversation handled by
  `answer()` and `escalationTurn()` in [the CLI](../../bin/cairn.mjs).

The SVG files were generated using the installed FrankenMermaid CLI,
which reports `fm-cli 0.2.0`. From the repository root:

```sh
frankenmermaid validate --parse-mode strict docs/diagrams/work-loop.mmd
frankenmermaid render --parse-mode strict docs/diagrams/work-loop.mmd \
  --format svg --theme neutral --font-size 20 \
  --output docs/diagrams/work-loop.svg
frankenmermaid validate --parse-mode strict docs/diagrams/explanation-loop.mmd
frankenmermaid render --parse-mode strict docs/diagrams/explanation-loop.mmd \
  --format svg --theme neutral --font-size 20 \
  --output docs/diagrams/explanation-loop.svg
```

The work overview ends its repeat branches at an explicit return step.
The explanation diagram draws a return arrow; the layout engine reports a
cycle reversal warning while arranging it. Inspect the rendered arrowheads
and labels after changing a source. A successful parse alone does not
establish that the diagram is readable or describes the workflow correctly.

The sources and rendered images are kept together so readers can see the
diagrams without installing a renderer. This tool is for documentation
authors; Cairn itself does not depend on it.
