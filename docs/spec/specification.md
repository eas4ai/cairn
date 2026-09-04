# The specification phase

Status: Draft
Prefix: SPEC

Normative.

## What this phase produces

The keystone, the glossary, one domain spec per domain the project has,
the roadmap, and the first commitment. Nothing else is scaffolded.

[SPEC-001] The agent MUST NOT create a spec file it has no content for.
Falsifier: a spec file exists whose sections are headings with no
requirements under them.

## Agreement

[SPEC-002] The agent MUST NOT record a requirement as Agreed before the
developer confirms its falsifier.
Falsifier: a requirement carries an Agreed marker and no confirmed
falsifier.

[SPEC-003] The agent MUST state its understanding in its own words
before it writes an artifact.
Falsifier: the agent writes a spec section whose content the developer
has not seen restated.

[SPEC-004] The agent MUST propose the falsifiers for a domain as one set
and MUST ask the developer to correct only the ones that are wrong.
Falsifier: the agent asks the developer to approve falsifiers one at a
time.

## Ambiguity

The rule this replaces made asking the only response to ambiguity, which
produced an interrogation. Recording is the third option.

[SPEC-005] When the agent meets an ambiguity it can resolve from the
specification, the conventions, or common practice, the agent MUST
resolve it, MUST record the reading, and MUST NOT ask the developer.
Falsifier: the agent asks the developer a question whose answer its own
recorded reasoning already determined.

[SPEC-006] The agent MUST ask the developer about an ambiguity only when
the answer is a preference, a priority, or a fact outside the
repository.
Falsifier: the agent asks a question that the specification already
answers.

[SPEC-007] The agent MUST record every ambiguity it resolved without
asking, where the developer can review it.
Falsifier: the agent resolved an ambiguity and no artifact records the
reading it chose.

## Depth and shape

[SPEC-008] The agent MUST infer documentation depth from the project and
MUST NOT ask the developer to choose it before any domain is specified.
Falsifier: the agent asks how much documentation is warranted before the
project's domains are known.

[SPEC-009] The agent MUST derive the set of domains from the project and
MUST NOT impose a fixed set.
Falsifier: a project's spec set contains a domain the project has no
content for.

## Vocabulary

[SPEC-010] When a term carries different meanings for the developer and
the agent, the agent MUST add the term to the glossary at its first
occurrence.
Falsifier: a term appears with two meanings across the specification and
the glossary does not define it.

## Ending the phase

The loop does not wait for the whole specification. It waits for one
commitment.

[SPEC-011] The specification phase MUST end when the keystone, the
glossary, and the first commitment are Agreed.
Falsifier: the loop starts while a requirement inside the first
commitment has no confirmed falsifier.

[SPEC-012] The agent MUST specify a later commitment during the loop,
and MUST NOT require the whole roadmap to be specified before work
starts.
Falsifier: a documented step tells the developer that every commitment
must be specified before implementation begins.
