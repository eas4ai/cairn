# Node, no build step, no runtime dependencies

Level: Consequential
Decided by: agent
Rests on: PKG-001, no infrastructure the developer must provision
Would be wrong if: the loop needs a capability that cannot be written
against node builtins, or an agent harness we must support cannot run
node

## Decision

Cairn runs under node with no build step and no runtime dependencies.

The reasoning is not inertia. A workflow tool that requires installation
before it can tell you your project is misspecified has failed at its own
first task. Zero dependencies also means the complexity ceiling in
PKG-004 measures the whole system rather than the part we wrote.

Reversal cost is low now and rises once anything is built.

## Realized by

- 6102851  cairn wake and cairn decide: the referee, 151 lines, 20 tests
