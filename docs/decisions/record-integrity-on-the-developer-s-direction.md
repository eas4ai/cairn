# Record integrity on the developer's direction

Level: Judged
Decided by: developer
Rests on: DEC-005 DEC-006 DEC-007 DEC-011
Would be wrong if: a decider tally still splits one decider across rows, or a decision record still reads as unbuilt above the commits that built it
History: One DEC reversal, experience-log-reports-it-does-not-steer: the log was reported and never steered. It argues for keeping this at the level that builds now rather than another queued measurement; the vocabulary it fixes is what makes the log's decider rate computable at all (DEC-011).

## Decision

On 2026-09-16 the developer asked, in writing, for two record defects found by an audit of three downstream projects to be repaired in the kernel.

The first: cairn decide --decided-by accepts any string, so one audited project carries seven spellings for three deciders: two capitalizations of the agent, two of the developer, the assistant's product name, the developer's own name, and both names joined. The reversals report tallies by decider to show who is making decisions, and fragments one decider across several rows, so the tally cannot answer its own question. DEC-011's falsifier -- that the reversal rate cannot be computed separately for the agent's decisions and the developer's -- is already true in those projects. The repair is a closed vocabulary at the point of writing: developer, agent, or joint, taken case-insensitively and stored lowercase; anything else is a usage error naming the three. Reading is separate from writing: an existing record is normalized for case and whitespace before it is tallied, and a value still outside the vocabulary is tallied as unrecognized: <value> rather than dropped or guessed, so drift stays visible instead of silently vanishing. No existing record is rewritten. History stays as recorded.

The second: decide writes '(none yet: recorded, not built)' under ## Realized by, and nothing removes it when the commits arrive. Another audited project holds three records whose placeholder sits directly above their realizing entries. The record contradicts itself and the wake accepts it, because the wake stops looking once one entry resolves. The repair is to name that shape as a repair, saying which file and to remove the placeholder line. A section holding the placeholder alone stays valid: that is a decision recorded and not yet built, which DEC-007 requires. The shallow-clone repair keeps precedence, so a clone that cannot resolve its identifiers is still told to fetch rather than told to edit.

This record is the deference SPEC-002 names: DEC-020 and DEC-021 are Agreed by it and carry the marker naming it, built under the commitment record-integrity. Judged rather than Consequential on the developer's instruction: he wrote the direction himself, so the queue would return it to the party that already decided it. Decided by the developer in writing; recorded by the agent.

## Realized by

- 72743f97cf5c1a6290818c21ac75d48c92d0726a Build: the decider vocabulary and the placeholder the wake refuses above a resolving commit (DEC-020, DEC-021)
