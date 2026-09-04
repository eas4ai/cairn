# Glossary

Status: Agreed 2026-09-04

This file owns Cairn's vocabulary. When a term here conflicts with a
prior meaning, this file wins.

**Agreed.** The state of a requirement whose text and falsifier the
developer has confirmed. An artifact is Agreed when the developer has
confirmed it and every requirement in it is Agreed. Only Agreed
requirements are contract.

**Backlog.** Ideas captured during the loop but not promoted into a
commitment. The scope valve writes here.

**Blocking.** The decision level at which the loop stops for the
developer. Defined in decisions.md.

**Cairn.** A marker left for someone who arrives with no memory of the
person who left it. The workflow's artifacts are cairns.

**Commitment.** One unit of scope, named for its goal. The loop runs
against exactly one commitment at a time.

**Decision record.** The durable record of a decision, what it rests on,
who made it, what would make it wrong, and which commits realized it.

**Escalation.** A decision the loop parks because only the developer can
make it. Durable on disk, and the loop's resume point.

**Evidence.** The recorded result of a mechanism that checked a
requirement, together with the state of the code when it ran.

**Falsifier.** The observable state that would prove a requirement is
not met. Confirmed by the developer when the requirement is confirmed.

**Freshness.** Whether evidence still describes the current state of the
code.

**Loop.** The autonomous phase. The agent works against one commitment
until it is met or until a Blocking decision stops it.

**Mechanism.** A program that checks a requirement and reports pass or
fail. A test, a type check, a lint rule, a script.

**Observed.** The state of specification text derived from an existing
codebase and not yet confirmed by the developer. Observed text describes
what is; it is not contract.

**Reversal.** A decision record superseding an earlier one, with the
cause of the earlier decision's failure classified.

**Roadmap.** The ordered sequence of commitments. Order lives in the
roadmap file, never in a filename.

**Routine.** The decision level the agent settles without a record.
Defined in decisions.md.

**Wake.** The moment an agent with no memory of previous sessions begins
work and reconstructs its position from disk.
