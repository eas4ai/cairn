# /next-iteration

## What it does

Captures a mid-development idea as a properly-formed, context-aware spec
staged for the next iteration -- what it touches, conflicts with, and
depends on -- instead of letting it expand the current build. Also closes
iterations: promote, carry, or cut staged specs into the next contract.

## When to reach for it

A new feature idea arrives mid-build; the model notices out-of-contract
work (it can invoke this itself); the current iteration is done and the
next needs negotiating.

## Common questions

Q: Does capturing mean committing to build it?
A: No. Promotion happens at iteration close, and cutting is always the
developer's call.

Q: Where do staged specs live?
A: docs/specs/<project>/iterations/next/, shaped to merge into their
target domain spec when promoted. They are written in Same Page
Technical English and pass the language check at capture; promotion
makes their requirements Agreed, confirms a falsifier for each, adds
them to the evidence map, conformance.md, and runs `same-page
elaborate` so each has its obligation file before implementation.

## It's working if

The current build stops growing mid-iteration; good ideas stop getting
lost; iteration close is a negotiation over written specs instead of a
memory test.
