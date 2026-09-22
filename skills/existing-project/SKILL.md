---
name: existing-project
description: Bring an existing codebase under Cairn, reconcile a drifted spec, or resume a pending supersession. Reads the code before asking anything, writes a cited recon report, and prepares one commitment through the shared spec-phase tail. Observed is not Agreed.
disable-model-invocation: true
---

# Existing project

### `start`
`/existing-project` was invoked. Follow the nodes in order.

### `state`
Run `cairn wake`. Done: `tonext`. Resolvable or Waiting with an open commitment: `fits`. Exit 3 naming a pending successor: `pending`. Exit 3 naming this skill because the project is not initialized: `legacy`. A verdict with no open range: `hasspec`.

### `tonext`
Stop and switch to `/next-feature`; this work is a later commitment.

### `fits`
Does the request belong to the open commitment? Yes: `continue`. No: `midway`.

### `continue`
Return to the work loop under AGENTS.md.

### `midway`
A commitment is open. The developer chooses: finish it (`finish`) or supersede it (`supersede`). State both and what each changes.

### `finish`
Capture the request: `cairn item --backlog --slug <slug> --from <REQ> --body "<what>"`, or `--next-feature` when it would change Agreed text. Return to the work loop.

### `supersede`
Run `cairn supersede <successor-slug> --quote "<the developer's words>"`. It writes the developer-quoted Consequential decision and the superseded record: old range closed with a transition id and intended slug; open escalations, unresolved findings and unfixed defects carried. It does not move `Current:` and cannot name a start that does not exist. Then `pending`.

### `pending`
A pending successor: resume the transition. Everything below prepares the successor; its later start points back to the superseded record. Continue at `readspec`.

### `legacy`
Is this a Cairn 1.x project? `.cairn/evidence/`, `.cairn/reviews/` or `.cairn/escalations/` present, or `docs/commitments/`: `migrate`. None of them: `init`.

### `migrate`
Cairn 2 reads no 1.x record; the specification is what carries over, and the 1.x records stay in Git history. Tell the developer what will be removed and what stays, and wait for ok. Then, in one commit: remove the 1.x record directories with `git rm -r`: `.cairn/evidence`, `.cairn/reviews`, `.cairn/escalations`, `.cairn/stops`, `.cairn/queue`, `.cairn/policy`, `.cairn/mechanisms`, `docs/decisions`, `docs/commitments` and `docs/audit`, keeping `.cairn/backlog/` and the 1.x directory of items waiting for the next spec phase until `carry` has read them, and copying each 1.x mechanism's command and inputs into `docs/recon.md` for `declare`. Convert the specification in place until `cairn lint docs/spec` is clean, changing no requirement's words: every block gets its own `Status:` line from its file's 1.x status; each multi-line `Falsifier:` is joined into one line; every Agreed block gets a `Mechanism:` line naming the mechanism that will observe it, declared later in the tail; a 1.x `Agreed <date> by deference <slug>` becomes `Agreed <date>` with the 1.x slug quoted in the block's rationale; each file gets a `Prefix:` header and `docs/spec/overview.md` gets the spec map; a reference to an identifier that no longer exists is removed. Then `init`.

### `init`
Ask the developer, in conversation, which Git remote holds the authority records or whether the project is local-only, and whether decisions are signed with a key or attested in their own words. Then run `cairn init --remote <name>|--local-only --signing-key <path>|--attested --quote "<their words>"`. Settings that exist without refs are adopted only with `--adopt <digest>` after the developer has confirmed that digest with you; refs without settings refuse and name the repair. Then `hasspec`, or `carry` when `migrate` ran.

### `carry`
For each 1.x item file without a `Promoted to:` line: `cairn item --backlog --slug <the file name> --from <its Surfaced from: identifier> --body "<its text>"`, or `--next-feature` for an item from the directory of items waiting for the next spec phase. Then `git rm -r` both directories and commit. Then `hasspec`.

### `hasspec`
Does `docs/spec/overview.md` exist? Yes, Path B: `readspec`. No, Path A: `recon`.

### `readspec`
Path B: read the glossary, keystone, domains, roadmap, `cairn decisions` and the items first. Then `recon`.

### `recon`
Recon before questions: manifests, entry points, data, tests, CI, scripts, non-spec docs and recent history. Path B covers every commit since the newest Agreed date.

### `report`
Write `docs/recon.md`: every claim as Exists, Documented, Contradicted or Unverified with a citation; carry unresolved earlier findings.

### `corrects`
Present it; the developer corrects the reading.

### `ask`
One open question: a feature to add, or a defect to fix?

### `radius`
Trace and cite the blast radius: modules, tests and spec sections. Path A: `pathA`. Path B: `pathB`.

### `pathA`
Glossary from code identifiers; Observed specs inside the radius; one-line map rows outside it. Then `confirm`.

### `pathB`
Verify every spec section inside the radius. Then `verdict`.

### `verdict`
Per section: Holds or Still Observed: `confirm`. Drifted: `drift`. Missing: `missing`.

### `drift`
Raise both sides with citations; the developer rules.

### `rule`
Which side is wrong? Spec: `specwrong`. Code: `codewrong`.

### `specwrong`
Revise the spec by the developer's ruling before the successor start; no commitment is open, so the text may change now. Then `confirm`.

### `codewrong`
The spec stands: `cairn item --defect --slug <slug> --from <REQ> --body "<what the code does instead>"`. Then `confirm`.

### `missing`
Write the missing behavior as Observed. Then `confirm`.

### `confirm`
Observed sections the developer confirms become Draft with falsifiers; the rest remain Observed and are not contract.

### `roadmap`
Prepare the roadmap section. A defect commitment names the violated requirement and a mechanism that reproduces it.

### `tail`
The spec-phase tail below; `cairn start` includes the supersession link when a transition is pending.

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
State what would be bound: the specification, the working agreement and settings, and what changed in them. Ask for ok, changes or a question, and wait. On ok run `cairn authorize --quote "<their words>"`: one record binding the final spec, agreement and settings digests. On changes or a question run `cairn authorize instead|ask --quote "<their words>"`, act on it, and ask again.

### `startintent`
Run `cairn start <slug>`. It verifies the authorization, writes the command intent, and commits the prepared contract, agreement and mechanisms.

### `startrec`
The same command finishes the transaction: workspace snapshot, frozen set and digests, `from_superseded` when resuming, and exact refspecs on the authority remote when one is configured. If it was interrupted, `cairn wake` names `recover <transaction>`; run `cairn recover <transaction>`.

### `done`
Run `cairn wake`; it names the first work-loop action. Consequential decisions wait in the queue. Hand over to AGENTS.md.
