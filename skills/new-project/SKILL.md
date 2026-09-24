---
name: new-project
description: Start new software under Sudus from an empty directory: initialize, ask what it is for, write the keystone, glossary, domains and Draft requirements through four developer gates, then run the shared spec-phase tail to the first work-loop action.
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
Initialize Git if there is none (`git init -b main`). Ask the developer, in conversation, which Git remote holds the authority records or whether the project is local-only, and whether decisions are signed with a key or attested in their own words. Then run `sudus init --remote <name>|--local-only --signing-key <path>|--attested --quote "<their words>"`; it writes the init record and the ref roots. The command asks nothing itself. Rerunning it is idempotent.

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
Copy `templates/AGENTS.md` from this skill to `AGENTS.md` for developer authorization. Do not edit it after authorization.

### `authorize`
State what would be bound: the specification, the working agreement and settings, and what changed in them. Ask for ok, changes or a question, and wait. On ok run `sudus authorize --quote "<their words>"`: one record binding the final spec, agreement and settings digests. On changes or a question run `sudus authorize instead|ask --quote "<their words>"`, act on it, and ask again.

### `startintent`
Run `sudus start <slug>`. It verifies the authorization, writes the command intent, and commits the prepared contract, agreement and mechanisms.

### `startrec`
The same command finishes the transaction: workspace snapshot, frozen set and digests, `from_superseded` when resuming, and exact refspecs on the authority remote when one is configured. If it was interrupted, `sudus wake` names `recover <transaction>`; run `sudus recover <transaction>`.

### `done`
Run `sudus wake`; it names the first work-loop action. Consequential decisions wait in the queue. Hand over to AGENTS.md.
