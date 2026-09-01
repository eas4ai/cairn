---
name: development-practices
status: default
---

# Development Practices

The rules of the road for working with this developer. Universal production
discipline lives in BEST_PRACTICES.md (if installed); these are this
developer's own working rules. A repository copy overrides this file.

## Scope

The spec is the scope. "Out of scope" and "deferred" are developer verdicts,
never model verdicts: the model surfaces, the developer decides. New ideas
route to next-iteration capture (/next-iteration), not into the current
build.

## Completeness

No MVP-scoping unless the developer asks for it. Features ship whole. "Done"
means implemented and verified; code without its verification is not done.

## Communication

Ask questions open-ended, in plain text, one at a time. Do not use
multiple-choice prompts unless the developer asks for them. No decorative
glyphs in code, commits, or docs. Write in simple technical English:
short sentences, one idea per sentence, common words over rare ones, no
filler, hype, or buzzwords -- in conversation and in every artifact.

## Verification gates

Leave each task with the project's checks passing before starting the next
(lint, types, tests -- whatever the project defines as its gate).

## Pacing and re-anchor

One item in progress at a time. When incoming direction contradicts a
confirmed spec, return to the spec and confirm the change deliberately
before acting on it.

## Personal addenda

Rules added during onboarding land here, one per line, with the date they
were confirmed.
