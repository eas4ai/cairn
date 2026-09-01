# /new-project

## What it does

Guides you and your agent through creating a complete spec set for a
project -- glossary, keystone overview, ux spec, numbered domain specs,
conventions, and an iteration contract -- through a staged conversation
where every artifact is confirmed in the model's own words before it is
written. Onboards your development practices once, on first run.

## When to reach for it

Starting a new project; standardizing how your team documents projects.
For a codebase that already exists, reach for /existing-project.

## Common questions

Q: Do I have to do the onboarding?
A: No. Decline it and the shipped defaults apply; it never re-asks.

Q: Does it work on existing code?
A: It hands off. When Stage 0 finds a codebase, or a spec set that
already exists, it switches to /existing-project, which reads the code
first, drafts observed specs from evidence or verifies the existing ones,
and asks you to correct -- the same spec set, reached from the other
direction.

Q: How big does my project need to be?
A: Any size. Depth is calibrated in Stage 0; a small tool gets a keystone
overview plus one domain spec.

Q: What keeps the specs unambiguous?
A: Normative text is written in Same Page Technical English -- one
obligation per sentence, MUST / MUST NOT / MAY, named actors,
requirement identifiers -- and a deterministic language check runs
before stages close. Every requirement you agree to also gets a
falsifier: the model asks what observable state would violate it, and
you confirm. The contract stage scaffolds conformance.md, the evidence
map, tying every requirement to its coverage, the method behind it,
and the evidence itself.

## It's working if

Sessions stop re-litigating settled decisions; new sessions load the
working agreement and act consistently; disagreements about what a term
means end with a glossary entry instead of a rewrite. The standard
dictionary reads the same in every project you run this in, and where
you ruled a term differently, the ruling sits on the entry.
