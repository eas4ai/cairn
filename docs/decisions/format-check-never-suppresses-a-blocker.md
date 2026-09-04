# A format check never suppresses a Blocking escalation

Level: Consequential
Decided by: agent
Rests on: LOOP-014, and the developer's position that a human is
necessary when a genuine blocker exists
Would be wrong if: unformatted escalations prove so noisy that the
developer stops reading escalations entirely, which would cost more than
the authority it protects

## Decision

The escalation format check governs how an escalation is written. It
never governs whether the developer sees one.

The draft said a decision that could not be stated in the format was
"decided, recorded, and classified Consequential instead." Blocking means
only the developer may decide it. So a formatting failure would silently
convert a decision reserved to the developer into one the agent makes.

A gate built to protect the developer's attention must not be able to
override the developer's authority. That is a soundness hole, not a
usability tradeoff, and it was in the specification for one commit.

LOOP-012 still returns a malformed escalation to the agent for rewriting.
LOOP-014 requires a Blocking escalation to reach the developer even when
the rewrite fails.

## Realized by

- 9784f8b  Adversarial review of the draft: eight findings fixed
