---
name: next-feature
description: After a commitment is Done, take the waiting items or a new request, trace and cite each change's blast radius, revise or add Draft requirements with the developer, and run the shared spec-phase tail to the next start. Runs from Done only.
disable-model-invocation: true
---

# Next feature

### `start`
`/next-feature` was invoked. Follow the nodes in order.

### `isdone`
`cairn wake` says Done? No: `notdone`. Yes: `read`.

### `notdone`
Stop and hand the verdict to AGENTS.md. Anything else is the loop's.

### `read`
Read the spec set, the finished roadmap section, the Consequential queue (`cairn decisions`), the unpromoted next-feature items and the backlog (`cairn show items`).

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
Run `cairn lint docs/spec`. Findings: `falsifiers`. Clean: `present`.

### `present`
Present by exception. End with: "If this isn't clear, ask me to explain it another way before you decide."

### `outcome`
The developer asks: `explain`. Corrects: `correct`. Confirms or rules: `agreed`.

### `explain`
Explain another way, then `present` again.

### `correct`
Apply the corrections, then `review` again.

### `agreed`
Set `Status: Agreed <date>` on each confirmed block. A ruling instead of a confirmation is a deference decision: `cairn decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body "<the developer's words>"`.

### `commitment`
Write the roadmap section with the Agreed requirements, delivery and done-when. `Current:` moves inside the start transaction, not by hand.

### `declare`
For this commitment only: `cairn declare <name> --file <path>`, reading the mechanism definition as JSON. Show the violating example fails: `cairn check <REQ>` must record a fail receipt, then `cairn review mechanism <REQ> <receipt>` binds it.

### `agreement`
Copy `templates/AGENTS.md` from this skill to `AGENTS.md` for developer authorization. Do not edit it after authorization.

### `authorize`
The developer runs `cairn authorize`: one record binding the final spec, agreement and settings digests. The agent never runs it.

### `startintent`
Run `cairn start <slug>`. It verifies the authorization, writes the command intent, and commits the prepared contract, agreement and mechanisms.

### `startrec`
The same command finishes the transaction: workspace snapshot, frozen set and digests, `from_superseded` when resuming, and exact refspecs on the authority remote when one is configured. If it was interrupted, `cairn wake` names `recover <transaction>`; run `cairn recover <transaction>`.

### `done`
Run `cairn wake`; it names the first work-loop action. Consequential decisions wait in the queue. Hand over to AGENTS.md.
