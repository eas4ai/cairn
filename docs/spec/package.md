# The package

Status: Agreed 2026-09-04
Prefix: PKG
Scope: every commitment

Normative.

## No infrastructure

[PKG-001] Cairn MUST run with no infrastructure the developer must
provision.
Falsifier: a documented step tells the developer to install or run a
database, a service, or a daemon.

[PKG-002] Cairn MUST store its state as files inside the project
repository.
Falsifier: Cairn stores state a fresh clone of the repository does not
contain, other than state it can rebuild by running a mechanism.

Git supplies ordering, authorship, and history. A database would buy
queries this volume does not need and cost the traceability the decision
records depend on.

## Complexity

The ceiling prevents verification machinery from becoming a second
application the developer must administer.

[PKG-003] A command, a record kind, or a directory under .cairn/ MUST
NOT enter Cairn without a decision record that names it and the failure
that forced it.
Falsifier: a command in the kernel's usage text, a record kind in a
commitment's formats, or a directory under .cairn/ is named by no
decision record.

The first text of this requirement said "a concept," which no mechanism
can observe. An independent review said so before the spec was
cemented, and it was cemented anyway. A command, a record kind, and a
directory are what a concept is when it has entered the code.

[PKG-004] The kernel, the files under bin/ that Cairn executes at run
time, MUST NOT exceed 1600 lines in total.
Falsifier: the line count of the files under bin/ exceeds 1600.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

Revised 2026-09-15 on the developer's direction after the second
audit. The ceiling of 1500 was set when the kernel held about 1200
lines; the two remediations added the gates the audits required, and
at 1496 lines the hooks could not take the lines PKG-033 to PKG-036
need. The ceiling moves once, to 1600, by the superseding decision
the-complexity-ceiling-is-1600-lines, queued for the developer's
review; the count is still the ceiling's purpose.

Revised 2026-09-15 on the developer's direction after the audit. The
first text covered every shipped run-time file, which the lint never
counted, and the two lint scripts under scripts/ would have pushed the
count past the ceiling; the rationale below already said the ceiling
measures the kernel.

[PKG-009] Cairn MUST NOT move run-time logic into test files to stay
under the ceiling.
Falsifier: a test file contains logic the shipped code calls.

The ceiling measures the kernel: the code that reads state, runs
mechanisms, decides freshness, and names the next action. Mechanisms a
project supplies are that project's, not Cairn's. The test behind the
number is whether Cairn is still a legible referee or has become a
second application that must itself be administered.

The ceiling is a backstop, not a target. Reaching it means a concept
should leave, not that the ceiling should rise.

## Distribution and runtime

[PKG-005] Cairn MUST run under node without a build step and without
runtime dependencies.
Falsifier: a Cairn entry point invoked with node on a clean checkout
exits with an error before doing its work.

[PKG-006] Cairn MUST NOT require an agent harness feature that only one
vendor provides.
Falsifier: a documented workflow step cannot be performed by an agent
outside one specific product.

[PKG-014] Cairn MUST be installable by the commands its README
documents, onto the path and into an agent's skill directory.
Falsifier: following the README's install steps on a machine with node
and git leaves `cairn` off the path or a skill unreachable by the
agent.

Confirmed 2026-09-04 from the backlog. The kernel was on no path and
the skills were linked into no agent's skill directory, so the only way
to use Cairn on another repository was by absolute path.

## No deferral

[PKG-013] Cairn's specification and documentation MUST NOT describe work
the specification includes as deferred, optional, or belonging to a
later version.
Falsifier: a document names a version, a phase, or a later stage for
work a requirement or a commitment already includes.

The specification is the scope. A concept that is not in it is not
"postponed"; it is absent until a named failure brings it in. A concept
that is in it is built. There is no third state, because the third state
is where debt lives.

## The boundary

[PKG-012] Cairn MUST NOT call a model or manage an agent's execution.
Falsifier: Cairn's shipped code sends a request to a model, or starts,
stops, or retries an agent.

## Language

[PKG-007] A normative sentence MUST state one obligation.
Falsifier: a normative sentence states two obligations.

[PKG-010] A normative sentence MUST name the actor.
Falsifier: a normative sentence states an obligation with no actor.

[PKG-011] Every commitment MUST satisfy every PKG requirement.
Falsifier: a commitment reports complete while the package violates a
PKG requirement.

PKG requirements are global constraints. They are inherited by every
commitment rather than assigned to one.

[PKG-008] Every file Cairn ships MUST contain only ASCII characters,
unless the file is not text.
Falsifier: a text file Cairn ships contains a character outside ASCII.

## Learning the workflow

[PKG-016] Cairn MUST provide a linked worked example from agreement
through a failing check, correction, review, escalation, and next commitment.
Falsifier: the README provides no walkthrough showing those steps with
commands and an explanation of the human's choices.

Confirmed 2026-09-05 from the developer's accepted recommendations.

## Inheritance by declaration

[PKG-015] The loop MUST fold into every commitment only the
requirements of a spec file that carries the line
`Scope: every commitment`.
Falsifier: a requirement is folded into a commitment from a file
without that line.
Status: Agreed 2026-09-05

The kernel folded every requirement whose identifier began with PKG,
which is this repository's prefix and a natural one for a consumer's
packaging domain. The file says it is inherited; the kernel reads the
file.

## Command help

[PKG-017] Cairn MUST print command help and exit successfully without
reading or changing repository records when invoked with --help or -h.
Falsifier: cairn --help outside a repository exits nonzero, omits command
usage, or changes files.
Status: Agreed 2026-09-06

Help includes command purposes, required options, global options, exit
codes, and examples. The flag also works after a command. Unknown options
still produce usage errors; a literal --help after the argument separator
is ordinary positional text. Requested by the developer on 2026-09-06.

## Hooks

Drafted 2026-09-14 on the developer's ok to escalation loop-091. Agents
skipped wake, ignored the verdict, and stopped mid-commitment, and the
working agreement alone (LOOP-036) did not hold them. The developer
ruled on 2026-09-14 that a hook which answers the harness with the
verdict does not manage the agent's execution under PKG-012: it starts,
stops, and retries nothing; the harness and the agent decide. The
earlier decision that shipped no hook is superseded on that ruling.
The hooks are optional: the working agreement is the path an agent
takes without them (PKG-006), and one contract serves every harness
that passes JSON on standard input and reads standard output.

[PKG-018] Cairn MUST ship a stop hook that runs wake and returns a
block decision naming the verdict while the verdict is Resolvable.
Falsifier: given a repository whose wake prints Resolvable, the hook
exits without a block decision; or given one whose wake prints
Escalate or Done, or a directory that is not a Cairn repository, it
emits a block decision or exits nonzero.
Status: Agreed 2026-09-14

[PKG-019] Cairn MUST ship a session-start hook that prints the wake
verdict for a Cairn repository. The hook MUST link the command onto
the path when the link is missing.
Falsifier: after the hook runs in a home with no cairn link, the link is
missing or points elsewhere than the checkout that ran it; or in a
Cairn repository its output lacks the wake verdict; or in a directory
that is not a Cairn repository it prints a verdict or exits nonzero.
Status: Agreed 2026-09-14

The harness caps consecutive blocks, so the stop hook keeps no counter.
Cairn's own loop bounds real work: three attempts escalate (DEC-016),
and an escalation lets the agent stop. The install skill registers both
hooks once, for the harnesses the README documents; the link script is
retired, since the session-start hook is the install.

## The hook and the command share one referee

Specified 2026-09-15 on the developer's direction after the audit,
the third remediation commitment. The hook ran its own checkout's
kernel while the agent ran the command on the path; when the two
checkouts differed, every record one wrote was stale to the other,
and the stop hook blocked on "the kernel changed" until the harness
cap. A checkout path with a space linked a command that resolved to
nothing, because the hook built its path from a URL.

[PKG-021] A hook MUST run the kernel that the command link on the
path resolves to when that link exists, and its own checkout's kernel
otherwise.
Falsifier: with the command linked to another checkout, the stop
hook's verdict differs from that checkout's wake.
Status: Agreed 2026-09-15

[PKG-022] On any error, a hook MUST exit 0 with one line on standard
error.
Falsifier: a hook exits nonzero or prints a stack trace when its
input is not an object, when the link's directory is a regular file,
or when the kernel cannot be found.
Status: Agreed 2026-09-15

A link that resolves to nothing is a missing link under PKG-019: the
session-start hook replaces it and says so. A link to another checkout
is reported once at session start, since the hooks then judge with
that checkout's kernel and this one's records are not consulted.

## The package lint reads what its requirements name

Specified 2026-09-15 on the developer's direction after the audit,
the fourth remediation commitment. The lint read command names from
header comments where PKG-003 names the help text, scanned every
tracked file for ASCII including thousands of evidence receipts it
never declared, and matched a vendor-naming step one line at a time.
The suite named 36 of the requirements the declaration speaks for in
no test title, and two of its tests read this repository through
paths the declaration did not list.

[PKG-023] The package lint MUST read the kernel's commands from its
help output.
Falsifier: a command in the kernel's help and dispatch but not in its
header comment passes PKG-003.
Status: Agreed 2026-09-15

[PKG-024] The package lint MUST scan only the files Cairn ships for
PKG-008.
Falsifier: a non-ASCII byte in an evidence receipt under .cairn/
fails the lint.
Status: Agreed 2026-09-15

The lint also reads .cairn/ in three ways the footprint cannot
express: the tracked set, for PKG-002's check that the in-progress
record is untracked; the directory listing, for PKG-003; and git
check-ignore, which reads the ignore files. LOOP-105 refuses `.cairn`
as a declared input, so these reads are recorded here and in the
commitment review of lints-and-tests-observe-what-they-name rather
than declared (audit-2 B8).

[PKG-025] Cairn's test suite MUST name, in a test title, every
requirement that the declaration of the mechanism running the suite
speaks for.
Falsifier: that declaration speaks for a requirement that no test
title names.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

[PKG-026] The declaration of the mechanism that runs Cairn's test
suite MUST list every repository path the tests read.
Falsifier: a test reads a repository file that the declaration's
inputs do not cover.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

Revised 2026-09-15 on the developer's direction after the second
audit (D13, E1): the texts named the node-test file inside a
specification whose scope is every commitment, so a renamed
declaration would have stranded both. The coverage test scans the
suite for `../` string literals and relative imports, which is every
read the suite makes today; it cannot see a read made by a spawned
process, and the declaration lists what those processes read.

[PKG-027] The package lint MUST match a vendor-naming step across a
wrapped paragraph.
Falsifier: a step that names a vendor's product across a line break
passes PKG-006.
Status: Agreed 2026-09-15

## A consumer's agent runs the checker and opens the skills

Specified 2026-09-15 on the developer's direction after the audit,
the fifth remediation commitment. The skills named the checker by a
path that exists only in Cairn's checkout; the README asked for the
phase skills in prose that a harness which hides them from the model
cannot answer; no minimum Node or Git version was stated; and the
deferral scan skipped the documents people read first.

[PKG-028] Cairn MUST provide a lint command that runs the shipped
specification checker from the checkout the command resolves to.
Falsifier: `cairn lint docs/spec` fails in a project where the
command is on the path.
Status: Agreed 2026-09-15

The checker's own code runs from Cairn's checkout, outside a
consumer's repository: like the kernel, it is outside any footprint a
consumer can declare, and a change to it does not stale a consumer's
lint evidence (audit-2 B7). In this repository the spec-lint
declaration lists the checker, the shared parser, and the skills
directory whose names it reads.

[PKG-029] The specification skills MUST name the checker through the
cairn command.
Falsifier: a skill names the checker by a path inside the consumer's
project.
Status: Agreed 2026-09-15

[PKG-030] The README MUST show the three phase skills invoked by name,
as the agent application invokes a skill, rather than asked for in
prose.
Falsifier: the README's example prompt asks the agent to use a phase
skill in prose.
Status: Agreed 2026-09-15

[PKG-031] The README MUST state the minimum Node and Git versions and
the platforms Cairn supports.
Falsifier: the README names no minimum version or no platform.
Status: Agreed 2026-09-15

[PKG-032] The package lint MUST scan the README, the manual, and the
walkthrough for deferral language.
Falsifier: a later-version phrase in the README passes PKG-013.
Status: Agreed 2026-09-15

## The hooks find the kernel and the project

[PKG-033] A hook MUST judge with the `cairn` command found on PATH, or
with the command link's target when PATH has none, or with its own
kernel when neither exists. The session-start hook MUST say which
kernel it judges with when that kernel is not its own.
Falsifier: with a wrapper on PATH that runs another checkout, the stop
hook's verdict differs from that checkout's wake, or session-start
prints no line naming the wrapper.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

[PKG-034] The session-start hook MUST replace the command link only
when its target does not exist.
Falsifier: a link to an existing wrapper or file is replaced.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

[PKG-035] A hook MUST find the project in cwd or the nearest ancestor
inside the Git working tree that holds docs/spec/roadmap.md.
Falsifier: in a project below the Git toplevel, the stop hook allows a
stop while wake there says Resolvable.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

[PKG-036] A hook whose kernel prints no verdict MUST report that in
one line on standard error. The stop hook MUST then allow the stop.
Falsifier: a linked kernel that exits without a verdict makes the stop
hook block, or leaves it silent, or makes session-start print a stack
trace.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

Agreed 2026-09-15 on the developer's direction after the second audit
(C1 to C6). The hooks honored one symlink at one path and replaced a
valid link whose target was a wrapper; they saw a roadmap at the Git
toplevel only; a failed link creation skipped the verdict; a kernel
that crashed left the stop hook silent and session-start printing the
trace; a missing git was silent. The same commitment repairs the
skipped verdict under PKG-019 and the missing git under PKG-022.
