# A value followed by list items keeps the value

Slug: a-value-followed-by-list-items-keeps-the-value
Requirements: LOOP-133
Inherits: every PKG requirement
Promoted from: fields-drops-a-scalar-value-when-a-list-item-follows-it
Status: Agreed 2026-09-17 by promotion promote-a-value-followed-by-list-items-keeps-the-value

## Goal

A record that writes a value on the key line and more items below it
is read whole: the value is the first item, and nothing is dropped.

Promoted from the backlog on 2026-09-17 by the decision named above,
from the kernel review the developer requested. Consequential: the
grammar reads every record type the kernel judges by.

## Deliverables

- bin/cairn.mjs fields(): a `- item` line under a key that holds a
  string turns the string into the first item of the new list, unless
  the string is empty, in which case the list starts fresh as before.
- tests/records.test.mjs: a commitment written as `Requirements:
  LOOP-001` followed by `- LOOP-002` names both requirements, and a
  declaration whose inputs are written the same way keeps the first
  input in its footprint.

## Tests

- the mixed form yields both requirements, and an empty key line
  followed by items yields the items alone (LOOP-133)
- a declaration's mixed inputs keep the first input (LOOP-133)

## Done when

- LOOP-133 has current passing evidence from node-test, recorded by
  `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` names promote, escalate next-iteration, or Done.
