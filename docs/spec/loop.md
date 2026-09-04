# The loop

Status: Agreed 2026-09-04
Prefix: LOOP

Normative.

## State

The loop's defining constraint. An agent that wakes with no memory must
be able to reach the same place the previous agent left.

[LOOP-001] The loop MUST NOT hold state that exists only in an agent's
context.
Falsifier: an agent that resumes with no memory of the previous session
cannot determine what is done, what is in progress, and what remains.

[LOOP-002] On wake, the agent MUST reconstruct its position from disk
before it acts.
Falsifier: the agent begins work without reading the roadmap, the current
commitment, and the decision records.

[LOOP-003] The loop MUST reach the same position when it is stopped
after any persisted transition and restarted.
Falsifier: stopping the loop after a persisted transition and restarting
it produces work that duplicates or contradicts work already done.

[LOOP-021] The agent MUST persist each transition before it begins the
next action.
Falsifier: the agent begins an action and the previous transition is not
on disk.

[LOOP-022] Before the agent begins an action that changes code, it MUST
record the action, its target, and the base commit.
Falsifier: uncommitted changes exist and no record names the action that
produced them.

[LOOP-027] On wake, when an in-progress record exists, the agent MUST
reconcile the working tree against it before it chooses new work.
Falsifier: the agent begins new work while an in-progress record names
an unfinished action.

The in-progress record is the write-ahead entry. Without it, the wake
has to guess which unfinished action the uncommitted changes belong to.
With it, reconciliation is the first and deterministic step.

The persisted transitions are: a decision recorded, code committed,
evidence recorded, an escalation written, an escalation answered. Files
and git give storage, not atomicity. Naming the transitions is what makes
"stopped at any point" honest: an interruption between two of them leaves
a state the wake can read, and the wake reads it before acting.

## Facts, not status

[LOOP-028] The agent MUST NOT record a status that can be derived from
other facts on disk.
Falsifier: two artifacts state the same status and disagree.

A requirement is met when its mechanisms have current passing evidence.
A commitment is complete when every requirement in it is met and no
decision for it is unrealized. An escalation is open when its file has no
answer. A decision is unrealized when it names no commit. Each of those
is derived, never stored, so there is one truth and it cannot drift.

## Verdicts

Verdicts classify by who must act next, not by how certain the agent is.

| Verdict | Meaning | Who acts |
|---|---|---|
| Proceed | The requirement is met. | The agent, silently. |
| Resolvable | The commitment is not met and the agent has the next action. | The agent, unattended. |
| Escalate | Only the developer can settle it. | The developer. |
| Done | Every requirement in the commitment is met. | The agent stops. |

[LOOP-004] The loop MUST classify every verdict by who must act next.
Falsifier: a verdict that only the agent can resolve is presented to the
developer.

[LOOP-005] The loop MUST treat missing evidence, stale evidence, a
failing mechanism, an unmet requirement, an unrealized decision, and a
malformed artifact the agent can repair as Resolvable.
Falsifier: the developer is asked to act on a verdict the agent could
have resolved by re-running a mechanism, fixing the code, or building a
recorded decision.

A mechanism that runs and fails is the case the first draft missed. It is
not Proceed, not Done, and almost never Escalate: the agent repairs the
implementation.

The failure this prevents: a system that reports almost everything as
insufficient after every commit trains the developer to stop reading it.

## Freshness

[LOOP-006] The agent MUST declare the paths each mechanism reads.
Falsifier: a mechanism exists with no declared inputs.

[LOOP-023] Evidence MUST record a digest of the mechanism's declared
inputs and of the mechanism itself.
Falsifier: evidence exists with no digest, or with a digest that omits
the mechanism.

[LOOP-024] Evidence is stale when the digest no longer matches; the
agent MUST NOT treat a change outside a mechanism's declared inputs as
making its evidence stale.
Falsifier: a change to a file no mechanism declares makes evidence stale.

[LOOP-034] Evidence MUST carry the command that ran, its arguments, its
working directory, its exit code, and a digest of its output.
Falsifier: an evidence record reports a result and no command, exit
code, or output digest that produced it.

A record that says pass and nothing else is a claim in a file. The
receipt is what makes it evidence: anyone can re-run the command and
compare the digest. It is also the cheapest defense against an agent
that writes a passing record by hand, because a hand-written record has
no receipt to check.

Cairn's own state files are never a mechanism's input. Freshness by
global commit is the Same Page failure: every record stale after every
commit, including commits that touched nothing the requirement governs.
Declared inputs are the smallest thing that fixes it. Computing inputs is
where the adapter registry came from, and it is out.

[LOOP-007] The agent MUST NOT report a requirement as met using evidence
produced before a change to the code that requirement governs.
Falsifier: a requirement reports as met, and the mechanism that checked
it has not run since the code changed.

[LOOP-008] The agent MUST re-run a mechanism whose evidence is stale
without asking the developer.
Falsifier: the loop stops and reports stale evidence to the developer.

[LOOP-025] The agent MUST NOT delete a failing result.
Falsifier: a mechanism's history shows a pass with no record of an earlier
fail against the same inputs.

A demonstrated counterexample is the most valuable thing a mechanism
produces. It stays after the fix.

[LOOP-030] The agent MUST record evidence only against a committed
state of the code.
Falsifier: an evidence record was produced while a declared input had
uncommitted changes.

Evidence from a half-edited tree describes a state that exists nowhere.
Freezing the candidate gives every observation one identity, so an
assessment cannot combine behavior from two versions. The agent's own
test runs while editing are not evidence; they are how it works.

[LOOP-031] When a requirement's latest evidence fails and earlier
evidence for it passed, the agent MUST resolve it before a requirement
that has never passed.
Falsifier: the loop works on a never-passed requirement while a
regression stands.

A regression is a preservation constraint that broke. Left standing
while features are added, the artifact degrades under the loop that is
supposed to be improving it. Harness-of-Harness reopened 17 of 81
issues over 70 loops, and its planner puts blockers and regressions
ahead of extensions for that reason.

## Escalation

[LOOP-009] An escalation MUST be durable on disk.
Falsifier: an escalation exists only in a session transcript.

[LOOP-010] An escalation MUST carry the question, the agent's
recommendation, the cost of being wrong, and one alternative.
Falsifier: an escalation reaches the developer with no recommendation.

[LOOP-026] An escalation MUST consist of exactly these fields, in this
order, each on one line: the question, the recommendation, the reason,
the cost of being wrong, one alternative, and the reply options.
Falsifier: an escalation reaches the developer with a field missing, a
field spanning more than one line, or a field not in this list.

    DECISION (n of m)

    Question:   <what is being decided, in consequence terms>
    Recommend:  <the option>
    Because:    <one line>
    If wrong:   <the cost>
    Instead:    <one alternative>

    Reply: ok | instead | ask

[LOOP-011] The agent MUST present one escalation at a time.
Falsifier: the developer receives two open escalations in one message.

[LOOP-012] An escalation that does not meet the format MUST return to
the agent for rewriting.
Falsifier: the developer receives an escalation longer than the format
permits.

[LOOP-013] The agent MUST deliver a Blocking escalation to the developer
even when it cannot be stated in the format.
Falsifier: a decision the agent classified Blocking is decided by the
agent because the escalation failed the format check.

The format check governs how an escalation is written, never whether the
developer sees it. A gate protecting the developer's attention must not
be able to override the developer's authority.

[LOOP-014] The agent MUST resume from an escalation using the record and
the developer's answer. The agent MUST NOT require the session that
raised it.
Falsifier: an escalation cannot be resolved by an agent that did not
raise it.

## Scope

[LOOP-015] The agent MUST write work that falls outside the current
commitment to the backlog. The agent MUST NOT implement it.
Falsifier: the loop implements something no commitment includes.

[LOOP-016] The agent MUST NOT discard work it declined to implement.
Falsifier: the agent identifies out-of-scope work and no artifact
records it.

[LOOP-029] A backlog item MUST NOT enter a commitment without the
developer's confirmation.
Falsifier: a commitment includes a requirement the developer did not
confirm.

Capture is the agent's. Promotion changes what gets built, which is
Blocking by the scale, so it is the developer's.

[LOOP-035] A commit made during a commitment MUST NOT change a file
outside the declared inputs of that commitment's mechanisms, other than
Cairn's own records.
Falsifier: a commit changes a file that no mechanism of the current
commitment declares and that is not under .cairn/ or docs/.

This makes LOOP-015 observable. The commitment's footprint is already
on disk as the union of its mechanisms' declared inputs, so no new
declaration is needed: a change outside it is either scope creep or a
missing declaration, and the agent resolves which by declaring or by
writing to the backlog.

## Commitments

[LOOP-018] A commitment MUST name the requirements it includes.
Falsifier: a commitment exists and the set of requirements it covers
cannot be determined from it.

[LOOP-019] The agent MUST work against exactly one commitment at a time.
Falsifier: the loop produces work for a commitment other than the current
one.

## Review

[LOOP-020] Before the agent reports a commitment complete, the agent
MUST examine the work for defects. The agent MUST record what it
examined.
Falsifier: a commitment reports complete and no record names what the
review examined.

[LOOP-032] The agent MUST NOT change code during a review.
Falsifier: the working tree differs between the start and the end of a
review.

A review that can repair what it examines becomes implementation and
stops being a review. Fixes are their own work, with their own
transition, after the review has recorded what it found.

The mechanism is the independent verifier, and the review is not
acceptance. A requirement is met when its mechanism passes against a
committed state; the review is the agent looking for what the
mechanisms would miss.

[LOOP-033] A defect a review records MUST be resolved before the
commitment reports complete.
Falsifier: a commitment reports complete while a review record names a
defect with no resolution.

Proof-or-Stop isolated this with the same reviewer signal in two arms:
treated as advice, it shipped 14 of 1800 injected green-but-wrong
artifacts; enforced as a gate, 2 of 1800. The difference is not the
review. It is whether a finding can block.

## Completion

[LOOP-017] The loop MUST report a commitment complete only when every
Agreed requirement in it has current evidence that it is met.
Falsifier: a commitment reports complete while one of its requirements
has no evidence, or has evidence that predates a later change.
