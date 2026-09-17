commitment: check-asks-mechanism-reviews-only-for-the-commitment
commit: 487b2417
examined:
  - LOOP-059 as revised: its mechanism review, recorded under unpushed-commits-carry-no-ai-attribution-when-forbidden at 6a0e235, found the first text observed and the added clause, that check asks for a mechanism review only for a requirement in the current commitment or inherited by it, neither built nor tested. runMechanism in bin/cairn.mjs applies the revision gate to every requirement the mechanism speaks for; the specification phase that revised LOOP-020, LOOP-059 and LOOP-087 hit that gate for all three while none was current.
findings:
  - resolved: check applies the mechanism-review gate to every requirement a mechanism speaks for, and no test revises a requirement outside the commitment; the gate must be limited to the commitment's requirements and inherited ones, with a test. Resolved: check's context carries the commitment's folded requirements and the gate reads only those; the first build let a revision escape review entirely, because a run outside the commitment wrote the new digest on the latest receipt and the change was read from that receipt alone, which the new test caught; a revision now counts as unreviewed while any earlier receipt carries another digest and the current digest is not reviewed. tests/revision-scope.test.mjs revises a requirement outside the commitment, runs check, includes it, and asserts both the wake and check name the review (aee249a9)

## Review at 487b2417, 2026-09-17

The existing evidence passes because the existing tests observe the
first text. The one finding is the revision itself, resolved as its own
action.
