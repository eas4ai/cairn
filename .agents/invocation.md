# Invocation conventions

- new-project: user-invoked only (frontmatter disable-model-invocation:
  true). Scaffolding a spec set is a developer decision.
- existing-project: user-invoked only (frontmatter
  disable-model-invocation: true). Adopting a codebase and choosing the
  work it prepares for is a developer decision; /new-project hands off to
  it when it finds existing code, and that handoff is still the developer
  invoking it.
- next-iteration: model-invocable on purpose. When the model detects
  out-of-contract work it opens the valve itself -- the conversational
  counterpart of the drift gate.

Any future skill states its invocation mode here and in frontmatter.
