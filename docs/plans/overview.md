# Cairn 2 implementation plans: overview

> **For agentic workers:** this file is the map. Each linked plan is
> executed with superpowers:subagent-driven-development or
> superpowers:executing-plans, one task at a time, in the order below.
> Read this file and `docs/spec/cairn-v2.md` before any plan.

**Goal:** build the Cairn 2 kernel, hooks, skills and optional evaluator
from the revision 5 specification, on the `v2` branch, as fourteen plans
that each end in tested, working software.

**Spec:** `docs/spec/cairn-v2.md` (revision 5, commit `b4cc2526`). The
six digraphs in `docs/diagrams/` are part of it; where they disagree,
the text is normative. Section numbers below refer to that file.

**Privacy:** this line of cairn-dev is private. `eas4ai/cairn-dev` is a
private repository and `v2` may be pushed there. `eas4ai/cairn` (the
`public` remote) is public and never receives `v2`, `refs/cairn/*` or
these plans; a local pre-push hook in the cairn-dev Git directory refuses
such a push. `package.json` carries `"private": true` until the license
decision is recorded. Nothing under `docs/plans/` is shipped in the
plugin.

## Global constraints

Copied from the spec. Every task in every plan inherits them.

- Runtime is Node and Git only: no build step, no package dependency,
  no service (section 11). Node 24 and Git 2.40 or later; the machine
  has Node 24.1.0 and Git 2.55.0.
- ES modules only (`.mjs`). Entry point `bin/cairn.mjs`; modules under
  `lib/`; tests under `tests/` run by `node --test tests/*.test.mjs`.
- Only `bin/typesafeai.mjs` performs network I/O (section 10). It reads
  `TYPESAFEAI_API_KEY` from the environment and never stores it.
- Reserved paths are kernel constants, never settings: `.cairn/**`,
  `docs/spec/**`, `docs/decisions.jsonl`, `AGENTS.md` (section 2).
  Developer-owned protected paths: `.cairn/settings.json`,
  `docs/spec/**`, `AGENTS.md`. Kernel-managed paths: `.cairn/mechanisms`,
  `docs/decisions.jsonl`. `.cairn/output/` is ignored runtime output.
- Durable refs: `refs/cairn/log`, `refs/cairn/snapshots`. Local only:
  `refs/cairn/in-progress` (the action lease), the check lock
  `cairn-check.lock` and the transaction staging and cycle counter below
  `git rev-parse --git-path`. Every ref advance is compare-and-swap.
- A log record is an empty commit: subject `cairn: <kind> <target>`,
  body one RFC 8785 canonical JSON object, exactly two trailers
  `Cairn-Schema: 1` and `Cairn-Digest: sha256:<hex of body bytes>`
  (section 4). Records are never edited.
- Wake writes nothing and exits 0 with a verdict, or 3 with one line
  naming the command or skill that continues (section 2, Verdict).
- Exit codes: 0 success or verdict; 1 refusal or error, with one line on
  stderr beginning `cairn: `; 3 no verdict (outside a project, missing
  refs, pending supersession, interrupted transaction).
- Shipped text is ASCII. No AI attribution anywhere in commits, docs
  or output. Commit messages describe the change in plain English.
- Every hand-written input the kernel parses is either the spec grammar
  or settings (section 4). Everything else it trusts is a Git object it
  wrote or canonical JSON it wrote.
- Tests build throwaway repositories under `os.tmpdir()` with the
  helper in plan 01; no test touches the real repository or the home
  directory. Tests never call the network: plan 11 injects a fake
  transport.

## File structure

One responsibility per module. Names are fixed here so that plans can
reference each other's exports.

```
bin/cairn.mjs            entry: parse argv, dispatch to lib/cli.mjs
bin/typesafeai.mjs       the only network file: POST to TypeSafe
lib/cli.mjs              command table, --help, exit codes, cairn show
lib/canon.mjs            canonical JSON, digests, base64url, ulid
lib/gitx.mjs             git plumbing wrapper (spawn, CAS ref updates)
lib/records.mjs          record schemas, encode/decode, log append/read
lib/snapshots.mjs        input and workspace snapshots, allowed base
lib/paths.mjs            path validation, classification, glob matching
lib/settings.mjs         settings parse, validate, digest
lib/spec.mjs             requirement grammar, roadmap, spec map, lint
lib/auth.mjs             developer authentication, authorization record
lib/init.mjs             cairn init
lib/tx.mjs               transaction lock, staging, intent, recover
lib/lease.mjs            action lease begin/end/--touch, check lock
lib/mechanisms.mjs       declare, definition and review-metadata digests
lib/check.mjs            run a mechanism, receipts, output, current, attempts
lib/adr.mjs              docs/decisions.jsonl append, read, queue
lib/commitment.mjs       start, done, supersede, promote, items, fix, outside
lib/scope.mjs            preflight, scope-breach, disposition
lib/cycle.mjs            local admin-action counter, liveness bound
lib/wake.mjs             predicates, precedence, Done rule, verdict
lib/escalate.mjs         escalate, answer, reply, dispute
lib/review.mjs           review, brief, projection, report, resolve, accept
lib/evaluate.mjs         envelope, state construction, intent/call/result, calibrate
lib/travel.mjs           refspecs, ordered push, fetch validation
hooks/session-start.sh   prints state; writes nothing
hooks/turn.sh            per-turn wake (harnesses that have it)
hooks/stop.sh            fallback wake line
skills/install-cairn/    SKILL.md
skills/new-project/      SKILL.md, templates/AGENTS.md
skills/existing-project/ SKILL.md
skills/next-feature/     SKILL.md
tests/helpers/repo.mjs   makeRepo (plan 01: a git repo) and makeProject (plan 03: an initialized project)
tests/*.test.mjs         one file per lib module, named after it
package.json             name cairn, version 2.0.0-dev, private true
```

## Shared interfaces

Exact names later plans consume. A plan may add exports; it may not
rename these.

```js
// lib/canon.mjs
canonicalize(value) -> string            // RFC 8785 JSON text
parseStrict(text) -> value                // throws CanonError on noncanonical input
sha256(bytes|string) -> 'sha256:<64 hex>'
b64url(bytes) -> string; unb64url(string) -> Uint8Array
ulid(now = Date.now()) -> string          // 26 chars, monotonic within a process

// lib/gitx.mjs   (all async; cwd is the worktree; throws GitError with stderr)
git(args, {cwd, input}) -> {stdout, stderr, code}
gitPath(cwd, name) -> absolute path           // git rev-parse --git-path <name>
readRef(cwd, ref) -> sha|null
updateRefCAS(cwd, ref, newSha, oldShaOrNull)  // git update-ref <ref> <new> <old>; throws CasError on mismatch
commitTree(cwd, {tree, parents, subject, body, trailers}) -> sha
catCommit(cwd, sha) -> {tree, parents, subject, body, trailers: [[k,v]]}
writeTreeFromPaths(cwd, {paths, exclude}) -> treeSha   // dirty bytes, index untouched
listTree(cwd, treeSha) -> [{path, mode, sha}]

// lib/records.mjs
KINDS  // Set of the 27 kinds in section 4 minus admin-transition plus read: see section 4 table
encodeRecord(kind, target, payload) -> {subject, body, trailers}
decodeRecord(commit) -> {kind, target, payload}   // validates schema, digest, closed keys
appendRecord(cwd, kind, target, payload) -> sha    // CAS on refs/cairn/log
readLog(cwd) -> [{sha, kind, target, payload, parent}]   // oldest first
range(log) -> {start, records, closed}             // after the last start record

// lib/snapshots.mjs
writeInputSnapshot(cwd, {mechanism, inputs}) -> sha
writeWorkspaceSnapshot(cwd) -> sha                 // refuses network_exclude and credential paths
readSnapshot(cwd, sha, expectedKind) -> {kind, tree, parent, payload}   // throws KindError
allowedBase(cwd, log) -> sha                       // newest allowed workspace snapshot

// lib/paths.mjs
validatePath(p) -> p                              // throws PathError
classify(p, settings) -> 'reserved'|'protected'|'kernel-managed'|'output'|'outside'|'source'|'interface'|'data'|'plain'
matchGlob(pattern, p) -> boolean                   // entry paths, never symlink targets
RESERVED, PROTECTED, KERNEL_MANAGED, CREDENTIAL_PATTERNS   // constants

// lib/settings.mjs
loadSettings(cwd) -> {settings, digest}            // throws SettingsError listing every refusal
validateSettings(obj) -> [] | [reasons]
SETTINGS_SCHEMA = 1

// lib/spec.mjs
parseDomainFile(text) -> {header: {prefix, scopeEvery, hostPaths}, blocks: [Block]}
Block = {id, obligation, falsifier, mechanism, rationale, status, textDigest}
parseRoadmap(text) -> {current, sections: {slug: {requirements}}}
lint(cwd) -> [] | [findings]
requirementSet(cwd, slug) -> [{id, textDigest}]    // roadmap section + Scope: every commitment Agreed blocks

// lib/auth.mjs
authenticateDeveloper(cwd, settings, {purpose}) -> evidence   // signature or terminal confirmation
verifyEvidence(settings, evidence) -> boolean
authorize(cwd) -> sha                              // writes the authorization record

// lib/init.mjs
init(cwd, {confirmRemote, chooseKey, confirm, confirmDigest}) -> {sha, created}   // injected developer interactions; the CLI supplies terminal-backed defaults
DEFAULT_SETTINGS(remote, key) -> object

// lib/tx.mjs
withTransaction(cwd, {command, plan}, fn) -> result   // lock, stage, intent, fn, terminal
recover(cwd, txId) -> {completed:'forward'|'abort'}
pendingTransaction(cwd, log) -> intent|null

// lib/lease.mjs
begin(cwd, {action, target, touch: []}) -> leaseSha
end(cwd) -> void
readLease(cwd) -> {action, target, snapshot, started, session, touch}|null
withCheckLock(cwd, fn)

// lib/mechanisms.mjs
declare(cwd, name, definition) -> {definitionDigest}
readMechanisms(cwd) -> {name: {definition, definitionDigest, review: {REQ: {definitionDigest, textDigest, failReceipt}}}}
reviewMechanism(cwd, name, REQ, failReceiptSha) -> void

// lib/check.mjs
check(cwd, REQ) -> receiptSha
isCurrent(cwd, receipt, REQ, now) -> boolean
attempts(log, REQ) -> number

// lib/adr.mjs
appendDecision(cwd, line) -> id      // kinds decision|realized|superseded|answered|read
readAdr(cwd) -> [lines]              // throws on breach
queue(cwd) -> [decision ids without a later read]
adrDigest(cwd) -> 'sha256:...'

// lib/commitment.mjs
start(cwd, slug) -> sha; done(cwd, slug) -> sha; supersede(cwd, successor) -> sha; promote(cwd, itemSha) -> sha
item(cwd, {kind, slug, source, body}) -> sha; outside(cwd, itemSha, reason, {evaluation = null}) -> sha; fix(cwd, itemSha) -> sha

// lib/scope.mjs
preflight(cwd, log) -> [breachSha]    // records a breach per undeclared changed path
dispose(cwd, breachSha, 'keep'|'restore') -> sha

// lib/cycle.mjs
bump(cwd, actionClass, target) -> {sameTarget, total}
resetOnProgress(cwd) -> void
BOUNDS = {sameTarget: 4, total: 28, acceptanceRounds: 3}

// lib/wake.mjs
wake(cwd) -> {verdict:'Resolvable'|'Waiting'|'Done', action, target, reason, predicate} | {exit:3, line}
predicates   // ordered list [{name, test(state) -> unmet|null}] in section 5 precedence

// lib/escalate.mjs
escalate(cwd, draft) -> sha; answer(cwd, slug, kind, text) -> sha; reply(cwd, slug, text) -> sha

// lib/review.mjs
review(cwd, slug, answers) -> sha; brief(cwd, slug) -> {sha, projectionDir}
report(cwd, slug, body) -> sha; resolve(cwd, slug, n, explanation) -> sha; accept(cwd, slug, body) -> sha

// lib/evaluate.mjs
evaluate(cwd, draft, {transport}) -> {route, evaluationSha}   // cairn escalate and cairn decide accept --transport-module <path> (test-only) to inject transport
calibrate(cwd) -> {pass, sample, errors, bound}
// bin/typesafeai.mjs
post(request, {key, fetchImpl}) -> {status, body}

// tests/helpers/repo.mjs
makeRepo() -> {dir, git, write, link, commit, readRef, remove}                       // plan 01
makeProject({settings, files}) -> {cwd, dir, git, write, commit, readRef, authorize, cleanup, remove}   // plan 03: settings, init record, ref roots, an origin remote

// lib/travel.mjs
installRefspecs(cwd, remote) -> void; push(cwd) -> void; validateAfterFetch(cwd) -> [] | [repairs]
```

## Plan order

Each plan lists the plans it depends on. Execute in number order; a
later plan's tests may use an earlier plan's modules but never the
reverse.

| Plan | File | Spec sections | Depends on |
|---|---|---|---|
| 01 Foundation: canonical records and refs | [01-foundation.md](01-foundation.md) | 2 (snapshots, refs), 4 (canonical encoding, schemas) | none |
| 02 Hand-written inputs: paths, settings, spec grammar | [02-inputs.md](02-inputs.md) | 2 (paths, hand-written tree, settings), 4 (grammar), 7 | 01 |
| 03 Initialization and authority | [03-init-authority.md](03-init-authority.md) | 2 (paths and authority), 3 (initialization), 8 (protected state) | 01, 02 |
| 04 Transactions and leases | [04-transactions-leases.md](04-transactions-leases.md) | 2 (action lease), 4 (commands and crash recovery) | 01, 03 |
| 05 Mechanisms and evidence | [05-mechanisms-evidence.md](05-mechanisms-evidence.md) | 2 (mechanism, receipt, current, attempt), 8 (freshness, attempts) | 01, 02, 04 |
| 06 Commitments and the ADR | [06-commitments-adr.md](06-commitments-adr.md) | 2 (commitment, item, start, done, superseded, range, ADR), 4 (ADR schema), 8 (decisions, capture) | 01, 02, 03, 04 |
| 07 Scope | [07-scope.md](07-scope.md) | 2 (scope breach, allowed snapshot), 5 (scope is monotonic), 8 (scope) | 01, 04, 06 |
| 08 Wake | [08-wake.md](08-wake.md) | 2 (verdict, predicate, semantic progress), 5 (all), 6 | 01 to 07 |
| 09 Escalation and answers | [09-escalation.md](09-escalation.md) | 2 (escalation, answer, reply, finding dispute), 8 (escalation) | 01, 03, 06 |
| 10 Review and the adversary | [10-review-adversary.md](10-review-adversary.md) | 2 (review, report, finding, acceptance), 9 | 01, 05, 06, 09 |
| 11 Evaluator | [11-evaluator.md](11-evaluator.md) | 2 (evaluation records, calibration), 10 | 01, 06, 09 |
| 12 Travel | [12-travel.md](12-travel.md) | 4 (travel with the code) | 01, 03 |
| 13 Hooks, skills and distribution | [13-hooks-skills-distribution.md](13-hooks-skills-distribution.md) | 3 (install and the four flows), 6, 11 | 08 |
| 14 End-to-end fixture and cutover | [14-fixture-cutover.md](14-fixture-cutover.md) | 3 (work loop), 5 (Done), 12, 14 | all |

## What every plan must contain

- The header from the writing-plans skill: goal, architecture, tech
  stack, spec path, and a Global constraints section that says "see
  overview.md" plus any constraint specific to the plan, quoted from
  the spec.
- Tasks with exact files, an Interfaces block naming what is consumed
  from earlier plans and produced for later ones, using the names above.
- Test-first steps with real test code against `node --test`, the
  command to run, the expected failure, the implementation, the passing
  run, and the commit. Every test builds its repository with
  `tests/helpers/repo.mjs`.
- One task per spec refusal or falsifier the plan covers: the refusal
  is the test. Section 4 says the lint refusal is the grammar's
  falsifier; the same holds for every "the kernel refuses" sentence.
- No placeholders. "Add validation" is not a step; the validation is
  code in the step.

## Record kinds by plan

The section 4 table, assigned. A kind is written by exactly one plan.

| Kind | Plan |
|---|---|
| init, authorization, read | 03 |
| command-intent, command-abort | 04 |
| receipt | 05 |
| start, done, superseded, item, outside, promotion, fix | 06 |
| scope-breach, scope | 07 |
| escalation, answer, reply | 09 |
| review, brief, report, resolution, acceptance | 10 |
| evaluation-intent, evaluation-call, evaluation, calibration | 11 |

Plan 01 defines the schema table for all of them so that plan 08 can
read any record before its writer exists; a writer plan adds tests that
its records round-trip through plan 01's decoder.

## Not in these plans

- The license change and README line: a developer decision, recorded
  when made.
- Migration of 1.x records: section 12 says they are not read; cutover
  is plan 14's last task and archives the 1.x line.
- Anything a section 13 decision reverses: a plan is amended when the
  decision is, not before.
