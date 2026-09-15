# Remediation plan for the 2026-09-15 audit

Basis: docs/audit/2026-09-15-audit.md (65 findings). Finding labels
below (A1, B4, C12, ...) are that report's.
Status: Executed 2026-09-15. The five commitments named under Direction
reached Done in order; see the Result section at the end.

## How the plan runs under Cairn

Every work package below is one of two kinds:

- Developer-requested: package 16 revises Agreed text and the
  working agreement to match what the kernel does. The developer
  ruled on 2026-09-15 that these are audit-found defects in the
  contract, not next-iteration items: his review of this plan is
  the confirmation LOOP-029 and SPEC-002 require. It is written
  straight into the roadmap as the next Current: commitment, the
  way the earlier "requested by the developer" repairs were, and it
  goes first because the working agreement it corrects is the one
  the other packages' loops run under.
- Backlog: packages 1 to 15 change no Agreed text and not the
  working agreement. Each is captured with `cairn backlog` and the
  loop promotes them at Done, one at a time, in the order given
  here, by a recorded decision the developer reads later.

Each package names the findings it closes, what changes, what proves
it (a test or a lint case that fails before and passes after,
SPEC-022), the decision level it needs, and a size: S (an hour), M
(a session), L (more than a session).

## First: the developer-requested commitment

### 16. The contract says what the kernel does

Findings: C2, C3, C8, C15, C11 (working agreement), D4 (ruling).
Changes to Agreed text, each a revision in place with a Revised note
and `Status: Agreed 2026-09-15`, confirmed by the developer's review
of this plan:
- DEC-016's falsifier counts attempts as DEC-017 and DEC-018 define
  them: "a fourth attempt at a requirement with no escalation raised
  since the third".
- LOOP-026 bounds the developer-facing block only and names the
  record lines that follow it (Concerns, Raised, Raised after, Scope,
  Malformed, Answer, Reply); "(n of m)" leaves the template.
- PKG-004's text says "the kernel under bin/", which is what the
  rationale and the lint already mean.
- SPEC-002 names a third route: a recorded deference by the developer
  to the agent's recommendation, marked `Status: Agreed <date> by
  deference <decision slug>` where the decision is the Consequential
  record the phase queued; the kernel and the spec lint resolve the
  marker as they do `by promotion`; the six requirements agreed on
  2026-09-14 that way are re-marked.
- The working agreement (AGENTS.md and its template) names a move
  for build, resolve, repair, commit, implement, declare, reconcile,
  present, and `escalate <path>`; states the declaration and review
  formats beside the in-progress record; names `--level Blocking` and
  `--outside`; widens the in-progress action list; moves the
  scope-breach paragraph under "The agent"; and CLAUDE.md becomes a
  pure include.
- SPEC-013's rationale, or SPEC-003 through SPEC-017 themselves,
  state how a conversation-behavior requirement is observed (see
  ruling R2).
Proof: node-test proxies for the working agreement; spec-lint for the
marker; a kernel test for the deference marker; the escalation tests
for LOOP-026.
Decision: the developer's, given in this review; the commitment file
records it. Size: L (one commitment).

## Backlog packages, in promotion order

### 1. The hooks find the kernel and fail loudly

Findings: A1, A5, B13, B17 (cwd type), D5.
Change: bin/hook.mjs resolves its own path with fileURLToPath; runs
the kernel that `$HOME/.local/bin/cairn` resolves to when that link
exists and points at a cairn.mjs, and its own otherwise, so the hook
and the agent judge with one referee (LOOP-096); when the two differ
and the link is not this checkout, session-start prints which kernel
is on the path and which one it is; a dangling link is replaced and
reported; a non-directory at $HOME/.local/bin, a non-string cwd, and
any thrown error exit 0 with one line on stderr. Tests and helpers
use fileURLToPath so the suite runs under a path with a space.
Proof: hooks.test.mjs cases for a spaced checkout path, a dangling
link, a link to a second kernel copy, a bad stdin type.
Decision: Consequential (changes which kernel the hook runs; touches
the install contract). Size: S.

### 2. The kernel refuses bad records instead of crashing or looping

Findings: A2, A3, A15, A9, A12, A13, A14, B11, B16, B17.
Change:
- Requirements: and Specified from: accept the list form (asList
  before split).
- Record directories read regular files only; .cairn/escalations,
  docs/decisions, .cairn/backlog and .cairn/next-iteration read
  `.md` files only; subdirectories and other files are ignored, and
  wake says so once when a directory holds one.
- Two Current: lines in the roadmap are a repair (LOOP-019).
- A declaration that repeats a requirement identifier is a
  declaration repair (LOOP-067); recordEvidence never writes two
  result lines for one identifier.
- A declared input that covers .cairn/evidence/ is a declaration
  repair naming the path: Cairn's own output cannot be a candidate.
- A requirement with evidence history and no mechanism is named
  `declare` before the regression and three-fails branches run.
- The read failures that throw become Resolvable repair verdicts
  naming the record (LOOP-005).
- An invalid cwd: is a declaration repair; a spawn that could not
  start records exit -1 as LOOP-062 says.
- `check --stale` says a receipt needs repair instead of "nothing
  stale"; a review without commit: is named as missing the line; an
  ambiguous or unresolvable Realized by identifier is named as such,
  not as unbuilt.
Proof: one test per bullet in a new tests/robustness.test.mjs; the
three loop traps get a two-wake assertion that the second wake names
a different action than the first.
Decision: Judged. Size: M. Kernel budget: about 25 lines; the kernel
is at 1403 of 1500.

### 3. Shallow clones and project roots below the Git toplevel

Findings: A4, A6, F2.
Change: workingObjects and the other path-taking git calls run
against the project root with paths the way git expects when the
root is a subdirectory of the worktree; the hook accepts a roadmap
in a subdirectory of the toplevel by walking up from cwd; in a
shallow repository an unresolvable Realized by identifier is a
repair that says to fetch history, not `build`. wake from a
subdirectory of the project says which directory to run from.
Proof: tests with the project under packages/app of a repository,
and with a `--depth 1` clone.
Decision: Judged. Size: M.

### 4. Gates match records, not substrings

Findings: A7, A8, B9, B10, C18 (kernel half).
Change: the LOOP-090 escalation is recognized by its Concerns line
naming every changed requirement, plus LOOP-036 for a change to the
working agreement; the LOOP-088 promotion record is recognized by a
header line `Promotes: <item>` that decide writes when given
`--promotes`; the LOOP-089 comparison reads the tree at the parent
of the activation commit, so the activation commit is inside the
gate; withAnswer surfaces the developer's answer for `escalate
<path>` and `escalate <slug>` actions; the wake reason for the
LOOP-090 route says the one escalation must name the changed
requirements. Existing promotion records that name the item only in
prose are read as before for one release, with a repair hint.
Proof: the continuation tests use a slug-free question and an
unrelated escalation containing the slug; a test for the activation
commit rewrite.
Decision: Consequential (a new decision-record header line; PKG-003
names it). Size: M.

### 5. The review gate reads the whole header it validates

Findings: B4, B14.
Change: reviewOf requires examined: as a nonempty list (LOOP-020
"record what it examined"); a missing findings: key is a repair
distinct from an empty list (LOOP-086 makes only the empty list
valid); a review whose first heading appears before findings: is
named with the hint that header fields go above the first heading.
Proof: review-findings tests for each shape.
Decision: Judged. Size: S.

### 6. Decision records are validated when read

Findings: B5.
Change: decisions() reports a record missing Level, Decided by,
Rests on, or Would be wrong if as a repair (DEC-001, DEC-005); a
Supersedes: target that does not exist is a repair (DEC-010);
reversals says which records lack a decider.
Proof: decide and supersede tests with hand-edited records.
Decision: Judged. Size: S.

### 7. The mechanisms of this repository declare what they read

Findings: B1, B2.
Change: node-test declares docs/manual.md; the two tests that lint
this repository's own spec and package are removed, since the
spec-lint and pkg-lint mechanisms already prove those results and
the duplication is what pulled every tracked file into node-test's
undeclared reads; spec-lint declares docs/decisions/; pkg-lint's
PKG-008 scan covers shipped files only (bin, scripts, skills, docs,
README, package.json, tests), not .cairn/ records, so the declaration
matches what it reads. PKG-003's directory listing of .cairn/ stays
undeclared and is noted in the declaration as a known read the
footprint cannot express.
Proof: the declarations change and the next check reruns; a test
that pkg-lint ignores a non-ASCII byte under .cairn/.
Decision: Judged. Size: S.

### 8. Scope exempts Cairn's records, not all of docs/

Findings: B3.
Change: breaches() exempts docs/spec/, docs/commitments/,
docs/decisions/, docs/recon.md, AGENTS.md, CLAUDE.md, .gitignore and
.cairn/; every other path under docs/ is subject to LOOP-035 like any
source file. In this repository docs/manual.md, docs/walkthrough.md
and docs/audit/ are already declared by pkg-lint, so nothing new
breaches here; a consumer whose docs/ holds deliverables gains the
check.
Proof: scope tests with docs/manual.md changed inside a commitment
whose mechanisms do not declare it.
Decision: Consequential (consumer-visible behavior change). Size: S.

### 9. The lints check what their requirements say

Findings: E1, E2, E3, E4, C17.
Change: spec-lint's SPEC-019 scan strips backticked and quoted text
first (mentions are not uses, as the lint's own header says), flags
`C:\` and `file://` forms, and exempts `/<name>` for every
skills/<name>/SKILL.md in the checkout; PKG-010 keeps a mention as a
placeholder word so a backticked actor counts; pkg-lint's PKG-003
reads command names from the kernel's help output (`--help`), not
header comments; PKG-006 matches across a wrapped paragraph;
PKG-013 also scans README.md, docs/manual.md and docs/walkthrough.md
once their wording is checked for false positives.
Proof: spec-lint and pkg-lint fixture tests for each case.
Decision: Judged. Size: S.

### 10. A consumer's agent can run the lint and open the skills

Findings: C12, C13, C17 (skills half), C18 (skill half).
Change: a `cairn lint [DIR]` command that runs the checkout's
scripts/spec-lint.mjs from wherever cairn is linked (three lines in
the kernel; the lint stays a script), so the skills and a consumer's
spec-lint declaration say `cairn lint docs/spec` and work on every
machine; new-project Stage 4 writes that declaration; README and
manual say to open the three phase skills by their slash name as the
agent application invokes skills, since disable-model-invocation
keeps them out of the model's own list on purpose; existing-project
tells a consumer to keep project instructions in a separate file
that includes the template, as new-project already does.
Proof: a help test for the command, a skills test for the new
wording, an install-skill test that the update line still lists four
skills.
Decision: Consequential (a new command; PKG-003 names it). Size: M.

### 11. Documentation says what the code does

Findings: C1, C4, C5, C6, C7, C9, C10, C14, C16, C20, F1, F3.
Change: remove the ok-to-escalation sentences from LOOP-091's
rationale and the draft.md routing sentence from loop.md, retire
docs/spec/draft.md; the walkthrough and manual say the agent promotes
backlog items at Done and only next-iteration waits for the
developer; the walkthrough commits evidence in a block and its test
asserts a clean tree; the roadmap gets a top note that each section
states the contract at its date, with one-line pointers where a
later section revised it; specification.md's "Nothing else is
scaffolded" lists mechanism declarations and recon.md; the verdict
table drops Proceed and completes the Done row; the glossary's
Falsifier entry names the promotion decision; the keystone's Draft
sentence cites the requirement that owns it once package 12 supplies
one; LOOP-024 keeps one Status line; the manual's receipt path,
suffix wording, and "its mechanism" sentences follow LOOP-097 and
LOOP-099; the README's hook sentence says "up to the harness's cap";
docs/recon.md gets a resolution note per SPEC-023 naming the
commitments that closed its two open findings; the README states the
minimum Node and Git versions and that Windows is unsupported.
Proof: the spec lint, the walkthrough test, the skills and manual
proxies.
Decision: Routine per edit; one Judged record for the roadmap note.
Size: M.

### 12. The tests observe what their labels claim

Findings: D1, D2, D3, D5 (and the tests of packages 1 to 9).
Change: the DEC-014 test gets a real fixture and asserts that wake
and check leave the queue entry in place; the LOOP-013 and LOOP-014
labels are swapped back; the LOOP-032 timing test is relabeled to
what it measures; tests are added for LOOP-019, LOOP-021 (the
kernel's own record before a run), LOOP-028 (no Status: line on an
escalation once package 13 removes it), and SPEC-023; the
declaration's speaking list is compared with the identifiers the
tests name, so a requirement no test names is a lint finding in
tests/coverage.test.mjs.
Proof: the coverage test itself fails on today's tree and passes
after.
Decision: Judged. Size: M.

### 13. The kernel writes no derivable status

Findings: A10.
Change: escalate stops writing `Status: open`; escalationTurn already
derives the state; existing records keep the line and it is ignored.
Proof: an escalate test asserting the line is absent; a wake test on
an old record carrying it.
Decision: Judged. Size: S.

### 14. Platform: file modes and Node

Findings: B15, F1 (kernel half).
Change: when core.filemode is false, fileIdentity takes the mode from
the index entry, so a mount that reports every file executable
agrees with the tree; the kernel checks process.versions.node at
start and exits 3 with the minimum named when it is older.
Proof: a candidate test with core.filemode=false and a chmod; a help
test under a spoofed version is impractical, so the check is read.
Decision: Judged. Size: S.

### 15. The write-ahead record is asked for

Findings: B8.
Change: when wake finds uncommitted changes to a declared input and
no .cairn/in-progress record, it names `record <REQ>` with the four
fields, before any run or implement action (LOOP-022's falsifier).
An agent that edits and then wakes mid-edit sees the record asked
for, which is the rule.
Proof: a wake test with a dirty input and no record.
Decision: Judged; the developer may rule it out (see rulings).
Size: S.

## Direction

On 2026-09-15 the developer directed that the findings be fixed
without further rulings. The recommendations above are applied as
decided: the write-ahead record is asked for (R1); conversation
requirements are observed by skill text plus each phase's review,
stated in SPEC-013's rationale (R2); the stop hook keeps blocking
while Resolvable and relies on the harness cap (R3); the three phase
skills keep disable-model-invocation and the documents invoke them by
name (R4); scope exempts records, not docs/ (R5).

The packages run as five developer-requested commitments, each
written into the roadmap in turn, in this order:

1. the-contract-says-what-the-kernel-does: package 16 and 13.
2. the-kernel-refuses-bad-records-and-leaves-no-trap: packages 2, 3,
   5, 6, 14, 15.
3. the-hooks-and-gates-judge-by-records: packages 1, 4, 8.
4. this-repository-declares-and-lints-what-it-reads: packages 7, 9,
   12.
5. consumers-can-run-the-lint-and-open-the-skills: packages 10, 11.

## Left as designed

B6 (on-disk escalations are not format-checked; LOOP-013's
precedence), B7 (evidence recorded for a Draft requirement a
mechanism speaks for; LOOP-040 says every requirement, and the
receipt becomes history when the requirement is Agreed), the
unobservable-by-design list in the audit, and F4 (unverified; check
the skills CLI's universal directory when the README is next
edited).

## Result

All five commitments reached Done on 2026-09-15, each with its
evidence and a clean review: the-contract-says-what-the-kernel-does
(DEC-016, LOOP-026, PKG-004, SPEC-002 revised; LOOP-101),
the-kernel-refuses-bad-records-and-leaves-no-trap (LOOP-102 through
LOOP-113), the-hooks-and-gates-judge-by-records (PKG-021, PKG-022,
LOOP-114 through LOOP-117), this-repository-declares-and-lints-what-
it-reads (SPEC-028, SPEC-029, PKG-023 through PKG-027), and
consumers-can-run-the-lint-and-open-the-skills (PKG-028 through
PKG-032). Two findings the packages did not carry, A11 and the
capture-gate half of B10, were captured to the backlog and promoted
the same day: record-writing-commands-run-only-in-a-cairn-repository
(LOOP-118) and the-capture-gate-reads-the-concerns-line (LOOP-119),
both Done. The items under "Left as designed" stand, and B12 belongs
with them (R3 places it there).

Correction, 2026-09-15, after the second audit (docs/audit/2026-09-15-
audit-2.md, D8). The sentence "the recommendations above are applied
as decided" overstated what was built. Six statements in the packages
above describe work no commit realized:

- package 2: "wake says so once when a directory holds one": not
  built; the record readers ignore other files silently.
- package 3: "the hook accepts a roadmap in a subdirectory of the
  toplevel by walking up from cwd": not built; the hooks recognize a
  roadmap at the Git toplevel only.
- package 4: prose promotion records "read as before for one
  release, with a repair hint": not built; the LOOP-088 check reads
  the Promotes: line only, and the repair says to record it.
- package 7: the pkg-lint listing of .cairn/ "noted in the
  declaration as a known read": not built; the declaration carries no
  note.
- package 10: "new-project Stage 4 writes that declaration": not
  built; the skill says to run `cairn lint docs/spec` and writes no
  declaration.
- package 14: `record <REQ>`: built as `record <path>`.

The first four are carried by the second remediation plan
(docs/audit/2026-09-15-remediation-plan-2.md); the fifth is left out,
since a consumer's declaration is the consumer's; the sixth is a
wording difference.
