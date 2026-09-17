# Untracked images are not a change under way

Changes: LOOP-110
Captured: 2026-09-17T11:59:29.274Z

Developer's direction, 2026-09-17: 'Cairn should ignore images and focus on code.' LOOP-110 names record for any declared input with uncommitted changes. LOOP-022, which it observes, speaks of an action that changes code. An untracked image or other binary under a declared directory is not a code change under way, so the wake should not demand an in-progress record for it. Declared images that a mechanism reads (assets/notation.png for the README lint) still count for freshness; only the record demand is narrowed. Changes what LOOP-110 counts as a change under way.
