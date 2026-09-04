commitment: scope-and-the-backlog
commit: 74afb61
examined:
  - breaches() cost: git log -S over roadmap.md only, so bounded by roadmap history, not repository history
  - a new file matching a declared glob, added in a commit: tracked at HEAD, so covered
  - a deleted out-of-scope file: appears in the diff, so a breach, which is correct
  - docs/ being exempt in full, including docs/spec/: the spec's own falsifier exempts it, so a mid-commitment spec edit is a DEC matter, not a LOOP-035 one
  - uncommitted changes: not checked, per the plan; LOOP-030 catches them at check time for declared inputs
  - the empty-inputs case in breaches()
  - the action verb wake prints for a breach
findings:
  - resolved: breaches() passes a fake path "--nothing--" to git ls-files when the commitment has no declared inputs; guard the empty case instead
  - resolved: wake prints "declare <path>" for a footprint breach and "declare <REQ>" for a requirement with no mechanism; two different acts under one verb; the breach should read "scope <path>"
