commitment: the-working-agreement
commit: 885086f
examined:
  - the template against PKG-013 and PKG-006 through pkg-lint, which scans skills/ and so scans the template
  - the template's moves against the spec verdict by verdict, and its decision levels against DEC-001 through DEC-004 and DEC-016
  - LOOP-036's "beside the spec set", read as the repository root because that is where an agent looks first; the commitment states the reading
  - the mechanism: a static proxy over the shipped text plus a byte comparison of this repository's copy, as the skills suite already does for SPEC; the falsifier is about a consumer repository, which only a run in one observes
  - the footprint: AGENTS.md and CLAUDE.md declared as inputs of node-test and pkg-lint before they were committed, so the tree is inside it
  - CLAUDE.md as a one-line include rather than a link: a linked input digests as its target under git show and as its content in the tree, so a linked declared input would stale every review forever; that kernel defect is captured to the backlog and not fixed here
  - the template's cairn invocations, which assume cairn on the path; the distribution backlog item covers it
  - the sequence used: tests and implementation committed together and checked once, because node-test speaks for sixty-seven requirements and a red run would have recorded a false regression against every one of them
  - what /existing-project does to a consumer's existing AGENTS.md
  - what the template tells the agent to read at wake, against LOOP-002's falsifier
findings:
  - open: /existing-project says to replace AGENTS.md when it differs, so a project's own instructions in that file would be lost; the skill must append the template and verify containment, not equality
  - open: the template's wake step omits the roadmap, which LOOP-002's falsifier names
