# Escalation

Slug: escalation
Requirements: LOOP-009, LOOP-010, LOOP-011, LOOP-012, LOOP-013, LOOP-014,
LOOP-026
Inherits: every PKG requirement

## Goal

A Blocking decision reaches the developer in a form they can decide from
in a short read, one at a time, and an agent that did not raise it can
resume from the answer.

Delivers two commands. `cairn escalate` writes an escalation from the
agent's fields, checks it against the format, and refuses one while
another is open. `cairn answer` records the developer's reply. The wake
already presents an open escalation (commitment 1, step 2); this
commitment makes writing and answering mechanical.

## Where things live

    .cairn/escalations/<slug>.md    one file per escalation; committed

## Behavior

escalate:

- Takes --question, --recommend, --because, --if-wrong, --instead, and
  the requirement or decision it concerns. Writes the six-line format
  (LOOP-026) followed by Status: open.
- Each field must fit one line and be present. A malformed escalation
  returns to the agent with the field named (LOOP-012) and is not
  written -- unless --level Blocking is given, in which case it is
  written with a Malformed: line naming the field, because a formatting
  gate must never suppress a Blocking decision (LOOP-014).
- Refuses while any escalation is open (LOOP-011). The queue is the
  file system: the agent writes the next one after the developer
  answers.

answer:

- Takes the slug and the reply: ok, instead, or free text after ask.
  Appends Answer: and Answered: lines. The file is the resume point:
  a later wake with no memory of the raising session reads the
  question and the answer and continues (LOOP-013).

wake, unchanged from commitment 1: an escalation with no Answer: line
is open; the first by name is presented; nothing else happens.

## Formats

An escalation, .cairn/escalations/<slug>.md:

    DECISION

    Question:   <one line>
    Recommend:  <one line>
    Because:    <one line>
    If wrong:   <one line>
    Instead:    <one line>

    Reply: ok | instead | ask

    Concerns: <REQ-ID or decision slug>
    Status: open
    Raised: <iso timestamp>
    Malformed: <field>            only when Blocking bypassed the check
    Answer: <the reply>
    Answered: <iso timestamp>

## Tests

- escalate writes the format exactly; a field longer than one line or
  missing is refused with the field named, and nothing is written
  (LOOP-012)
- escalate --level Blocking with a malformed field writes it anyway and
  records which field (LOOP-014)
- a second escalate while one is open is refused (LOOP-011)
- answer appends Answer: and Answered:; wake no longer presents it
- a fresh temp repository containing only an answered escalation and
  the commitment files: wake proceeds past it without the raising
  session (LOOP-013)
- an escalation exists only when a file exists: wake on a repository
  whose escalation was written but never committed still sees it,
  because the file is on disk (LOOP-009)

## Done when

- Every requirement above has a mechanism and current passing evidence.
- A review record at the current commit with no open finding.
- `cairn wake` says Done.
