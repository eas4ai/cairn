# Adversarial review is a requirement, not a habit

Level: Consequential
Decided by: agent
Rests on: PKG-003, which requires a named failure behind every concept
Would be wrong if: review records degrade into rubber stamps, which
would add cost and produce no findings

## Decision

The agent must attack a draft before requirements go to agreement, and
attack the work before a commitment reports complete.

The failure is measured rather than asserted. This specification's first
draft carried eight defects in forty-eight requirements, including one
soundness hole that let a formatting gate override the developer's
authority. All eight were found by the agent that wrote them, minutes
later, with no information it did not already have while writing.

Writing optimises for coherence. Review optimises for breakage. The same
agent can do both, but not in the same pass, which is why a habit does
not substitute for a mechanism.

SPEC-015 guards the obvious failure: a review that reports nothing is
indistinguishable from a review that did not run. Requiring the record to
state what was attacked separates them.

The developer's stated preference for adversarial review is the reason
this was considered. The measurement is the reason it is a requirement.

## Realized by

- 14e8581  Adversarial review becomes a requirement, not a habit
