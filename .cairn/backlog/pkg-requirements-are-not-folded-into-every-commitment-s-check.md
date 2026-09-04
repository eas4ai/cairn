# PKG requirements are not folded into every commitment's check

Surfaced from: PKG-011
Promoted to: every-commitment-satisfies-the-package (2026-09-04, on the developer's word)
Captured: 2026-09-04T20:35:24.067Z

PKG-011 says every commitment must satisfy every PKG requirement, and the roadmap says PKG is inherited rather than assigned. wake and check read only the commitment's own Requirements line, so no mechanism speaks for PKG-001 through PKG-013 at Done time; PKG-007 and PKG-010 reach the spec lint only because commitment 5 named them. Folding the Agreed PKG set into every commitment's requirement list is a kernel change, and four of the thirteen (PKG-001 no infrastructure, PKG-003 concept needs a named failure, PKG-006 vendor neutrality, PKG-009 no logic moved into tests) have no obvious mechanism, which SPEC-013 says should have been settled at agreement. Promotion is the developer's.
