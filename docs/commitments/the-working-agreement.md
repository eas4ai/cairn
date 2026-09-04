# The working agreement

Slug: the-working-agreement
Requirements: LOOP-036, DEC-014
Inherits: every PKG requirement

## Goal

An agent that has never read Cairn's own repository can run the loop
from a consumer's.

Both skills ended with "the loop takes over," and the kernel names one
action per wake. Nothing in a consumer repository said what to do with
the verdict: act on Resolvable and wake again, present an Escalate and
stop, stop on Done. The in-progress record's format lived only in
Cairn's first commitment plan. So an agent stopped after its first
action, the failure Cairn exists to remove. Promoted from the backlog
on the developer's word, with the review queue's undocumented exit
folded in, because the developer's moves belong in the same file.

Delivers three things.

- The working agreement: AGENTS.md at the repository root, the
  cross-vendor name for the file an agent reads first. It states the
  agent's move for each verdict, the write-ahead record and when to
  write it, when to run check and when to record a decision, the
  backlog, and the developer's two moves: answer an escalation with
  `cairn answer`, and review a queued decision by removing its entry
  in a commit, so the commit's author and date are the mark, no status
  is stored (LOOP-028), and no command is added (PKG-003). The template
  ships at skills/new-project/templates/AGENTS.md and is copied
  verbatim; the paths it names are the ones every Cairn repository has.
- Both skills write it: /new-project at Stage 4 beside the roadmap;
  /existing-project when it writes a roadmap, and on Path B it verifies
  the file is present and matches the template. A harness that reads a
  differently named instructions file gets a one-line file of that
  name that includes it; no vendor is named (PKG-006).
- Cairn's own copy: this repository's AGENTS.md is the template, byte
  for byte, so the loop that builds Cairn runs by the file Cairn ships.

## Where things live

    skills/new-project/templates/AGENTS.md   the working agreement, shipped
    AGENTS.md                                this repository's copy
    CLAUDE.md                                one line that includes AGENTS.md, for a harness that reads that name

## Formats

The working agreement states, in this order: the wake; the move for
Resolvable, for Escalate, and for Done; the write-ahead record with its
four fields; check against a committed tree; decisions by level; the
backlog; the review before Done; the developer's move for an
escalation and for a queued decision; and the developer's move to name
the next commitment.

## Tests

- the template names each verdict with its move, the write-ahead
  record's four fields, check against a committed tree, `cairn answer`,
  and the removal of a queue entry as the developer's review (LOOP-036,
  DEC-014)
- this repository's AGENTS.md is identical to the template, and
  CLAUDE.md includes it
- /new-project writes it at Stage 4 and /existing-project writes or
  verifies it at Stage 3; neither names a vendor's file (PKG-006)

## Done when

- LOOP-036 and DEC-014 have current passing evidence from node-test.
- A review record at the current commit with no open finding.
- `cairn wake` says Done.
