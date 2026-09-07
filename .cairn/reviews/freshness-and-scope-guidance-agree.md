commitment: freshness-and-scope-guidance-agree
commit: 42705f6
examined:
  - LOOP-024, LOOP-035 rationale, LOOP-085, the existing freshness and retention runtime, manual, and decision history.
findings:
  - open: Remove the new decision template's none-yet placeholder now that it names a realization commit.
  - resolved: Clarified ordinary input freshness versus agreement, evidence integrity, and retention conditions.
  - resolved: Named declaration, exact retention approval, and restoration separately.
  - resolved: Added retained candidate stability and current recovery test links to the manual.

## Mechanism review for revised LOOP-024

The node-test mechanism already exercises ordinary undeclared changes,
retention approval, retained candidate stability, receipt history, and output
integrity. No runtime or test code changed during this examination. The
revision reconciles the broad old wording with implemented, already agreed
conditions rather than changing those conditions.

The retention test is the concrete counterexample to the old wording:
a committed approval outside declared inputs requires another run despite
unchanged agreement, mechanism, and inputs. Its old-evidence mutation was
rejected in the preceding commitment review; the unchanged implementation
passed. Unrelated file edits remain the corrected preservation control.
The existing record-history and damaged-output cases cover the other named
conditions. The reviewed requirement digest is
LOOP-024 sha256:60e41fd9bd95b487c08ad685d17b27df6c3cf302de3d57cd886c1dd2fac82d4c.

Committed mechanism runs and final documentation review remain outstanding.

## Documentation review finding

The revised contract and manual agree with the unchanged runtime. The new
superseding decision has a valid realization entry but still contains its
initial none-yet placeholder. Remove that contradictory placeholder before
completion. The existing targeted controls and all 348 committed suite
tests pass; package and specification checks also pass.
