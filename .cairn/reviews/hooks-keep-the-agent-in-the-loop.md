commitment: hooks-keep-the-agent-in-the-loop
commit: eab98460216db64c0c0d2f3c8409992bf668826a
examined:
  - The hooks build at eab9846: bin/hook.mjs, the wake ending, tests/hooks.test.mjs and the answered-escalation test, the install skill, the README, the manual, and the working agreement; both hooks run on this repository.
  - node-test against the revised LOOP-091: tests/continuation.test.mjs and the wake ending in bin/cairn.mjs, and this repository's own wake after the developer's ok to loop-091.
findings:
  - resolved: LOOP-091's answered clause had no test and no kernel path; wake now names specify for the item the answer chooses, and a stamped item is not offered again. The continuation test ran red on the old kernel and green on this one.

## LOOP-091 mechanism review, 2026-09-14

Revised text adds one clause: when the next-iteration escalation is
answered, the loop names the specification of the chosen item rather
than another escalation. The falsifier adds: the escalation is answered
and wake names a new escalation.

node-test speaks for LOOP-091 through one test in
tests/continuation.test.mjs, which covers the first clause: an empty
backlog with a next-iteration item names escalate next-iteration, and an
open escalation gives Escalate. The answered clause has no test. The
kernel's ending reads only open escalations, so a closed one changes
nothing.

Safe violating example, observed on this repository rather than a
fixture: at commit 943d465, with escalation loop-091 answered ok, wake
printed Resolvable: escalate next-iteration with the four items listed.
That is the falsifier state, and the suite passes in it. Mismatch
recorded as the open finding. The corrected case follows the kernel
change under this commitment, with a fixture that answers ok and
instead. No code changed during this review.

## Commitment review at eab9846, 2026-09-14

Every requirement has current passing evidence: PKG-018, PKG-019, the
revised LOOP-091, PKG-014, and the inherited package set. The suite is
379 passing after the three link-script tests left and five hook and
continuation tests arrived; both lints are clean; the package lint at
the last committed check reports the kernel with bin/hook.mjs
counted, under the 1500 ceiling.

Failure demonstrations. LOOP-091: with the answered-escalation test
written and the kernel unchanged, the continuation suite ran 8 passing
and 1 failing; on the new kernel all pass, for ok and for instead, and
a stamped item is not chosen again. PKG-018: the falsifier's first arm
is the state before this commitment, a stop allowed at Resolvable; the
hook tests show a block decision at a Resolvable fixture and nothing at
Done, at Escalate, and in a directory with no roadmap. PKG-019: a
temporary HOME gains the link on the first run, keeps it on the second,
the linked command runs wake, and a foreign link is left alone.

Observed on this repository during this review, no code changed. The
stop hook, with the tree at a Resolvable verdict:

    {"decision":"block","reason":"Resolvable: reconcile review hooks-keep-the-agent-in-the-loop at eab98460216db64c0c0d2f3c8409992bf668826a\n  .

The session-start hook with a throwaway HOME:

    cairn: linked /home/shawn/workspace2/scratchpads/tmp/tmp.oaf8vCvcwb/.local/bin/cairn -> /home/shawn/workspace2/cairn-dev/bin/cairn.mjs
    cairn wake:

Attacked: the hook when the kernel cannot run, which yields no block
because a spawn error is not a Resolvable verdict; a TTY on standard
input, which is treated as no input; the choice of item by substring of
the recommendation, which the Judged record names and which asks the
agent to spell the slug; the location of the hooks under bin/ rather
than hooks/, so the package lint counts them toward PKG-004; the
hookless path, which the README, the manual, the install skill, and the
working agreement all keep (PKG-006); and PKG-012, which the superseding
record answers: the hook starts, stops, and retries nothing.

Limits recorded: the install skill registers hooks for Claude Code and
Codex by name and describes the contract for others; the stop hook trusts
the harness cap on consecutive blocks; the session-start hook prints the
verdict as plain text, which both documented harnesses take as context.

Self-audit against the production rules: the change is one hook file,
one wake branch, the install skill, and the documentation the commitment
lists, with every check reported here run and passed. No open finding.
