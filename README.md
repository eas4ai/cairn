# Cairn

A cooperative workflow for agent-led software development.

Cairn has two phases.

**Specification.** The human and the agent build an unambiguous
specification together, through a staged confirm-back conversation. A
requirement is not agreed until both parties have named the observable
state that would prove it false.

**The loop.** The agent then works against that specification on its own:
resumable across sessions, recording every decision, and stopping only
for a blocker a human must actually resolve. All loop state lives on
disk, so an agent with no memory of the previous session reconstructs its
position and continues.

The name is the idea. A cairn is a marker left by someone who was here
before, for someone who arrives with no memory of them.

## Status

Design only. Nothing is built yet.

`docs/design-record.md` holds the decisions taken so far, the
measurements behind them, and the questions still open. It is the input
to the specification, not the specification.

## Background

Cairn succeeds Same Page, which established the specification phase and
then grew a verification engine 2.3 times the size of the software it
governed. The design record explains what carries forward, what does not,
and why.
