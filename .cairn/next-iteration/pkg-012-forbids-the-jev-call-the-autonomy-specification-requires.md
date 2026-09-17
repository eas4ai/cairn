# PKG-012 forbids the Jev call the autonomy specification requires

Changes: PKG-012
Outside because: found while building PKG-045; the autonomy specification's Jev call contradicts PKG-012, which only the developer can change
Captured: 2026-09-17T16:44:10.148Z

PKG-012: Cairn MUST NOT call a model or manage an agent's execution; falsifier: shipped code sends a request to a model. AUTO-014, agreed 2026-09-17: the loop MUST send a submission to Jev as one Choice question, and Jev is TypeSafe's model. Both are Agreed, so Jev mode cannot be built without violating PKG-012. The review before agreement for the autonomy specification checked PKG-001 and PKG-005 and missed PKG-012. Proposed: PKG-012 allows one model call, to the judge in Jev mode, when the developer's environment turns that mode on; the kernel still never calls a model for its own reasoning or manages an agent.
