commitment: the-specification-phase
commit: e6a091a
examined:
  - the skills test's matching strategy, for what a meaning-preserving reflow of a skill would do to it
  - the spec lint's requirement-block boundary, for a Draft requirement with no Falsifier line followed by prose
  - the spec lint's actor heuristic, against every requirement in the cemented spec after the fix
  - both skills for any surviving Same Page apparatus: elaborate, validators, trust, conformance.md, iterations, next-iteration
  - both skills against each SPEC requirement, for a rule that is stated and a rule that is only implied
  - docs/recon.md as an artifact the existing-project skill introduces that no spec names
  - the eight split requirements, read side by side with their originals, for any changed word inside an obligation
findings:
  - open: tests/skills.test.mjs matches substrings that include the skills' line breaks, so a reflow of a paragraph that changes no word fails the test; it is checking wrapping, not content
  - open: spec-lint's block scan continues past a blank line when no Falsifier line has been seen, so prose after a Draft requirement is scanned as requirement text; the body must end at the first blank line whether or not a falsifier was found
  - open: neither skill says when a decision made during the specification phase is recorded; DEC-003 requires a record at Judged and above, and a domain partition or a depth call is at least Judged
