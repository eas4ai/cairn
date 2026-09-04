# The complexity ceiling is 1500 lines

Level: Consequential
Decided by: agent
Rests on: PKG-003, which requires a named failure behind every concept
Would be wrong if: a requirement in this specification cannot be met
within the ceiling, which would mean the requirement set is too large
rather than the ceiling too low

## Decision

Cairn's executable code must stay under 1500 lines.

The number comes from measurement, not preference. Same Page's engine
reached 4,443 lines across 23 modules to govern 1,932 lines of software,
and the developer's judgment was that the apparatus had become the
interface. The package the developer remembers working well was 2,354
lines in total, most of it skill prose rather than code.

A line ceiling is a blunt instrument and it is deliberately blunt: it is
mechanically checkable, which a qualitative rule about "essential
concepts" is not. PKG-003 carries the qualitative half.

Reaching the ceiling means a concept should leave, not that the ceiling
should rise. That is the failure mode this record exists to make visible.

## Realized by

- 6102851  cairn wake and cairn decide: the referee, 151 lines, 20 tests
