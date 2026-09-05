# Declare host paths without weakening repository citations

Level: Judged
Decided by: agent
Rests on: SPEC-019, SPEC-024
Would be wrong if: A placeholder still fails, an undeclared path passes, or an example grants a file-wide exception

## Decision

Read Host paths only from the existing specification header outside fences. Accept comma-separated absolute or home-relative paths and allow exact matches or slash-delimited descendants in that file. Keep ordinary machine-local citations as findings. Remove the closing angle bracket from path-start delimiters so placeholder suffixes are not absolute paths. Validate declaration entries and explain the visible exception in both project skills and the human manual. The developer supplied this behavior to correct reproduced adoption failures; no kernel metadata or runtime behavior changes.

## Realized by

- a0687c2 Allow declared host paths and preserve placeholder templates in spec lint
