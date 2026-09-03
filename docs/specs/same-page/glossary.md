# Glossary

Canonical language for the Same Page package's own specifications: the
design spec, the language spec, the language check and evidence map
spec, and the engine spec under docs/superpowers/specs/, and the spec
set that governs the package's own build in this directory. The
self-hosting check scans both directories as one corpus and reads this
file's Avoid lines, so the specs that define the check are held to the
same vocabulary discipline they prescribe. The Working vocabulary section below
is the standard dictionary, verbatim from the shipped glossary template;
the check reports any entry that differs without a recorded ruling
(CONF-014). The package's own terms live under Project terms.

## Working vocabulary

**Done**:
Implemented and verified. Code without its verification is not done.
_Avoid_: mostly done, done pending tests

**Complete**:
Nothing agreed remains. Work is complete or it is not.
_Avoid_: essentially complete, complete except

**Defer**:
A developer verdict that moves agreed work out of scope. Models surface;
only the developer defers.
_Avoid_: out of scope (as a model verdict), later, phase 2

**MVP**:
Not used in this methodology. The spec is the scope; there is no smaller
version of done.
_Avoid_: slim version, first cut, v1 scope

**Refactor**:
A behavior-preserving change. If behavior changes, it is a feature or a fix.
_Avoid_: rewrite (unless it truly is one), cleanup (when behavior changes)

**Spec**:
The agreed contract for a domain. Normative, not advisory.
_Avoid_: notes (as a name for a spec), suggestions (as a name for a spec)

**Iteration**:
The current scope contract (iterations/NNN.md): what ships now, what
explicitly does not.
_Avoid_: sprint, phase

**Drift**:
Any divergence between an artifact and reality -- in code, specs, or
vocabulary.
_Avoid_: slippage, staleness

**Observed**:
Spec text drafted from reading the code: what the system does, cited,
not yet confirmed by the developer as what it should do. Not contract.
_Avoid_: documented (says nothing about confirmation), as designed

**Agreed**:
Spec text the developer has confirmed describes both what the system does
and what it should do. Only Agreed sections enter an iteration contract.
_Avoid_: approved (implies a process this methodology does not have),
final (as a section status)

**Requirement**:
A single identified normative statement. One sentence, one obligation,
one identifier.
_Avoid_: rule (reserved for language rules), constraint (unless it is
one), feature (a feature contains requirements)

**State**:
The stored condition of a thing at a moment, enumerable and testable.
_Avoid_: status (when state is meant)

**Status**:
A reported summary of state for a reader. A status is derived; a state
is stored.
_Avoid_: state (when status is meant)

**Capability**:
Something the system can do, spec'd as a set of requirements under a
domain.
_Avoid_: functionality, feature set

**Dependency**:
A thing that must exist or hold before another thing works, named
explicitly.
_Avoid_: prerequisite, assumption (an assumption is unverified)

**Interface**:
The agreed surface between two components: operations, inputs,
outputs, errors.
_Avoid_: API (when the surface is not an API), contract (reserved for
iteration contracts)

**Defect**:
A violation of an Agreed requirement, recorded in
defects/<slug>.md.
_Avoid_: bug (colloquial), issue (tracker artifact)

**Verify**:
To confirm by executing a check -- a test, a lint, a measurement.
Reading is review, not verification.
_Avoid_: validate (unless input validation), check (as a verb for
reading)

**Reject**:
To refuse an input or request with an observable error result. Silent
dropping is not rejection.
_Avoid_: ignore (when rejection is meant), discard (when rejection is
meant)

**Falsifier**:
The observable state that would violate a requirement, named by the
model and confirmed by the developer at the moment the requirement
becomes Agreed. A requirement without a confirmed falsifier has been
written but not understood.
_Avoid_: failure case, negative test (a test is one way to address a
falsifier, not the falsifier itself)

**Evidence map**:
The committed claim register (`conformance.md`) tying each Agreed
requirement identifier to its coverage, the method that produced its
evidence, and the cited evidence.
_Avoid_: conformance map

**Coverage**:
Whether cited evidence addresses a requirement's falsifier: Covered,
Asserted, or Uncovered. Coverage never names the mechanism.
_Avoid_: status (when coverage is meant)

**Method**:
The mechanism that produced a piece of evidence: formal, model,
property, integration, test, static, inspected, or manual. The list
is not a rank.
_Avoid_: evidence level, confidence

## Project terms

**Same Page Technical English**:
The controlled language for normative spec text: one obligation per
sentence, exactly one of the three normative keywords, the actor named,
the condition first, permanent identifiers. Abbreviated SPTE.
_Avoid_: simplified English (the ASD-STE100 name), plain English (a
style, not a rule set)

**Normative text**:
Text under a canonical heading, or in a section whose first line is
"Normative.": the only text that states obligations and the only text
the language check scans.
_Avoid_: prose (when normative text is meant)

**Mention**:
A normative keyword or banned term inside quotes, a code span, or a
fenced block. A mention names a word; it states nothing.
_Avoid_: reference (when a mention is meant)

**Language check**:
The two-pass verification of normative spec text: pass one is the
script and is deterministic; pass two is the model in-session and is
judgment. The check reports and never writes.
_Avoid_: linter (a linter rewrites; the check reports), spell check

**Standard dictionary**:
The Working vocabulary section of every glossary: the terms where model
priors and developer intent split, defined once by Same Page and
identical in every project by default. A project changes an entry
only by a recorded ruling, and the language check reports any change
without one.
_Avoid_: working vocabulary (as a name for something freely editable)

**Same Page Conformance**:
The evidence engine specified in
2026-09-02-same-page-conformance-engine.md (prefix ENG), built on the
language check and the evidence map, and built as iteration contracts
over its construction layers. The name is reserved for the engine; the
check and the map sit beneath it and are not it.
_Avoid_: conformance (as a name for the language check or the evidence
map)

**Obligation**:
The engine's persistent projection of one Agreed requirement: its
identifier, locator, digests, confirmed falsifier, assurance profile,
and validator references. Keyed on the requirement identifier; never a
second contract.
_Avoid_: contract (when an obligation is meant), task (when an
obligation is meant)

**Evidence record**:
The unit of machine-evaluable belief: one record per evidence
mechanism run, carrying the independent axes method (`kind`), binding
basis, sensitivity, freshness, dependency provenance, and assumptions.
_Avoid_: proof (when a record is meant), result (when a record is
meant)

**Binding basis**:
Why the engine believes an evidence record corresponds to its
obligation: `none`, `attested` (a named actor mapped it), or
`backend` (a trusted adapter established it).
_Avoid_: link (when a binding basis is meant)

**Sensitivity**:
Whether an evidence mechanism has demonstrated that it notices a
realization of the confirmed falsifier: `unchallenged`, `challenged`,
or `not_applicable`.
_Avoid_: strength (when sensitivity is meant), mutation score

**Challenge**:
Any deliberate attempt to realize or expose the confirmed falsifier:
mutation, fault injection, a negative fixture, a controlled double, a
counterexample search, an adversarial input, a harness. A challenge
that derives from the falsifier is recorded as such.
_Avoid_: mutation (as a synonym for challenge)

**Weak sensitivity**:
What the engine records when a validator passes a challenge that
realizes the confirmed falsifier: the mechanism does not notice the
violating state, so no challenged claim of that validator stands.
_Avoid_: false negative (when weak sensitivity is meant)

**Freshness**:
Whether an evidence record is current for its exact recorded inputs
and source snapshot, inside the recorded verification boundary:
`current`, `stale`, or `unknown`. Unknown is never green.
_Avoid_: up to date (when freshness is meant)

**Dependency provenance**:
How an evidence record's dependency set was established:
`conservative`, `adapter_derived`, or `traced_supplemental`. A
supplemental trace enriches and never silently narrows.
_Avoid_: coverage (when provenance is meant)

**Residual assumption**:
A named input the engine did not verify but the evidence depends on: a
verifier version, a toolchain, a container digest, an external
contract. Always reported, never absorbed into correctness.
_Avoid_: caveat (when a residual assumption is meant)

**Source snapshot**:
The immutable identity evidence is bound to: `git:<commit-sha>` for a
clean tree, `workspace:<digest>` for a dirty one. Workspace evidence
never passes as commit evidence.
_Avoid_: version (when a snapshot is meant), build (when a snapshot is
meant)

**Verification boundary**:
The recorded envelope inside which the engine claims freshness: root,
dependency scope, selected inputs, validator definition, fingerprints,
declared contracts, named assumptions. Residual risk outside it is
explicit.
_Avoid_: scope (when the boundary is meant)

**Evidence identity**:
Every input whose change invalidates an evidence claim: snapshot,
requirement and falsifier digests, obligation digest, validator
digest, adapter identity, dependency and environment fingerprints.
Policy is not part of it.
_Avoid_: cache key (when evidence identity is meant)

**Machine view**:
The coverage the engine computes from the evidence records of one
obligation: Covered, Asserted, or Uncovered, with the methods that
addressed the falsifier. Compared with the evidence map, never written
into it except by `same-page sync-map`.
_Avoid_: report (when the machine view is meant)

**Environment fingerprint**:
The recorded values of the inputs a validator definition declares
under `environment:`: a command's output or a file's digest, exactly
those and nothing else. Drift outside the declaration is residual
risk, never a claim.
_Avoid_: toolchain hash (when the fingerprint is meant)

**Verification authority**:
Which execution context's evidence counts as authoritative for a
snapshot: `ci`, `local`, or `named-environment`. Non-authoritative
evidence stays visible and never overwrites authoritative evidence.
_Avoid_: source of truth (when authority is meant)

**Validator**:
A declared mechanism that produces evidence for an obligation. The
floor is direct argv execution; a shell is explicit opt-in; execution
always needs an execution trust context.
_Avoid_: test (when a validator is meant), checker (when a validator
is meant)

**Adapter**:
Registered, trusted code that integrates an evidence backend and holds
explicit capabilities: binding, complete dependencies, challenge,
formal or model results. A validator result never awards itself a
capability.
_Avoid_: plugin (when an adapter is meant), integration (when an
adapter is meant)

**Execution trust**:
The context under which the engine may run a validator or adapter:
explicit developer invocation, owner-controlled CI, an externally
recorded trust grant, or a named trusted environment.
_Avoid_: permission (when execution trust is meant)

**Trust anchor**:
The record, outside the evaluated repository, that grants execution
trust to a validator or adapter identity and configuration digest.
Repository content can request trust and cannot grant it.
_Avoid_: allowlist (when a trust anchor is meant)

**Assurance profile**:
The composition of evidence properties sufficient for a requirement:
methods, alternatives, binding, attestation, sensitivity, authority,
named assumptions. Current freshness is always required. Project and
domain defaults apply unless a requirement needs an exception.
_Avoid_: assurance level, tier (when a profile is meant)

**Policy**:
The committed file, `.same-page/policy.yaml`, that names the spec
directories the engine reads, the assurance profiles, the project
default, and the domain overrides. Written by the first elaboration;
the developer's to edit. A change to policy re-evaluates evidence; it
never makes evidence stale.
_Avoid_: config (when policy is meant)

**Verdict**:
The single outcome of policy evaluation for one requirement:
`FAILING`, `BLOCKED`, `INSUFFICIENT`, or `SUFFICIENT`, evaluated in
that order.
_Avoid_: score (when a verdict is meant), grade (when a verdict is
meant), pass (when a verdict is meant)

**Policy downgrade**:
A policy change that reduces the assurance required for an existing
Agreed requirement. Surfaced with old and new policy, confirmed by the
developer, and logged; hidden, it is drift.
_Avoid_: relaxation (when a downgrade is meant)

**Standing disproof**:
Authoritative evidence that a requirement's falsifier occurred: a last
verdict of `FAILING` or a current authoritative counterexample. A
revision that would clear it is surfaced, acknowledged, and logged,
and the disproof stays as history.
_Avoid_: known failure (when a standing disproof is meant)

**Requirement locator**:
The spec file path plus the requirement identifier, together locating
one requirement in the spec set. Stored on the obligation (ENG-015).
_Avoid_: pointer

**Canonical text**:
A requirement's sentences as the engine digests them: the lines under
its identifier up to the next identifier, blank line, Falsifier line,
or Agreed line, with whitespace collapsed to single spaces. The engine
digests canonical text, never raw bytes, so re-wrapping a paragraph
does not invalidate an obligation and changing a word does.
_Avoid_: raw text (when the digest input is meant)

**Digest**:
The SHA-256 of canonical text, written `sha256:<hex>`. The requirement
digest covers the requirement; the falsifier digest covers the
confirmed falsifier. A mismatch invalidates the obligation and every
evidence record bound to it (ENG-015, ENG-019).
_Avoid_: hash (when the stored value is meant), checksum

**Elaboration**:
The stage-close step that turns each confirmed requirement and its
falsifier into an obligation file under `.same-page/obligations/`, with
the inherited assurance profile applied and no hand-authoring
(ENG-206, ENG-207, ENG-211).
_Avoid_: generation (when elaboration is meant), sync (when elaboration
is meant)

**Disproof-clearing revision**:
A revision of an Agreed requirement or its falsifier that invalidates
an obligation carrying a standing disproof. Surfaced as a finding,
acknowledged by the developer, logged, and the prior disproof kept as
history (ENG-112 through ENG-118).
_Avoid_: reset

**Manual evidence**:
An evidence record produced by a named human: actor, timestamp,
snapshot, description, coarse bindings, and an expiry or
re-attestation policy. Covered only when the human addressed the
falsifier; never immortal.
_Avoid_: sign-off (when manual evidence is meant)

**Drift gate**:
The one-shot completion hook that audits a session against the
iteration contract and the ruleset. It fires once per session and fails
open.
_Avoid_: hook (as a name for the gate; the hook is its registration)

**Spec set**:
The directory of specs a project agrees to: a keystone overview,
numbered domain specs, glossary, conventions, iteration contracts, and
the evidence map. This package's own spec set lives under
docs/specs/same-page/, its four normative specs under
docs/superpowers/specs/, and both are governed by the same rules.
_Avoid_: docs (as a name for the spec set), documentation (as a name
for the spec set)

## Relationships

Same Page Technical English is the language; the standard dictionary is
its fixed vocabulary; the language check verifies text written in it;
the evidence map records what the code proves about requirements
written in it; Same Page Conformance is the engine that will consume
the map. The drift gate audits a session against all of them once, at
completion.

## Flagged ambiguities

- **Conformance** -- collided between the engine and the checker plus
  map that this package ships; resolved on 2026-09-01: the name belongs
  to the engine, the shipped spec is titled for the two things it
  covers, and the CONF identifier prefix stays because identifiers are
  permanent.
- **Status** -- collided between a spec's confirmation state (Observed,
  Agreed) and the evidence map's old single column; resolved: the map
  carries Coverage and Method, and "status" names neither.
