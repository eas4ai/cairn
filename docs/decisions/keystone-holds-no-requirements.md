# The keystone holds no requirements

Level: Judged
Decided by: agent
Rests on: SPEC-001, which forbids a spec file with no content
Would be wrong if: a requirement is genuinely cross-cutting and belongs
to no single domain

## Decision

overview.md says what Cairn is and maps the domains. Every requirement
lives in the domain spec that owns its prefix.

The first draft put SPEC, LOOP, DEC and PKG requirements in the keystone
and would have continued their numbering in the domain specs, splitting
one prefix across two files. A reader looking for LOOP-004 would have had
to know which half it fell in.

## Realized by

- 6093095  Draft specification: four domains, 48 requirements with falsifiers
