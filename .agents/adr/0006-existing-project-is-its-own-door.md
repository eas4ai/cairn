# 0006: Adopting an existing codebase is its own skill

Date: 2026-08-25

/new-project claimed to cover existing codebases ("read code before
asking, draft from evidence"), but what it then ran was the six-stage
spec-writing conversation whose output is a complete spec set. For a
developer who opened an agent in a large application to change one thing,
that is the wrong shape twice: it documents the whole project before the
work can start, and it writes retro-documentation in the voice of design
intent, which misstates a codebase nobody specified. It also left the
drift gate inert exactly where scope discipline matters most, since the
gate activates only when 00-overview.md exists.

/existing-project is a separate, user-invoked skill: recon from evidence
(every claim cited), a glossary drafted from the code's own identifiers,
observed specs for the work's blast radius only, an explicit documentation
gap list, and the session's work prepared as one feature or one defect.
It has two entry paths: with no spec set it writes observed specs and the
first contract; with a spec set it verifies the specs against the code
first, raises every drift for the developer to rule on, and only then
routes the work through /next-iteration -- a staged spec written before
recon is written from priors. Two conventions travel with it: the
Observed / Agreed status pair (the gate asks whether Observed text was
relied on as contract; only Agreed sections may enter an In list), and
the defect record as a first-class artifact. /new-project now hands off
when it finds a codebase. Rejected: a mode flag on /new-project (two
workflows with different outputs under one name); documenting the whole
codebase first (the failure mode this exists to prevent); and letting a
spec'd project skip straight to /next-iteration (the valve captures
ideas, it does not get an agent up to speed).
