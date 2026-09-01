# Glossary

Canonical language for the Same Page package's own specifications: the
design spec, the language spec, and the language check and evidence map
spec. The language check reads this file's Avoid lines whenever it scans
this directory, so the specs that define the check are held to the same
vocabulary discipline they prescribe. The Working vocabulary section below
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
The evidence engine specified separately from this package:
obligations, validators, evidence records, verdicts. The name is
reserved for the engine; the language check and the evidence map sit
beneath it and are not it.
_Avoid_: conformance (as a name for the language check or the evidence
map)

**Drift gate**:
The one-shot completion hook that audits a session against the
iteration contract and the ruleset. It fires once per session and fails
open.
_Avoid_: hook (as a name for the gate; the hook is its registration)

**Spec set**:
The directory of specs a project agrees to: a keystone overview,
numbered domain specs, glossary, conventions, iteration contracts, and
the evidence map. This package's own specs live under
docs/superpowers/specs/ and are governed by the same rules.
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
