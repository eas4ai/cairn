# /existing-project

## What it does

Gets your agent up to speed on a codebase that already exists. It reads
the code before asking you anything and writes a cited recon report: what
exists, what is documented, where the docs and the code disagree, what it
could not verify. With no spec set, it drafts observed specs for the parts
your work will touch and writes the first iteration contract. With a spec
set, it verifies the specs against the code, raises every drift for you
to rule on, extends the specs where the work needs, and then routes the
feature or fix through /next-iteration. Observed specs stay marked as such
until you confirm them; only confirmed sections can enter a contract.

## When to reach for it

Opening an agent in an existing project for the first time; returning to
a spec'd project after enough commits that you no longer trust the specs
to match; picking up a codebase whose documentation you do not trust;
preparing a remediation where the first question is "what does it
actually do today".

## Common questions

Q: Does it document the whole codebase first?
A: No. Depth follows the work: the modules your feature or fix touches get
domain-spec depth; everything else gets one line in the overview. The
gaps it did not close are recorded, not lost.

Q: My project already has a spec set. Why not go straight to
/next-iteration?
A: Because a staged spec written before the agent has read the code and
checked the specs against it is written from priors. /existing-project
does the recon and the drift check first, then hands the work to
/next-iteration with that context; it will not open the valve earlier.

Q: What if the code does something I never intended?
A: The observed spec records what the code does; your intent becomes a
defect record or a staged next-iteration spec. The workflow never writes
inferred intent as if you had agreed to it.

Q: What language are observed specs written in?
A: Same Page Technical English from birth -- identified requirements,
one obligation per sentence -- and the language check runs on them as
written. Confirming a section is a status change, not a rewrite; the
moment a section becomes Agreed you are asked what observable state
would violate each requirement, and its identifiers enter the evidence
map, conformance.md, Uncovered until evidence is cited. An Observed
section carries no falsifier, because nobody has agreed yet what the
code should do.

Q: How is this different from /new-project?
A: /new-project designs software that does not exist. /existing-project
starts from evidence and asks you to correct its reading. Same spec set,
same glossary, same drift gate afterwards.

## It's working if

The first session in an old codebase ends with a contract instead of a
tour; contradictions between the README and the code surface as findings
instead of surprises; the next session loads the working agreement and
knows which specs are confirmed and which are only observed.
