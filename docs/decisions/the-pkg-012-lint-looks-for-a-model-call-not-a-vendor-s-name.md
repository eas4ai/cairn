# The PKG-012 lint looks for a model call, not a vendor's name

Level: Judged
Decided by: agent
Rests on: PKG-012 PKG-045
Would be wrong if: the developer meant PKG-012 to keep every model vendor's name out of the kernel, not only calls to a model; then PKG-045's vendor list belongs in the project's policy file instead
History: No reversal concerns the package lint's PKG-012 rule.

## Decision

PKG-012 says Cairn MUST NOT call a model, and its falsifier is shipped code that sends a request to a model. The lint approximated that with a fetch call, a URL, a node:http or node:https import, or the words anthropic or openai anywhere in bin/. PKG-045, agreed the same day, needs the kernel to recognize attribution trailers that name Claude, Anthropic, Codex, OpenAI, Copilot or Gemini, and naming them sends no request. The lint keeps every request signal and gains the vendor SDK imports (@anthropic-ai/, openai, @google/generative-ai) as the model-client signal; a vendor's name in text no longer counts. Alternative: move the vendor list into .cairn/policy, which changes PKG-045's agreed text and so is the developer's.

## Realized by

(none yet: recorded, not built)
