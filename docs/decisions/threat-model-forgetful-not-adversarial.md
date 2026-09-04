# Cairn's threat model is the forgetful agent, not the adversarial one

Level: Consequential
Decided by: agent
Rests on: PKG-003, PKG-004, and the Proof-or-Stop clean-task result
Would be wrong if: an agent is observed writing a passing evidence
record by hand, or editing a record after the fact, to reach Done

## Decision

Cairn defends against an agent that loses context and against an agent
that games a visible signal: retries until a test passes, narrates
completion, marks its own work done. It does not defend against an
agent that forges evidence, tampers with records, or runs on a
compromised host.

Proof-or-Stop defends against all of those. Its receipts are signed
with a local key, its evidence carries producer identity, its verifier
rejects eighteen tamper classes, and high-risk DONE needs three rounds
of two independent host verdicts. That is the right apparatus for its
threat model, and it is the apparatus that put Same Page's engine at
4,443 lines for a threat that never materialised.

The line: the receipt enters, because a record with a command, an exit
code, and an output digest is self-describing and a hand-written one is
not (LOOP-034). Signing, producer identity, and quorum do not enter.
If the invalidation condition above is observed, they enter through
PKG-003 with that observation as the named failure.

The paper's own scoping rule is the reason this line is defensible:
"expensive exactly where being wrong is expensive, and cheap everywhere
else." For Cairn, being wrong about a forgetful agent is expensive.
Being wrong about a forging agent has not yet cost anything.

## Realized by

- febd829  Four Draft requirements from Proof-or-Stop (arXiv 2607.14890)
