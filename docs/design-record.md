# Cairn -- design record

(successor to Same Page; CLI command `cairn`)

Captured 2026-09-04 from the design conversation. Not a spec. The input
to one.

## Why v2

Measured on the current repo:

- engine 4,443 lines / 23 modules; the software it governs 1,932 lines (2.3:1)
- package was 2,354 lines at 0.3.1 (last release before the engine), 7,022 today
- 1 of 178 obligations SUFFICIENT at HEAD; 177 INSUFFICIENT for a
  bookkeeping reason (stale snapshot after a commit), not a real blocker

Tier-3 apparatus is woven through the core, not layered on it:
authority 13 of 23 modules, environment 12, challenge 11, adapter 10,
trace 8, sensitivity 8, closure 6, narrowing 6. There is no seam to
build a loop on top of.

## The two imports

- ASD-STE100 (simple technical english, ambiguity in naming): WORKED.
  Self-contained, self-hosting, delivers. Carry forward intact.
- Verus (mathematically proving specification compliance): brought the
  vocabulary of proof into a domain with no solver. The feature spec was
  honest about this ("does not prove that arbitrary evidence semantically
  establishes a natural-language requirement") but kept the bookkeeping
  anyway. In Verus the trusted base and boundary are load-bearing because
  a solver discharges everything else. Here nothing is discharged.

The tell: eight axes recorded per evidence record, and a default profile
of `any:` over seven kinds so one passing test satisfies everything.
Maximum rigor in what is recorded, maximum laxity in what is required,
nothing connecting them.

## Carry forward

- The falsifier. The solver-free translation of a proof obligation:
  name the observable state that disproves the requirement.
- Freshness. A proof dies when the code changes.
- Permanent counterexamples. A disproof is never deleted.
- The language check, and the SPTE discipline.
- The three skills' confirm-back staging, Observed vs Agreed.
- The feature spec's "Why this exists" section, verbatim: belief that a
  section holds currently lives in a session and dies with it.

## Drop

boundary, closure, narrowing, trusted base, residual assumptions,
sensitivity, the authority lattice. Load-bearing only with a solver.

## Structure

Two phases with opposite human-involvement profiles:

- Phase A, specification. Human required; confirm-back IS the mechanism.
  Ends when the spec bundle is complete.
- Phase B, the loop. Human not in the loop by default, with defined
  escalation. Must be resumable.

Resumability is the shaping constraint: no loop state lives in the
agent's context. On every wake the agent reconstructs position from disk.
Kill it anywhere, restart, it reaches the same place.

## Naming (fixes the iterations/00x problem)

"iteration" currently names two things: a numbered contract and a bucket
of unpromoted ideas. Replace with three words, none of them iteration:

- roadmap -- the ordered agreed sequence; order lives in the file
- commitment -- one unit of scope, named for its goal, never numbered
- backlog -- captured, unpromoted; where the scope valve files things

Slugs not numbers, everywhere. A filename should tell the agent what it
is without opening it.

## Three drifts, three mechanisms

| Drift | What goes wrong | Mechanism |
|---|---|---|
| Scope | building what was not committed | the backlog valve |
| Context | agent loses the shape of the project | on-disk state, roadmap, ADR log |
| Spec | implementation diverges from what was agreed | certification plus validators |

## Verdicts: classify by who acts next, not by confidence

| State | Meaning | Who acts |
|---|---|---|
| Proceed | requirement met | agent, silently |
| Resolvable | stale evidence, unrun validator, missing obligation | agent, unattended |
| Escalate | a question only the human can answer | human |
| Done | commitment fully met | agent stops |

Everything currently reported INSUFFICIENT-because-stale collapses into
Resolvable. That is what un-buries the real signal.

## The decision scale

| Level | Test | Action |
|---|---|---|
| L0 Routine | spec, convention, or common practice determines it | decide, no ADR |
| L1 Judged | real fork, cheap to reverse, inside the commitment | decide, write ADR |
| L2 Consequential | expensive to reverse, or crosses the project boundary | decide, write ADR, add to review queue |
| L3 Blocking | changes WHAT gets built; needs info only the human has; irreversible and externally visible; or no recommendation | stop, escalate |

Only L3 stops the loop. L2 is the innovation: decide and keep moving,
surface it for asynchronous review.

Rationale for a high threshold: escalation moves a decision from the
party with context to the party without it. The agent wrote the code;
the human did not. Escalating is not automatically the safe choice.

## Escalation format

One decision. Fixed shape. Six lines.

    DECISION (1 of 3)

    Question:   <one line, in consequence terms, not implementation>
    Recommend:  <the option>
    Because:    <one line>
    If wrong:   <one line, the cost>
    Instead:    <one line alternative>

    Reply: ok | instead | ask

`If wrong` is load-bearing: it tells the human how much to care before
deciding anything. Banned: preamble, restating known context, listing
rejected options, hedging, explaining twice.

Machine-enforced by the language check with a different rule set (line
budget, sentence length, banned hedges, required fields). An escalation
that fails the check goes back to the agent, not to the human.

Pairing rule: if the decision does not fit the format, it is not ready to
be a question. Decide, log it, flag L2.

## ADR

The decision points at the commit. Not the reverse.

    decision:            session-storage
    decided by:          agent
    rests on:            <requirement or spec section>
    would be wrong if:   <the invalidation condition>
    realized by:
      - a3f9c21  session store behind the repository interface
      - 7b104de  migrate existing sessions on startup

Store the commit subject next to the SHA: SHAs move under rebase and
amend, and the subject makes a dead pointer recoverable and the ADR
readable without git.

Property that falls out: an ADR with an empty `realized by` is a decision
made but not yet built. Free work queue on wake.

Threshold: an ADR is earned when a competent person arriving later would
ask "why is it like this?"

## The experience log

Same shape as requirements, applied to judgment:

    requirement + falsifier  -> evidence -> verdict  -> disproof permanent
    decision    + wrong-if   -> outcome  -> revision -> reversal permanent

Supersession must name the predecessor and classify the cause:

- the stated condition occurred      -> ADR worked as designed, no lesson
- an unforeseen condition occurred   -> the wrong-if was incomplete
- wrong when made                    -> a reasoning pattern to avoid
- the premise was false              -> a class of fact to verify

Track reversal rate BY DECIDER. The escalation threshold then becomes
empirical rather than a guess, per project and per domain.

Failure modes: unlinked supersession; volume beyond what can be read on
wake; the incentive not to record a reversal. The last one is fatal and
must be structurally prevented.

## Constraints

- No infrastructure requirement. Git plus files is the store. No database.
- Complexity budget stated as a requirement in the spec, with the rule
  that a new concept must name the failure that forced it.
- "No ambiguity" restated achievably: a requirement with no agreed
  falsifier is not agreed.

## Resolved after this record was written

- The pre-engine quirks: the developer confirmed the diagnosis. Over-asking
  was the conversation-side defect (standing rule 1 made asking the only
  response to ambiguity); the missing Phase B was the real gap. See
  specification.md and docs/decisions/loop-before-specification-phase.md.
- Freshness stays in the core. Specs going stale is the quirk it exists to
  catch. The "stale on every commit" friction is a classification
  problem, solved by the Resolvable verdict (LOOP-005, LOOP-008).
- The repo lives at ~/workspace2/cairn, github.com/eas4ai/cairn, private.
- Adversarial review is a requirement in both phases (SPEC-014, SPEC-015,
  LOOP-020), after the first draft's own review found eight defects in
  forty-eight requirements.

## External evidence (2026-09-04)

Harness-of-Harness (Yan et al., arXiv 2609.01481, Shanghai AI Lab)
runs a fixed coding harness in a planning-coding-testing loop and
carries two states across iterations: the artifact and the evidence
bundle. It is an orchestrator, which Cairn is not (PKG-012), so what
transfers is mechanism, not architecture. Its ablations on 45
GameCraft-Bench tasks, Codex with GPT-5.5, T=3:

- without evidence-conditioned replanning: -8.13 points
- without evidence feedback to the planner: -6.28
- without warm start from the previous artifact: -7.85

Those are the three things Cairn's wake does structurally: it derives
the next action from evidence on disk, against the repository as it
stands. The paper is the first quantitative support for that design
choice that did not come from this project.

Three mechanisms entered as Draft (LOOP-030, LOOP-031, LOOP-032):
evidence only against a committed state; regressions before never-passed
requirements; reviews that cannot change code. Each names the failure
the paper documents.

Its reference [11], "Proof-or-stop: don't trust the agent, trust the
evidence" (arXiv 2607.14890), is adjacent enough to Cairn's thesis to
be worth the developer's eyes.

## External evidence, second paper (2026-09-04)

Proof-or-Stop (Huang et al., arXiv 2607.14890) is a referee, not an
orchestrator, and says so: "agent frameworks orchestrate agents;
Proof-or-Stop controls which agent claims a lifecycle is allowed to act
on." It was built under its own gate (565 stories), powered-tested
(9,240 cells), and cross-vendor reviewed. Its design converges with
Cairn's on every load-bearing point, independently:

- agent output is a claim, never state; only evidence advances
- evidence is bound to code identity and goes stale the instant the
  tree changes
- never a false DONE; fail closed, repair within a bound, or stop
- the experience layer is advisory, marked gateEvidence:false, and
  cannot satisfy a gate -- the ruling this project made two hours
  before reading it
- git-native durable state; work outlives the dead host
- self-application: "the tool gated its own author"

Three results shape Cairn directly:

- Review as advice amplified 14/1800 green-but-wrong artifacts; the
  same review as an enforced gate amplified 2/1800. Enforcement is the
  mechanism, not the reviewer. Cairn had the advice shape (LOOP-033).
- On clean, well-specified work the gated loop is pure overhead, 2x
  cost, no benefit. Its value is entirely the green-but-wrong case.
  "Expensive exactly where being wrong is expensive, cheap everywhere
  else." That is the argument for the scale and for review once per
  commitment rather than once per requirement.
- 26 of 28 deep-set review findings were filed while the author's own
  tests were green. A green mechanism is not the end of the question.

Where Cairn draws a line the paper does not: Proof-or-Stop signs
receipts, tracks producer identity, rejects 18 tamper classes, and
runs 3x2 review quorums. That apparatus is sized for forged evidence
and compromised hosts. Cairn's threat is the forgetful agent that games
a visible signal, not the adversarial one. The receipt enters
(LOOP-034); signing does not, until an agent is observed writing
evidence by hand. See docs/decisions/threat-model-forgetful-not-
adversarial.md.

Four requirements entered as Draft: LOOP-033, LOOP-034, LOOP-035,
DEC-016. The last recovers an escalation trigger that was agreed in
conversation and lost before it reached the spec.

