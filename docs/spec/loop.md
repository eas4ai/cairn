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

## The working agreement

The verdicts name who acts. The working agreement, beside the spec set,
names what each party does when it is their turn, so an agent that has
never read Cairn's own repository can run the loop from a consumer's.

[LOOP-036] The specification phase MUST leave, beside the spec set, a
document that states the agent's move for each verdict and the
developer's move for each record that awaits one.
Falsifier: a repository has a spec set and a roadmap, and no file in it
states what the agent does on Resolvable.

Confirmed 2026-09-04 from the backlog. Both skills ended with "the loop
takes over," and nothing an agent read in a consumer repository said
what to do with a verdict, so it stopped after its first action, the
failure Cairn exists to remove.

## Freshness

[LOOP-006] The agent MUST declare the paths each mechanism reads.
Falsifier: a mechanism exists with no declared inputs.

[LOOP-023] Evidence MUST record a digest of the mechanism's declared
inputs and of the mechanism itself.
Falsifier: evidence exists with no digest, or with a digest that omits
the mechanism.

[LOOP-024] When its requirement and falsifier are unchanged, the agent
MUST NOT treat a change outside a mechanism's declared inputs as making
its evidence stale.
Falsifier: an unrelated file change makes evidence stale while its
requirement, falsifier, mechanism, and declared inputs are unchanged.

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
global commit makes every record stale after every commit, including
commits that touched nothing the requirement governs. Declared inputs
restrict invalidation to the paths the mechanism reads, without adding
dependency analysis to the kernel.

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

## Drafted from the first adoptions

The requirements below were drafted on 2026-09-05 from two live
projects running the loop. Each carries its own Status: line, which
SPEC-018 makes the kernel read ahead of this file's. The developer
confirmed the set by exception on 2026-09-05, with corrections to
LOOP-039 and DEC-017 recorded in place. Until SPEC-018 is built, the
kernel reads one Status: per file, so a requirement drafted after
this date goes in docs/spec/draft.md under `Status: Draft` and moves
to its domain file when the developer confirms it.

### Evidence per requirement

[LOOP-037] The loop MUST read a line `cairn: <REQ-ID>: pass` or
`cairn: <REQ-ID>: fail` on a mechanism's standard output as that
requirement's result.
Falsifier: a mechanism prints `cairn: R-002: pass` and exits nonzero,
and R-002's record says fail.
Status: Agreed 2026-09-05

The marker is what keeps a test suite's own output from being read as
a verdict: a line has to be written to be one. Both adopters asked
for it.

[LOOP-038] The loop MUST ignore a result line for a requirement the
mechanism does not speak for.
Falsifier: a mechanism that speaks for R-001 prints
`cairn: R-002: pass`, and R-002 gains a record.
Status: Agreed 2026-09-05

[LOOP-039] When a mechanism has no declared reporting mode and reports
no result for any requirement it speaks for, the agent MUST record every
requirement's evidence from the command's exit code.
Falsifier: a mechanism with no results field and no result line writes
a record whose result disagrees with its exit code.
Status: Agreed 2026-09-05

[LOOP-052] When a mechanism's output reports a result for one
requirement it speaks for and none for another, the agent MUST record
the other as unverified.
Falsifier: a mechanism prints `cairn: R-001: pass` and exits nonzero,
and R-002's record says pass or fail.
Status: Agreed 2026-09-05

A mechanism with no declared reporting mode that says nothing is read
by its exit code, as every mechanism was before result lines existed; that is the transition,
and an existing mechanism's output earns nothing new by it. A
mechanism that speaks is taken at its word for what it said and at
nothing for what it did not: a run that aborted after the host checks
leaves the native assertions unverified, not failed. Unverified is a
result, so the record exists and the wake names the requirement; it
is not a fail, so it is not an attempt. Two lines for one requirement
are one statement, and a fail on either is a fail.

[LOOP-040] A check that names requirements MUST record evidence for
every requirement each mechanism it runs speaks for.
Falsifier: `cairn check R-001` runs a mechanism that speaks for R-001
and R-002, and R-002 gains no record.
Status: Agreed 2026-09-05

One mechanism claiming thirteen requirements wrote thirteen identical
records; a targeted check ran the same mechanism and kept one. The
aggregate was the adopter's only option because the kernel gave a
mechanism one result, and the falsifiers the specification phase had
sharpened one by one collapsed into a single bit at the point they
were meant to discriminate.

### The output is evidence

[LOOP-041] Evidence MUST keep the complete output of the command that
produced it beside the record.
Falsifier: an evidence record exists and the output its digest was
computed over is not on disk.
Status: Agreed 2026-09-05

[LOOP-042] The loop MUST capture a mechanism's output without a bound
on its size.
Falsifier: a mechanism that writes more output than some limit is
recorded as a failure it did not produce.
Status: Agreed 2026-09-05

A record that carries a digest and discards the bytes is a receipt for
a document nobody kept. Both adopting agents reported that a failure
had to be reproduced by hand to be read. The same defect killed a
mechanism at one megabyte of output and recorded the kill as a fail.

[LOOP-043] Evidence MUST be tracked in the repository.
Falsifier: a fresh clone lacks an evidence record the origin holds.
Status: Agreed 2026-09-05

The three-fails count, the regression order, and the rule that a
failing result is never deleted all read the evidence directory. Kept
per checkout, a second worktree turns every regression into a
never-passed requirement and every history into nothing. PKG-002
permits ignoring what a mechanism can rebuild; a pass can be rebuilt,
a history cannot.

### The wake names an action or refuses

[LOOP-044] The loop MUST NOT run a mechanism whose declared input
matches no tracked file.
Falsifier: check records evidence for a mechanism one of whose
declared inputs matches nothing `git ls-files` returns.
Status: Agreed 2026-09-05

[LOOP-045] When a declared input is absent from the working tree, the
wake MUST name it as uncommitted change.
Falsifier: wake exits with an error rather than a verdict when a
declared input is in the index and not in the tree.
Status: Agreed 2026-09-05

[LOOP-046] The loop MUST refuse to run in a directory git does not
manage.
Falsifier: wake or check produces a verdict or a record where
`git rev-parse` fails.
Status: Agreed 2026-09-05

[LOOP-047] The loop MUST compute the footprint over the commits on the
first-parent line since the commitment began, excluding merge commits.
Falsifier: a file changed only by a branch merged into the loop's
branch is reported as a breach.
Status: Agreed 2026-09-05

A merge brings another party's commits, which LOOP-035 does not
govern; the loop's own commits are the non-merge commits on the line
it works on. A fast-forward puts a stranger's commits on that line as
if the loop made them, so the working agreement says merge with a
merge commit. A change a merge brings to a declared input still stales
evidence, which is the check that governs it.

[LOOP-053] An escalation's Concerns line MUST name every requirement
the escalation concerns, by identifier.
Falsifier: an escalation is answered and the wake asks for a new
escalation about a requirement it concerned.
Status: Agreed 2026-09-05

The kernel compared the line to one identifier. The second adoption's
escalation concerned two requirements and named them by a title, so
it matched neither, and the wake asked for an escalation that
existed.

[LOOP-054] The write-ahead record the kernel writes for a mechanism
run MUST carry the process id of the run.
Falsifier: a run-mechanism record exists with no process id.
Status: Agreed 2026-09-05

[LOOP-055] When the process a run-mechanism record names is not
running, the wake MUST remove the record and continue.
Falsifier: wake says reconcile a run-mechanism record whose process
is dead.
Status: Agreed 2026-09-05

A mechanism that repeats a binary twenty times takes minutes and is
killed in practice. The record it leaves is the kernel's own, and no
evidence was written, so removing it loses nothing; a record with no
process id left an agent unable to tell a run still going elsewhere
from a dead one.

[LOOP-056] The loop MUST refuse a requirement that two mechanisms
speak for, naming both.
Falsifier: two declarations claim one requirement and the kernel runs
either.
Status: Agreed 2026-09-05

Last-wins was silent, and the older evidence then read as "the
mechanism changed", which misdescribes what happened. A requirement
two commands prove is one mechanism that runs both.

[LOOP-057] The agent MUST repair a failing requirement that every
commitment inherits under the current commitment.
Falsifier: an escalation asks the developer under which commitment an
inherited requirement is repaired.
Status: Agreed 2026-09-05

An inherited requirement's mechanism declares inputs, and those
inputs are in every commitment's footprint by construction, so its
repair is inside scope wherever the loop stands. A fix outside them
means the declaration was incomplete, and LOOP-006 says declare. A
failure no repository change can address is DEC-019's, not this
one's.

### The answer reaches the agent

[LOOP-048] The loop MUST refuse a reply to an escalation that is not
`ok`, `instead` followed by text, or `ask` followed by text.
Falsifier: `cairn answer` records a reply outside those three forms.
Status: Agreed 2026-09-05

[LOOP-049] When the developer replies `ask`, the wake MUST name
replying to that escalation as the agent's next action.
Falsifier: after an `ask` reply, wake names any action other than
replying to the escalation.
Status: Agreed 2026-09-05

[LOOP-050] When the agent replies to an `ask`, the escalation MUST be
open for the developer again.
Falsifier: after the agent's reply, wake does not present the
escalation.
Status: Agreed 2026-09-05

[LOOP-051] When the wake names a requirement whose escalation was
answered after its latest evidence, the verdict MUST carry the answer.
Falsifier: wake names the requirement and its output does not contain
the developer's reply.
Status: Agreed 2026-09-05

An `instead` reply changes what gets built, and nothing in the wake
pointed the agent that resumed at it; an `ask` reply closed the
escalation on the developer's question. Both left the resume point
LOOP-014 promises with no way to reach the answer.

## Evidence follows the agreement

Confirmed 2026-09-05: the developer accepted the comparison's five
recommendations and added the large-input defect.

[LOOP-058] The loop MUST treat evidence for different requirement or
falsifier text as stale.
Falsifier: tightening a response limit from 500 ms to 100 ms leaves
evidence for the 500 ms limit current.

A receipt carries requirement_digest for its requirement paragraph and
Falsifier paragraph. Status lines, headings, and separate rationale are
not part of that digest. Old receipts use the text at their recorded
commit; unavailable text cannot establish freshness. A commitment review
is also stale when a requirement it covers changed since its commit.

[LOOP-059] Before recording evidence for revised requirement text, the
loop MUST require a recorded review of the mechanism against that text.
Falsifier: rerunning the old 500 ms check records new passing evidence
for the 100 ms requirement without a mechanism review.

The agent examines the check without changing code and records its
findings in the commitment's existing review file. It fixes a mismatch
as a separate implementation action, then verifies the correction. It adds
`ID sha256:...` to the mechanism declaration's reviewed list, using the
digest wake prints. This records the agent's judgment, not proof of its
understanding. The declaration and specification are committed before
check. A first check with no prior evidence needs no revision marker.

[LOOP-060] The loop MUST digest a declared input identically at a commit
and in the tree whatever its size.
Falsifier: a tracked input larger than 1 MiB makes a review that examined
HEAD stale at HEAD.

Git listings and blob reads have no imposed output limit. A failed blob
read produces no digest; bytes received before failure are not evidence.

## Declared per-requirement reporting

Added from the developer's live-project report on 2026-09-05. A shared
check stopped before publishing any requirement result, and one command
failure became thirteen requirement failures.

[LOOP-061] For a mechanism declaring per-requirement reporting, the loop
MUST record every omitted requirement as unverified.
Falsifier: a declaration with results: per-requirement produces no valid
result lines and a requirement receives pass or fail from the exit code.

The declaration uses `results: per-requirement` before execution. An
absent results field retains LOOP-039 and LOOP-052. A present but invalid
mode is a declaration error; it never silently selects the fallback.
Accepted result lines still use the exact pass/fail marker and declared
IDs; contradictory duplicates still fail. No new stdout marker is added.

[LOOP-062] The loop MUST preserve execution diagnostics separately from
requirement results in each receipt.
Falsifier: a command fails to start or is killed, and its unverified
receipt loses the available exit status, signal, spawn error, or stderr.

The exit field keeps a numeric status, `signal <name>` on a signal, or
-1 when execution could not start. The receipt carries signal and a JSON
execution_error. stderr_output names a separate stderr log; older
receipts retain their inline JSON stderr.
Historical receipts stay unchanged. Unverified results neither satisfy
Done nor add failed requirement attempts, including across changed inputs.
