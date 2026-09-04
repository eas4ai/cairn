# The package

Status: Draft
Prefix: PKG

Normative.

## No infrastructure

[PKG-001] Cairn MUST run with no infrastructure the developer must
provision.
Falsifier: a documented step tells the developer to install or run a
database, a service, or a daemon.

[PKG-002] Cairn MUST store its state as files inside the project
repository.
Falsifier: Cairn stores state a fresh clone of the repository does not
contain, other than state it can rebuild by running a mechanism.

Git supplies ordering, authorship, and history. A database would buy
queries this volume does not need and cost the traceability the decision
records depend on.

## Complexity

The failure this prevents is recorded: Same Page grew a verification
engine of 4,443 lines to govern 1,932 lines of software, and the
apparatus became the interface.

[PKG-003] A concept MUST NOT enter Cairn without a decision record
naming the failure that forced it.
Falsifier: a concept appears in the specification or the code and no
decision record names the failure it answers.

[PKG-004] The files Cairn ships and executes at run time, excluding
tests and excluding specification text, MUST NOT exceed 1500 lines in
total.
Falsifier: that line count exceeds 1500.

[PKG-009] Cairn MUST NOT move run-time logic into test files to stay
under the ceiling.
Falsifier: a test file contains logic the shipped code calls.

The ceiling measures the kernel: the code that reads state, runs
mechanisms, decides freshness, and names the next action. Mechanisms a
project supplies are that project's, not Cairn's. The test behind the
number is whether Cairn is still a legible referee or has become a
second application that must itself be administered.

The ceiling is a backstop, not a target. Reaching it means a concept
should leave, not that the ceiling should rise.

## Distribution and runtime

[PKG-005] Cairn MUST run under node without a build step and without
runtime dependencies.
Falsifier: a Cairn entry point invoked with node on a clean checkout
exits with an error before doing its work.

[PKG-006] Cairn MUST NOT require an agent harness feature that only one
vendor provides.
Falsifier: a documented workflow step cannot be performed by an agent
outside one specific product.

## No deferral

[PKG-013] Cairn's specification and documentation MUST NOT describe work
the specification includes as deferred, optional, or belonging to a
later version.
Falsifier: a document names a version, a phase, or a later stage for
work a requirement or a commitment already includes.

The specification is the scope. A concept that is not in it is not
postponed; it is absent until a named failure brings it in. A concept
that is in it is built. There is no third state, because the third state
is where debt lives.

## The boundary

[PKG-012] Cairn MUST NOT call a model or manage an agent's execution.
Falsifier: Cairn's shipped code sends a request to a model, or starts,
stops, or retries an agent.

## Language

[PKG-007] A normative sentence MUST state one obligation.
Falsifier: a normative sentence states two obligations.

[PKG-010] A normative sentence MUST name the actor.
Falsifier: a normative sentence states an obligation with no actor.

[PKG-011] Every commitment MUST satisfy every PKG requirement.
Falsifier: a commitment reports complete while the package violates a
PKG requirement.

PKG requirements are global constraints. They are inherited by every
commitment rather than assigned to one.

[PKG-008] Every file Cairn ships MUST contain only ASCII characters,
unless the file is not text.
Falsifier: a text file Cairn ships contains a character outside ASCII.
