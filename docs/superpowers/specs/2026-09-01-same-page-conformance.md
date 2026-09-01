# The Language Check and the Evidence Map

**Date:** 2026-09-01
**Status:** Draft for review
**Sibling:** 2026-09-01-same-page-technical-english.md (the language)
**Rule prefix:** CONF

Same Page Conformance names the evidence engine specified separately:
obligations, confirmed falsifiers, typed evidence records, assurance
policy, and verdicts. This spec covers two of that engine's siblings,
each of which stands alone and ships first: the language check and the
evidence map. The CONF prefix is permanent and does not move with the
name (LANG-052).

## Why this exists

A controlled language without a checker degrades into a style guide --
followed when remembered, drifting the rest of the time. And a spec
written in checkable language earns a second layer: once every
requirement carries a stable identifier, "does the implementation
honor the spec" stops being a vibe and becomes a map from identifiers
to evidence.

Conformance therefore has two surfaces, checked in order:

1. **The spec side -- the language check.** Is the normative text
   valid Same Page Technical English? Every deterministic check here
   cites the LANG rule it enforces; the two specs interlock at those
   citations.
2. **The implementation side -- the evidence map.** For each
   Agreed requirement identifier, what evidence exists that the
   implementation honors it?

The check reports; the developer rules. This spec inherits the
package's standing philosophy whole: surface the ambiguity, propose
the interpretation, confirm it. A checker that silently rewrites
specs has merely moved silent assumption-making into a script.

## Goals

- A repeatable language check any agent can run over a spec set,
  reporting findings by requirement identifier with the LANG rule
  violated and a proposed resolution.
- The deterministic subset as a dependency-free script in the drift
  gate's mold: node builtins only, runs under Node or Bun unchanged.
- An evidence map from Agreed requirement identifiers to
  implementation evidence, cited by path, honest about coverage.
- Findings that make specs better through the confirm-back loop,
  never through silent rewrites.

## Non-goals

- **Not an auto-rewriter.** The check never edits spec text. It
  surfaces, proposes, and waits (CONF-030).
- **Not a proof system.** Evidence is citation, not verification of
  correctness: a cited test can be wrong. Deterministic guarantees
  remain the job of the tests themselves, lint, and CI -- the same
  honesty boundary the drift gate states.
- **Not a file-to-feature verifier.** Mapping changed files to
  requirements automatically is not attempted, for the drift gate's
  stated reasons.
- **Not a grammar parser.** Deterministic checks are lexical and
  structural. Semantic judgment (referent ambiguity, synonym drift
  beyond Avoid lists) belongs to the model-run checks and the
  developer's ruling.

## The language check

Normative.

Canonical name: **the language check**. Script:
`skills/new-project/scripts/language-check.mjs`, delivered exactly as
the drift gate is -- inside the new-project skill so every install
channel carries it. Invocable standalone against a spec set
directory; the skills invoke it at the stage gates where normative
text is written or revised.

The check runs in two passes.

### Pass one -- deterministic (the script)

Lexical and structural findings only; zero false authority. Scope:
the normative sections named in the language spec's "Where SPTE
applies" table.

[CONF-001] The script MUST report a requirement identifier that does
not match `[PREFIX-NNN]` form, a duplicate identifier, or an
identifier whose prefix is not declared by its spec (enforces
LANG-050, LANG-051, LANG-053).

[CONF-002] The script MUST report a renumbered or reused identifier
when the spec set's git history makes the prior assignment visible
(enforces LANG-052). When history is unavailable, the script MUST
say so rather than pass silently.

[CONF-003] The script MUST report "should", "should not", "shall",
"will", and "needs to" in any letter case, and "RECOMMENDED" and
"OPTIONAL" in upper case only, in normative text (enforces
LANG-005). Lower-case "optional" and "recommended" are ordinary
adjectives; when one is genuinely ambiguous, pass two owns it.

[CONF-004] The script MUST report lower-case "must", "must not", and
"may" used normatively in normative text (enforces LANG-006).

[CONF-005] The script MUST report every banned qualifier from
LANG-030 found in normative text, unless the glossary defines that
term measurably.

[CONF-006] The script MUST parse `glossary.md` in its existing entry
format and report every unqualified `_Avoid_:` term found in
normative text (enforces LANG-013). An `_Avoid_:` term carrying a
parenthetical qualifier -- "out of scope (as a model verdict)" -- is
a conditional ban, and the condition is a judgment, so it belongs to
pass two. The glossary is the only terminology input; the check reads
no parallel data file.

[CONF-007] The script MUST report a normative sentence containing
more than one normative keyword as a suspected compound requirement
(enforces LANG-020).

[CONF-008] The script MUST report a requirement sentence whose
subject is "it", "this", "they", or "the system" (enforces LANG-021).

[CONF-009] The script MUST report a requirement sentence longer than
30 words (enforces LANG-024).

[CONF-010] The script MUST NOT modify any file.

[CONF-011] The script MUST exit zero on no findings and nonzero on
findings. The script MUST write its report to stdout.

[CONF-012] The script MUST identify normative text exactly as
LANG-060 and LANG-061 define it: the canonical headings with their
subsections, plus any section marked with the "Normative." line.

[CONF-013] The script MUST treat text inside double quotes, backtick
code spans, and fenced code blocks as mention, not use (LANG-062).
The script MUST NOT report findings from mentions.

[CONF-014] When a "Working vocabulary" entry in `glossary.md` differs
from the entry shipped in the glossary template beside the script and
carries no `_Ruling_:` line, the script MUST report the difference.
When the section or a shipped entry is missing, or when the section
holds an entry the template does not, the script MUST report it. This
enforces LANG-011 across projects: the standard dictionary gives every
project one sense of each term by default, and a project changes that
sense only by a ruling the developer has recorded on the entry. When
an entry carries a `_Ruling_:` line, the script MUST list the ruling
as information rather than report it. When the template is not beside
the script, the script MUST say so rather than pass silently.

### Pass two -- judgment (the model, in-session)

The findings a script cannot make honestly: a term used in two senses
neither of which the glossary rejects; distinct project terms
conflated ("revoked token" written where "expired token" was meant);
an undefined qualitative term not on the banned list; a referent that
parses but misleads; a parenthetically qualified `_Avoid_:` term used
inside its qualifying condition. These enforce LANG-010, LANG-011,
LANG-013, and LANG-021 beyond the lexical surface.

[CONF-020] The model MUST run pass two over normative text it wrote
or revised before presenting that text for confirmation.

[CONF-021] A pass-two finding MUST cite the sentence, the LANG rule,
and the glossary entries in tension, in the report format below.

### Report format

One finding block per issue, addressed by identifier, worked example:

```text
AUTH-014

"The service should gracefully handle invalid tokens."

SERVICE
  Ambiguous term. (LANG-013)
  Project vocabulary contains: authentication service

SHOULD
  Ambiguous normative strength. (LANG-005)
  Did you mean MUST or MAY?

GRACEFULLY
  Undefined qualitative term. (LANG-030)
  State the observable required behavior.

INVALID TOKEN
  "revoked token" and "expired token" are distinct
  project terms. (LANG-010) Specify which state applies.
```

### No silent rewrites

[CONF-030] For each finding, the writer of the fix MUST state the
proposed rewrite and its interpretation of intent. The writer MUST
NOT apply the rewrite to spec text before the developer confirms it.

[CONF-031] When a finding's resolution changes a term's meaning or
retires a term, the writer MUST revise the glossary in the same
change. The writer MUST log the collision under Flagged ambiguities.

## The evidence map

Normative.

One file in the spec set: `conformance.md`, sibling to `recon.md`.
One table per prefix, one row per identifier. Each column carries
exactly one meaning: coverage says whether cited evidence addresses
the requirement's falsifier, method names the mechanism that produced
that evidence. The two are never collapsed onto one axis.

```text
## BROKER

| Requirement | Coverage | Method | Evidence |
|---|---|---|---|
| BROKER-021 | Covered | integration | tests/broker/invalid_request.rs::rejects_invalid |
| BROKER-022 | Asserted | inspected | src/broker/dispatch.rs (authorization guard) |
| BROKER-023 | Uncovered | - | |
```

[CONF-040] Every Agreed requirement identifier in the spec set MUST
appear in `conformance.md` exactly once. A Withdrawn identifier MUST
leave the map in the same change that withdraws it: no obligation,
no evidence row.

[CONF-041] A row's coverage MUST be one of Covered, Asserted, or
Uncovered.

Covered means that cited evidence beyond implementation inspection
addresses the requirement's falsifier. Asserted means that
implementation is cited and no evidence mechanism addresses the
falsifier. Uncovered means that no evidence is claimed.

[CONF-042] Every evidence citation MUST be a path that exists in the
repository, with an optional `::identifier` locator. The script MUST
report citations to paths that do not exist.

[CONF-043] The map records evidence about Agreed requirements only.
An Observed requirement MUST NOT appear in the map: evidence of
as-built behavior belongs in `recon.md` citations until the section
is Agreed.

[CONF-044] The map is a claim register, not a contract: writing
Covered asserts that the cited evidence addresses the falsifier, and a
false Covered entry is drift like any other. The map MUST NOT change
any spec's Observed or Agreed status.

[CONF-045] A row's method MUST be one of `formal`, `model`,
`property`, `integration`, `test`, `static`, `inspected`, `manual`,
or `-`.

[CONF-046] When a row's method is `inspected`, the row MUST carry
coverage Asserted.

[CONF-047] When a row's coverage is Asserted, the row MUST carry
method `inspected`.

[CONF-048] When a row's coverage is Uncovered, the row MUST carry
method `-`.

[CONF-049] When a row's coverage is Uncovered, the row MUST NOT cite
evidence.

The method list is not a rank. A deterministic integration test that
executes the confirmed falsifier can establish more about one
requirement than a property search near it, and a formal result and an
integration result can establish different parts of one claim.
Implementation inspection alone addresses no falsifier, which is why
`inspected` and Asserted are two names for one row shape.

The vocabulary is deliberate and carries three axes:
Covered/Asserted/Uncovered describe coverage, the method column
describes the mechanism, and Observed/Agreed describe confirmation.
The three never mix.

## Workflow integration

The falsifier question joins the confirm-back loop wherever a
requirement becomes Agreed. When the developer confirms a `MUST` or
`MUST NOT` requirement, the model asks:

> What observable state would violate this agreed requirement?

The model states the proposed falsifier in its own words and the
developer confirms it, so the question doubles as a comprehension
test. A permission-only `MAY` requirement carries no falsifier,
because permitted behavior is not itself obligatory; when a limit on
permitted behavior matters, the limit is written as its own `MUST` or
`MUST NOT` requirement. The falsifier is recorded with the requirement it
belongs to. The language rules that govern how a falsifier is written
land with the engine specification, not here.

- `/new-project`: the language check runs at the close of each stage
  that writes normative text; findings resolve through the
  confirm-back loop before the stage closes. The falsifier question
  runs at Stage 4, as each requirement is confirmed. `conformance.md`
  is scaffolded with every identifier Uncovered and every method `-`
  -- an honest zero.
- `/existing-project`: Observed specs are written in SPTE (already
  the design's rule), so pass one runs on them as written; recon
  evidence flows into the map only as sections become Agreed. The
  falsifier question runs at the moment a section is confirmed, on
  both paths -- an Observed section carries no falsifier, because
  nobody has yet agreed what it should do.
- `/next-iteration`: staged specs under `iterations/next/` get pass
  one at capture, so promotion at iteration close is a status change,
  not a language cleanup. Promotion is an agreement point, so the
  falsifier question runs there.
- **The drift gate** gains audit item 6: did normative text written
  or revised this session pass the language check, and does
  `conformance.md` still tell the truth for requirements whose
  implementation this session touched? The gate stays a mandatory
  anchored self-audit; the script stays the deterministic floor
  beneath it.

## Package changes

The two specs land as revisions to existing package files, under the
repo's sync rules:

- `skills/new-project/templates/glossary.md` -- the standard
  dictionary additions from the language spec.
- `skills/new-project/templates/domain-spec.md` -- `Prefix:` line in
  the status header; capability and acceptance-criteria examples
  rewritten as identified SPTE requirements.
- `skills/new-project/templates/iteration.md` -- In / Out /
  definition-of-done examples in SPTE.
- `skills/new-project/templates/conformance.md` -- new template: the
  scaffolded map, all rows Uncovered.
- `skills/new-project/templates/00-overview.md` -- Purpose section
  references SPTE keywords instead of "shall".
- `skills/new-project/scripts/language-check.mjs` plus
  `tests/language-check.test.mjs` -- the pass-one script and its
  false-pass / false-block suite.
- The three SKILL.md files -- stage gates gain the language check at
  the points named under Workflow integration.
- `docs/WORKFLOW.md` -- the tool-neutral statement gains the language
  and the check.
- `2026-08-10-same-page-design.md` -- the drift gate section gains
  audit item 6; the spec set table gains `conformance.md`.
- `README.md` and the docs pages -- wherever behavior they describe
  changes.

## Acceptance criteria

- Every deterministic check (CONF-001 through CONF-014) cites the
  LANG rule it enforces, and running the script on this spec and the
  language spec together reports zero findings: the interlock closes
  and both specs stand under their own check.
- A glossary whose "Working vocabulary" entry differs from the shipped
  template without a ruling, or lacks the section or an entry, is
  reported; the shipped section passes, and a ruled entry passes with
  the ruling listed.
- The script is dependency-free, runs under Node and Bun unchanged,
  never writes, and its test suite covers the two failure modes of
  any gate: a false pass (slop flows through) and a false block
  (valid SPTE reported as a finding).
- The worked AUTH-014 example is reproduced by the check verbatim in
  structure when run against a fixture containing that sentence.
- A spec set with a populated `conformance.md` answers, for any
  Agreed identifier, "where is the evidence" with a path or an
  honest Uncovered, and answers "what produced it" from the method
  column rather than from the coverage word.
- Coverage and method are separable in the map, in the template, in
  the script's parsing, and in the tests: no check reads a mechanism
  out of a coverage value.
- Every Agreed `MUST` or `MUST NOT` requirement has a confirmed
  falsifier.
- No Observed requirement has a falsifier.
- No file in the spec set is ever modified by the check itself; every
  resolution passes through developer confirmation.

## Decisions and revisions

- 2026-09-01 -- Developer confirmed the three judgment calls shipped
  in 0.2.0 without a ruling at the time: the Asserted/inspected lock
  in both directions (CONF-046, CONF-047), the eight-kind method
  vocabulary enforced before the engine exists (CONF-045), and this
  spec's retitle. All three stand as written.
- 2026-09-01 -- CONF-014: the glossary's Working vocabulary entries
  are compared with the shipped template. The language spec's decision
  to ship the standard dictionary inside the glossary template stands;
  what was missing was enforcement, since every project's copy was
  editable and nothing compared it, and the template's own intro
  invited revising entries in place. The developer agrees to the
  standard terms at Stage 1 and may rule a term differently for the
  project; the ruling lives on the entry as a `_Ruling_:` line, so an
  agreed deviation is visible to the check and an unrecorded one is
  drift. The model states an ambiguous standard term before building
  on it, and the resolution is recorded under Flagged ambiguities.
  Alternatives rejected: a separate frozen dictionary file (a second
  terminology surface, when the comparison gives the same guarantee
  with one); a dictionary no project may change (forces the standard
  sense onto a project whose domain already owns the word).
- 2026-09-01 -- A `glossary.md` joins the package's own specs so the
  self-hosting run of the check exercises CONF-006. Until then the
  Avoid-term check was skipped on the very specs that define it, and
  the shipped template's `_Avoid_: conformance map` entry protected
  consumer projects only. The suite now fails if that skip returns.
- 2026-09-01 -- Remediation against the round-five Feature Spec
  consensus, three items. (a) The map's single Status column splits
  into Coverage and Method (CONF-041, CONF-045 through CONF-049):
  one meaning per column, so `inspected` stops hiding inside
  Asserted and `integration` stops hiding inside Covered. Covered is
  redefined against the requirement's falsifier rather than against
  "a cited test", which was the narrower claim. (b) The table is the
  evidence map; Same Page Conformance names the evidence engine
  specified separately, and this spec is retitled for the two
  siblings it actually covers. The filename and the CONF prefix
  stay: identifiers are permanent (LANG-052) and the date-stamped
  filename is a reference others hold. (c) The falsifier question
  joins the confirm-back loop in all three skills. The falsifier's
  own language rules are deliberately not added here; they land with
  the engine specification, so the language spec churns once rather
  than twice.
- 2026-09-01 -- Review pass, same day: script scope bound to
  LANG-060/061 (CONF-012) so "normative text" is deterministic;
  mention-is-not-use honored by the script (CONF-013);
  parenthetically qualified Avoid terms routed to pass two
  (CONF-006); Withdrawn identifiers leave the evidence map
  (CONF-040); package changes enumerated under the sync rules.
- 2026-09-01 -- Two-pass split: deterministic findings in a script,
  semantic findings by the model in-session. Alternative rejected: a
  single model-run check (loses the repeatable floor and CI
  invocability); a single script (would need to fake semantic
  judgment it cannot have).
- 2026-09-01 -- `conformance.md` as one file with per-prefix tables,
  not per-domain evidence sections inside the specs. Rationale:
  evidence churns with code while specs are contracts; separating
  them keeps spec diffs meaning "the agreement changed". Alternative
  rejected: evidence inline in domain specs (every refactor dirties
  the contract file).
- 2026-09-01 -- Covered/Asserted/Uncovered kept disjoint from
  Observed/Agreed. Rationale: one axis is evidence, the other is
  confirmation; merging them re-creates the ambiguity the package
  exists to remove.
- 2026-09-01 -- The drift gate extends to audit item 6; the
  2026-08-10 design spec's gate section is revised in the change
  that lands this spec, per the repo's sync rules.
- 2026-09-01 -- Script ships in `skills/new-project/scripts/` beside
  the drift gate, for the same delivery reason: the core Agent Skills
  spec defines no hooks frontmatter, and new-project is the skill
  every channel installs.
