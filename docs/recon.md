# Recon: explainable freshness

Status: Observed
Examined commit: a97d238265cb8402655a6e08ba6cdf09c859d4e4
Date: 2026-09-07

The developer confirmed explainable freshness as the next iteration and
invoked existing-project. This is Path B: verify the existing specification
and prepare the next commitment. Observed findings below describe current
behavior; proposed behavior remains Draft until its falsifiers are confirmed.
There was no earlier docs/recon.md to replace.

## Exists

| Finding | Evidence |
|---|---|
| Cairn is a Node CLI with no build script or runtime dependency declaration. Its public entry is bin/cairn.mjs. | [package.json](../package.json), [entry point](../bin/cairn.mjs) |
| The wake reconstructs the current commitment and checks ownership, unfinished actions, escalations, decisions, declarations, scope, requirements, evidence, and review in a defined order. | [wakeVerdict](../bin/cairn.mjs#L538) |
| Evidence freshness compares requirement text, mechanism identity, raw declared-input identity, prior receipt history, and captured output. The input-change explanation is only "a declared input changed". | [assess](../bin/cairn.mjs#L490) |
| New receipts contain aggregate identities, execution details, sequence, and prior-history digest. They do not retain individual input-path identities. | [recordEvidence](../bin/cairn.mjs#L756) |
| Working input identity includes path, mode, and raw content or link identity. Historical review comparison uses Git object identities, including clean conversion. A historical Git blob alone need not contain the raw bytes executed. | [inputsDigest](../bin/cairn.mjs#L246), [inputsDigestAt](../bin/cairn.mjs#L299), [conversion decision](decisions/keep-execution-order-separate-from-time-and-preserve-record-boundaries.md) |
| Tests use Node's test runner and real disposable Git repositories. Existing cases cover changed agreement, restored state, clock rollback, receipt imports, candidate mutation, and damaged output. | [helpers](../tests/helpers.mjs), [freshness tests](../tests/requirement-freshness.test.mjs), [order tests](../tests/execution-order.test.mjs), [candidate tests](../tests/candidate.test.mjs), [output integrity tests](../tests/evidence-integrity.test.mjs) |
| Verification commands are declared in three mechanisms: node-test, pkg-lint, and spec-lint. No tracked CI workflow, container definition, or dependency lockfile appeared in the inspected tracked-file listing. | [test declaration](../.cairn/mechanisms/node-test), [package declaration](../.cairn/mechanisms/pkg-lint), [spec declaration](../.cairn/mechanisms/spec-lint), [package manifest](../package.json) |
| The shipped skills are new-project, existing-project, and install-cairn. No next-iteration skill is shipped in skills/. | [new-project](../skills/new-project/SKILL.md), [existing-project](../skills/existing-project/SKILL.md), [install-cairn](../skills/install-cairn/SKILL.md) |

## Documented and verified in this radius

| Contract or convention | Reading and evidence |
|---|---|
| Freshness is limited to declared inputs and the agreement; unrelated commits do not invalidate evidence. | Holds in source and the disposable sequence below: [LOOP-023/024](spec/loop.md#freshness), [assess](../bin/cairn.mjs#L490), [input-declaration decision](decisions/freshness-by-declared-inputs.md). |
| Changed requirement text requires mechanism review before new evidence. | Holds in source and existing tests: [LOOP-058/059](spec/loop.md#evidence-follows-the-agreement), [wake priority](../bin/cairn.mjs#L566), [requirement-freshness tests](../tests/requirement-freshness.test.mjs#L26). |
| Evidence reflects raw executed bytes even when Git normalizes text. | Holds in inspected identity and candidate paths: [LOOP-073](spec/loop.md#records-preserve-execution-order-and-meaning), [candidate](../bin/cairn.mjs#L648), [conversion tests](../tests/git-conversion.test.mjs), [manual](manual.md#why-passing-checks-sometimes-need-to-run-again). |
| Sequence and history identity govern receipt ordering; output damage cannot leave evidence current. | Holds in assessment and existing regression coverage: [LOOP-065/070](spec/loop.md), [order tests](../tests/execution-order.test.mjs), [output tests](../tests/evidence-integrity.test.mjs). |
| Cairn is the referee, and its runtime has a 1500-line ceiling. | The proposal preserves this boundary: [keystone](spec/overview.md), [package constraints](spec/package.md#complexity), [referee decision](decisions/cairn-is-the-referee.md). |
| The working agreement states both parties' actions. | The repository AGENTS.md is byte-identical to both the shipped and installed new-project template at inspection. No replacement is needed: [agreement](../AGENTS.md), [template](../skills/new-project/templates/AGENTS.md). |
| Glossary meanings already cover this work. | Freshness, Evidence, Mechanism, Wake, and Commitment need no new synonyms or changed definitions: [glossary](spec/glossary.md). |

## Contradicted or missing

| Finding | Disposition and evidence |
|---|---|
| No contradiction between the inspected freshness contract and implementation was established in this recon. | The current contract requires correct freshness decisions, not a per-file explanation: [LOOP-023/024](spec/loop.md#freshness), [assessment](../bin/cairn.mjs#L490). This is a feature proposal, not a relabeled defect. |
| The confirmed next behavior is absent: a stale-input action omits the changed filename, affected receipt path, and explicit check command. | Reproduced below and supported by [receipt writer](../bin/cairn.mjs#L756) and [stale verdict](../bin/cairn.mjs#L576). Proposed [commitment](commitments/evidence-explains-its-freshness.md), [backlog record](../.cairn/backlog/explain-which-facts-made-evidence-stale.md). |
| Preparing another iteration currently uses adoption guidance. | Developer observation and shipped skill inventory above. Captured separately in [backlog](../.cairn/backlog/prepare-a-next-iteration-without-repeating-project-adoption.md); it is outside this proposed commitment. |

## Disposable sequence observed

Using tests/helpers.mjs, create a repository with one passing mechanism for
R-001 and R-002, declaring src/other. Check it, write a review, and commit.
Then change src/other from its original bytes, commit, and wake. The result is:

```text
Resolvable: run R-001
  evidence is stale: a declared input changed (m)
```

Assertions confirmed the initial wake was Done, the changed wake omitted both
src/other and its receipt path, restoring the original bytes and committing
returned Done, and a later docs/note.md-only commit retained Done. Each wake
ran in a fresh process. The fixture was separate from the development tree.
This is an observation of the requested gap with two preservation controls,
not a claim that the new requirements pass.

## Blast radius and unverified limits

| Area | Scope and evidence |
|---|---|
| Runtime | Input selection and identity, receipt serialization, stale-cause assessment, and formatting the selected wake action: [kernel](../bin/cairn.mjs#L214). Preserve the surrounding action priority in [wakeVerdict](../bin/cairn.mjs#L538). |
| Tests and contract | Extend the existing [node-test declaration](../.cairn/mechanisms/node-test) after agreement. Proposed requirements are in the existing [loop domain](spec/loop.md#explainable-freshness); the [draft commitment](commitments/evidence-explains-its-freshness.md) lists failure demonstrations and event sequences. |
| Documentation | Add examples to the existing [manual section](manual.md#why-passing-checks-sometimes-need-to-run-again). The [keystone spec map](spec/overview.md#spec-map) already covers all domains; no new domain is needed. |
| Coverage limits | Existing committed evidence records 284 passing tests and a completed adversarial review. Those runs predate this recon; the new explanations and sequence generator are not implemented or tested yet. This recon ran only the disposable sequence described above. [Prior review](../.cairn/reviews/records-preserve-order-and-meaning.md). |
| Platform limits | The recon ran on Linux with local Node and Git. macOS and Windows behavior was not established here. Existing tests include conversion fixtures, which are narrower evidence than native-host testing: [conversion cases](../tests/git-conversion.test.mjs). |
| Discovery limits | Graph tracing connected assess to a test helper named has because of a same-name match. Source inspection shows a Set.has call; that graph edge is not a runtime test dependency: [assess](../bin/cairn.mjs#L502). |
| Historical scope | Reviewed the recent record-integrity and candidate-identity changes, including 54bcbee, 70e0cce, and 68bd2bd, plus the current commitment and related decisions. Older backlog entries are historical claims, not assumed current defects; they remain intact in [.cairn/backlog](../.cairn/backlog). |

## Resolution, 2026-09-15

Two findings above are closed, with the evidence in the commitments
that closed them (SPEC-023): the missing stale-input explanation was
delivered by evidence-explains-its-freshness (LOOP-076 through
LOOP-080), and the absent next-iteration skill by
the-next-iteration-starts-from-the-specification (SPEC-026). The
other rows stand as the observations of 2026-09-07 at commit a97d238.

## Adoption pass, 2026-09-17 (Path B)

Status: Observed. Examined commit: b290963 (HEAD). This pass re-adopts
the codebase the earlier recon already covers; it verifies what changed
since the 2026-09-15 resolution, not the whole tree again. Earlier rows
stand except where this section names them stale, with evidence.

### The loop's position

`cairn wake` says `Resolvable: scope .muse-plugin/plugin.json`: one
path changed since the releases-are-versioned commitment began that no
mechanism declares (LOOP-035). The path is new at HEAD: commit
b290963 created `.muse-plugin/plugin.json` (one line: name cairn,
version 0.3.0, hook entries for `bin/hooks/session-start.mjs` and
`bin/hooks/stop.mjs`, skill entries for all four shipped skills) and
taught `scripts/release.mjs` to stamp the version into it alongside
the other four files. The same commit updated `tests/plugin.test.mjs`
and `tests/release.test.mjs` to read it, plus README, manual,
releasing docs, the install skill, and both hook scripts.

The work looks like it belongs to the commitment: the commitment's
deliverables say the release script "sets the version in package.json
and the three manifests"
([commitment](commitments/releases-are-versioned.md)), and version
parity across every shipped manifest is PKG-039/PKG-040 territory. But
neither declaration names the new directory: node-test declares
`.claude-plugin/` and `.codex-plugin/` but not `.muse-plugin/`
([declaration](../.cairn/mechanisms/node-test)), and pkg-lint does the
same ([declaration](../.cairn/mechanisms/pkg-lint)). The tests read
the file through the declared `tests/` input
([plugin test](../tests/plugin.test.mjs#L15)), so execution sees it;
the footprint does not. That is the whole breach: one undeclared new
path, on work the commitment's own words cover.

No `.cairn/in-progress` record exists, so no action is half-finished.
The commitment's review
([review](../.cairn/reviews/releases-are-versioned.md)) predates HEAD
(the last recorded review examined 0be0d8f; HEAD adds b290963), so
review and evidence are stale behind the scope verdict regardless.

### Spec set

The spec set is intact and current: keystone
([overview](spec/overview.md)), glossary ([glossary](spec/glossary.md)),
roadmap ([roadmap](spec/roadmap.md), Current: releases-are-versioned),
and the commitment file above. No drift between the commitment text
and the code was established in this pass beyond the undeclared path,
which is a declaration gap, not a spec-code contradiction: the spec
says what the code does, the code does it, and only the footprint
omits it.

### Earlier rows, corrected

- The "no next-iteration skill" row is stale: `skills/next-iteration/`
  ships now (SPEC-026, closed above). The shipped skills are
  new-project, existing-project, install-cairn, and next-iteration.
- The "1500-line ceiling" row is stale: the ceiling is 1600 lines
  (PKG-004, revised by the-hooks-find-the-kernel-and-the-project);
  `bin/cairn.mjs` is 1415 lines.
- The "no tracked CI workflow, container, or lockfile" row was not
  re-verified in this pass and stands as a 2026-09-07 observation only.

### Untouched and unverified

- Untracked files `Claude outputs/`, `assets/cover.png`, and
  `assets/cover_bg.png` are present and were not examined; they are
  outside any declared input and outside this recon's scope.
- This pass ran no test suite and no `cairn check`; it read the wake
  verdict, the commitment, the declarations, the HEAD diff, and the
  files cited above. Behavior claims rest on those reads.
- This file itself is now an uncommitted change to `docs/`, which
  pkg-lint declares: committing it is part of whatever work comes
  next, and leaving it dirty blocks `cairn check` until it is
  committed.
