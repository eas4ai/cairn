# Same Page Conformance -- The Engine

**Date:** 2026-09-02
**Status:** Draft for review
(sections that carry an `Agreed:` line are confirmed by the developer
with a falsifier under each `MUST` and `MUST NOT` requirement; the
rest is draft)
**Rule prefix:** ENG
**Source:** the Feature Spec "Same Page Conformance", remediated draft,
round five, consensus 2026-09-01, kept under reference/
**Siblings:** 2026-09-01-same-page-technical-english.md (the language),
2026-09-01-same-page-conformance.md (the language check and the evidence
map)

This spec is the stage-8 generation of the Feature Spec into Same Page
Technical English. The Feature Spec's seven queued "SHOULD" statements
were presented to the developer and ruled on 2026-09-01; each ruling is
recorded under Decisions and revisions with the Feature Spec decision
that governs it. The Feature Spec's rejected alternatives are carried
into the same section, because the reasons they were rejected are part
of the architecture.

## Trust model

Normative.

Agreed: 2026-09-02

This section governs every requirement below. A requirement that
conflicts with it is wrong until the conflict is argued and resolved
under Decisions and revisions.

[ENG-001] The engine MUST NOT claim that evidence semantically
establishes a natural-language requirement.
Falsifier: `same-page verify` output states that a requirement is
proven, correct, or established, instead of stating that evidence is
`SUFFICIENT` for it under a named policy.

[ENG-002] The engine MUST record the confirmed falsifier of each
obligation.
Falsifier: an obligation file exists with no falsifier field, or with a
falsifier that differs from the Falsifier line in the spec.

[ENG-003] The engine MUST execute and evaluate only declared evidence
mechanisms.
Falsifier: the engine runs a command that no validator definition
declares, or evaluates a record that no declared mechanism produced.

[ENG-004] The engine MUST track only the evidence inputs it can observe
within the recorded verification boundary.
Falsifier: an evidence record lists a tracked input outside its recorded
boundary, or claims freshness from an input the engine never read.

[ENG-005] The engine MUST record the basis on which each evidence record
is bound to its obligation.
Falsifier: an evidence record has no `binding_basis` field, or holds a
value outside `none`, `attested`, and `backend`.

[ENG-006] The engine MUST record whether each evidence mechanism has
demonstrated sensitivity to the confirmed falsifier.
Falsifier: an evidence record has no `sensitivity` field, or holds a
value outside `unchallenged`, `challenged`, and `not_applicable`.

[ENG-007] The engine MUST NOT claim freshness or sufficiency beyond the
recorded verification boundary.
Falsifier: a file inside the recorded boundary changes after the
evidence was produced, and the next `same-page verify` run still
reports that evidence current.

[ENG-008] The engine MUST NOT convert uncertainty into correctness.
Falsifier: a requirement with unknown freshness, or with a dependency
closure not established complete, evaluates `SUFFICIENT`.

Rationale: the engine's defining behavior is refusal. Its most important
output is not a pass. It is `BLOCKED`, with a reason.

## Why this exists

An agent can write an implementation and a test that agree with each
other while both violate the specification. Neither the implementation
nor the test defines correctness. The Agreed requirement does.

Same Page already creates a persistent record of trustworthy intent:
shared vocabulary, controlled specification language, explicit
confirmation, stable requirement identifiers, checkable acceptance
criteria, and a confirmed falsifier for each mandatory or prohibited
behavior. What is missing is a persistent, machine-evaluable record of
why we believe the implementation still conforms to that intent. Today
that belief lives inside an agent session and disappears with it; a
future session must rediscover the relationship between requirement,
implementation, validator, and evidence.

In one sentence: Same Page Conformance compiles Agreed requirements
into persistent falsifiable obligations, maintains a soundness-aware
trace between requirements and implementation, executes declared
evidence mechanisms, and records the method, binding, sensitivity,
freshness, authority, and residual assumptions of the resulting
evidence rather than assuming them.

## Boundaries

Same Page Conformance is not a replacement for the drift gate, the
language check, the evidence map, or a project's tests, lint, CI, model
checkers, or formal verifiers. It is not a test generator bolted on
after implementation, not a Markdown mutation layer, not
language-specific, not stack-specific, not a semantic oracle, not a
universal dependency analyzer, and not a universal falsification
language.

The drift gate remains semantic and scope-focused. The language check
answers whether normative text obeys Same Page Technical English. The
evidence map remains the human claim register. The engine is the
deterministic evidence layer beneath those surfaces.

## System character

Four rules shape every design decision:

1. The specification is authoritative.
2. Evidence is typed, not flattened into one score.
3. Freshness is claimed only inside a stated soundness envelope.
4. Unknown is never green.

## Core model

Normative.

### Requirement authority

Agreed: 2026-09-02

[ENG-010] The engine MUST NOT keep an active obligation for a
requirement that is not Agreed.
Falsifier: a requirement whose section is Observed or Draft has an
obligation file that `same-page verify` evaluates.

[ENG-011] The engine MUST NOT change a requirement from Observed to
Agreed.
Falsifier: after an engine command runs, a section's status reads
Agreed where it read Observed before, with no developer confirmation in
the conversation.

Rationale: machine evidence can show that code matches an Observed
description. Only developer confirmation can establish that the
description is what the system is meant to do.

### Obligation

Agreed: 2026-09-02

[ENG-012] An active obligation MUST belong to exactly one Agreed
requirement identifier.
Falsifier: an obligation file names two identifiers or none, or two
obligation files name the same identifier.

[ENG-013] An obligation MUST key on a requirement identifier.
Falsifier: an obligation file is named or keyed by anything other than
its requirement identifier.

[ENG-014] The engine MUST NOT assign identifiers to acceptance
criteria.
Falsifier: an engine-written artifact carries an identifier for an
acceptance-criterion line.

[ENG-015] An obligation MUST store the requirement identifier, a source
locator for the requirement, the canonical requirement digest, the
confirmed falsifier, and the canonical falsifier digest.
Falsifier: an elaborated obligation file lacks the identifier, the
locator, the requirement digest, the falsifier, or the falsifier
digest.

[ENG-016] An obligation MUST store the applicable assurance profile and
its validator references.
Falsifier: an elaborated obligation lacks a profile field or a
validators field, or names a profile the policy file does not define.

[ENG-017] When implementation exists, an obligation MUST store
evidence-binding metadata and dependency metadata.
Falsifier: an obligation with a bound implementation has no binding
section or no dependency section.

[ENG-018] An obligation MAY include a copied requirement sentence for
readability.

[ENG-019] When the requirement digest no longer matches the
specification, the engine MUST treat the obligation as invalid until
the obligation is regenerated from the confirmed requirement.
Falsifier: a requirement's text changes in the spec, and `same-page
verify` evaluates its old obligation as anything other than invalid
before re-elaboration.

[ENG-020] The engine MUST NOT treat an obligation as a second contract.
Falsifier: the obligation's copied sentence and the spec disagree, and
the engine evaluates against the copy instead of reporting the
obligation invalid.

Rationale: acceptance criteria remain observations that establish
whether a requirement is satisfied; they receive no second identifier
namespace. The copied sentence is convenience only. The requirement in
the specification is the sole authority.

### Falsifier

Agreed: 2026-09-02

[ENG-021] A falsifier MUST record the observable state that violates
the requirement.
Falsifier: an obligation's falsifier field is empty or is a copy of the
requirement sentence.

[ENG-022] A falsifier MAY include preconditions, actors, an observable
sequence, relevant state, and the violating result.

[ENG-023] The engine MUST NOT interpret a falsifier sequence as an
executable language.
Falsifier: the engine runs, or parses as commands, the lines of a
falsifier's sequence.

[ENG-024] A permission-only `MAY` requirement MUST NOT carry a
falsifier.
Falsifier: elaboration writes an obligation file for a requirement whose
only keyword is `MAY`.

[ENG-025] When a limit on permitted behavior matters, the specification
MUST express the limit as a separate `MUST` or `MUST NOT` requirement
with its own falsifier.
Falsifier: a `MAY` requirement carries a Falsifier line or an "only"
clause standing in for a limit, with no separate `MUST` or `MUST NOT`
requirement stating the limit.

Rationale: the falsifier is machine-readable semantic intent, written
for validator authors, reviewers, and adapters. Executable behavior
belongs to validators. Example:

```yaml
falsification:
  precondition: token is valid
  sequence:
    - issue token
    - revoke token
    - authenticate with token
  violation:
    authentication succeeds
```

### Evidence record

Agreed: 2026-09-02

An evidence record is the unit of machine-evaluable belief. Each record
carries independent axes; no axis is derived from another.

[ENG-026] An evidence record MUST carry the independent axes `kind`,
`binding_basis`, `sensitivity`, `freshness`, `dependency_provenance`,
and `assumptions`.
Falsifier: an evidence record lacks `kind`, `binding_basis`,
`sensitivity`, `freshness`, `dependency_provenance`, or `assumptions`.

[ENG-027] The `kind` field MUST hold the evidence method: one of
`formal`, `model`, `property`, `integration`, `test`, `static`,
`inspected`, or `manual`.
Falsifier: a record's `kind` holds a value outside the eight methods.

[ENG-028] The engine MUST NOT order evidence methods as a ranking.
Falsifier: a clause naming one method is satisfied by a record of
another method, or an engine surface presents the methods as a ladder.

Rationale: a deterministic integration test that executes the exact
confirmed falsifier can establish more about one requirement than a
property test that explores nearby input space. A formal proof and an
integration test can establish different parts of one claim. Assurance
policy composes methods instead of pretending the middle of the
evidence space is a total order.

[ENG-029] The `binding_basis` field MUST hold one of `none`, `attested`,
or `backend`.
Falsifier: a record's `binding_basis` holds a value outside `none`,
`attested`, and `backend`.

[ENG-030] An attested binding MUST record the actor, the actor type
(`developer` or `agent`), the timestamp, the source snapshot identity,
and whether the developer confirmed the mapping.
Falsifier: an attested record lacks the actor, the actor type, the
timestamp, the snapshot, or the developer-confirmed flag.

[ENG-031] The engine MUST NOT treat developer confirmation of a binding
as strengthening the evidence mechanism itself.
Falsifier: a developer-confirmed binding satisfies a kind, sensitivity,
or freshness clause it would not satisfy unconfirmed.

[ENG-032] A backend binding MUST be established by a trusted adapter
capability.
Falsifier: a record carries `binding_basis` `backend` and no registered
adapter with `can_establish_binding` produced it.

[ENG-033] The engine MUST NOT accept a backend binding from a free-form
claim in a validator result.
Falsifier: a validator's output declares a backend binding and the
record carries `binding_basis` `backend`.

[ENG-034] The `sensitivity` field MUST hold one of `unchallenged`,
`challenged`, or `not_applicable`.
Falsifier: a record's `sensitivity` holds a value outside
`unchallenged`, `challenged`, and `not_applicable`.

[ENG-035] A challenged record MUST name the challenge mechanism.
Falsifier: a record with `sensitivity` `challenged` has no challenge
mechanism field.

[ENG-036] A challenged record MUST state whether the challenge derives
from the confirmed falsifier.
Falsifier: a challenged record lacks the falsifier-derived flag.

[ENG-037] When a challenge derives from the confirmed falsifier, the
record MUST cite the falsifier the challenge realizes.
Falsifier: a challenged record flagged falsifier-derived cites no
falsifier digest.

[ENG-038] The `freshness` field MUST hold one of `current`, `stale`, or
`unknown`.
Falsifier: a record's `freshness` holds a value outside `current`,
`stale`, and `unknown`.

[ENG-039] The engine MUST evaluate freshness relative to the recorded
verification boundary.
Falsifier: a record is reported current while an input inside its
recorded boundary changed after the record was produced.

[ENG-040] The `dependency_provenance` field MUST hold one of
`conservative`, `adapter_derived`, or `traced_supplemental`.
Falsifier: a record's `dependency_provenance` holds a value outside
`conservative`, `adapter_derived`, and `traced_supplemental`.

[ENG-041] A `traced_supplemental` dependency set MAY enrich a
conservative or adapter-derived set.

[ENG-042] The engine MUST NOT narrow a conservative dependency floor by
a `traced_supplemental` set unless that set is established complete
within the verification boundary.
Falsifier: a record's boundary is narrower than the conservative floor
on the strength of a traced set with no completeness established.

[ENG-043] An evidence record MAY carry residual assumptions.

[ENG-044] The engine MUST report every recorded assumption with the
evidence it qualifies.
Falsifier: a record carries an assumption that `same-page verify`
output does not show next to that record.

[ENG-045] The engine MUST NOT absorb an assumption into a claim of
correctness.
Falsifier: a `same-page verify` entry states `SUFFICIENT` and shows no
assumptions while its records carry one.

Rationale: residual assumptions include a trusted verifier version, a
declared toolchain fingerprint, a container digest, a database version,
an external service contract, a formal verifier's trusted computing
base, and untracked environment behavior. They stay visible.

### Source snapshot identity

Agreed: 2026-09-02

[ENG-046] The engine MUST bind every evidence record to an immutable
source snapshot identity.
Falsifier: a record has no snapshot field.

[ENG-047] For a clean Git source tree, the snapshot identity MUST be
`git:<commit-sha>`.
Falsifier: a record produced in a clean git tree carries a snapshot
other than `git:` followed by the HEAD commit.

[ENG-048] For a dirty workspace, the snapshot identity MUST be
`workspace:<digest>`.
Falsifier: a record produced with uncommitted changes carries a `git:`
snapshot.

[ENG-049] A workspace digest MUST include the Git HEAD identity when
present, every relevant dirty input inside the verification boundary,
and every untracked input the dependency mechanism declares relevant.
Falsifier: two workspaces that differ in HEAD or in a dirty tracked
file produce the same workspace digest.

[ENG-050] The engine MUST NOT present workspace evidence as evidence for
the underlying commit.
Falsifier: `same-page verify` reports a workspace record as current for
a `git:` snapshot, or shows a commit as the authority for a workspace
record.

Rationale: workspace evidence is evidence for that workspace snapshot
only. CI authority remains commit-based unless a named environment
defines another immutable snapshot model.

## Adapter capability and trust model

Normative.

Agreed: 2026-09-02

[ENG-051] The engine MUST own every trust-sensitive evidence axis.
Falsifier: a record's `binding_basis`, `sensitivity`, `freshness`, or
`dependency_provenance` value comes from a validator's output rather
than from the engine.

[ENG-052] A validator result MUST NOT award itself a trust property.
Falsifier: a validator's output sets a trust property and the record
carries it.

[ENG-053] A command validator MAY return a pass, a fail, an error,
stdout and stderr, artifacts, and measurements.

[ENG-054] The engine MUST NOT accept from a validator result a claim of
complete dependency closure, backend binding, formal proof coverage,
challenge sensitivity, or authoritative freshness.
Falsifier: a validator's output claims any of those five and the
record carries it.

[ENG-055] The engine MUST register each adapter with explicit
capabilities.
Falsifier: an adapter produces records with no entry in the capability
registry.

[ENG-056] The engine MUST accept an adapter claim only when the
adapter's trusted registration carries the matching capability.
Falsifier: a record carries a property an adapter claimed while the
adapter's registration lacks the capability.

[ENG-057] The engine MUST NOT grant a capability because an evidence
payload carries additional fields.
Falsifier: an evidence payload with an extra field yields a capability
the registration does not carry.

Conceptual capabilities:

```text
can_establish_binding
can_establish_complete_dependencies
can_establish_challenge
can_establish_formal_result
can_establish_model_result
```

### Adapter trust

Adapters and validators are executable code.

[ENG-058] The engine MUST NOT execute a newly discovered
repository-controlled validator because configuration for it exists.
Falsifier: a validator definition added to the repository runs with no
trust record and no explicit invocation.

[ENG-059] The engine MUST execute a validator only under an execution
trust context.
Falsifier: a validator runs and its record carries no execution trust
context.

[ENG-060] The engine MUST accept exactly the execution trust contexts
listed below.
Falsifier: a record carries an execution trust context outside the four
listed.

- Explicit developer invocation.
- Owner-controlled CI configuration.
- Repository validator configuration whose exact identity an external
  developer trust record covers.
- A named trusted environment the developer configured.

### Trust-anchor location

[ENG-061] The evaluated repository MUST NOT grant execution trust to
itself.
Falsifier: a file inside the repository makes a validator trusted.

[ENG-062] A trust record that authorizes repository-controlled
validators or adapters MUST live outside the repository it authorizes.
Falsifier: the engine reads a trust record from a path under the
evaluated repository.

[ENG-063] Committed repository content MAY request trust.

[ENG-064] Committed repository content MUST NOT grant trust.
Falsifier: committing a file makes a validator run with no trust record
outside the repository.

[ENG-065] A trust grant MUST bind to the validator or adapter identity
and configuration digest, unless the developer approves a broader scope
outside the repository.
Falsifier: a validator whose definition changed since the grant runs
under that grant, with no broader scope approved outside the
repository.

[ENG-066] An agent completion hook MAY inspect existing conformance
state.

[ENG-067] An agent completion hook MUST NOT execute a newly discovered
validator or adapter without the execution trust the host environment
requires.
Falsifier: the drift gate, or any completion hook, spawns a validator.

Valid trust-anchor locations: local derived host state controlled by
the developer; developer-level Same Page configuration outside the
repository; owner-controlled CI configuration; named-environment
configuration controlled outside the evaluated repository. A validator,
adapter, manifest, or pull request cannot make itself trusted by adding
or modifying a repository-side trust marker.

## Assurance profile

Normative.

Agreed: 2026-09-02

[ENG-070] An assurance profile MUST define the evidence properties that
are sufficient for a requirement as a composition, not as one scalar
grade.
Falsifier: a profile in `policy.yaml` is a single number or word, and
the engine accepts it.

[ENG-071] A profile MAY require one or more evidence methods,
alternative method sets, a binding basis, developer-confirmed
attestation, challenged sensitivity, an authoritative execution
context, and named assumptions or verifier families.

[ENG-072] Every profile MUST require current freshness.
Falsifier: a requirement evaluates `SUFFICIENT` on evidence whose
freshness is `stale` or `unknown`, under any profile.

[ENG-073] A profile MUST NOT waive current freshness.
Falsifier: `policy.yaml` carries a profile setting that turns freshness
off, and the engine accepts the policy without a finding.

[ENG-074] A profile MAY require falsifier-derived challenge for a
requirement.

[ENG-075] The policy file MUST define a default assurance profile at
project scope.
Falsifier: `policy.yaml` has no project-scope default profile, and
elaboration or `same-page verify` runs without a finding.

[ENG-076] A domain MAY override the project default profile.

[ENG-077] When an obligation names no profile, the engine MUST apply the
nearest inherited default.
Falsifier: an obligation with no profile field is evaluated under a
profile other than its domain default, or the project default when the
domain has none.

[ENG-078] When the inherited default applies to a requirement, the
workflow MUST NOT ask the developer about that requirement's profile.
Falsifier: the model asks which profile a requirement takes when no
exception is in play.

[ENG-079] When a requirement needs a profile that differs from the
inherited default, the workflow MUST ask the developer.
Falsifier: an obligation is elaborated with a non-default profile that
the developer never confirmed in the conversation.

Examples:

```yaml
profiles:
  security-critical:
    require:
      all:
        - kind: integration
        - sensitivity: challenged
      any:
        - kind: property
        - kind: formal
        - kind: model
      binding:
        developer_confirmed: true
  formal-core:
    require:
      all:
        - kind: formal
        - kind: integration
      binding:
        basis: backend
```

## Policy evaluation

Normative.

Agreed: 2026-09-02

[ENG-080] Policy evaluation MUST produce exactly one verdict:
`SUFFICIENT`, `INSUFFICIENT`, `FAILING`, or `BLOCKED`.
Falsifier: a `same-page verify` entry shows no verdict, two verdicts,
or a value outside the four.

[ENG-081] The engine MUST evaluate verdicts in the order `FAILING`,
`BLOCKED`, `INSUFFICIENT`, `SUFFICIENT`.
Falsifier: an obligation with a failing result and a blocking
precondition evaluates `BLOCKED`, or with a blocking precondition and
satisfying evidence evaluates `SUFFICIENT`.

[ENG-082] When a current, relevant, authoritative validator result or
counterexample demonstrates that the falsifier occurs, the verdict MUST
be `FAILING`.
Falsifier: a current authoritative validator result of fail exists and
the verdict is not `FAILING`.

[ENG-083] A profile MUST NOT override a `FAILING` verdict.
Falsifier: a profile that does not require the failing validator's
method yields `SUFFICIENT` or `INSUFFICIENT` over a current failing
result.

[ENG-084] When the engine cannot establish a precondition required for
evaluation, the verdict MUST be `BLOCKED`.
Falsifier: freshness is `unknown`, a validator errored, or a digest
mismatches, and the verdict is `SUFFICIENT` or `INSUFFICIENT`.

Preconditions whose absence blocks: freshness is `unknown`; required
authoritative evidence cannot be obtained; validator infrastructure
failed; a trusted adapter capability is unavailable; an obligation or
spec digest mismatch prevents safe evaluation.

[ENG-085] When evaluation is possible and current evidence does not
satisfy the active assurance profile, the verdict MUST be
`INSUFFICIENT`.
Falsifier: evaluation is possible, no failing result exists, the
profile is unsatisfied, and the verdict is not `INSUFFICIENT`.

[ENG-086] When current evidence inside the recorded verification
boundary satisfies every active policy requirement, the verdict MUST be
`SUFFICIENT`.
Falsifier: current evidence inside the boundary satisfies every clause
and the verdict is not `SUFFICIENT`.

[ENG-087] The engine MUST NOT discard evidence because that evidence is
insufficient under policy.
Falsifier: a record that does not satisfy the profile is deleted or
omitted from `same-page verify` output.

[ENG-088] The engine MUST report partial evidence with its coverage,
method, freshness, the active policy, and the verdict.
Falsifier: an `INSUFFICIENT` entry omits the evidence present, its
method, its freshness, or the active policy.

Rationale: a current counterexample dominates profile sufficiency; a
profile cannot ignore evidence that demonstrates the requirement is
false. Partial truth remains visible; it does not become green.

```text
Coverage: Covered
Method: test
Freshness: Current
Policy: property + integration
Verdict: INSUFFICIENT
```

## Assurance-policy downgrade handling

Normative.

Agreed: 2026-09-02

[ENG-100] The developer MAY change assurance policy.

[ENG-101] The engine MUST treat a change that reduces the assurance
required for an existing Agreed requirement as a policy downgrade.
Falsifier: a policy change removes a required clause for an Agreed
requirement and the engine reports no downgrade.

[ENG-102] The engine MUST surface a policy downgrade explicitly, showing
the old policy, the new policy, and the effect on current sufficiency.
Falsifier: a downgrade finding omits the old policy, the new policy, or
the effect on current sufficiency.

[ENG-103] The engine MUST NOT apply a policy downgrade before the
developer confirms it.
Falsifier: a requirement evaluates under the reduced profile before the
developer confirms the downgrade.

[ENG-104] The workflow MUST record a confirmed policy downgrade in the
applicable Decisions and revisions log.
Falsifier: a confirmed downgrade has no entry in the affected spec's
Decisions and revisions.

[ENG-105] The engine MUST treat a policy downgrade without developer
confirmation as drift.
Falsifier: `same-page verify` runs with an unconfirmed downgrade and
reports no finding.

Rationale: the developer is allowed to change the bar. An agent is not
allowed to lower it silently.

## Requirement and falsifier revision handling

Normative.

Agreed: 2026-09-02

[ENG-110] The developer MAY revise an Agreed requirement or its
confirmed falsifier through the Same Page confirmation process.

[ENG-111] The engine MUST record a standing disproof when authoritative
evidence for a requirement includes a last verdict of `FAILING` or a
current authoritative counterexample realizing the confirmed falsifier.
Falsifier: an authoritative `FAILING` verdict exists for a requirement,
and the engine's state for it carries no standing disproof.

[ENG-112] When a revision invalidates an obligation that has a standing
disproof, the engine MUST surface a disproof-clearing revision finding
before the revised obligation can evaluate `SUFFICIENT`.
Falsifier: a requirement with a standing disproof is revised, and the
revised obligation evaluates `SUFFICIENT` with no disproof-clearing
finding reported.

[ENG-113] A disproof-clearing revision finding MUST show the prior
requirement text, the prior falsifier, the prior verdict, and the
authoritative source snapshot.
Falsifier: a disproof-clearing finding omits any of those four.

[ENG-114] A disproof-clearing revision finding MUST show the
counterexample or failing evidence reference, the proposed revision,
and the reason the revision invalidates the prior disproof.
Falsifier: a disproof-clearing finding omits any of those three.

[ENG-115] The workflow MUST obtain the developer's explicit
acknowledgment that the revision clears or changes the standing
disproof.
Falsifier: a revised obligation is created after a disproof-clearing
finding with no acknowledgment from the developer in the conversation.

[ENG-116] The workflow MUST record that acknowledgment in the
applicable Decisions and revisions log.
Falsifier: the developer acknowledged a disproof-clearing revision and
the affected spec's log has no entry for it.

[ENG-117] The engine MUST preserve the prior counterexample as
historical evidence about the prior contract.
Falsifier: after the revision, the prior counterexample's record is
gone from the evidence store.

[ENG-118] The engine MUST NOT delete, relabel as irrelevant, or hide a
prior disproof because the requirement digest changed.
Falsifier: a prior disproof is absent from `same-page verify` output,
or shown as irrelevant, because the digest changed.

[ENG-119] After acknowledgment, the engine MUST create a new obligation
projection under the same requirement identifier, unless the language
spec's revision rules require withdrawal and replacement.
Falsifier: after acknowledgment, the obligation file still carries the
prior digests, or a new identifier was assigned where the language
rules did not require one.

[ENG-120] A revised obligation MUST NOT inherit a sufficiency claim from
evidence bound to the prior requirement or falsifier.
Falsifier: the revised obligation evaluates `SUFFICIENT` on evidence
records whose digests match the prior requirement or falsifier.

Rationale: a revision does not erase the history of what the previous
contract disproved. Revision remains the developer's right; the
engine's job is to make the consequence of that revision visible.

## Dependency and freshness model

Normative.

This is the load-bearing joint of the engine.

[ENG-121] The engine MUST NOT report evidence as current from a
dependency set it cannot establish as complete within the recorded
verification boundary.

[ENG-122] The engine MUST NOT use a hand-declared symbol list as the
freshness graph.

[ENG-123] The engine MUST NOT use a runtime execution trace as the
freshness graph.

Rationale: declared symbol lists rot silently. A runtime trace
under-approximates behavioral dependency: it can miss configuration,
feature flags, migrations, database constraints, generated artifacts,
unexecuted branches, external contracts, and code paths that validator
run did not exercise.

[ENG-124] The engine MUST establish the dependency scope by the
conservative fallback chain listed below, taking the first step that
succeeds.

1. A trusted adapter establishes a complete dependency closure inside
   the verification boundary.
2. The engine establishes a sound package, crate, or service boundary
   and invalidates that whole boundary.
3. The engine establishes a repository boundary and invalidates the
   repository.
4. Freshness is `unknown`.

[ENG-125] The engine MUST prefer over-invalidation to
under-invalidation.

[ENG-126] When no step of the chain succeeds, the engine MUST set
freshness to `unknown`.

[ENG-127] Explicit bindings and runtime traces MAY enrich the
dependency graph.

[ENG-128] The engine MUST NOT narrow the conservative floor unless the
narrowing mechanism establishes that the resulting dependency set is
complete within the verification boundary.

[ENG-129] The engine MUST record every narrowing as a reviewable act.

Rationale: over-invalidation costs computation; under-invalidation
manufactures a false claim that evidence remains current. Narrowing is
where unsoundness can enter. Binding types belong to validators and
adapters, not to the core engine: symbol, package, crate, service, HTTP
route, database schema, migration, configuration key, browser surface,
generated artifact, external contract, file, directory, glob.

## Verification boundary

Normative.

[ENG-130] A verification boundary MUST define the envelope inside which
the engine claims freshness.

[ENG-131] A verification boundary MAY include any of the inputs listed
below.

- The repository or service root.
- The dependency closure or conservative source boundary.
- Selected configuration inputs.
- Selected schema and migration inputs.
- The validator definition.
- A toolchain fingerprint.
- A container digest.
- Declared external contracts.
- Named assumptions.

[ENG-132] The engine MUST NOT claim completeness outside the recorded
verification boundary.

[ENG-133] The engine MUST report residual risk outside the boundary
explicitly.

Freshness therefore means: current for the exact recorded source
snapshot, obligation, validator, dependencies, declared environment
inputs, and assumptions inside the recorded verification boundary.

## Evidence identity

Normative.

[ENG-140] Evidence identity MUST include every input that can
invalidate the evidence claim.

[ENG-141] Evidence identity MUST include at minimum the inputs listed
below.

- The source snapshot identity.
- The requirement identifier.
- The canonical requirement digest.
- The canonical falsifier digest.
- The obligation digest.
- The validator-definition digest.
- The trusted adapter identity and version, when applicable.
- Implementation dependency fingerprints.
- The declared tool and environment fingerprint.
- Relevant external-contract fingerprints, when declared.

[ENG-142] When any evidence identity input changes, the engine MUST
treat the prior evidence as no longer current.

[ENG-143] The engine MUST NOT include assurance policy in evidence
identity.

[ENG-144] When policy changes, the engine MUST re-evaluate existing
current evidence under the new policy.

[ENG-145] The engine MUST NOT mark evidence stale because policy
changed.

```text
implementation changed -> evidence freshness can change
requirement changed    -> evidence freshness can change
falsifier changed      -> evidence freshness can change
validator changed      -> evidence freshness can change
tool boundary changed  -> evidence freshness can change
policy changed         -> evidence is re-evaluated
```

## Environment fingerprint

Normative.

[ENG-150] Each validator or adapter MUST declare the environment inputs
relevant to its result.

[ENG-151] The engine MUST NOT attempt to fingerprint the whole
execution environment.

[ENG-152] The engine MUST record environment drift outside the declared
fingerprint as residual risk.

Rationale: declared inputs include the validator tool name and
version, the compiler version, the lockfile, the toolchain file, the
target triple, the OS and architecture where relevant, a container
digest, a database version. The fingerprint is deliberately incomplete
unless a hermetic environment provides stronger guarantees. Same Page
Conformance does not pretend to be a hermetic build system.

## Verification authority

Normative.

[ENG-155] The engine MUST treat evidence as authoritative only for the
exact source snapshot the evidence describes.

[ENG-156] The configured verification authority MUST be one of `ci`,
`local`, or `named-environment`.

[ENG-157] When owner-controlled CI configuration exists, the default
verification authority MUST be `ci`.

[ENG-158] The developer MAY configure `local` or `named-environment`
authority explicitly.

[ENG-159] The engine MUST report non-authoritative evidence with its
authority stated.

[ENG-160] The engine MUST NOT let non-authoritative evidence overwrite
or pass as authoritative evidence.

Rationale: a project without CI can choose local authority. A named
environment serves specialized verification such as hardware in the
loop, GPU validation, a browser matrix, a staging database, or a
certified formal-verification environment.

```text
Current locally.
Not yet established by authoritative CI.
```

## Validators

Normative.

Agreed: 2026-09-02

[ENG-161] A validator definition MUST state the mechanism that produces
evidence for an obligation.
Falsifier: a validator definition under `.same-page/validators/` has no
method, or one outside the eight.

[ENG-162] The portability floor for a validator MUST be direct argv
execution.
Falsifier: a validator definition's command is a single string rather
than a list of arguments.

[ENG-163] The engine MUST NOT apply shell interpretation to a validator
command by default.
Falsifier: a validator with no shell declaration runs through a shell,
or an argument containing shell metacharacters is interpreted.

[ENG-164] A validator that requires a shell MUST declare `shell: true`.
Falsifier: a validator that needs a shell runs without `shell: true` in
its definition.

[ENG-165] The engine MUST require an execution trust context for every
validator, with or without a shell.
Falsifier: a validator with `shell: true` runs with no execution trust
context recorded, or a validator without it does.

Rationale: the obligation says what has to be demonstrated; the
validator determines how to attempt that demonstration. Direct argv
prevents shell parsing hazards; it does not make arbitrary repository
code safe.

```json
{
  "command": ["cargo", "test", "auth_revocation"],
  "cwd": "."
}
```

Adapters can integrate Verus, Kani, model checkers, property
frameworks, mutation systems, static analyzers, HTTP validators,
database validators, browser validators, and custom project validators.

[ENG-166] The engine MUST NOT treat a formal proof as eliminating the
correspondence assumption between a natural-language requirement and
its formal model.
Falsifier: a `same-page verify` entry backed by a formal record shows
no correspondence assumption between the requirement and its model.

[ENG-167] A bound formal proof MAY establish that the implementation
satisfies the formalized obligation under the proof's declared
preconditions, assumptions, and trusted computing base.

Rationale: a formal backend is special only because it can eliminate
some uncertainty boundaries inside its verified model.

## Challenge and sensitivity model

Normative.

[ENG-170] The engine MUST accept as a challenge any deliberate attempt
to realize or expose the confirmed falsifier.

Challenge is not synonymous with mutation. Mechanisms include mutation,
fault injection, negative fixtures, controlled test doubles,
model-check counterexample search, explicit adversarial inputs, and
challenge harnesses. The evidence record rules above require a
challenged record to name its mechanism and to state whether the
challenge derives from the confirmed falsifier.

[ENG-171] A challenged record MUST cite a reviewable challenge artifact.

[ENG-172] The engine MUST NOT record a challenge that has no reviewable
artifact as `challenged`.

[ENG-173] When a validator passes both the intended implementation and
a challenge that realizes the violating state, the engine MUST report
weak or vacuous sensitivity for that requirement.

[ENG-174] When a validator passes a challenge that realizes the
violating state, the engine MUST NOT preserve a `challenged`
sensitivity claim for that validator.

[ENG-175] The engine MUST NOT treat a challenge as proof that a
natural-language requirement is equivalent to its validator.

Rationale: challenge raises the bar. It does not close the semantic
gap between the requirement and the mechanism that checks it.

## Manual evidence

Normative.

Agreed: 2026-09-02

[ENG-180] The engine MUST accept manual evidence.
Falsifier: `same-page attest` refuses a well-formed manual record, or
the record is absent from `same-page verify` output.

[ENG-181] A manual evidence record MUST include a named human actor, a
timestamp, the source snapshot identity, an evidence description, the
relevant coarse bindings, and an expiry or re-attestation policy.
Falsifier: a manual record lacks the actor, the timestamp, the
snapshot, the description, the bindings, or the expiry.

[ENG-182] When a bound surface changes, the engine MUST invalidate
manual evidence by the normal freshness rules.
Falsifier: a bound surface changes and the manual record is still
reported current.

[ENG-183] The engine MUST NOT let expired manual evidence satisfy
policy.
Falsifier: a manual record past its expiry satisfies a profile clause.

[ENG-184] The engine MUST project manual evidence to `Covered` only
when the human actor exercised or otherwise addressed the falsifier.
Falsifier: a manual record whose description does not address the
falsifier projects to Covered.

[ENG-185] The engine MUST project implementation inspection alone to
method `inspected` and coverage Asserted.
Falsifier: an inspection-only record projects to a coverage other than
Asserted, or to a method other than `inspected`.

Rationale: manual evidence is not immortal, and inspection alone
addresses no falsifier.

## Storage

Normative.

Agreed: 2026-09-02

The storage model separates authored contract projection from derived
execution state:

```text
docs/specs/<project>/
  conformance.md                human claim register

.same-page/
  obligations/
    <REQ-ID>.yaml               committed, diffable
  validators/                   committed, diffable
  policy.yaml                   committed, diffable
  evidence/                     derived, gitignored
  cache/                        derived, gitignored
```

[ENG-186] The engine MUST keep authored contract projection separate
from derived execution state.
Falsifier: a file under `obligations/`, `validators/`, or `policy.yaml`
holds an evidence record or a freshness value, or a file under
`evidence/` or `cache/` is the only place an obligation's fields exist.

[ENG-187] The engine MUST store canonical obligations as one committed,
diffable text artifact per requirement under `.same-page/obligations/`.
Falsifier: two requirements share one obligation file, an obligation
lives outside `.same-page/obligations/`, or an obligation file is not
plain text.

[ENG-188] The canonical obligation syntax MUST be YAML.
Falsifier: an obligation file is written in a syntax other than YAML.

[ENG-189] The engine MUST store validator definitions and the policy
file as committed, diffable text under `.same-page/`.
Falsifier: a validator definition or the policy file lives outside
`.same-page/`, or is not plain text.

[ENG-190] The engine MUST keep derived evidence and caches uncommitted,
under `.same-page/evidence/` and `.same-page/cache/`.
Falsifier: a file under `.same-page/evidence/` or `.same-page/cache/`
is tracked by git, or derived evidence is written anywhere else.

[ENG-191] A database MAY index obligations or evidence as a derived
cache.

[ENG-192] The engine MUST NOT use a database as the authoritative
committed obligation store.
Falsifier: an obligation exists only in a database, with no YAML file
under `.same-page/obligations/`, and the engine evaluates it.

[ENG-193] The engine MUST NOT commit a freshness lock file.
Falsifier: a tracked file under `.same-page/` records freshness state
or evidence digests.

[ENG-194] The engine MUST treat CI evidence as an artifact and local
evidence as derived local state.
Falsifier: the engine reads a local evidence file as authoritative CI
evidence, or writes local evidence where CI artifacts are read.

Rationale: machine-generated hashes are derived execution state, not
mergeable human source. Replacing the diffable-artifact rule with a
database store requires an explicit design decision in this log.

## Evidence map

Normative.

Agreed: 2026-09-02

[ENG-195] The evidence map MUST remain the committed human claim
register that CONF-040 through CONF-049 define.
Falsifier: the engine writes a column, a value, or a row format into
`conformance.md` that the map spec does not define.

[ENG-196] The evidence map MUST NOT store freshness or policy
sufficiency.
Falsifier: a row in `conformance.md` carries a freshness value or a
verdict.

[ENG-197] The engine MUST NOT edit the committed evidence map without
an explicit synchronization action or a confirmed workflow action.
Falsifier: `conformance.md` changes after an engine command other than
`same-page sync-map`, or after a workflow step the developer did not
confirm.

[ENG-198] The engine MUST compute its machine view of coverage and
compare that view with the evidence map.
Falsifier: `same-page verify` runs with a map present and its output
carries no comparison between the machine view and the map.

[ENG-199] The `same-page verify` command MUST report every disagreement
between the machine view and the evidence map.
Falsifier: the machine view and the map differ on a row, and the
`same-page verify` output does not name that row.

[ENG-200] An explicit synchronization action MAY update the map; its
working name is `same-page sync-map`.

[ENG-201] A workflow MAY propose the same map changes through the
developer-confirmation loop.

Rationale: the human map remains a human artifact; the engine remains
the evaluator. Coverage semantics are the map spec's: Covered means
cited evidence beyond implementation inspection addresses the
falsifier, the method says how, Asserted means implementation is cited
and no mechanism addresses the falsifier, Uncovered means nothing is
claimed.

## Obligation lifecycle

Normative.

Agreed: 2026-09-02

The lifecycle has three moments: requirement confirmation, stage close
before implementation, and implementation.

[ENG-205] At requirement confirmation, the workflow MUST ask the
falsifier question and record the confirmed falsifier with the
requirement.
Falsifier: a requirement becomes Agreed in the spec with no Falsifier
line under it.

[ENG-206] At stage close, before implementation, the workflow MUST
elaborate confirmed requirements and falsifiers into obligation files.
Falsifier: implementation of an Agreed requirement begins with no
obligation file for it.

[ENG-207] At stage close, the workflow MUST apply the inherited
assurance profile to each new obligation.
Falsifier: a newly elaborated obligation carries no profile, or a
non-default one with no developer ruling.

[ENG-208] The workflow MUST keep machine-shaped detail in `.same-page/`,
not in the confirmation conversation.
Falsifier: the model asks the developer to confirm a digest, a locator,
a dependency list, or a YAML field.

[ENG-209] The engine MUST attach evidence bindings only after
implementation exists.
Falsifier: an obligation carries a binding to an implementation path
that does not exist in the snapshot.

[ENG-210] After implementation, the workflow or the engine MAY
associate implementation boundaries, validators, a binding basis,
dependency provenance, and a verification boundary with an obligation.

[ENG-211] The engine MUST compute digests, dependency provenance, and
evidence records without developer hand-authoring.
Falsifier: elaboration or verification stops and asks the developer to
supply a digest, a dependency set, or an evidence record.

Rationale: confirm fatigue creates rubber-stamped authority, so the
requirement and its falsifier are confirmed inline and everything
machine-shaped is elaborated afterwards from defaults.

## Developer surfaces

Normative.

Agreed: 2026-09-02

[ENG-215] The normal developer surface MUST be the evidence map, the
policy file, and `same-page verify`.
Falsifier: a routine workflow step requires the developer to open or
edit a file under `.same-page/` other than `policy.yaml`.

[ENG-216] The engine MUST NOT require a developer to hand-author
obligation files, digests, dependency provenance, or evidence records.
Falsifier: a documented or prompted step tells the developer to write
an obligation file, a digest, provenance, or an evidence record by
hand.

[ENG-217] A developer MAY edit a committed obligation file directly.

[ENG-218] The `same-page verify` output MUST show, for each
requirement, the verdict, the requirement text, the required evidence,
the evidence present, the freshness, the authority with its snapshot,
and the boundary.
Falsifier: a `same-page verify` entry omits the verdict, the text, the
required evidence, the present evidence, the freshness, the authority
with its snapshot, or the boundary.

[ENG-219] A `BLOCKED` result MUST state the uncertainty that prevents a
correctness claim.
Falsifier: a `BLOCKED` entry carries no reason line.

```text
AUTH-011  SUFFICIENT
  Requirement: A revoked token MUST NOT authenticate.
  Required:    integration + challenged
  Evidence:    integration test; developer-confirmed binding; challenge passed
  Freshness:   current
  Authority:   ci @ 92a4c1f
  Boundary:    service auth-api

AUTH-011  BLOCKED
  Freshness cannot be established.
  Reason: the validator dependency boundary was narrowed, but the
          engine cannot establish that the narrowed set is complete.

AUTH-011  INSUFFICIENT
  Coverage:    Covered
  Evidence:    deterministic test
  Required:    property + integration
  Freshness:   current
  Authority:   ci @ 92a4c1f
```

The `BLOCKED` output is part of the product's character.

## Workflow integration

Normative.

Agreed: 2026-09-02

[ENG-225] In `/new-project`, the workflow MUST ask the falsifier
question in the confirmation loop, elaborate obligations at stage
close, and turn project and domain assurance defaults into policy.
Falsifier: a `/new-project` run reaches the working agreement with an
Agreed `MUST` lacking a Falsifier line, with no obligation files, or
with no `policy.yaml`.

[ENG-226] In `/existing-project` Path B, the workflow MUST consult
conformance state before re-deriving what the engine already
established.
Falsifier: a Path B session re-verifies a section from code while
fresh, sufficient, authoritative evidence for it exists unconsulted.

[ENG-227] Fresh, sufficient, authoritative evidence MAY establish
`Holds` for a spec section.

[ENG-228] The workflow MUST focus session judgment on the requirements
listed below.
Falsifier: a session spends its judgment on a requirement whose
obligation, evidence, validator, and map row are all in order while one
of the listed conditions stands unaddressed.

- The obligation is missing.
- The evidence is stale.
- The freshness is unknown.
- The policy is insufficient.
- The validator fails.
- The evidence map disagrees with machine state.

[ENG-229] The engine MUST NOT change the meaning of `Holds`,
`Drifted`, `Still Observed`, or `Missing`.
Falsifier: an engine surface reports one of those four words with a
meaning other than the `/existing-project` definition.

[ENG-230] In `/next-iteration`, the workflow MUST confirm a falsifier
for each staged `MUST` or `MUST NOT` requirement before promotion.
Falsifier: a staged requirement is promoted into a contract with no
Falsifier line.

[ENG-231] The workflow MUST elaborate obligations for promoted
requirements before implementation.
Falsifier: implementation of a promoted requirement begins with no
obligation file for it.

[ENG-232] The drift gate MUST remain a semantic and scope audit.
Falsifier: the gate's output contains a validator result or a verdict
the gate computed itself.

[ENG-233] The drift gate MUST NOT become the validator runtime.
Falsifier: the gate spawns a validator command.

[ENG-234] The drift gate MAY inspect cached conformance state.

[ENG-235] The drift gate MUST NOT execute a newly discovered validator
during completion.
Falsifier: a validator definition added in the session runs during the
completion hook.

Rationale: the engine changes who establishes the evidence. It does
not change the vocabulary.

## Construction layers

Normative.

Agreed: 2026-09-02

[ENG-240] Every construction layer listed below is in scope, and an
iteration contract MUST decide when each layer is built.
Falsifier: a spec, a contract, or a doc describes a layer as optional
or out of scope.

[ENG-241] When an iteration contract includes a layer, the contract
MUST include or presuppose every layer that layer depends on.
Falsifier: a contract's In list names a layer whose dependency layer is
neither in that list nor already built.

- L1, obligation store and lifecycle: requirement locator and digest,
  falsifier lifecycle, YAML obligation artifacts, policy defaults,
  workflow integration.
- L2, validator floor and evidence model: direct argv validators,
  evidence records, adapter capability model, policy evaluation, source
  snapshot identity. Depends on L1.
- L3, conservative freshness: verification boundary, evidence identity,
  conservative invalidation, environment fingerprint, `current`,
  `stale`, `unknown`, `BLOCKED` semantics. Depends on L2.
- L4, authority and map comparison: configurable verification
  authority, authoritative evidence selection, machine-view and
  evidence-map comparison, explicit map synchronization. Depends on L2
  and composes with L3.
- L5, sensitivity mechanisms: challenge artifacts, negative fixtures,
  fault injection, mutation where a mechanism exists, sensitivity
  evidence. Depends on L2.
- L6, ecosystem adapters and sound narrowing: compiler and build
  dependency adapters, database, browser, and service dependency
  adapters, formal-verifier backends, backend binding, adapter-derived
  complete closures. Depends on L3. Open-ended by ecosystem.

## Open questions

These remain implementation-design questions, decided under the
iteration contract that builds the layer they belong to.

1. Challenge review surface: do reviewable challenge artifacts live
   primarily in repository files, in `same-page verify` output, or
   both?
2. Package boundary -- closed under iteration 001 (2026-09-02):
   `policy.yaml` is written by the first `same-page elaborate` in a
   project, with the default profile and the spec directories;
   installing Same Page writes nothing.
3. Trusted adapter registration: how does a developer inspect and
   approve the capabilities an adapter is authorized to assert?
4. Evidence artifact portability: what portable artifact format does CI
   publish so another machine can inspect evidence without trusting a
   local cache?

Closed: canonical obligations are diffable text artifacts; YAML is the
first canonical syntax; a database is at most a derived index; freshness
state is derived and gitignored; direct argv is the command floor;
shell interpretation is explicit opt-in; requirement identifiers, not
acceptance-criterion identifiers, key obligations.

## Acceptance criteria

The engine is ready to move from design into implementation planning
when all of these statements are true.

- The trust model appears at the top of the design and no section
  contradicts it.
- The engine never treats a validator result as authority for a
  trust-sensitive evidence property the validator is not registered to
  establish.
- A requirement change invalidates prior evidence for that requirement.
- A falsifier change invalidates prior evidence for that requirement.
- An obligation change invalidates prior evidence for that obligation.
- A validator-definition change invalidates prior evidence produced by
  that validator.
- An implementation or declared-environment change invalidates
  evidence according to the verification boundary.
- A policy-only change re-evaluates evidence without marking the
  evidence stale.
- Freshness is never `current` from a dependency set not established
  complete inside the verification boundary.
- Unknown freshness never evaluates `SUFFICIENT`.
- A current authoritative counterexample evaluates `FAILING` even when
  its validator is not required by the active assurance profile.
- A hidden assurance-policy downgrade is reported.
- A developer-confirmed assurance-policy downgrade is permitted and
  recorded.
- A requirement or falsifier revision that invalidates a standing
  disproof is reported as a disproof-clearing revision, preserves the
  prior disproof as history, requires explicit developer
  acknowledgment, and is recorded in the Decisions and revisions log.
- Non-authoritative evidence never overwrites authoritative evidence.
- Dirty-workspace evidence never passes as commit evidence.
- A generic command validator never awards itself backend binding,
  complete dependency closure, formal status, or challenge sensitivity.
- A newly discovered repository validator command never executes
  without the configured execution trust.
- Execution-trust grants live outside the repository they authorize;
  repository content can request trust and cannot grant itself trust.
- `Covered`, `Asserted`, and `Uncovered` carry coverage meaning only;
  the evidence method is a separate field.
- Manual evidence earns `Covered` only when the human exercises or
  otherwise addresses the falsifier; implementation inspection alone is
  `inspected` evidence and projects to Asserted.
- `inspected` names implementation-inspection evidence; Observed
  remains reserved for requirement authority.
- The engine never silently writes the evidence map.
- Canonical obligations remain committed, diffable text artifacts.
- Derived evidence and freshness caches remain uncommitted execution
  state.
- A project with only direct command validators can use the engine end
  to end.
- A project with a formal-verifier adapter can record backend-established
  proof binding without implying that formal proof closes the
  natural-language semantic gap.
- The normal developer workflow uses only the evidence map, the policy
  file, and `same-page verify`; internal evidence dimensions never
  become routine manual bookkeeping.
- Every queued "SHOULD" statement of the Feature Spec is resolved in
  this spec as conditioned normative language, and the no-falsifier
  rule for permission-only `MAY` requirements is preserved.
- A challenged evidence record states whether its challenge derives
  from the confirmed falsifier, and cites the falsifier when it does.
- A challenge with no reviewable artifact is never recorded as
  `challenged`.

## Definition of success

Same Page Conformance succeeds when a future development session can
ask "Why do we currently believe AUTH-011 conforms?" and the repository
can answer with the Agreed requirement, the falsifier the developer
confirmed, the obligation derived from that agreement, the evidence
that addresses the falsifier, why that evidence is believed to
correspond to the obligation, whether the mechanism has been
challenged, the exact source snapshot it describes, the verification
boundary inside which freshness is claimed, the inputs that have not
changed, the configured verification authority, the active assurance
policy the evidence satisfies, and the assumptions and residual risks
that remain. Therefore AUTH-011 is currently `SUFFICIENT`.

And when that claim cannot be justified, the system answers `BLOCKED`,
with the uncertainty that prevents a correctness claim. That refusal is
not a failure of Same Page Conformance. It is the feature working
correctly.

## Decisions and revisions

- 2026-09-02 -- Iteration 002 (layer L2) built, under
  docs/specs/same-page/iterations/002.md. Implementation-design
  decisions taken under that contract: (a) freshness is
  whole-repository: a record is `current` while the snapshot, the
  validator definition digest, and the obligation digests are
  unchanged, else `unknown` (the widest sound boundary; `stale` and
  narrower boundaries are L3); (b) `local` is the only verification
  authority, stated on every record and every `verify` entry, until
  L4; (c) the snapshot identity covers the source tree outside
  `.same-page/`, because obligations and validator definitions are
  identified on every record by their own digests and a policy change
  re-evaluates evidence instead of staling it -- a tree that differs
  from HEAD only under `.same-page/` has the commit's identity
  (ENG-047 read as "clean of source changes"); (d) execution trust
  records live under `$SAME_PAGE_HOME` or `~/.same-page/trust.yaml`,
  bound to repository path, validator name, and definition digest; the
  four contexts are `trust-record`, `developer-invocation`
  (`--as-developer`), and, when they arrive with L4, `ci` and
  `named-environment`; (e) the validator-to-obligation mapping is the
  obligation's `validators` list: a bare name is `binding_basis:
  none`, an entry with `attested_by` (developer or agent) is
  `attested`, and elaboration or `run` completes the actor, timestamp,
  snapshot, and confirmation; (f) the downgrade baseline is the
  `required` block each obligation stores at elaboration, compared by
  implication (a requirement is weaker when it no longer guarantees
  what the old one demanded; incomparable counts as weaker);
  (g) a standing disproof is `disproof.yaml` under the requirement's
  evidence directory while the latest record is a failing result;
  acknowledgment is a sibling file naming the prior and new digests,
  and `elaborate` regenerates only when they match; (h) the capability
  registry holds `command` and `manual`, neither with a capability;
  (i) a manual record satisfies `kind: manual` only when it addressed
  the falsifier, and `inspected` otherwise, which is ENG-184 and
  ENG-185 in policy terms ahead of the L4 map projection; (j) a
  validator run has a timeout (default 600 seconds) and a timed-out or
  unspawnable validator is `error`, hence `BLOCKED`.
- 2026-09-02 -- Confirmed Agreed by the developer with falsifiers at
  the close of iteration 001, for iteration 002 (layer L2): Evidence
  record, Source snapshot identity, Adapter capability and trust model,
  Policy evaluation, Assurance-policy downgrade handling, Validators,
  Manual evidence.
- 2026-09-02 -- Iteration 001 (layer L1) built, under
  docs/specs/same-page/iterations/001.md. Implementation-design
  decisions taken under that contract: (a) open question 2 closed --
  the policy file is written by the first `elaborate`, not by
  installation; (b) the policy file carries `specs:`, the spec
  directories the engine reads, so `verify` needs no arguments and the
  developer surface stays the map, the policy, and `verify` (ENG-215);
  (c) the default profile requires any one evidence method other than
  `inspected`, so its sufficiency is the map's Covered in policy form;
  (d) an obligation stores the applicable profile (ENG-016) together
  with `profile_from` (`project default`, `domain <PREFIX>`, or
  `obligation`), which is how re-elaboration re-resolves an inherited
  default when policy changes (ENG-077) and keeps a profile the
  developer set (ENG-217); (e) digests are over canonical text
  (glossary), so a re-wrapped paragraph keeps its obligation; (f) the
  engine is TypeScript run directly by node and bun with no build step
  and no dependency, with its own reader and writer for the YAML subset
  it emits (ENG-188); (g) at L1 `verify` evaluates every valid
  obligation `INSUFFICIENT` and names the required evidence, because
  no evidence record exists until L2 -- the full `verify` output
  (ENG-218) lands with the layers that produce its fields.
- 2026-09-02 -- Confirmed Agreed by the developer with falsifiers, in
  the /existing-project pass that opened the package's own spec set:
  Trust model, Requirement authority, Obligation, Falsifier, Assurance
  profile, Requirement and falsifier revision handling, Storage,
  Evidence map, Obligation lifecycle, Developer surfaces, Workflow
  integration, Construction layers. ENG-010
  reworded from "Only an Agreed requirement MAY have an active
  obligation" to a `MUST NOT`, because a limit phrased as a permission
  is what ENG-025 and LANG-074 forbid. In a section whose first line
  is `Normative.`, the `Agreed:` line follows that marker, because the
  language check reads the marker only on the first line.
- 2026-09-02 -- Generated at stage 8 from the Feature Spec (remediated
  draft, round five, consensus 2026-09-01). The seven queued "SHOULD"
  statements were presented to the developer on 2026-09-01 with the
  Feature Spec decision that governs each, and approved as one set:
  (1 and 6) challenge targeting the falsifier "where practical" --
  governed by F8 and F2 -- becomes a recorded fact on the evidence
  record (ENG-036, ENG-037) that a profile can require (ENG-074);
  mutation stays a legal mechanism and stops passing for the stronger
  kind. (2) policy defaults -- governed by F6 -- become ENG-075 through
  ENG-077. (3) ask only about exceptions -- governed by F6 -- becomes
  ENG-078 and ENG-079. (4) CI as default authority -- governed by P4
  -- becomes ENG-157 and ENG-158. (5) reviewable challenge artifacts --
  governed by the sensitivity section and F8 -- become ENG-171 and
  ENG-172; where artifacts live stays open question 1. (7) no
  hand-authored YAML, digests, provenance, or evidence records --
  governed by F6, the developer surfaces section, and lifecycle moment
  3 -- becomes ENG-206, ENG-211, ENG-215, ENG-216, and ENG-217, so the
  obligation sits on the tooling and "most projects" disappears.
- 2026-09-02 -- One term for the mechanism axis: the Feature Spec's
  "evidence kind" is the same concept as the evidence map's method
  (CONF-045). This spec uses "method" for the concept and keeps `kind`
  as the stored field name the Feature Spec fixed (ENG-026), so the map
  column and the record field name one thing (LANG-010).
- 2026-09-02 -- The falsifier language rules land in the language spec
  as the LANG-070 block in the same change, as the 2026-09-01 remediation
  planned: the workflow got the question then, the language gets the
  grammar now.
- 2026-09-02 -- Acceptance criteria are keyword-free observations and
  carry no identifiers, per the Feature Spec's F12: requirement
  identifiers are canonical, obligations key on requirements.
- 2026-09-01 -- Feature Spec consensus, round five. The rejected
  alternatives are carried here because their reasons are part of the
  architecture:
  - F1 and P1, dependency freshness: rejected hand-declared symbol lists
    and runtime traces as the freshness graph (they rot silently and
    under-approximate); adopted sound adapter closure, else the widest
    sound conservative boundary, else `unknown`; traces enrich and never
    silently narrow.
  - F2, falsification semantics: rejected a universal executable
    falsification language; adopted the falsifier as semantic intent,
    executable behavior in validators, binding basis and sensitivity as
    recorded axes.
  - F3, environment hashing: rejected fingerprinting the whole
    environment (that is a hermetic build system); adopted declared
    fingerprints with explicit residual risk.
  - F4, committed freshness lock: rejected (conflict-heavy, unreadable
    derived state); adopted committed configuration and obligations,
    derived evidence and cache, CI evidence as artifact.
  - F5, evidence ladder: rejected a total order of evidence methods;
    adopted independent methods, composite profiles, and coarse map
    coverage as a separate axis.
  - F6, confirmation ceremony: rejected full machine elaboration at
    each sentence confirmation (confirm fatigue creates rubber-stamped
    authority); adopted inline requirement and falsifier confirmation,
    elaboration at stage close, bindings at implementation, defaults
    from policy.
  - F7, immortal manual evidence: rejected; adopted actor, date,
    snapshot, coarse bindings, expiry or re-attestation policy.
  - F8, mutation as magic or decoration: rejected mandatory mutation
    and unmodeled optional mutation; adopted sensitivity as its own
    axis, several challenge mechanisms, profiles deciding where
    challenged evidence is required.
  - F9, `OBSERVED` as an evidence kind: rejected (Same Page owns
    Observed as requirement authority); adopted `inspected`.
  - F10, lexical proof-binding theater: rejected treating a requirement
    identifier inside a proof file as proof binding; adopted lexical
    presence as citation integrity only, real binding through a trusted
    backend capability.
  - F11, silent scope reduction: rejected treating a candidate minimal
    engine as a feature deferral; adopted full scope, construction
    layers that expose order, iteration contracts that decide when.
  - F12, criterion identifiers: rejected a second identifier namespace
    for acceptance criteria; adopted requirement identifiers as
    canonical.
  - F13, shell validator floor: rejected shell-string execution as the
    default; adopted the argv floor, explicit `shell: true`, execution
    trust still required.
  - P2, anonymous attestation: rejected; adopted actor, actor type,
    timestamp, snapshot, developer-confirmed mapping status.
  - P3, unknown freshness laundering: rejected every path by which
    unknown freshness becomes green; adopted `BLOCKED`.
  - P4, universal CI authority: rejected requiring CI for every
    project; adopted configurable snapshot-bound authority, CI default
    where present, local and named-environment authority explicit.
  - P5, mixed relevance axis: rejected one axis holding attestation,
    backend binding, and challenge status; adopted binding basis and
    sensitivity as independent axes.
  - R4-F1, validator self-grading: rejected; adopted engine-owned
    trust-sensitive axes and registered adapter capabilities.
  - R4-F2, incomplete evidence identity: rejected freshness based only
    on implementation dependencies; adopted the full identity input
    list, with policy changes re-evaluating rather than staling.
  - R4-F3, formal proof closes the semantic loop: rejected; adopted
    formal verification eliminating implementation-to-model uncertainty
    only inside its stated boundary, semantic correspondence as an
    explicit assumption.
  - R4-F4, undefined completeness: rejected; adopted the verification
    boundary as the soundness envelope.
  - R4-F5, argv equals safe execution: rejected; adopted argv as a
    parsing and portability floor with trusted execution still
    required.
  - R4-F6, undefined verdict precedence: rejected; adopted `FAILING`,
    `BLOCKED`, `INSUFFICIENT`, `SUFFICIENT`.
  - R4-F7, invisible policy downgrade: rejected; adopted an explicit
    finding, developer confirmation, and a log record.
  - R4-F8, dual evidence-map writers: rejected humans and engine editing
    the same map silently; adopted compute and compare, explicit sync
    or confirmed workflow action.
  - R4-F9, commit-only local evidence: rejected pretending dirty
    workspace verification belongs to the commit; adopted snapshot
    identity for both commit and workspace.
  - R4-F10, Covered means exercised: rejected wording that excludes
    formal and model evidence; adopted Covered as evidence beyond
    inspection that addresses the falsifier, with the method saying
    how.
  - R4-F11, SQLite as the canonical store: rejected reopening
    authoritative storage; adopted one diffable text artifact per
    obligation, YAML first, databases as derived indexes only.
  - R5-F1, requirement-revision verdict laundering: rejected letting a
    revision silently erase a standing disproof; adopted the
    disproof-clearing revision finding with acknowledgment, a log
    entry, preserved history, and no inherited sufficiency.
  - R5-F2, repository self-trust: rejected storing the execution-trust
    grant inside the repository it authorizes; adopted external trust
    anchors bound to validator or adapter identity and configuration
    digest.
  - R5-F3, inspect on both coverage sides: rejected one verb for both
    the Covered manual act and the Asserted inspection act; adopted
    manual Covered evidence as exercising or otherwise addressing the
    falsifier, inspection alone as `inspected` and Asserted.
