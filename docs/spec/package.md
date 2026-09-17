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
time, MUST NOT exceed 1900 lines in total.
Falsifier: the line count of the files under bin/ exceeds 1900.
Status: Agreed 2026-09-17

Revised 2026-09-17, confirmed by the developer ("approved") on 2026-09-17 in the next-iteration phase. The first text set 1600 lines, and the
kernel stood at 1590 when autonomous and Jev mode were specified; the
mode check, the decision in place of an escalation, and the Jev call
and its template need room the old ceiling did not leave.

Revised 2026-09-15 on the developer's direction after the second
audit. The ceiling of 1500 was set when the kernel held about 1200
lines; the two remediations added the gates the audits required, and
at 1496 lines the hooks could not take the lines PKG-033 to PKG-036
need. The ceiling moves once, to 1600, by the superseding decision
the-complexity-ceiling-is-1600-lines, queued for the developer's
review; the count is still the ceiling's purpose. The count is the
sum of each file's lines; a file's final newline ends its last line
and starts none.

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
block decision naming the verdict while the verdict is Resolvable,
except as PKG-043 allows.
Falsifier: given a repository whose wake prints Resolvable, the hook
exits without a block decision on a stop PKG-043 does not allow,
whatever the input's stop_hook_active; or given one whose wake prints
Escalate or Done, or a directory that is not a Cairn repository, it
emits a block decision or exits nonzero.
Status: Agreed 2026-09-17

Revised again 2026-09-17, confirmed by the developer ("confirmed") on 2026-09-17 in the next-iteration phase. The text agreed earlier that day let
the hook give way whenever the harness sent stop_hook_active true.
Claude Code keeps that flag true for the whole continuation a block
starts, so an agent could stop by ignoring one refusal. The only way
past a Resolvable verdict now is the agent's own progress, an
escalation, or PKG-043's valve, which the developer sees.

[PKG-019] Cairn MUST ship a session-start hook that prints the wake
verdict for a Cairn repository. The hook MUST link the command onto
the path when the link is missing.
Falsifier: after the hook runs in a home with no cairn link, the link is
missing or points elsewhere than the checkout that ran it; or in a
Cairn repository its output lacks the wake verdict; or in a directory
that is not a Cairn repository it prints a verdict or exits nonzero.
Status: Agreed 2026-09-14

The stop hook counts, per session, the refusals that met no progress, in the Git directory beside the check lock (PKG-043).
Cairn's own loop bounds real work: three attempts escalate (DEC-016),
and an escalation lets the agent stop. The plugin's hooks file registers
both hooks when Cairn is installed from a marketplace (PKG-038); the
install skill registers them for a harness without one; the link
script is retired, since the session-start hook is the install.

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
otherwise, unless PKG-033's evidence rule selects another kernel.
Falsifier: with the command linked to another checkout and no receipt
naming another kernel's digest, the stop hook's verdict differs from
that checkout's wake.
Status: Agreed 2026-09-17

Revised 2026-09-17, confirmed by the developer ("confirmed") on 2026-09-17 in the next-iteration phase: the evidence rule of PKG-033 comes first.

[PKG-022] On any error, a hook MUST exit 0. The hook MUST print one
line on standard error for that error.
Falsifier: a hook exits nonzero or prints a stack trace when its
input is not an object, when the link's directory is a regular file,
or when git cannot run.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

Revised 2026-09-15 on the developer's direction after the second
audit (D10): one obligation per sentence. The falsifier's third case
was a kernel that cannot be found, which PKG-033 makes unreachable:
the hook falls back to its own kernel. A missing git is the reachable
case, and its test exists.

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
Status: Agreed 2026-09-15 by deference audit-found-contract-defects-are-repaired-on-the-developer-s-direction

[PKG-024] The package lint MUST scan only the files Cairn ships for
PKG-008.
Falsifier: a non-ASCII byte in an evidence receipt under .cairn/
fails the lint.
Status: Agreed 2026-09-15 by deference audit-found-contract-defects-are-repaired-on-the-developer-s-direction

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
suite for `../` literals in a `new URL`, an import, or the flat, raw
and here helpers; a read spelled another way, such as a path joined
from a constant, or a read made by a spawned process, is not seen,
and the declaration lists what those reads cover.

[PKG-027] The package lint MUST match a vendor-naming step across a
wrapped paragraph.
Falsifier: a step that names a vendor's product across a line break
passes PKG-006.
Status: Agreed 2026-09-15 by deference audit-found-contract-defects-are-repaired-on-the-developer-s-direction

## A consumer's agent runs the checker and opens the skills

Specified 2026-09-15 on the developer's direction after the audit,
the fifth remediation commitment. The skills named the checker by a
path that exists only in Cairn's checkout; the README asked for the
phase skills in prose that a harness which hides them from the model
cannot answer; no minimum Node or Git version was stated; and the
deferral scan skipped the documents people read first.

[PKG-028] Cairn MUST provide a lint command that runs the shipped
specification checker from the checkout the command resolves to.
Falsifier: `cairn lint docs/spec` fails to run in a project where the
command is on the path; a finding is exit 1 and is not a failure to
run.
Status: Agreed 2026-09-15 by deference the-second-audit-is-remediated-on-the-developer-s-direction

Revised 2026-09-15 on the developer's direction after the second
audit (D10): "fails" conflated a finding with failing to run.

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
Status: Agreed 2026-09-15 by deference audit-found-contract-defects-are-repaired-on-the-developer-s-direction

[PKG-030] The README MUST show the three phase skills invoked by name,
as the agent application invokes a skill, rather than asked for in
prose.
Falsifier: the README's example prompt asks the agent to use a phase
skill in prose.
Status: Agreed 2026-09-15 by deference audit-found-contract-defects-are-repaired-on-the-developer-s-direction

[PKG-031] The README MUST state the minimum Node and Git versions and
the platforms Cairn supports.
Falsifier: the README names no minimum version or no platform.
Status: Agreed 2026-09-15 by deference audit-found-contract-defects-are-repaired-on-the-developer-s-direction

The tests for PKG-029, PKG-030 and PKG-031 read the documents for
phrases: a README that names the versions and platforms in other
words would pass or fail them by wording alone. They are listed here
so the limit stays visible (audit-2 E5).
[PKG-032] The package lint MUST scan the README, the manual, and the
walkthrough for deferral language.
Falsifier: a later-version phrase in the README passes PKG-013.
Status: Agreed 2026-09-15 by deference audit-found-contract-defects-are-repaired-on-the-developer-s-direction

## The hooks find the kernel and the project

[PKG-033] A hook MUST judge with the `cairn` command found on PATH, or
with the command link's target when PATH has none, or with its own
kernel when neither exists. When the latest evidence receipt names the
digest of one of those kernels, or of the project's own bin/cairn.mjs,
the hook MUST judge with that kernel instead. The session-start hook
MUST say which kernel it judges with when that kernel is not its own.
Falsifier: with a wrapper on PATH that runs another checkout and no
receipt naming another kernel, the stop hook's verdict differs from
that checkout's wake; or with receipts written by the project's
bin/cairn.mjs and a different kernel on PATH, the stop hook judges the
evidence stale because the kernel changed; or session-start prints no
line naming the kernel it judges with.
Status: Agreed 2026-09-17

Revised 2026-09-17, confirmed by the developer ("confirmed") on 2026-09-17 in the next-iteration phase. On 2026-09-17 the stop hook ran the
production kernel while the checkout's newer kernel had written every
receipt, so each stop was refused for a staleness no action in that
repository could clear. A kernel that exists on disk and wrote the
evidence gives the verdict that evidence was written for; choosing it
gains an agent nothing. After an upgrade the old kernel is gone, so the
hook judges with the new one and the re-run LOOP-095 asks for stands.

[PKG-034] The session-start hook MUST replace the command link only
when its target does not resolve to a regular file.
Falsifier: a link to an existing wrapper or file is replaced, or a
link to a directory is kept.
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

[PKG-037] Cairn MUST ship a plugin manifest and a marketplace listing
at the repository root, so a harness with a plugin marketplace
installs the command, the skills and the hooks from the repository
alone.
Falsifier: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
or `.codex-plugin/plugin.json` is missing, disagrees with the others
or with package.json on the name or version, or names a path the
repository does not hold.
Status: Agreed 2026-09-15 by deference the-plugin-installs-from-a-marketplace-on-the-developer-s-direction

[PKG-038] The plugin's hooks file MUST register the session-start and
stop hooks against the plugin's own hook.mjs through the plugin root
variable.
Falsifier: hooks/hooks.json lacks either event, or its commands, run
with the plugin root set to a copy of bin/ elsewhere, fail to print
the verdict at session start or to refuse a stop while wake says
Resolvable.
Status: Agreed 2026-09-15 by deference the-plugin-installs-from-a-marketplace-on-the-developer-s-direction

Agreed 2026-09-15 on the developer's direction: Cairn is installed
from a plugin marketplace, in Claude Code and in Codex. Both harnesses
read the manifest under .claude-plugin/, the skills under skills/ and
hooks/hooks.json, and both substitute the plugin root variable in a
hook command; Codex reads .codex-plugin/plugin.json first when it
exists. The install skill keeps the skills-CLI path, with its
checkout, for a harness without a marketplace.

[PKG-039] Cairn MUST print its version, the version in package.json,
on `cairn --version`, without a repository.
Falsifier: `cairn --version` prints a version other than
package.json's, exits nonzero, or needs a repository.
Status: Agreed 2026-09-15 by deference releases-are-versioned-on-the-developer-s-direction

[PKG-040] A release MUST be one commit that sets one version in
package.json and the plugin manifests and carries that version's
changelog entry, tagged v<version>. The release script MUST refuse a
dirty tree, a version that is not a semantic-version increase, a
missing changelog entry, an existing tag, or a loop that is not at
Done.
Falsifier: the script commits with the version differing across those
files or without the changelog entry, leaves the tag off, or proceeds
on a dirty tree, a lower version, a taken tag, or a verdict other than
Done.
Status: Agreed 2026-09-15 by deference releases-are-versioned-on-the-developer-s-direction

Agreed 2026-09-15 on the developer's direction. A marketplace
refreshes a plugin only when its version changes, so the version is
the release; one script keeps the four files agreeing, and the tag
and the changelog entry make a release findable from Git alone. The
version files are declared inputs, so their evidence goes stale at
the release commit, and the loop's next check and review record it.

[PKG-041] A hook MUST name the failure it met. When the working
directory on standard input does not exist, the line MUST say so and
name the directory. When a hook entry file cannot start the shared
hook, the entry MUST print one line on standard error naming the
cause and exit 0.
Falsifier: with a cwd on standard input that no longer exists, the
hook's line says git cannot run; or a hook entry whose shared hook
file is missing prints nothing or exits nonzero.
Status: Agreed 2026-09-17 by promotion promote-the-hooks-name-the-failure-they-met

Promoted 2026-09-17 from the kernel review's findings 7, 8 and 10.
The hook spawned git in the harness's working directory, so a
directory that had vanished was reported as a git that cannot run,
and the Muse entry files exited with the child's status or 0, so a
child that never started was silent. The same work makes the walk
from the working directory to the Git toplevel end by construction:
when the toplevel is the filesystem root, dirname("/") is "/", and
the old loop never ended, a hang PKG-022 already forbids. A
repository at / cannot be built in a test, so that repair is read,
not demonstrated.

[PKG-042] The release script MUST find a version file's version field
with any whitespace around its colon. A release MUST change nothing in
a version file but the version.
Falsifier: a version file written as compact JSON, `"version":"0.1.0"`,
makes the script refuse; or a release changes a byte of a version file
other than the version.
Status: Agreed 2026-09-17 by promotion promote-the-release-script-reads-a-version-field-in-any-json-spacing

Promoted 2026-09-17 when release 0.4.0 was refused. The script matched
the literal text `"version": "X"` with one space, and the Muse manifest
is written compact, as the Muse validator writes it. Every manifest in
the test fixture had the space, so PKG-040's test passed while no real
release could be cut.

## The stop hook holds without trapping

[PKG-043] The stop hook MUST allow a stop after it has refused the same
Resolvable verdict three times in one session with the commit and the
working tree unchanged. When it allows such a stop, the hook MUST show
the developer a message naming the verdict. When it allows such a stop,
the hook MUST write a stop record under .cairn/stops/.
Falsifier: in one session, with the verdict, the commit and the working
tree unchanged, the stop hook blocks a fourth stop, or allows one of
the first three; or it allows a stop after a change to the verdict,
the commit or the working tree reset its count; or it allows a stop
without a systemMessage naming the verdict or without writing a stop
record.
Status: Agreed 2026-09-17

[PKG-044] The stop hook's refusal MUST tell the agent that, when it
cannot act on the verdict, it raises an escalation and stops.
Falsifier: a block decision's reason does not name cairn escalate.
Status: Agreed 2026-09-17

Specified 2026-09-17, confirmed by the developer ("confirmed") on 2026-09-17 in the next-iteration phase. A refusal that can never end trapped a
session more than ten times that morning; a refusal that ends after
one ignored attempt lets an agent quit mid-work. The count resets on
any progress, so an agent doing real work never reaches the valve. An
agent that cannot act has an honest exit, the escalation, and never
needs the valve. An agent that idles three times can still stop, but
the harness shows the developer why, and the next wake asks the agent
to explain it before any other work (LOOP-139). The count lives in the
Git directory, which a fresh clone lacks and the next stop rebuilds
(PKG-002); the stop record is a Cairn record and is committed.
