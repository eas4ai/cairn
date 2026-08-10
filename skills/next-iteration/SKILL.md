---
name: next-iteration
description: Scope-creep valve for spec-driven projects. Use when a new feature idea or scope-affecting request surfaces mid-development in a project with a Same Page spec set (docs/specs/), including when you notice out-of-contract work yourself -- it captures the idea as a properly-formed next-iteration spec instead of expanding the current build. Also use to close an iteration and negotiate the next contract.
---

# /next-iteration -- the scope-creep valve

A new idea does not enter the current build. It becomes a well-formed spec
for the next iteration, written with full context. You may invoke this
yourself when you detect out-of-contract work -- you are the conversational
counterpart of the drift gate.

## Capture

1. Read the project's glossary.md, 00-overview.md, the current iteration
   contract (highest-numbered docs/specs/<name>/iterations/NNN.md), and the
   domain spec(s) the idea touches.
2. Confirm-back loop, in miniature: state your understanding of the idea in
   your own words -- what it is, which domain owns it, what it touches,
   conflicts with, and depends on. Let the developer correct until
   confirmed. Use the glossary's terms; add new ones it surfaces.
3. Write the spec under docs/specs/<name>/iterations/next/, named for the
   idea, shaped to slot into its target domain spec at promotion. Structure
   (inline fallback if the new-project templates are not co-installed):

   # Idea name -- staged for next iteration
   Status: Staged (not in current contract)
   Captured: date
   Target domain: NN-domain.md
   ## What it is
   Two or three normative sentences.
   ## Acceptance criteria
   - Checkable conditions.
   ## Touches
   Components, specs, and features it affects; conflicts and dependencies.
   ## Why not now
   One line: staged because it is outside iterations/NNN.md.

4. Tell the developer what was captured and where. Do not implement any of
   it in the current iteration.

## Iteration close

When the developer asks to close an iteration: verify the current
contract's definition of done against reality; then negotiate the next
contract from iterations/next/ -- promote, carry, or cut each staged spec
(cutting is the developer's verdict, never yours); merge promoted specs
into their target domain specs, logging each in that spec's Decisions and
revisions; write iterations/NNN+1.md; update the working agreement's
contract reference.
