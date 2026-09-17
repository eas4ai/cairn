# Autonomy

Status: Agreed 2026-09-17
Prefix: AUTO
Host paths: ~/.claude/skills/, ~/.agents/skills/, ~/.codex/skills/

Normative.

Specified 2026-09-17 in the next-iteration phase and confirmed by the developer ("approved") on 2026-09-17 in the next-iteration phase. Two modes
let the loop run without the developer answering escalations: one for
purely autonomous coding, and one for benchmarking Cairn against
project and drift benchmarks. No commitment builds them yet.

## The mode and who sets it

[AUTO-001] The loop MUST run in autonomous mode when CAIRN_AUTONOMOUS
is 1 and JEV_ENGINE is unset or 0. The loop MUST run in Jev mode when
JEV_ENGINE is 1. In any other environment the loop MUST run in the
developer's mode.
Falsifier: with CAIRN_AUTONOMOUS=1 and JEV_ENGINE unset, a Blocking
decision is named as an escalation; with neither set, the wake names a
decision where it names an escalation today; with JEV_ENGINE=1, a
decision is accepted without a judgment.

[AUTO-002] The session-start hook MUST record, in the Git directory,
the mode it reads from the environment the harness started it with.
Falsifier: after the session-start hook runs with CAIRN_AUTONOMOUS=1,
the Git directory holds no mode record naming autonomous mode.

[AUTO-003] The loop MUST NOT run in autonomous or Jev mode unless the
session-start hook's record names that mode. The loop MUST refuse, in
one line, a command whose environment names a mode the record does not.
Falsifier: with no mode record, or a record naming the developer's
mode, a command run with CAIRN_AUTONOMOUS=1 or JEV_ENGINE=1 acts in
that mode.

The developer ruled that the model cannot set the flag. The agent's
shell can set an environment variable; the hook is started by the
harness, not by that shell, so its record is the environment the
session was launched with. An agent that edits the record by hand is
not stopped. The record and every decision made under it name the
mode, so the forgery is visible; Cairn is a discipline tool, not a
security boundary. The record lives in the Git directory beside the
check lock, which a fresh clone lacks and the next session start
rebuilds (PKG-002).

## Deciding instead of escalating

[AUTO-004] In autonomous or Jev mode, where the developer's mode names
an escalation, the wake MUST name a decision instead. This covers a
Blocking decision (DEC-002), three attempts (DEC-016), a failure no
change inside the footprint can address (DEC-019), work the commitment
cannot finish (LOOP-092), and a scope breach (LOOP-035).
Falsifier: in autonomous mode, the wake names escalate for a
requirement at three attempts or for a scope breach.

[AUTO-005] A change to an Agreed requirement, its falsifier, or the
working agreement MUST go to next-iteration in every mode. Such a
change MUST NOT be decided in autonomous mode or submitted to Jev.
Falsifier: in autonomous or Jev mode, a decision record or a judgment
concerns a change to an Agreed requirement's text or falsifier, or to
the working agreement.

The developer ruled: "Changes to the original specification go into
next-iteration without exception." In autonomous or Jev mode a promoted
commitment that needs such a change records the item under
next-iteration with the reason and supersedes its own promotion
(LOOP-090); nothing is escalated and nothing is judged.

[AUTO-006] A decision made in autonomous or Jev mode MUST be recorded
with cairn decide at Consequential. The record MUST name the mode it
was made in.
Falsifier: a decision record written in autonomous or Jev mode lacks
Level: Consequential, its review queue entry, or a Mode: line.

[AUTO-007] A decision made in autonomous or Jev mode MUST carry a
self-audit. The self-audit MUST answer whether the decision is
complete, verified, internally consistent, and within the ruleset. The
self-audit MUST say what was revised before the decision was recorded.
Falsifier: cairn decide in autonomous or Jev mode writes a record
without a Self-audit: section.

The developer asked for a self-evaluation against rule 13 of the
production best practices: do not deliver work known to be incomplete,
unverified, internally inconsistent, or in violation of the ruleset;
review it, and revise before delivering. Cairn states the rule's
substance because a consumer project does not carry that file.

[AUTO-008] In autonomous or Jev mode, a recorded decision on a scope
breach's exact snapshot MUST resolve the breach as the developer's ok
on a scope escalation does (LOOP-083, LOOP-084).
Falsifier: in autonomous mode, a restoration or retention decision
recorded on the breach's snapshot leaves the scope verdict in place,
or resolves paths or commits outside that snapshot.

## Jev mode

Jev is TypeSafe's System One model: it evaluates a state against typed
questions and returns probabilities, and it cannot converse. Cairn
calls it; the agent uses the call as a command.

[AUTO-009] In Jev mode, the loop MUST refuse to judge unless
TYPESAFE_API_KEY is set in its environment.
Falsifier: cairn judge with TYPESAFE_API_KEY unset sends a request or
writes a judgment.

[AUTO-010] In Jev mode, the loop MUST refuse to judge unless the
TypeSafe skill is installed where the loop looks for it.
Falsifier: cairn judge in a home with no typesafe-ai skill under
~/.claude/skills/, ~/.agents/skills/, ~/.codex/skills/, or the Claude
plugin cache sends a request or writes a judgment.

[AUTO-011] A submission MUST carry exactly one question.
Falsifier: cairn judge sends a submission whose Question: field holds
more than one question mark, or that carries more than one Question:
field.

[AUTO-012] A submission MUST carry the context the question needs: the
situation, the evidence, the decision, and at least one alternative.
The loop MUST add the text of each requirement the submission concerns
and the commitment's goal.
Falsifier: cairn judge sends a submission with an empty Situation:,
Evidence:, Decision: or Alternatives: field, or a request whose state
lacks the text of a requirement named on the Concerns: line.

The check enforces the fields; whether the context is sufficient
cannot be measured, so the loop supplies the requirement text itself,
the part most often left out.

[AUTO-013] A submission MUST state the decision in logical notation.
Falsifier: cairn judge sends a submission whose Notation: block holds
no logical operator (:=, and, or, not, implies, for all, exists, or
their symbols).

[AUTO-014] The loop MUST send a submission to Jev as one Choice
question whose options are the decision and each alternative. The loop
MUST record Jev's response, the chosen option, and its confidence.
Falsifier: a judgment's request carries more than one question, or its
options omit the decision or an alternative; or the judgment record
lacks the response, the chosen option, or the confidence.

A Choice answer carries a confidence from 0 to 1, and its chosen option
says which alternative Jev prefers when it is not the decision. The
request goes to TYPESAFE_API_URL when it is set, so tests can use a
stub, and to the TypeSafe API otherwise; Node's built-in fetch sends
it (PKG-005). Jev is a hosted service the developer opts into, not
infrastructure the developer runs (PKG-001).

[AUTO-015] A judgment MUST pass only when Jev chooses the decision and
its confidence is at or above the threshold. The threshold MUST be
read from one committed setting.
Falsifier: a judgment passes with Jev choosing an alternative, or with
confidence below the committed threshold.

The threshold starts at 0.70, provisional, until calibration sets it.

[AUTO-016] After a failing judgment, the agent MUST reconsider the
decision and resubmit. After the third failing judgment on one
decision, the loop MUST accept the submission with the highest
confidence, mark it below threshold, and queue it.
Falsifier: a decision record in Jev mode cites a failing judgment as
its last and fewer than three judgments; or after three failures the
record accepts a submission other than the highest-confidence one, or
omits the below-threshold mark.

Three failing judgments gate one decision, not a requirement; they are
not attempts under DEC-016 and do not escalate.

[AUTO-017] In Jev mode, a decision record MUST list every judgment made
for it, each with its chosen option, confidence, and result.
Falsifier: a Jev-mode decision record omits a judgment its submission
directory holds.

[AUTO-018] Cairn MUST ship a calibration script that runs labelled
submissions through Jev and reports, for each threshold in a range, how
many would pass and fail correctly.
Falsifier: the script, run against a stub of the API with labelled
submissions, reports counts that disagree with the labels.

This repository holds four escalations in its history, all answered
ok, so calibration needs a purpose-built labelled set.
