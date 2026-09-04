# Supersession and the experience log

Slug: supersession-and-the-experience-log
Requirements: DEC-008, DEC-009, DEC-010, DEC-011, DEC-012
Inherits: every PKG requirement

## Goal

A decision that is reversed stays in history with its cause classified,
the reversal rate is reported by decider, and a new decision in a
domain that has seen reversals says what the history changed.

Delivers `cairn supersede` and `cairn reversals`.

## Behavior

supersede:

- Takes the old slug and the fields of a new decision, including
  --cause from the four (DEC-009). Writes the new record with a
  Supersedes: line, and adds a Superseded by: line to the old one.
  Never deletes or empties the old record (DEC-010).
- The wake already skips a superseded record when looking for
  unrealized work (commitment 1).

reversals:

- Reads every decision record. Reports: reversals by decider (DEC-011),
  reversals by cause, and reversals by domain, where a decision's
  domain is the requirement prefix in its Rests on: line. Reporting
  only; nothing in Cairn moves a threshold from these numbers.

decide, extended (DEC-012):

- When the domain of the new decision has one or more reversed records,
  decide requires --history and writes a History: line stating what the
  reversal history changed about the level. Without it, decide refuses
  and names the reversals it found.

## Formats

A decision record gains optional lines: Superseded by after the title
on the old record; Supersedes and Cause after Decided by on the new
record; History after Would be wrong if, when the domain carries
reversals.

    Superseded by: <slug>         old record, after its title
    Supersedes: <slug>            new record
    Cause: <one of four>          new record
    History: <one line>           new record, after Would be wrong if

## Tests

- supersede writes both lines; the old record still contains its
  original text (DEC-008, DEC-010)
- supersede without a cause, or with a cause not in the four, is
  refused (DEC-009)
- reversals reports counts by decider and by domain from a fixture of
  records (DEC-011)
- decide in a domain with a reversal, without --history, is refused and
  names the reversal; with it, the record carries History: (DEC-012)
- decide in a domain with no reversals needs no --history

## Done when

- Every requirement above has a mechanism and current passing evidence.
- A review record at the current commit with no open finding.
- `cairn wake` says Done.
