# An added report is not a change under way; its items go to the backlog or next-iteration

Changes: LOOP-110
Captured: 2026-09-17T11:59:29.307Z

Developer's direction, 2026-09-17: 'adding things like audit reports should only trigger adding the items to backlog or next-iteration if a new specification is required.' Today a report, audit or draft dropped under a declared directory such as docs/ makes the wake name record, and the stop hook refuses to stop until it is committed or recorded, as happened with docs/Claude outputs/ on 2026-09-17. Proposed: an added document that no mechanism reads is committed as content, not recorded as work under way; the agent reads it and captures each item to the backlog, or to next-iteration when the item needs a new specification. Changes what LOOP-110 counts as a change under way, and the working agreement's record paragraph.
