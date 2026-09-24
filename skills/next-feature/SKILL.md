---
name: next-feature
description: After a commitment is Done, take the waiting items or a new request, trace and cite each change's blast radius, revise or add Draft requirements with the developer, and run the shared spec-phase tail to the next start. Runs from Done only.
disable-model-invocation: true
---

# Next feature

### `start`
`/next-feature` was invoked. Follow the nodes in order.

### `isdone`
`sudus wake` says Done? No: `notdone`. Yes: `read`.

### `notdone`
Stop and hand the verdict to AGENTS.md. Anything else is the loop's.

### `read`
Read the spec set, the finished roadmap section, the Consequential queue (`sudus decisions`), the unpromoted next-feature items and the backlog (`sudus show items`).

### `ask`
One open question: the waiting items, a new feature, or both? Then, for each requested change, `radius`.

### `radius`
Trace and cite the blast radius: requirements, mechanisms, code and documents.

### `restate`
Restate what changes for whom; quote any affected Agreed text; give the alternative and your recommendation.

### `corrects`
The developer corrects the reading.

### `fits`
Covered by the current Agreed requirements? Yes: `covered`. No: `revise`.

### `covered`
Put it into the commitment; write no new contract text. Then `next`.

### `revise`
Revise under the same identifier, or add a Draft block, with at most one `Rationale:` line. No commitment is open, so confirmed text may change before the new start. Then `next`.

### `next`
More changes? Yes: `radius`. No: `tail`.

### `tail`
The spec-phase tail below.

## Spec-phase tail

### `falsifiers`
Propose the falsifiers as one set and name the mechanism that will observe each.

### `review`
Self-review for contradictions, falsifiers that would miss their violation, and requirements no mechanism can check. Performed, not recorded.

### `lint`
Run `sudus lint docs/spec`. Findings: `falsifiers`. Clean: `present`.

### `present`
Present by exception. End with: "If this isn't clear, ask me to explain it another way before you decide."

### `outcome`
The developer asks: `explain`. Corrects: `correct`. Confirms or rules: `agreed`.

### `explain`
Explain another way, then `present` again.

### `correct`
Apply the corrections, then `review` again.

### `agreed`
Set `Status: Agreed <date>` on each confirmed block. A ruling instead of a confirmation is a deference decision: `sudus decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body "<the developer's words>"`.

### `commitment`
Write the roadmap section with the Agreed requirements, delivery and done-when. Write `Current:` by hand too, unless this start resumes a pending supersession, when `sudus start` moves it itself.

### `declare`
For this commitment only: `sudus declare <name> --file <path>`, reading the mechanism definition as JSON. Show the violating example fails: `sudus check <REQ>` must record a fail receipt, then `sudus review mechanism <REQ> <receipt>` binds it. The violating example needs no commit: make it in the working tree, check, bind, then undo it. The receipt's input snapshot keeps the violating bytes, so only the bound mechanism file is committed.

### `agreement`
Copy the new-project skill's working agreement, `../new-project/templates/AGENTS.md` from this skill's directory, to `AGENTS.md` for developer authorization. Do not edit it after authorization.

### `authorize`
State what would be bound: the specification, the working agreement and settings, and what changed in them. Ask for ok, changes or a question, and wait. On ok run `sudus authorize --quote "<their words>"`: one record binding the final spec, agreement and settings digests. On changes or a question run `sudus authorize instead|ask --quote "<their words>"`, act on it, and ask again.

### `startintent`
Run `sudus start <slug>`. It verifies the authorization, writes the command intent, and commits the prepared contract, agreement and mechanisms.

### `startrec`
The same command finishes the transaction: workspace snapshot, frozen set and digests, `from_superseded` when resuming, and exact refspecs on the authority remote when one is configured. If it was interrupted, `sudus wake` names `recover <transaction>`; run `sudus recover <transaction>`.

### `done`
Run `sudus wake`; it names the first work-loop action. Consequential decisions wait in the queue. Hand over to AGENTS.md.
