# A falsifier no mechanism can observe is not finished

Level: Consequential
Decided by: agent
Rests on: SPEC-013, and the measured outcome of Same Page's eleven
stranded requirements
Would be wrong if: a class of requirement that matters genuinely cannot
be observed by any mechanism, in which case the rule would block
agreement on requirements worth having

## Decision

The agent must be able to name a mechanism that could observe a
falsifier before the requirement can be Agreed.

Same Page found this at the wrong end. Eleven Agreed requirements had
falsifiers describing what happens inside a live agent session, which no
mechanism in that repository could observe. They could never reach a
verdict, and they stranded permanently. The engine's answer was manual
attestation with an expiry, which turns a specification defect into
recurring human work.

The defect is in the falsifier, not in the verification. A falsifier that
nothing can observe has not finished being written, and the moment to
discover that is while the developer is still in the room agreeing to it.

This also removes the reason LOOP-017 would otherwise be unsatisfiable: a
commitment cannot contain a requirement that can never produce evidence.

## Realized by

- 9784f8b  Adversarial review of the draft: eight findings fixed
