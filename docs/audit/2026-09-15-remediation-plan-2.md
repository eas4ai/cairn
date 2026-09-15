# Remediation plan for the second audit, 2026-09-15

Source: docs/audit/2026-09-15-audit-2.md (57 findings; A1 and A2
resolved under the-capture-gate-reads-the-concerns-line at c356a46;
C7 withdrawn by the developer).
Direction: the developer ruled on 2026-09-15, "remediate ... give me
a fully fixed plugin". Recorded as the deference decision
the-second-audit-is-remediated-on-the-developer-s-direction; every
requirement this plan adds or revises carries `by deference` naming
it (SPEC-002).

This plan is also the tracking record. The Result table at the end
names, for every finding, the commit that closed it or says "not
built". A finding is marked closed only when its code and its
verification are both committed.

## Commitments, in order

1. the-gates-bind-to-the-commitment. Kernel. New: LOOP-120 (the
   activation commit is inside the scope footprint), LOOP-121 (a
   requirement Agreed at activation that is demoted or removed is a
   contract change), LOOP-122 (the include file is any root file whose
   whole content is `@AGENTS.md`; exempt from the footprint, compared
   by the contract gate), LOOP-123 (a superseded promotion no longer
   satisfies the LOOP-088 check). Revised: LOOP-090 and LOOP-092
   falsifiers to the Concerns reading. Closes B1, B2, B3 (kernel
   half), B4, D2.
2. records-in-every-shape. Kernel. New: LOOP-124 (list-form Concerns,
   Rests on, Promoted from), LOOP-125 (an item named by slug, filename,
   path, or backticked slug), LOOP-126 (an input is refused by the
   tracked paths it matches, whatever its spelling), LOOP-127 (an
   unreadable record directory is a repair), LOOP-128 (an empty slug
   is refused), LOOP-129 (`examined: []` is empty), LOOP-130 (scope
   paths compare root-relative below the toplevel), LOOP-131 (a
   Consequential record this commitment added needs its queue entry
   committed). Under existing requirements: A10 and D12 (lint checks
   the directory, refuses extra positionals; PKG-028), A11 (LOOP-107),
   A12 (LOOP-030, LOOP-110), A14 (LOOP-104), A15 (SPEC-018), B10 and
   D10's message (DEC-016 wording). Closes A3 to A15, B5, B10.
3. the-hooks-find-the-kernel-and-the-project. Hooks. New: PKG-033
   (the hook judges with the `cairn` command on PATH, then the fixed
   link, then its own kernel, saying which once), PKG-034 (only a link
   whose target does not exist is replaced), PKG-035 (a project in cwd
   or an ancestor under the toplevel gets the verdict), PKG-036 (a
   kernel that prints no verdict is one stderr line; the stop is
   allowed). Under existing: C4 (PKG-019), C6 (PKG-022). Closes C1 to
   C6.
4. lints-and-tests-observe-what-they-name. Lints, tests,
   declarations. Revised: PKG-025 and PKG-026 name the mechanism, not
   the file (D13); SPEC-028 names the character set (F1). Under
   existing: B7 (spec-lint declares skills/; PKG-028 rationale), B8
   (PKG-024 rationale and the pkg-lint review note), E1 (PKG-026 scan
   sees every `../` literal and relative import; root listing
   removed; the old review corrected), E2 (fourteen titles), E3
   (tests for the branches the audit lists, except the 7-hex
   collision, verified by hand), F2 to F6 (lint fixes with tests),
   D10's PKG-004 lint counts every file under bin/. Closes B7, B8,
   D13, E1, E2, E3, F1 to F6.
5. the-documents-say-what-the-code-does. Contract text and human
   documents. Revised: LOOP-088 and the working agreement (promotions
   at Consequential, B6; the record is removed before an escalation,
   B9; `cwd:` in the declaration format, D5); LOOP-105, LOOP-108,
   PKG-022 split to one obligation per sentence; LOOP-118, PKG-028,
   SPEC-029, LOOP-026 falsifier wordings (D10). Stamps: the 37 bare
   `Status: Agreed 2026-09-15` lines carry `by deference audit-found-
   contract-defects-are-repaired-on-the-developer-s-direction` (D1),
   with overview.md and the next-iteration skill naming the marker.
   The agreement's scope paragraph says restoration is to the tree
   before activation (found by commitment 1's review). Documents: D3,
   D4, D6, D7, D9, D11, D12, E4, E5 noted. Closes B6,
   B9, D1, D3 to D12, E4, E5.

Not remediated, with the reason in the audit: F7 (robustness nits by
the slug rule), the LOOP-113 collision test (verified by hand, too
slow for the suite), the `record` gate under the developer's own
edits (the first audit's R1).

## Result

Updated at each commit. "closed" means code and verification are
committed under the named commit.

| Finding | Commitment | Commit | State |
|---|---|---|---|
| A1, A2 | the-capture-gate-reads-the-concerns-line | c356a46 | closed |
| B1 | 1 | 5074d62 | closed |
| B2 | 1 | 5074d62 | closed |
| B3 kernel | 1 | 5074d62 | closed |
| B4 | 1 | 5074d62 | closed |
| D2 | 1 | 8e200f6 | closed |
| A3 | 2 | a840208 | closed |
| A4 | 2 | a840208 | closed |
| A5 | 2 | a840208 | closed |
| A6 | 2 | a840208 | closed |
| A7 | 2 | a840208 | closed |
| A8 | 2 | a840208 | closed |
| A9 | 2 | a840208 | closed |
| A10, D12 lint | 2 | a840208 | closed |
| A11 | 2 | a840208 | closed |
| A12 | 2 | a840208 | closed |
| A13 | 2 | a840208 | closed |
| A14 | 2 | a840208 | closed |
| A15 | 2 | a840208 | closed |
| B5 | 2 | a840208 | closed |
| B10 | 2 | a840208 | closed |
| C1 | 3 | a1c9240 | closed |
| C2 | 3 | a1c9240 | closed |
| C3 | 3 | a1c9240 | closed |
| C4 | 3 | a1c9240 | closed |
| C5 | 3 | a1c9240 | closed |
| C6 | 3 | a1c9240 | closed |
| B7 | 4 | 038e748 | closed |
| B8 | 4 | 038e748 | closed |
| D13 | 4 | 038e748 | closed |
| E1 | 4 | 038e748 | closed |
| E2 | 4 | 038e748 | closed |
| E3 | 4 | 038e748 | closed |
| F1 | 4 | 038e748 | closed |
| F2 | 4 | 038e748 | closed |
| F3 | 4 | 038e748 | closed |
| F4 | 4 | 038e748 | closed |
| F5 | 4 | 038e748 | closed |
| F6 | 4 | 038e748 | closed |
| D10 PKG-004 | 4 | 038e748 | closed |
| B6 | 5 | | open |
| B9 | 5 | | open |
| D1 | 5 | | open |
| D3 | 5 | | open |
| D4 | 5 | | open |
| D5 | 5 | | open |
| D6 | 5 | | open |
| D7 | 5 | | open |
| D8 | before commitment 1 | ec1c335 | closed |
| D9 | 5 | | open |
| D10 text | 5 | | open |
| D11 | 5 | | open |
| D12 walkthrough | 5 | | open |
| E4 | 5 | | open |
| E5 | 5 | | open |
| C7 | withdrawn | d18ece7 | closed |
| F7 | not remediated | | by the slug rule |
