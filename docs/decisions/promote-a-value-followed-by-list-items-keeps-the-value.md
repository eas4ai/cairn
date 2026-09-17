# Promote a value followed by list items keeps the value

Level: Consequential
Decided by: agent
Promotes: fields-drops-a-scalar-value-when-a-list-item-follows-it
Rests on: LOOP-133 LOOP-087 LOOP-088 LOOP-104
Would be wrong if: a record relies on a '- item' line after 'Key: value' replacing the value; then keeping the value as the first item would read a requirement or an input the author meant to drop, and the mixed form should be refused instead
History: Five reversals in the decision domain; none about the field grammar. Consequential: every record type is read through fields(), and a promotion is reviewed in the queue (LOOP-088).

## Decision

Promotes .cairn/backlog/fields-drops-a-scalar-value-when-a-list-item-follows-it.md, captured 2026-09-17 from the kernel review's finding 4. Drafted requirement, LOOP-133: when a field line carries a value and list items follow it under the same key, the loop reads the value as the first item of the list. Falsifier: a commitment written as Requirements: LOOP-001 followed by - LOOP-002 reads as a list without LOOP-001; or a declaration's inputs written the same way loses the first input. Mechanism: node-test through tests/records.test.mjs. Chosen first of the eight because fields() reads every record type the kernel judges by, so a dropped first value can narrow a footprint or let a commitment reach Done with a requirement that was never checked, and the fix is one expression with an exact falsifier.

## Realized by

- ba5479d0270a5136b6b5cd3655017ba4445ebc4e A value on the key line is the first item when list items follow (LOOP-133)
