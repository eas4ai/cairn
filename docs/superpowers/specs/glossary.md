# Glossary

Canonical language for the Same Page package's own specifications: the
design spec, the language spec, and the language check and evidence map
spec. The language check reads this file's Avoid lines whenever it scans
this directory, so the specs that define the check are held to the same
vocabulary discipline they prescribe. Entries follow the shipped glossary
template's format: bold term, tight definition, then an Avoid line. An
unqualified Avoid term is banned outright in normative text; a
parenthetically qualified one is banned only under that condition and is
left to pass two.

## Working vocabulary

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

**Requirement**:
A single identified normative statement. One sentence, one obligation,
one identifier.
_Avoid_: rule (reserved for language rules), constraint (unless it is
one), feature (a feature contains requirements)

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

**Observed**:
Spec text drafted from reading the code: what the system does, cited,
not yet confirmed by the developer as what it should do. Not contract.
_Avoid_: documented (says nothing about confirmation), as designed

**Agreed**:
Spec text the developer has confirmed describes both what the system does
and what it should do. Only Agreed sections enter an iteration contract.
_Avoid_: approved (implies a process this methodology does not have),
final (as a section status)

**Iteration**:
The current scope contract (iterations/NNN.md): what ships now, what
explicitly does not.
_Avoid_: sprint, phase

**Drift**:
Any divergence between an artifact and reality -- in code, specs, or
vocabulary.
_Avoid_: slippage, staleness

**Defer**:
A developer verdict that moves agreed work out of scope. Models surface;
only the developer defers.
_Avoid_: out of scope (as a model verdict), later, phase 2

## Relationships

Same Page Technical English is the language; the language check
verifies text written in it; the evidence map records what the code
proves about requirements written in it; Same Page Conformance is the
engine that will consume the map. The drift gate audits a session
against all of them once, at completion.

## Flagged ambiguities

- **Conformance** -- collided between the engine and the checker plus
  map that this package ships; resolved on 2026-09-01: the name belongs
  to the engine, the shipped spec is titled for the two things it
  covers, and the CONF identifier prefix stays because identifiers are
  permanent.
- **Status** -- collided between a spec's confirmation state (Observed,
  Agreed) and the evidence map's old single column; resolved: the map
  carries Coverage and Method, and "status" names neither.
