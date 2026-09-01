# Same Page Technical English -- The Language

**Date:** 2026-09-01
**Status:** Draft for review
**Sibling:** 2026-09-01-same-page-conformance.md (checking and evidence)
**Rule prefix:** LANG

## Why this exists

The target is not better documentation. It is a controlled natural
language for software specifications.

Model prose optimizes for variety, flow, and register -- exactly the
qualities that make specifications ambiguous. This sentence reads well
and specifies nothing:

> The broker should gracefully handle invalid plugin requests while
> ensuring that unauthorized operations are appropriately rejected.

Three undefined qualifiers, one ambiguous normative keyword, two
requirements fused into one sentence. The same intent in controlled
form:

```text
[BROKER-021]
When a plugin sends an invalid request, the broker MUST reject the
request.

[BROKER-022]
The broker MUST NOT execute an operation that the plugin is not
authorized to use.
```

Now the reader knows exactly what must happen, and a verification
layer has something to verify. Compatibility gets the same treatment:
"the system should preserve compatibility with older SDK clients
whenever possible" is prose; "[PROTO-014] Broker version 3 MUST accept
every valid request produced by SDK version 2" is a contract.

ASD-STE100 proves the method: a controlled language is writing rules
plus a controlled dictionary; where ordinary English offers several
synonyms, the dictionary approves one; subject-specific technical
terms live in company and domain terminology sources rather than in
the universal dictionary. Same Page adopts the method and builds its
own rules and dictionary from scratch. "ASD-STE100" and "Simplified
Technical English" are registered marks of the ASD; this language is
named **Same Page Technical English** (SPTE), claims no compliance
with the ASD standard, and copies none of its rule text or dictionary
(reference copy: `reference/`, vendored for study only).

The mission statement:

> Same Page specifications use a controlled form of technical English
> designed to minimize semantic ambiguity between developers, coding
> agents, implementations, and future verification systems. Prefer
> precision over variety, explicitness over elegance, and consistent
> terminology over natural-language style.

## Goals

- Specs that read like competent engineering English: short, direct,
  repetitive where repetition preserves meaning, deliberately boring.
- One writer-independent reading per requirement: developer, model,
  and checker parse the same sentence to the same obligation.
- Human-readable specs without model slop; machine-readable-enough
  semantics without forcing humans to write a formal DSL.
- A language defined tightly enough that the sibling spec can check
  it: every rule here that admits a deterministic check carries an ID
  the checker cites.

## Non-goals

- **Not a replacement for technical vocabulary.** Specs still say
  ABI, RPC, capability, sandbox, broker, manifest, hash, lease. SPTE
  makes the English around that vocabulary unambiguous; it never
  simplifies the concepts themselves.
- **Not a general prose style.** SPTE governs normative text (see
  "Where SPTE applies"). Rationale, overview narrative, ux journeys,
  and docs pages remain plain English.
- **Not a formal grammar.** SPTE is rules over English, enforced by
  lint and judgment, not a parser-defined syntax.
- **Not ASD-STE100.** Method adopted; content original; no compliance
  claimed or implied.

## The layer architecture

```text
          SAME PAGE LANGUAGE
                 |
       standard dictionary
       writing rules
       normative semantics
                 |
                 v
           DOMAIN LANGUAGE
                 |
        technical vocabulary
        (ABI, RPC, broker, lease)
                 |
                 v
          PROJECT GLOSSARY
                 |
        project-specific terms
        (glossary.md, Avoid lists)
                 |
                 v
           SAME PAGE SPECS
                 |
        unambiguous contracts
                 |
                 v
       SAME PAGE CONFORMANCE
                 |
       language check +
       implementation evidence
```

Three dictionary layers, one resolution rule: the most specific layer
wins. The **standard dictionary** ships with the methodology inside
the glossary template's working vocabulary -- the terms where model
priors and developer intent split, defined once for every project.
The **domain language** is the technical vocabulary of the project's
field; SPTE admits it freely on the condition that it is defined. The
**project glossary** (`glossary.md`) is where both domain terms and
project-specific terms land, in the existing entry format: bold term,
tight definition, `_Avoid_:` rejected synonyms. The glossary is
therefore already the controlled-dictionary mechanism; SPTE adds no
second terminology file.

## Normative keywords

Normative.

[LANG-001] A normative statement MUST use exactly one of the
keywords "MUST", "MUST NOT", or "MAY".

[LANG-002] "MUST" states behavior whose absence is a defect.

[LANG-003] "MUST NOT" states behavior whose presence is a defect.

[LANG-004] "MAY" states behavior that is permitted; its absence is
not a defect.

[LANG-005] A normative statement MUST NOT use "SHOULD", "SHOULD
NOT", "RECOMMENDED", "OPTIONAL", "shall", "will", or "needs to" as a
normative keyword.

[LANG-006] The writer MUST write normative keywords in upper case.

[LANG-007] When a recommendation is worth recording, the writer MUST
record it as a Note or as rationale, phrased with "recommended". The
writer MUST NOT phrase a recommendation as a requirement.

[LANG-008] A requirement MUST use present tense: the obligation lives
in the normative keyword, never in "will". LANG-005 bans "will" as a
keyword; this rule bans future tense in the rest of the sentence.

Rationale for excluding "SHOULD": "SHOULD" is a requirement with
unstated exceptions -- the reader cannot tell whether a given
deviation is one of them. In this methodology the developer rules on
exceptions, not the sentence. What RFC-style writing marks "SHOULD"
becomes either a MUST (the exceptions are enumerated as conditions)
or a Note (it was advice all along). This is a deliberate divergence
from RFC 2119 and is the single largest ambiguity source it removes.

## Writing rules

Normative.

### Terminology

[LANG-010] For one concept, a spec set MUST use one term. Two terms
for one concept is a finding; two concepts under one term is a
finding.

[LANG-011] When a spec uses a term that has a glossary entry, the
spec MUST use the term in the glossary's sense.

[LANG-012] When normative text introduces a term that is not plain
English and not in the glossary, the writer MUST add the glossary
entry in the same change.

[LANG-013] Normative text MUST NOT contain a term that the glossary
lists on an `_Avoid_:` line.

### Sentences

[LANG-020] A sentence in normative text MUST state at most one
requirement. The writer MUST split compound requirements.

[LANG-021] A requirement MUST name its actor. A requirement MUST NOT
use "it", "this", "they", or "the system" as its subject. A named
actor is always available in a one-sentence requirement; the ban is
outright so the check needs no referent judgment.

[LANG-022] When a requirement is conditional, the condition MUST come
first: "When X occurs, the broker MUST Y."

[LANG-023] A requirement MUST use active voice unless the actor is
genuinely unknown or irrelevant, and that case is rare enough to be
confirmed with the developer.

[LANG-024] A requirement sentence longer than 30 words is a finding:
the writer MUST split it or confirm it with the developer as
irreducible.

### Qualifiers

[LANG-030] Normative text MUST NOT contain a vague qualifier. The
banned list: "quickly", "appropriately", "normally", "gracefully",
"robustly", "efficiently", "seamlessly", "easily", "simply",
"properly", "adequately", "reasonably", "as needed", "where
possible", "if necessary", "whenever possible", "best-effort". A
banned qualifier becomes usable only by gaining a measurable glossary
definition.

[LANG-031] A quality requirement (performance, capacity, latency)
MUST state a measurable bound and its measurement condition, or it is
rationale, not requirement.

### Separation

[LANG-040] A spec MUST separate requirement from rationale: a
requirement states behavior; rationale explains it, in adjacent
plain-English text or in the spec's decisions log.

[LANG-041] Examples and diagrams are non-normative unless a
requirement references them by identifier.

## Requirement identifiers

Normative.

[LANG-050] Every requirement in a spec that declares a prefix MUST
carry an identifier of the form `[PREFIX-NNN]`, placed on its own
line above the requirement or opening the requirement's line.

[LANG-051] A spec that contains identified requirements MUST declare
exactly one prefix in its status header (`Prefix: BROKER`). The
overview's spec map MUST list every prefix. A prefix is unique
within a spec set.

[LANG-052] An identifier is permanent: the spec set MUST NOT
renumber identifiers. The spec set MUST NOT reuse a retired
identifier. A withdrawn requirement keeps its identifier with the
text replaced by `Withdrawn: date -- reason`.

[LANG-053] NNN is three digits, assigned in increasing order; gaps
are allowed and carry no meaning.

## Where SPTE applies

Normative.

| Spec set text | SPTE |
|---|---|
| Domain spec capability statements | Normative -- full SPTE with identifiers |
| Acceptance criteria (feature, domain, iteration) | Normative -- full SPTE; identifiers when the domain declares a prefix |
| Iteration contract In / Out / definition of done | Normative -- full SPTE |
| Defect record expected behavior | Normative -- cites the Agreed identifier it violates |
| Overview cross-cutting requirements | Normative -- full SPTE with identifiers |
| Overview narrative, principles, rationale | Plain English |
| `ux.md` journeys and flows | Plain English; step form (`user action -> system response`) already carries the discipline |
| Glossary definitions | Plain English written in the glossary's own terms |
| Decisions logs, recon report | Plain English |

Observed sections are written in SPTE too -- the designed shape, so
confirmation is a status change, not a rewrite. An Observed
requirement carries its identifier from birth.

The table binds by heading, so the check needs no judgment to find
its scope:

[LANG-060] A spec set MUST use the template headings for its
normative sections ("Capabilities", "Acceptance criteria",
"Cross-cutting requirements", "In", "Out", "Definition of done",
"Expected behavior"); the applies table is keyed to those headings,
and a normative heading covers its subsections.

[LANG-061] A spec MAY mark any other section normative by placing
the line "Normative." directly under the section heading; the marker
covers the section and its subsections. This spec marks its own rule
sections this way, so the language stands under its own check.

[LANG-062] Mention is not use: a term inside double quotes, a
backtick code span, or a fenced code block is a mention, and no
terminology or keyword rule applies to it. This is how LANG-005 and
LANG-030 name the words they ban without violating themselves.

## Standard dictionary additions

The glossary template's working vocabulary already defines done,
complete, defer, MVP, refactor, spec, iteration, drift, Observed, and
Agreed. SPTE adds the terms specifications lean on hardest, in the
same entry format, shipped in the same template section:

**Requirement**:
A single identified normative statement. One sentence, one obligation,
one identifier.
_Avoid_: rule (reserved for language rules), constraint (unless it is
one), feature (a feature contains requirements)

**State**:
The stored condition of a thing at a moment, enumerable and testable.
_Avoid_: status (different term)

**Status**:
A reported summary of state for a reader. A status is derived; a state
is stored.
_Avoid_: state (different term)

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
`defects/<slug>.md`.
_Avoid_: bug (colloquial), issue (tracker artifact)

**Verify**:
To confirm by executing a check -- a test, a lint, a measurement.
Reading is review, not verification.
_Avoid_: validate (unless input validation), check (as a verb for
reading)

**Reject**:
To refuse an input or request with an observable error result. Silent
dropping is not rejection.
_Avoid_: ignore, discard (different behaviors -- specify which)

## Acceptance criteria

- Every rule in this spec is itself written in SPTE and carries a
  LANG identifier: the language self-hosts.
- The sibling conformance spec cites a LANG identifier for every
  deterministic check it defines, and no LANG rule that admits a
  deterministic check lacks one.
- A model-prose requirement rewritten into SPTE loses no obligation
  and gains no unstated one, demonstrated by the worked pairs in this
  spec.
- The glossary template carries the standard dictionary additions;
  no new terminology file exists.
- A developer reading a domain spec written in SPTE can state, for
  any sentence, whether it is requirement or rationale, and for any
  requirement, the exact condition under which it is violated.

## Decisions and revisions

- 2026-09-01 -- Review pass, same day: pronoun subjects banned
  outright (LANG-021) so the deterministic check needs no referent
  judgment; present tense stated as a rule (LANG-008); normative
  scope made deterministic by heading binding plus the "Normative."
  marker (LANG-060, LANG-061); mention-is-not-use added (LANG-062)
  so the language can name the words it bans and still pass its own
  check.
- 2026-09-01 -- SHOULD excluded from normative keywords (LANG-005,
  LANG-007). Alternatives rejected: RFC 2119 adoption wholesale
  (imports SHOULD's unstated-exception ambiguity, the largest single
  source of drift between writer intent and reader obligation).
- 2026-09-01 -- Named Same Page Technical English; "Simplified
  Technical English" avoided as an ASD registered mark. The method is
  borrowed, the dictionary and rules are original.
- 2026-09-01 -- The standard dictionary ships inside the glossary
  template's working vocabulary rather than as a separate file: the
  glossary is already the project's controlled dictionary, its
  `_Avoid_:` format is already the one-approved-word mechanism, and
  one terminology surface beats two.
- 2026-09-01 -- Requirement identifiers apply only in specs that
  declare a prefix (LANG-050); ux.md and narrative sections stay
  plain English. Alternative rejected: SPTE everywhere (turns
  journeys and rationale into stilted pseudo-requirements and buries
  the normative signal).
