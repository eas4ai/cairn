# The answer reaches the agent

Slug: the-answer-reaches-the-agent
Requirements: LOOP-048, LOOP-049, LOOP-050, LOOP-051, LOOP-014
Inherits: every PKG requirement

## Goal

An escalation is a conversation with a resume point at both ends.

Drafted 2026-09-05. Item 7 of [the original PoC report](https://github.com/eas4ai/cairn/blob/a161d4907afa23e5c89ceca8ff00ee45e54130f6/docs/issues-from-the-poc.md). After
`cairn answer`, the wake named the requirement and nothing pointed
the agent at the reply; `answer` accepted any text; an `ask` reply
marked the escalation answered and closed the channel the developer
had asked on. The first adoption's pending escalation would have been
answered `ask` had that not closed it.

A question is not an authorization. An `ask` reply resolves nothing:
the escalation stays open, the agent may not implement the
recommendation or the alternative on the strength of it, and the
answer that eventually resolves it is `ok` or `instead` on the same
file, so the answer stays attached to the decision it resolves and
a stranger reading the file sees the whole exchange in order.

The Concerns line is a list, matched by membership, since commitment
10 (LOOP-053); this commitment's `answer` carries that reading into
the reply.

## Decisions to record

- An escalation carries turns. After `Answer: ask ...` the agent
  appends `Reply: ...` and the developer answers again; the file is
  open for whoever spoke last's counterpart. No new command: `answer`
  serves both parties, and the record's last field says whose turn
  it is. Judged.

## Deliverables

- answer(): the reply must begin with `ok`, `instead ` followed by
  text, or `ask ` followed by text; anything else is refused with
  the three forms named. A second answer is refused unless the last
  turn is the agent's Reply.
- The escalation file: `Answer:` and `Reply:` lines alternate; an
  escalation is open for the developer when its last turn is a
  Question or a Reply, and open for the agent when its last turn is
  an `ask` Answer.
- wake(): an escalation whose last turn is an `ask` Answer yields
  `Resolvable: reply <slug>` with the question in the why, and that
  is the only action it yields: the requirement it concerns is not
  named for implementation while the escalation is open. One whose
  last turn is a Reply is presented as Escalate, as an unanswered one
  is.
- wake(): when the requirement a verdict names has an escalation
  whose latest Answer is newer than the requirement's latest evidence,
  the why carries `answered <slug>: <reply>`.
- The working agreement gains the agent's move on `reply` and the
  developer's move when the agent has replied.

## Tests

- a reply outside the three forms is refused and nothing is written
  (LOOP-048)
- after `ask`, wake says reply and the why carries the question; it
  does not say implement (LOOP-049)
- an `ask` followed by the agent's reply and then `ok`: the file holds
  all three turns in order, and the escalation is closed by the `ok`
  alone (LOOP-050, LOOP-014)
- after the agent's reply, wake presents the escalation to the
  developer (LOOP-050)
- after `instead`, wake names the requirement and carries the reply
  (LOOP-051)
- a stranger resumes from the file alone with the whole exchange in it
  (LOOP-014)

## Done when

- Every requirement listed above has current passing evidence from
  node-test, recorded by `cairn check`.
- A review record for this commitment at the current commit with no
  open finding.
- `cairn wake` says Done.
