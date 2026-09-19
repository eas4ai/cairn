---
name: new-project
description: Start new software under Cairn from an empty directory: initialize, ask what it is for, write the keystone, glossary, domains and Draft requirements through four developer gates, then run the shared spec-phase tail to the first work-loop action.
disable-model-invocation: true
---

# New project

### `start`
`/new-project` was invoked. Follow the nodes in order.

### `exists`
Does source code or `docs/spec/overview.md` exist here? A README, a license and a `.git` directory do not count. Yes: `switch`. No: `init`.

### `switch`
Stop and switch to `/existing-project`.

### `init`
Initialize Git if there is none (`git init -b main`). Run `cairn init`: the developer confirms settings, the authority remote or explicit local-only operation, and signed or unsigned-local developer authentication; it writes the init record and the ref roots. Rerunning it with the same answers is idempotent.

### `ask`
One open question, verbatim: "What is the software for?"

### `restate`
Gate 1: restate the answer in your own words; the developer corrects it. Continue only on a correction or an explicit yes.

### `keystone`
Write `docs/spec/overview.md`: what it is, its problem, what it is not, and the spec map with one row per domain file and its prefix.

### `glossary`
Gate 2: write `docs/spec/glossary.md` with five to fifteen terms as one set; the developer corrects by exception.

### `partition`
Gate 3: derive the domains from the keystone; the developer confirms the partition.

### `draft`
For each domain write `docs/spec/<domain>.md` with `Prefix: <PREFIX>` and one block per requirement: `[PREFIX-nnn]`, one obligation with the actor named, `Falsifier:`, `Mechanism:`, `Status: Draft`.

### `more`
More domains? Yes: `draft`. No: `roadmap`.

### `roadmap`
Write `docs/spec/roadmap.md`: `Current: <slug>` naming the first commitment and its section (heading, `Requirements:`, delivery prose, done-when prose).

### `tail`
Gate 4: the spec-phase tail below.

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
Write the roadmap section with the Agreed requirements, delivery and done-when. Write `Current:` by hand too, unless this start resumes a pending supersession, when `cairn start` moves it itself.

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
