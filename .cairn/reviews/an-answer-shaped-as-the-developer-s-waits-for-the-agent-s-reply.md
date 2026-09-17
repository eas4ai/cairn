commitment: an-answer-shaped-as-the-developer-s-waits-for-the-agent-s-reply
commit: 53b9e12
examined:
  - the failure demonstration before the fix: with the test in place and the kernel at 5f685b0's parent, answer r-001 "ask and what about C?" during the agent's turn printed "replied to" and wrote the refinement as the agent's Reply; with the guard, each of the three shapes exits 3, names the agent's turn and LOOP-135, and leaves the file byte-identical; wake still names reply, the plain explanation is then accepted, and wake presents the escalation. Full suite 477.
  - the guard on a scratch repository, probed directly after an ask: "okay, because ..." is accepted as an explanation, since only the bare word ok is a developer form; "instead" alone is accepted as an explanation, as the developer form needs text after it; "ok " is refused, since the reply is trimmed before the test; a capitalized "Ask B" is accepted and written as the Reply, because the three forms are matched case-sensitively in both turns. Finding, below.
  - the developer's turn is unchanged: the same three forms are required there, case-sensitively, so a developer who types "Ask B" in their own turn is refused as before, and escalationTurn still reads only a lowercase ask as an open question.
  - the documents: the manual's escalation section says the plain form is valid only while the record waits for the agent's explanation, and now says a developer-shaped answer in that state is refused and nothing is written; cairn --help already says the agent replies with the same command, and needs no change for the refusal.
  - the package: every mechanism re-run after the kernel change and the manual sentence, every requirement pass; bin/ is 1564 lines against the 1600 ceiling.
findings:
  - open: the agent-turn guard matches ok, instead and ask case-sensitively, so a developer who refines with "Ask B" during the agent's turn still has it stored as the agent's reply; the guard should match the three words regardless of case while the developer's own turn keeps its exact forms

## Commitment review at 53b9e12, 2026-09-17

The third promotion out of the kernel review. The guard closes the
trap the finding described, and the probe that found the crack is the
same one the finding used, typed with a capital letter. The
developer's turn stays strict on purpose: escalationTurn reads a
lowercase ask as the open question, and loosening what the developer
may write would change what closes an escalation. Only the refusal on
the agent's side needs to be case-blind.
