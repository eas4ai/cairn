# A declared input matching no tracked file is accepted silently

Surfaced from: LOOP-006
Captured: 2026-09-05T13:00:05.000Z

inputFiles() returns nothing for it; evidence never goes stale for the path the agent meant; the change surfaces later as a LOOP-035 breach. Item 5; drafted as LOOP-044.
