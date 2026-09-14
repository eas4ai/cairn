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

[LOOP-024] The agent MUST NOT treat an unrelated file change or movement
of HEAD alone as making evidence stale. This rule MUST NOT suppress the
freshness requirements for changed agreement, mechanism declarations,
receipt history, captured output, or applicable retention approval and
retained candidates under LOOP-085.
Falsifier: a file change makes evidence stale while the requirement,
falsifier, mechanism, declared inputs, receipt history, captured output,
and applicable retention approval and retained candidate are unchanged.
Status: Agreed 2026-09-07

[LOOP-034] Evidence MUST carry the command that ran, its arguments, its
working directory, its exit code, and a digest of its output.
Falsifier: an evidence record reports a result and no command, exit
code, or output digest that produced it.

A record that says pass and nothing else is a claim in a file. The
receipt is what makes it evidence: anyone can re-run the command and
compare the digest. It is also the cheapest defense against an agent
that writes a passing record by hand, because a hand-written record has
no receipt to check.

Declared inputs identify the files a mechanism reads; HEAD movement alone
does not invalidate evidence. Cairn also checks the agreement, declaration,
receipt history, captured output, and applicable retention approval.
These record checks do not add files to the mechanism's declared footprint.
Retained paths join candidate validation under LOOP-085 without granting
permission for future edits. Cairn does not infer missing dependencies.

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

[LOOP-029] A backlog item MUST NOT enter a commitment without a
recorded promotion decision. A next-iteration item MUST NOT enter a
commitment without the developer's confirmation.
Falsifier: a commitment includes a requirement that neither a promotion
decision nor the developer's confirmation covers.
Status: Agreed 2026-09-14

Capture is the agent's. A backlog item is inside the specification, so
promoting it changes nothing the developer agreed to: the agent decides
it at Judged or Consequential and records it. A next-iteration item
changes an Agreed requirement, its falsifier, or the working agreement,
which is the Blocking row's change to what gets built, so it is the
developer's. Revised 2026-09-14: the first text made every promotion
the developer's, and a confirmation asked for every bounded item is
given without reading. A confirmation that is always given is not a
decision, and it spends the attention the Blocking decisions need.

[LOOP-035] A commit made during a commitment MUST NOT change a file
outside the declared inputs of that commitment's mechanisms, other than
Cairn's own records. The loop MUST block evidence recording for an
unresolved breach. A declaration can cover the path; otherwise restoration
and a developer acknowledgment under LOOP-083 resolve the incident.
An explicit retention approval under LOOP-084 can instead keep exact
committed work without restoring it.
Falsifier: evidence is recorded despite an undeclared, non-record change
in the commitment's own history without a valid restoration acknowledgment
or exact retention approval.
Status: Agreed 2026-09-07

This makes LOOP-015 observable. The footprint is the union of the
commitment's mechanisms' declared inputs. If correct work belongs to the
agreement but a declaration omitted a dependency, correct that declaration;
it can cover earlier changes without reverting them.

For correct work outside that agreement, propose explicit developer
approval to keep the exact committed changes under LOOP-084. That approval
corrects scope for the recorded incident only and requires fresh checks
and review under LOOP-085. For accidental work, capture it in the backlog,
commit restoration, and request acknowledgment under LOOP-083. Backlog
capture and a revert alone do not resolve the historical breach. Neither
approval widens the footprint or authorizes future changes.

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

[LOOP-048] The loop MUST refuse a developer reply to an escalation that is not
`ok`, `instead` followed by text, or `ask` followed by text.
Falsifier: `cairn answer` records a developer reply outside those three forms.
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

## Evidence survives ordinary repository changes

Requested by the developer on 2026-09-06 after the end-to-end review
reproduced six defects and measured repeated Git reads.

[LOOP-063] The check MUST reject a run whose committed candidate changes
between its starting and ending validation.
Falsifier: starting and ending validation see a different input,
declaration, requirement file, or HEAD, but check records a passing receipt.

The candidate includes declared inputs, the mechanism declaration, the
specification files defining its requirements, and HEAD. Validate committed
state before execution and again before recording evidence. Compare the
starting inputs with the commit even when Git status hides changes. Retain the
rejected run's output and explain why no receipt was written. This detects
changes present at either boundary; it does not isolate a command from an
editor that changes and restores a file between those boundaries. Checks
run in the existing working tree and retain its environment.

[LOOP-064] The loop MUST include Git entry kind and executable mode in
the identity of declared inputs and reviewed inputs.
Falsifier: committing removal of a declared script's executable bit leaves
its passing evidence or a review of its former mode current.

Current and historical digests use the same versioned identity. Old
content-only evidence becomes stale without rewriting historical receipts.
Symbolic links retain their target-path identity.

[LOOP-065] The wake MUST refuse current evidence whose captured output
is missing or does not match its recorded digest.
Falsifier: deleting or changing a latest receipt's output leaves the
commitment Done, or a missing output field is silently accepted.

Validate the combined log and, for new receipts, the separately digested
stderr log. Older receipts without verifiable output need a new check;
history stays unchanged. Hash each shared log once per wake with bounded
memory. Name the damaged receipt and the rerun needed to replace it.

[LOOP-066] The check MUST hold exclusive execution ownership in its
working tree until it finishes writing evidence or reports an error.
Falsifier: two checks in one working tree execute mechanisms concurrently,
or one run removes the other's live ownership record.

An execution lock in the Git working-tree administration directory is
separate from the agent's in-progress record. A live owner blocks another
check and is visible to wake. A dead or unreadable owner produces a named
reconciliation action; recovery never guesses that an unknown owner is
safe to overwrite. Separate Git worktrees have separate execution locks.

[LOOP-067] The loop MUST refuse a mechanism declaration without a
nonempty command, input list, and valid requirement identifiers.
Falsifier: a declaration missing inputs records evidence, or a malformed
required field reaches command execution instead of a named repair action.

An empty input list never means the entire repository. Existing scalar
input and requirement fields remain valid as one-item lists. Validation
also retains the existing reporting-mode and duplicate-owner checks.

[LOOP-068] The loop MUST name an unsupported Git submodule input as a
declaration repair before attempting to hash or execute it.
Falsifier: a populated or unpopulated submodule selected by a broad input
causes an EISDIR crash or silently contributes no identity.

Submodule execution is unsupported; declaring parent directories does not
turn a gitlink into a regular file. Narrow the declaration only when the
mechanism does not depend on the submodule. Otherwise choose a mechanism
whose dependencies Cairn can represent.

[LOOP-069] The wake MUST share identical input selections and file
digests across mechanisms within one read of the repository.
Falsifier: 100 mechanisms with the same input list cause more than 20
Git subprocesses in a wake with no evidence or decision history.

The cache lasts for one read only. A check uses fresh input state at each
candidate boundary, so caching cannot conceal changes made by its command.

## Records preserve execution order and meaning

Requested by the developer on 2026-09-06 after the repeated audit:
remediate its six finding groups and examine the finished repairs again.

[LOOP-070] The loop MUST order new evidence by persisted execution order,
independent of the wall clock, and refuse a latest result whose recorded
prior history differs from the history now present.
Falsifier: a later failed check reports Done after the clock moves backward,
or importing additional receipts leaves a pass current without a new check.

Each new receipt carries a per-requirement sequence greater than the
sequences already present and a digest of the prior receipts. The working-tree
execution lock protects allocation. Timestamps remain descriptive. Legacy
receipts stay unchanged; a latest receipt without execution-order evidence
needs one new check. An imported, removed, or edited prior receipt makes the
latest result stale; rerunning incorporates the visible history. Uncertain
history must not trigger a three-attempt escalation before that rerun.
New escalation and answer records snapshot the concerned evidence sequences;
comparisons to sequenced receipts use those milestones, not wall-clock dates.
Legacy dates remain usable only when comparing legacy unsequenced receipts.

[LOOP-071] The loop MUST read decision and review metadata only from the
record header, excluding body sections and fenced examples.
Falsifier: an example Superseded by or findings field makes an unbuilt
decision or open review finding disappear from the wake.

A realization is a commit entry in the actual Realized by section, not a
quoted example. Decision command metadata must stay on one line; its body
may contain ordinary multiline Markdown. Existing flat declarations and
escalation answer histories retain their formats.

[LOOP-072] Raising an escalation MUST NOT create an Answer or Reply record
from any supplied question or concerns value.
Falsifier: a multiline concerns value creates Answer: ok and the next wake
continues without presenting the Blocking escalation to the developer.

Validate the concerns identifier list and all single-line fields. A malformed
Blocking escalation is still written and presented, with line breaks flattened
and the malformed field named. Its content never counts as a developer answer.

[LOOP-073] The check MUST accept Git-clean text conversion while preserving
the identity of the bytes actually executed at both candidate boundaries.
Falsifier: a CRLF working-tree input with an LF Git blob is refused as
uncommitted despite Git accepting it, or conversion hides an input mutation
during execution.

Use Git's clean conversion for committed identity and review comparison;
keep raw working-tree content, kind, and mode in execution evidence and in
the starting/ending candidate comparison. Hidden content changes and mode
changes remain rejected. Conversion errors must not produce passing evidence.
Git configuration and filters retain their existing trusted local environment.

[LOOP-074] The loop MUST read historical specification paths without Git's
display quoting changing their identity.
Falsifier: a current review of a specification with a non-ASCII filename remains stale
with default core.quotePath but becomes current when that option is disabled.

Use raw NUL-delimited paths for historical listings, as for declared inputs.

[LOOP-075] The loop MUST distinguish receipts from supporting files in an
evidence directory and name a malformed receipt as a repair.
Falsifier: adding README.md beside valid receipts triggers mechanism review
or a rerun loop, or a receipt-shaped malformed file is silently accepted.

Recognize the receipt filename format explicitly. Supporting notes and output
logs never participate in ordering, prior-history digests, or attempt counts.
Malformed receipt identity, result, or execution-order fields name the receipt
to repair before a check runs. Preserve historical receipts and their results.

## Explainable freshness

Confirmed with its falsifiers by the developer on 2026-09-07. The
behavior below adds explanations to the existing next action. It does not
change freshness rules, attempt accounting, or the order of actions.

[LOOP-076] When the wake selects an action because existing evidence is
stale, the wake MUST identify the affected requirement, mechanism, and
latest receipt in its explanation.
Falsifier: after a declared input changes, the stale-evidence verdict omits
the affected requirement, mechanism, or repository-relative receipt path.
Status: Agreed 2026-09-07

This includes the mechanism-review action required by LOOP-059 when a
requirement or falsifier changed. Missing evidence has no receipt to name;
that case remains a missing-evidence explanation.

[LOOP-077] For evidence recorded with input-detail support, the wake MUST
explain the changed declared input paths using the identities checked by
the recorded run.
Falsifier: a committed addition, deletion, content change, executable-mode
change, or file-kind change within declared inputs is omitted or attributed
to an unchanged path, when no higher-priority action prevents the comparison.
Status: Agreed 2026-09-07

Show added, removed, content-changed, mode-changed, and kind-changed paths.
A path can carry several applicable reasons. Symbolic links use their target
path identity; Git-clean text conversions retain the raw execution identity
required by LOOP-073. Compare the old and current selected sets, including
when the declaration changes. A rename is an addition and a deletion;
inferring rename intent is unnecessary. List paths in deterministic order,
escape control characters, and show at most 20 paths with the exact number
of additional paths omitted. No file contents are printed. The comparison
uses facts retained by the run; old Git blobs alone do not establish which
raw bytes a converted working tree executed.

[LOOP-078] The wake MUST distinguish a known stale-evidence cause from
unavailable evidence needed to explain that cause.
Falsifier: an older receipt without input details produces an invented
changed path, missing historical requirement text is reported as a proven
text change, or a damaged log is described only as an input change.
Status: Agreed 2026-09-07

Retain the existing cause categories: requirement or falsifier identity,
mechanism declaration, declared inputs, receipt history, and captured output.
Report all established causes for the selected requirement when comparison
is possible. When a comparison cannot be established, name what is missing
or invalid. Old receipts remain unchanged. Missing or invalid optional input
details do not by themselves invalidate evidence that satisfies the existing
freshness rules; they only limit the explanation. A later normal check can
supply details. Invalid details never justify naming a path as changed.

[LOOP-079] An explanation of stale evidence MUST state how to perform
the next permitted action.
Falsifier: a stale-input verdict omits cairn check with its requirement
identifier, or a revised requirement's explanation suggests checking before
the required mechanism review is recorded.
Status: Agreed 2026-09-07

For an ordinary stale-input result, show cairn check followed by the
requirement identifier. For a changed requirement needing review, explain
how to record that review and retain the exact reviewed entry Cairn already
prints; only then can the check run. A higher-priority escalation, unfinished
action, declaration repair, or receipt repair keeps its existing action.

[LOOP-080] Adding freshness explanations MUST preserve the verdict and
next action selected from the existing agreement and evidence facts.
Falsifier: the same recorded history selects a different next action solely
because optional input details are absent or damaged, explanatory output is
truncated, or the wake restarts without remembered state.
Status: Agreed 2026-09-07

Verify this through deterministic event sequences covering checks, input
edits and restoration, unrelated commits, declaration and requirement edits,
clock rollback, imported receipts, and damaged output. Each failing test
names its seed or case and the event prefix. Model the expected state from
the fixture's actions independently of Cairn's assessment helpers. Keep the
existing regression, mechanism-review, three-attempt, and completion-review
priorities. Explanations neither run mechanisms nor rewrite receipt history.

## Scope recovery

[LOOP-081] When none of a commitment's requirements, including inherited
requirements, has a declared mechanism, wake and an untargeted check MUST name
declaration of its first requirement before reporting historical scope breaches.
The empty footprint MUST NOT block explicitly requested checks whose mechanisms
already exist. Evidence still requires an actual mechanism, and declaring one
for this commitment MUST restore scope validation over its entire history.
Falsifier: an empty footprint traps the loop at a scope action instead of
declaration, blocks a requested existing mechanism solely on that empty footprint,
or declaring its first mechanism hides an unrelated earlier change.
Status: Agreed 2026-09-07

[LOOP-082] A scope verdict from wake or check MUST name every unresolved
breaching path in deterministic order, escape control characters in paths,
and give the same recovery instructions. The action may name the first path,
but the explanation MUST show the total and the complete path list.
Falsifier: a multi-file breach conceals a path, a filename fabricates an output
line, or wake and check offer different scope remedies for the same state.
Status: Agreed 2026-09-07

[LOOP-083] The loop MUST support a scope-specific escalation that records
the current commitment, its activation commit, the current commit, and exact
breaching paths. A committed developer ok on that unchanged record MUST
resolve only the recorded paths' history through the recorded commit, and
only while their committed contents, modes, and kinds match the activation
tree. New changes after that commit, another commitment activation, malformed
or edited records, ordinary escalation answers, and ask or instead answers
MUST NOT grant this acknowledgment. Scope verdicts MUST show relevant
answered scope escalations and explain the remaining remedy.
Falsifier: a restored and specifically acknowledged incident still blocks
checks, or an acknowledgment hides later work, unrestored changes, another
commitment's incident, or changes outside its recorded paths.
Status: Agreed 2026-09-07

Use cairn escalate --scope after capturing the work in the backlog and
committing restoration. The record explains that ok acknowledges only that
restored history. An instead answer closes the question and supplies direction;
the agent follows it by correcting declarations within the agreement or by
restoring and raising a new scope-specific question. No free-text answer is
interpreted as permission to ignore arbitrary changes. Git history is retained.


## Keeping correct work after a scope breach

[LOOP-084] The developer MUST be able to approve keeping exact committed
work outside the current commitment through an explicit scope retention
escalation. The record MUST distinguish retention from restoration, name
the commitment activation, commit, and exact paths, and bind the committed
ok to that unchanged snapshot. It MUST resolve only that recorded history
while those paths match the approved commit in contents, modes, and kinds.
Later own commits, even when reverted, other paths, other activations,
ordinary answers, malformed records, and edits to approved snapshots MUST
NOT gain permission from it. Existing restoration approvals MUST retain
their restoration requirement. Missing declarations within the agreement
MUST remain a separate remedy that does not require reverting correct work.
Falsifier: correct committed work cannot be kept after its explicit committed
retention approval, or that approval hides unapproved changes or turns an
ordinary or restoration answer into permission to retain unrestored work.
Status: Agreed 2026-09-07

[LOOP-085] An applicable retention approval MUST require fresh evidence and
a fresh commitment review from commits containing that approval. It MUST
NOT widen the mechanisms' declared inputs or bypass agreement, declaration,
check failures, candidate stability, or evidence integrity. Diagnostics and
the working agreement MUST distinguish declaring missing inputs, approving
retention of exact work, and restoring accidental work.
Falsifier: evidence or review from before retention approval completes the
commitment, later undeclared edits inherit permission, a failed check is
accepted, or the user is told restoration is the only remedy.
Status: Agreed 2026-09-07

The developer requested this repair on 2026-09-07 after identifying the
missing retention branch. Use cairn escalate --scope --keep with the usual
decision fields to propose keeping the recorded work. The developer's ok
corrects scope for that incident only. Explain why it belongs, what was
checked, and any missing dependencies that need declaration. It neither
promotes a future feature nor silently extends a mechanism's coverage.


## Review finding validation

[LOOP-086] Before reporting Done, the loop MUST validate every review
finding entry. Supported entries are open: followed by a nonempty description
and resolved: followed by a nonempty description. An empty findings list
MUST remain valid. An unrecognized prefix, empty description, or non-list
findings value MUST produce an actionable non-Done verdict naming the
review file and supported format, rather than disappearing from the gate.
Valid open findings MUST still require resolution. Resolved findings MUST
NOT block completion. A free-form Status field MUST NOT excuse invalid
findings or substitute for their validation.
Falsifier: a committed review containing REM-002: Historical agent checks
remain inside role-input JSON rather than readable sections. and Status:
in progress reports Done with current passing evidence, or valid open,
resolved, or empty findings lose their established behavior.
Status: Agreed 2026-09-07

## Continuation

Done was the developer's cue to name the next commitment by hand, and
the stop repeated for every bounded item. Drafted 2026-09-14 on the
developer's ruling that the loop continues through the backlog on its
own and stops only for a change to the specification. Each requirement
carries its own Status: line.

The backlog holds ideas inside the specification. Next-iteration holds
ideas that would change an Agreed requirement, its falsifier, or the
working agreement. The agent sorts at capture; the developer moves a
file to correct the sort. An item is promoted when its file carries a
Promoted to: line.

[LOOP-087] When every requirement in the current commitment is met and
the backlog holds an item with no Promoted to: line, the loop MUST name
promotion as the next action rather than Done.
Falsifier: the commitment is complete, a backlog item carries no
Promoted to: line, and wake prints Done.
Status: Agreed 2026-09-14

[LOOP-088] The agent MUST promote a backlog item by a decision record at
Judged or Consequential that names the item, the requirement it drafts,
and that requirement's falsifier. The promoted requirement's Status:
line MUST name that decision.
Falsifier: a requirement's Status: line names a promotion decision that
no record under docs/decisions/ resolves, or a commitment file carries a
Promoted from: line and no decision record names that backlog item.
Status: Agreed 2026-09-14

The marker is `Status: Agreed <date> by promotion <decision slug>`. It
is the one search that answers which requirements the developer never
confirmed. A requirement marked Agreed without the marker claims the
developer's confirmation, and no mechanism observes that claim, as
before this section.

[LOOP-089] A commitment promoted from the backlog MUST NOT change the
text or falsifier of an Agreed requirement or the working agreement.
Falsifier: a commit inside a promoted commitment's footprint changes an
Agreed requirement's digest or the working agreement file.
Status: Agreed 2026-09-14

[LOOP-090] When a promoted commitment needs a change LOOP-089 forbids,
the agent MUST escalate before building it. The agent MUST record the
item under next-iteration with the reason.
Falsifier: a commit inside a promoted commitment's footprint changes an
Agreed requirement's digest or the working agreement file, and no
escalation names that commitment.
Status: Agreed 2026-09-14

Source review sometimes shows that a bounded item was not bounded. The
route is the same as any other Blocking discovery: stop, write it down,
ask. The larger change is not built under the smaller record.

[LOOP-091] When every requirement in the current commitment is met, no
backlog item lacks a Promoted to: line, and next-iteration holds an
item, the loop MUST name an escalation that recommends which item to
specify next rather than Done. When that escalation is answered, the
loop MUST name the specification of the chosen item rather than
another escalation.
Falsifier: the commitment is complete, the backlog holds no item without
a Promoted to: line, next-iteration holds an item, and wake prints Done;
or the escalation is answered and wake names a new escalation.
Status: Agreed 2026-09-14

Revised 2026-09-14, the day it was agreed: after the developer's ok,
wake named the escalation again, because nothing read the answer. The
chosen item is the recommended one on ok, and the named one on instead.

When both the backlog and next-iteration are empty, Done means what it
meant before: every requirement is met, and the agent stops. The
developer's `ok` to a next-iteration escalation starts a specification
phase for that item, in which the developer confirms its falsifier
(SPEC-002). The loop resumes with the commitment that phase names.

Neither directory is deferral. PKG-013 says a concept is in the
specification and built, or absent until a named failure brings it in,
and there is no third state. Work a commitment includes is finished or
escalated. An agent that cannot finish it has a real problem, and the
evidence of that problem belongs in an escalation the developer reads,
not in a capture file that lets the commitment report Done.

[LOOP-092] The agent MUST NOT capture work the current commitment
includes to the backlog or next-iteration. When the agent cannot
complete such work, the agent MUST escalate with the evidence of the
problem.
Falsifier: a file added under .cairn/backlog/ or .cairn/next-iteration/
by a commit inside the commitment's footprint names a requirement of
that commitment on its Surfaced from: or Changes: line, carries no
Outside because: line, and no escalation names the file.
Status: Agreed 2026-09-14

The Outside because: line is the agent's stated reason that the idea is
not the commitment's work. No mechanism judges the reason. The line
makes the claim explicit and attributable in the diff, which is what
the review queue and the developer's reading need.

[LOOP-093] A next-iteration item MUST name the Agreed requirement or
the working agreement it would change.
Falsifier: a file under .cairn/next-iteration/ carries no Changes: line
naming a requirement identifier or the working agreement.
Status: Agreed 2026-09-14

## Promoted from the backlog

[LOOP-094] When check is invoked with --stale, the loop MUST run each
mechanism that speaks for a requirement of the current commitment
whose evidence is missing or stale. The loop MUST NOT run any other
mechanism under --stale. The loop MUST run each selected mechanism
once.
Falsifier: check --stale runs a mechanism none of whose requirements
has missing or stale evidence, runs one mechanism twice, or skips a
mechanism for a requirement whose evidence is missing or stale.
Status: Agreed 2026-09-14 by promotion promote-the-stale-only-check-selector

Promoted 2026-09-14 under LOOP-087 from the second adoption's request.
A fresh failure and an unverified result are not stale: wake names
implement for them, and --stale skips them and says why. A run still
records evidence for every requirement its mechanism speaks for
(LOOP-040), so a mechanism shared by a stale and a current requirement
runs once and refreshes both.
