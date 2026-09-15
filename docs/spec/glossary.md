# Glossary

Status: Agreed 2026-09-04

This file owns Cairn's vocabulary. When a term here conflicts with a
prior meaning, this file wins.

**Agreed.** The state of a requirement whose text and falsifier the
developer has confirmed. An artifact is Agreed when the developer has
confirmed it and every requirement in it is Agreed. Only Agreed
requirements are contract. A requirement promoted from the backlog is
Agreed by the promotion decision that names it, one agreed by
deference by the decision that records the ruling, and its Status:
line names that decision.

**Backlog.** Ideas captured during the loop that fit inside the
current specification and are not yet promoted into a commitment. The
scope valve writes here. At Done, the loop promotes from here without
the developer.

**Blocking.** The decision level at which the loop stops for the
developer. Defined in decisions.md.

**Cairn.** A marker left for someone who arrives with no memory of the
person who left it. The workflow's artifacts are cairns.

**Commitment.** One unit of scope, named for its goal. The loop runs
against exactly one commitment at a time.

**Decision record.** The durable record of a decision, what it rests on,
who made it, what would make it wrong, and which commits realized it.

**Deference.** The developer's recorded ruling, in their own words,
that the agent's recommendation stands for a named scope of work
unless review changes it substantively. A requirement agreed that
way carries `by deference <decision slug>` (SPEC-002).

**Escalation.** A decision the loop parks because only the developer can
make it. Durable on disk, and the loop's resume point.

**Evidence.** The recorded result of a mechanism that checked a
requirement, together with the state of the code when it ran.

**Falsifier.** The observable state that would prove a requirement is
not met. Confirmed by the developer when the requirement is confirmed,
or by the promotion or deference decision that names it.

**Freshness.** Whether evidence still describes the current requirement,
its falsifier, and the code checked against them.

**Kernel.** The files under bin/ that Cairn executes: the command,
its parser, and the hooks, together under the PKG-004 ceiling. The
kernel digest that stamps evidence covers the two files that decide
verdicts and write records, bin/cairn.mjs and bin/spec.mjs; a change
to the hooks does not stale evidence.

**Loop.** The autonomous phase. The agent works against one commitment
until it is met or until a Blocking decision stops it.

**Mechanism.** A program that checks a requirement and reports pass or
fail. A test, a type check, a lint rule, a script.

**Next-iteration.** Ideas captured during the loop that would change
an Agreed requirement, its falsifier, or the working agreement. They
enter a commitment only through a specification phase the developer
confirms.

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

**Working agreement.** The document beside the spec set that states the
agent's move for each verdict and the developer's move for each record
that awaits one. Read at wake, before the roadmap.
