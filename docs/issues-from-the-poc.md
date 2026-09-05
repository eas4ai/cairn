# Issues found by the System Pulse adoption

Date: 2026-09-05. Reviewed: bin/cairn.mjs at the tree Shawn's checkout
holds (418 lines), docs/spec, both skills, the tests, and the
workspace-visibility worktree's .cairn/ and docs/spec. Every kernel claim
below was reproduced against a temp repository with the shipped test
helpers; the probe scripts are in /tmp/probe.mjs and /tmp/probe2.mjs in
the session that wrote this. The full suite passes (104 of 104 once the
staged copy's executable bits were restored; the one failure was the
copy, not the code).

Each item names what is wrong, where, why the PoC feels it, and the fix
I would make. Severity is about the loop giving a wrong or useless
verdict on a live project, not about code taste. None of these are
recorded in .cairn/backlog yet; promotion is yours.

## Wrong verdicts

### 1. One mechanism, many requirements: every requirement gets the same result

cairn.mjs check(), lines 261-283. A mechanism runs once; its one exit
code is written into a record for every requirement it claims. The
thirteen LIVE records in the worktree carry the identical output_digest
and exit. When LIVE-003 is implemented and passing inside verify.py,
its evidence still says fail until LIVE-013's AT-SPI capture also
passes.

Why it matters: the spec phase produced a distinct mechanism name per
LIVE requirement (live-runtime-source, collector-discovery,
live-process-table, ...) and the commitment file had to collapse them
into one aggregate "because Cairn assigns one mechanism per
requirement." The per-requirement falsifiers lose their executable
discrimination at exactly the point they were meant to have it. Cairn's
own repository has the same shape: node-test speaks for 67
requirements, and the working-agreement review notes it ran tests and
implementation together in one commit because a red run would have
recorded a false regression against all 67.

Fix: let a mechanism report per requirement. The command's stdout may
carry lines of the form `REQ-ID: pass` / `REQ-ID: fail`; check records
each claimed requirement from its own line and falls back to the exit
code for any claimed requirement the output does not mention. An
aggregate that prints nothing behaves exactly as today. The mechanism
declaration format does not change. This needs a decision record under
PKG-003 because it changes what an evidence record means.

### 2. "Three attempts" counts check runs, not attempts

assess(), lines 186-187: threeFails is the last three records all
failing, regardless of whether anything changed between them. Probe E:
three checks at one commit, identical inputs_digest, and wake says
escalate. Probe D: two mechanisms both failing, three full `cairn check`
runs while the agent works on R-001; after R-001 is escalated and
answered, wake immediately demands an escalation for R-002, which
nobody attempted.

Why it matters: the PoC's baseline check (which the existing-project
skill instructs) already counts as attempt one for all thirteen
requirements. Two more full checks while implementing LIVE-001 and the
referee will demand twelve escalations in sequence. The commitment file
already routes around this by hand ("preserving failures rather than
accumulating repeated identical attempts"), which is a rule the kernel
should express.

Fix: an attempt is a failing record whose inputs_digest differs from the
previous failing record's. Count consecutive fails by distinct
inputs_digest. Three checks at one commit are one attempt; a baseline
followed by two real fixes is three. DEC-016's text ("three consecutive
attempts") already says this; the kernel's reading is the defect.

### 3. A mechanism whose output exceeds 1 MB records a false fail

check(), line 269: spawnSync with the default maxBuffer. Probe B: a
command writing 3 MB to stdout is killed, status is null, the record
says `exit: -1`, `result: fail`, and the output_digest is over a
truncated buffer, so the receipt cannot be re-verified either.

Why it matters: verify.py runs cargo test, strict clippy, a native
build, and host verification. That is a plausible megabyte. A passing
candidate would be recorded as a failure with a receipt that does not
match any real run, and the three-fails counter would tick.

Fix: `maxBuffer: Infinity` is the one-line version. The better version
is item 6, which also fixes this because the output goes to a file.

### 4. A declared input deleted from the working tree crashes wake

blob(), line 137: lstatSync on a path from `git ls-files`, which lists
the index, not the tree. Probe A: delete src/exit without `git rm`, run
wake, and the kernel dies with an ENOENT stack trace. check() happens to
survive because dirtyInputs runs first and refuses.

Why it matters: the wake is the one thing that must never fail to name
an action. A half-finished refactor that moves a file is a normal state
for the tree to be in when an agent wakes, and LOOP-027 says
reconciliation is the first step; the kernel cannot get that far.

Fix: an input in the index but absent from the tree is uncommitted
change. Report it as `Resolvable: commit <path>` from wake, the same way
check does, and never throw from the digest.

### 5. A declared input that matches no tracked file is accepted silently

inputFiles(), line 133. Probe C: a mechanism declaring
`src/typo-does-not-exist/` runs, passes, and its evidence never goes
stale for anything; the change the agent meant to declare surfaces
later as a LOOP-035 breach instead of as stale evidence. LOOP-006's
falsifier ("a mechanism exists with no declared inputs") is met in
letter and defeated in effect.

Why it matters: the PoC's live-acceptance declares nine paths across
crates/, vendor/, examples/, and scripts/. One typo, and evidence for a
requirement that reads through that path stays fresh forever.

Fix: check and wake refuse a mechanism any of whose declared inputs
matches zero tracked files, naming the input: `Resolvable: repair
.cairn/mechanisms/<name>`. Cheap, and it turns a silent hole into a
verdict.

### 19. `cairn check REQ...` runs the whole mechanism and records only the named requirements

check(), line 258: `runs` is built from the named targets, so a
mechanism that speaks for thirteen requirements runs once and writes
one record. Reported by the agent on the second live project. The run
was real evidence for every requirement the mechanism claims; twelve
records are discarded, and the targeted form becomes the only way to
avoid item 2's cascade, at the price of throwing evidence away.

Fix: the REQ argument selects which mechanisms run; a record is written
for every requirement each of them claims. With item 1, a targeted check
records each requirement from its own result line; with item 2, the
extra records cost nothing on the attempt counter because they share an
inputs_digest. Items 1, 2, and 19 are one change to check() and
assess(), and should ship together.

## Useless verdicts

### 6. Evidence keeps the digest of the output and throws the output away

check(), lines 271-275. LOOP-034 asks for a digest, and that is all
that is kept. An agent that wakes to `implement LIVE-004: latest
evidence is fail` has to re-run a multi-minute aggregate to learn what
failed, and the developer reading .cairn/evidence sees a hash.

Why it matters: this is the half of "keeping failed evidence visible"
that Astra credited Cairn with and that Cairn does not actually do. The
failure is visible; its content is not. The agent on the second live
project reported the same thing independently: a failure has to be
reproduced by hand to be read.

Fix: write the captured output beside the record
(`.cairn/evidence/<REQ>/<stamp>.out`, or one shared
`.cairn/runs/<stamp>.log` referenced from each record so an aggregate
run is stored once). The digest in the record is then verifiable
against a file that exists. A new file kind under .cairn/ needs a
decision record (PKG-003).

### 7. An answered escalation is invisible to the next wake

wake(), lines 205-206, and probe H: after `cairn answer r-001 "instead:
use the other store"`, wake says `implement R-001: latest evidence is
fail`. Nothing points the agent that wakes at the answer. LOOP-014 says
resume from the record and the answer; the working agreement says
present-and-stop; neither says how the answer reaches the agent that
resumes.

Also: `answer` accepts any text (probe K: "yeah sure" is recorded), and
an `ask` reply marks the escalation answered, so the developer's
question back to the agent closes the channel it was asked on.

Fix: when the requirement wake names has an answered escalation newer
than its latest passing evidence, wake's `why` carries the answer
(`answered r-001: instead: use the other store`). `answer` accepts only
`ok`, `instead <text>`, `ask <text>`. An `ask` reply keeps the
escalation open with the question appended, so the agent's reply is the
next thing wake presents to the developer.

### 8. Agreed is read per file; the skills promise it per section

agreedRequirements(), lines 64-72: every [ID] in a file whose Status
line begins Agreed. existing-project Stage 2 says "mark the section
Agreed with the date," and the keystone says "a later requirement is
Draft until the developer confirms it." The kernel has no reading of
either. In a file that is Agreed at the top, a requirement added in
Draft is contract the moment it is written. In a file that mixes
confirmed and Observed sections, the whole file is one or the other.

Why it matters: existing-project is the path where files mix. The PoC
avoided it by keeping Observed and Agreed in separate files, but the
skill tells the agent to do the thing the kernel cannot see.

Fix: pick one grain and make both sides agree. Per-requirement is the
honest one: a `Status:` on the requirement block overrides the file's,
spec-lint checks it, agreedRequirements reads it. Or keep file grain and
fix the two skills and the keystone to say so.

### 9. The PKG fold is a Cairn-specific rule hard-coded into every consumer

fold(), line 100, keyed on the literal prefix `PKG-`. Probe G: a
consumer whose packaging domain uses the prefix PKG has every one of its
PKG requirements pushed into every commitment, and wake demands
mechanisms for them.

Fix: the domain spec declares it. A `Scope: every commitment` line in
the file (or an `Inherits:` line in the commitment, which the first
commitment already carries as prose) is what fold reads. PKG-011 then
holds for Cairn because Cairn's package.md says so, not because the
kernel knows Cairn's prefixes.

## Footprint and freshness

### 10. The footprint's start is found by substring

breaches(), line 77: `git log -S"Current: <slug>"`. -S matches a
substring. Probe I: with an earlier commitment `first-draft`, the
footprint for `first` begins at the commit that wrote `Current:
first-draft`, and a change made under the old commitment is reported as
a breach of the new one. A slug that is a prefix of an earlier slug
(`escalation` after `escalation-2`) does the same.

Fix: `git log -G '^Current: first$'` or, simpler, walk
`git log --format=%H -- docs/spec/roadmap.md` and read the Current:
line at each commit until it stops equalling the slug.

### 11. Every commit since the footprint began is the loop's, including merges

breaches() diffs began..HEAD. A merge from main into the worktree, or
any commit not made under the loop, is a breach the agent must resolve
by declaring inputs it did not touch or reverting work it did not do.
LOOP-035 says "a commit made during a commitment." The PoC runs in a
worktree of an active project; this will happen the first time the
branch is refreshed.

Fix: I do not have a clean one that stays inside the no-status rule.
First-parent-only diffs exclude merged history but not fast-forwards.
The honest option may be to report a merge commit inside the footprint
as its own Resolvable (`scope merge <sha>`) that the agent clears by
declaring or backlogging once, rather than per file. Worth a decision
record either way.

### 12. Review freshness spawns one git process per declared file

inputsDigestAt(), lines 145-154. Probe M: 1500 declared files, 6.3 s
per wake once a review record exists, on every wake for the rest of the
commitment. The PoC declares vendor/ and two crate trees; a Rust
project that declares src/ will feel this.

Fix: one `git archive <commit> -- <inputs> | tar` read, or `git
cat-file --batch` fed the ls-tree output. Same digest, one process.

### 13. Evidence history does not survive a clone, and LOOP-031 depends on it

.gitignore excludes .cairn/evidence/. The three-fails count, the
regression ordering (everPassed), and the "never delete a failing
result" rule all read that directory. A fresh clone, a second worktree,
or a `git clean` turns every regression into a never-passed requirement
and every escalation history into nothing. PKG-002 permits ignoring
state "it can rebuild by running a mechanism"; a pass can be rebuilt, a
history cannot.

This is a design choice, not a bug, and the decision record
(the-write-ahead-record-is-not-tracked, git-is-the-store) covers the
in-progress file, not evidence. Either track evidence (small text, and
.cairn/ changes are never breaches) or state in loop.md that history is
per checkout and LOOP-025 and LOOP-031 hold per checkout.

### 14. Outside a git repository the kernel records evidence against `commit: null`

Probe F: with .git removed, check passes and records `commit: null`;
every digest is over an empty file list, so nothing is ever stale and
Done is reachable. `git-is-the-store` says git is the store.

Fix: wake and check refuse when `git rev-parse` fails, exit 3, the same
way a missing roadmap is refused.

## Working agreement and skills

### 15. The skills let absolute paths into the specification

The PoC's overview.md and live-collection.md cite
`/home/shawn/workspace2/task-manager/docs/...` five times. A cairn is
for someone with no memory; an absolute path on one machine is dead for
them. The existing-project skill's evidence rule ("every statement
carries a path") does not say repository-relative, and spec-lint does
not check it.

Fix: the skill says repository-relative; spec-lint flags a path
beginning with `/` or `~` in docs/spec.

### 16. The working agreement says "three attempts" without saying what one is

AGENTS.md: "Three attempts at a requirement without new passing
evidence make the next decision about it Blocking." With item 2 fixed,
the sentence should say what counts: a failing check against a commit
the previous failing check did not see.

### 17. A stale in-progress record is always "reconcile", even when the answer is obvious

Probe J: base behind HEAD, tree clean. The action was committed and the
record was not removed, which is the most common way the record goes
stale. Wake could say so (`reconcile implement R-001: base 0000000 is
behind HEAD and the tree is clean; the action appears committed, remove
the record`) instead of leaving the agent to work it out. Ergonomics,
not correctness.

### 18. DEC-006 is not observed

unrealizedDecisions(), line 111, accepts a commit identifier alone. The
PoC's adopt-system-pulse record lists a bare sha. DEC-006's falsifier is
about an identifier that no longer resolves; the subject line is what
makes it recoverable. A one-line regex change makes the kernel demand
it.

## What I would do first

Items 1, 2, 19, 3, 4, and 5 change verdicts and are each under thirty
lines of kernel. They fit one commitment with one decision record for
the per-requirement result lines and one for the output file. Items 6 and 7
are what make the loop usable from a cold wake and go next. Items 8 and
9 are contract questions you should rule on before code moves. The rest
are cheap and can ride along or wait; 13 needs your call, not mine.
