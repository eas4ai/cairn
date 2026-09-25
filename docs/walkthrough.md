# One small project with Sudus

This is the hands-on companion to the [human manual](manual.md). The
manual explains your choices; this example lets you see the commands and
records in a disposable project. You do not need to type these files
yourself when working with an agent: the project skills write them for
you, asking you to confirm each one. This example builds a name
validator: it accepts `Ada` and rejects an empty string. A *falsifier* is
an observable failure of a requirement; here, accepting an empty string is
the falsifier.

Run the shell blocks in order, in one new, empty directory. Have Node 24
and Git 2.40 or newer, and configure your Git author if you have not
already. Every command below is exactly as `sudus --help` lists it; every
transcript is copied from an actual run.

## Install

Link the command once per machine (the plugin and skills-CLI installs do
this step for you):

```sh
mkdir -p "$HOME/.local/bin"
[ -e "$HOME/.local/bin/sudus" ] || ln -s "<checkout>/bin/sudus.mjs" "$HOME/.local/bin/sudus"
export PATH="$HOME/.local/bin:$PATH"
sudus --help
```

`<checkout>` is wherever you cloned Sudus. `sudus --help` lists every
command; it works anywhere and changes nothing.

## Start the project

A bare repository stands in for a host such as GitHub, so this example
can push at the end. Create it, then the project itself:

```sh
git init -q --bare /tmp/nametag-origin.git
mkdir nametag && cd nametag
git init -q -b main
git config user.name "Ada Lovelace"
git config user.email "ada@example.com"
git remote add origin /tmp/nametag-origin.git
sudus wake
```

Outside an initialized project, wake exits 3 and names what continues:

```text
sudus init  (durable refs refs/sudus/log, refs/sudus/snapshots are missing and no authority remote is configured)
```

The agent asks you two things in conversation: the authority remote (a
configured Git remote's name, or local only) and your ok. Name the remote
you just added, so Sudus's durable records can travel with the code later.
The agent then runs `sudus init` with your answer as flags, quoting your
words; the command itself asks nothing, and you are never asked to run it:

```text
$ sudus init --remote origin --quote "ok: origin"
sudus: initialized; init record <sha> (attested: "ok: origin" through <harness> by Ada Lovelace <ada@example.com>; evidence, not authentication)
```

Attested mode records your quoted words, the harness that carried them and
your Git author identity as evidence of your decision, not as
cryptographic proof it was you; a project that needs that proof sets a
public key in `signing_key` in `.sudus/settings.json` instead. `sudus wake` now asks for the
specification:

```text
verdict: Resolvable
action: repair docs/spec
reason: docs/spec is missing
predicate: the named hand-written file reads under its grammar and no unrelated byte changed
```

## Agree on the behavior

For a new project, an agent would use the `new-project` skill: it asks
what the software is for, restates the answer, drafts a glossary, derives
the domains, and writes the requirement blocks with you, one gate at a
time. Here, write the files directly, the way the skill would once you
had agreed to this scope:

```sh
mkdir -p docs/spec src tests
cat > docs/spec/overview.md <<'EOF'
# Nametag: overview

Nametag validates a person's display name before it is saved.

## Spec map

| File | Prefix |
|---|---|
| names.md | APP |
EOF
cat > docs/spec/glossary.md <<'EOF'
# Glossary

**Name.** The text a person enters as their display name.
EOF
cat > docs/spec/names.md <<'EOF'
Prefix: APP

# Names

[APP-001] The validator MUST reject an empty name.
Falsifier: The validator accepts an empty string.
Mechanism: names
Status: Draft
EOF
cat > docs/spec/roadmap.md <<'EOF'
# Roadmap

## reject-empty-names

Requirements: APP-001

Reject an empty name. Done when the validator refuses an empty string
and the check is current and reviewed.
EOF
sudus lint docs/spec
```

A clean lint prints nothing and exits 0. Only your confirmation moves a
block from `Draft` to `Agreed`; here, confirm it by hand:

```sh
sed -i 's/^Status: Draft$/Status: Agreed 2026-09-19/' docs/spec/names.md
sudus lint docs/spec
```

## Declare and demonstrate the check

Write the deliberately broken implementation and its check:

```sh
printf 'export const validName = (name) => true;\n' > src/names.mjs
cat > tests/names.mjs <<'EOF'
import assert from 'node:assert/strict';
import { validName } from '../src/names.mjs';
let ok = true;
try { assert.equal(validName('Ada'), true, 'ordinary names remain valid'); }
catch (e) { ok = false; console.log(String(e.message)); }
try { assert.equal(validName(''), false, 'an empty name is rejected'); }
catch (e) { ok = false; console.log(String(e.message)); }
console.log(`sudus: APP-001: ${ok ? 'pass' : 'fail'}`);
process.exit(ok ? 0 : 1);
EOF
git add src tests
git commit -qm "Add a failing name validator and its check"
```

A mechanism is a JSON file naming the command, its declared inputs, and
the requirements it speaks for:

```sh
cat > /tmp/mechanism-names.json <<'EOF'
{
  "command": "node tests/names.mjs",
  "inputs": ["src/names.mjs", "tests/names.mjs"],
  "requirements": ["APP-001"],
  "results": "per-requirement"
}
EOF
sudus declare names --file /tmp/mechanism-names.json
```

```text
declare names sha256:<definition digest>
```

Run it against the violating example, before trusting it:

```sh
sudus check APP-001
```

```text
check <receipt-sha> APP-001
```

`sudus show <receipt-sha>` prints the receipt; its `results` entry for
APP-001 reads `"result": "fail"`. This demonstrates that the check
actually catches the intended violation, not a missing dependency or a
crash before the assertion. Bind that fail receipt so this mechanism's
evidence counts:

```sh
sudus review mechanism APP-001 <receipt-sha>
```

```text
sudus: review mechanism APP-001 names
```

## Authorize and start

Copy the working agreement template (an agent would copy it from
`skills/new-project/templates/AGENTS.md`) and ask the developer to
authorize the prepared contract:

```sh
cp <checkout>/skills/new-project/templates/AGENTS.md AGENTS.md
```

The agent tells you what would be bound (the specification, the working
agreement and settings, each by digest) and asks for your ok in
conversation. Then it records your answer, quoting you:

```text
$ sudus authorize --quote "ok"
sudus: authorization <sha> (attested: "ok" through <harness> by Ada Lovelace <ada@example.com>; evidence, not authentication)
```

`sudus authorize` commits the specification and the working agreement for
you, as part of this record. The agent runs it only after you have said
ok; you are never asked to run it. Before the first `sudus start`, write the roadmap's `Current:` line
by hand, naming the commitment you are about to open (`sudus start`
checks that it already matches, rather than choosing it for you):

```sh
cat > docs/spec/roadmap.md <<'EOF'
# Roadmap

Current: reject-empty-names

## reject-empty-names

Requirements: APP-001

Reject an empty name. Done when the validator refuses an empty string
and the check is current and reviewed.
EOF
sudus lint docs/spec
sudus start reject-empty-names
```

```text
start <sha> reject-empty-names
```

`sudus wake` now names the real work:

```text
verdict: Resolvable
action: implement APP-001
reason: the current receipt for APP-001 says fail
predicate: a current receipt says pass and review metadata binds the requirement to the current detection and text digests with a fail receipt
```

## Fix it, check it, review it

Claim the action lease before touching a declared input, fix the code,
commit, and release the lease:

```sh
BEGIN_OUT=$(sudus begin implement APP-001)
echo "$BEGIN_OUT"
LEASE=$(echo "$BEGIN_OUT" | awk '{print $NF}')
printf 'export const validName = (name) => name.length > 0;\n' > src/names.mjs
node tests/names.mjs
git add src/names.mjs
git commit -qm "Reject empty names"
sudus end --lease "$LEASE"
sudus check APP-001
```

```text
sudus: lease implement APP-001 <lease-sha>
sudus: APP-001: pass
sudus: lease ended
check <receipt-sha> APP-001
```

The check now passes. Before Done, the builder answers six fixed
questions (Q1 to Q6, in [the manual](manual.md#review-the-adversary-and-done))
in a JSON file. Write it somewhere outside the repository, so it is never
itself an undeclared change inside the project:

```sh
cat > /tmp/review.json <<'EOF'
{
  "examined": ["the fail receipt before the fix, and the pass receipt after it"],
  "answers": [
    { "question": "Q1", "target": "names", "status": "observed", "text": "node tests/names.mjs printed the assertion failure and exited 1 before the fix" },
    { "question": "Q2", "target": "names", "status": "observed", "text": "the failure was the assert.equal on the empty string, the exact falsifier" },
    { "question": "Q3", "target": "APP-001", "status": "observed", "text": "validName now returns name.length > 0; an empty string returns false" },
    { "question": "Q4", "target": "APP-001", "status": "observed", "text": "only src/names.mjs changed" },
    { "question": "Q5", "target": "reject-empty-names", "status": "observed", "text": "the check only tries '' and 'Ada'; a spaces-only name is not covered" },
    { "question": "Q6", "target": "reject-empty-names", "status": "not-checked", "text": "" }
  ],
  "findings": []
}
EOF
sudus review reject-empty-names --file /tmp/review.json
```

```text
sudus: review reject-empty-names <review-sha>
```

## The independent report

```sh
sudus wake
sudus brief reject-empty-names
```

`sudus brief` writes the brief file and prints exactly how to start the
adversary:

```text
sudus: brief reject-empty-names <brief-sha>
brief: <path>/.sudus/output/brief-<digest>.md
brief digest: sha256:<digest>
harness: claude_code
model: any
start: in claude_code, start one fresh subagent with none of your conversation, working in <project>, with the file <brief path> as its entire prompt. It reads only and starts no subagents. When it hands back its report file, run: sudus report reject-empty-names --file <its report>
```

Start that adversary exactly as printed: one fresh subagent, none of the
builder's conversation, only the brief file as its prompt. It runs once,
here, right before Done. It reads the project and the whole specification,
and it runs nothing: the brief's receipts say what already ran. It judges
the work through five lenses: the falsifier, the builder's decisions,
security, logic, and complexity and spec adherence. Its answer is a JSON
file, written outside the repository, with one attempt for each pair the
brief's Report section names:

```sh
cat > /tmp/report.json <<'EOF'
{
  "attempts": [
    { "question": "falsifier", "target": "APP-001", "looked_for": "a way for validName to accept '' while tests/names.mjs passes", "found": "the check asserts validName('') is false; nothing else decides it", "held": true },
    { "question": "security", "target": "reject-empty-names", "looked_for": "input crossing a trust boundary", "found": "validName takes a string and touches nothing else", "held": true },
    { "question": "logic", "target": "reject-empty-names", "looked_for": "the input that takes the other side of name.length > 0", "found": "a three-space name passes; APP-001's falsifier names only the empty string", "held": true },
    { "question": "complexity", "target": "reject-empty-names", "looked_for": "behavior no requirement names", "found": "none", "held": true }
  ],
  "interface_attempts": [],
  "findings": [],
  "sudus_bug": null
}
EOF
sudus report reject-empty-names --file /tmp/report.json
```

```text
sudus: report reject-empty-names <report-sha>
```

`sudus report` refuses a report once the workspace differs from the
reviewed snapshot, since the adversary reads only; it also refuses a stale
brief and a pair left without an attempt. A finding would be the agent's
to decide: `sudus resolve` with the fix, or `sudus decline` with its
reason. This report has none, so `sudus wake` goes on toward Done.

## Capture what is outside this commitment, then finish

The review's own Q5 named a real gap: a name of only spaces is accepted.
Rejecting it would need a new requirement, so that idea is not this
commitment's work; capture it separately later. For this walkthrough,
capture a smaller, already-covered idea instead, one that changes nothing
Agreed:

```sh
ITEM=$(sudus item --backlog --slug names-node-test-runner --from APP-001 \
  --body "Run the APP-001 check under node --test so failures show in the standard test reporter." \
  | awk '{print $2}')
sudus wake
```

Capturing an item that surfaced from this commitment's own requirement
needs a reason it is not this commitment's work:

```sh
sudus outside "$ITEM" --reason "This changes how the check runs, not what APP-001 requires."
sudus wake
```

```text
verdict: Resolvable
action: done reject-empty-names
reason: the Done rule holds for reject-empty-names and no done record exists
predicate: a done record names the commitment and final workspace snapshot
```

```sh
sudus done reject-empty-names
```

```text
done <sha> reject-empty-names
review report for reject-empty-names: 0 findings, 0 fixed, 0 declined (adversary report <report-sha>)
```

The review report lists every finding, its severity, and what the agent
did with it. The agent shows it to you before the next feature or
commitment.

## Promote the backlog item

```sh
sudus wake
```

```text
verdict: Resolvable
action: promote names-node-test-runner
reason: backlog item names-node-test-runner waits for promotion and no commitment is open
predicate: no commitment is open; one promotion names a backlog item and decision; Current: and a one-item successor start were written transactionally
```

A promotion needs the new commitment's roadmap section written first,
naming an already-Agreed requirement; `sudus promote` moves `Current:`
for you:

```sh
cat >> docs/spec/roadmap.md <<'EOF'

## names-node-test-runner

Requirements: APP-001

Run the APP-001 check under node --test. Done when the mechanism runs
that way and still passes.
EOF
sudus lint docs/spec
sudus promote "$ITEM"
```

```text
promote <sha> <item-sha>
```

This is a Consequential decision, recorded and queued for your review,
not an escalation: the agent continues. Read it with `sudus decisions`.
`sudus wake` now points at the promoted commitment's own next action.

## Push

Push the branch and the durable records together:

```sh
sudus push
```

```text
sudus: pushed refs/sudus/snapshots, refs/sudus/log, refs/heads/main to origin (atomic)
```

`sudus push` pushes the branch and both durable refs atomically where the
remote supports it, or in the safe order otherwise. Never push
`refs/sudus/*` with plain `git push`. A clone that only ran `git clone`
is missing the durable refs; `sudus wake` there prints the exact `git
fetch` that repairs it.

## What you saw

One commitment, `reject-empty-names`, went from a Draft requirement to a
failing check, a fix, a builder review, an independent report, and Done,
with every fact a Git commit you can read with `sudus show`. Promoting
`names-node-test-runner` opened a second commitment automatically, from
one already-Agreed requirement, with no new contract text. The `manual.md`
[command reference](manual.md#command-reference) and
[record reference](manual.md#record-reference) cover every command and
record kind this walkthrough used, and the ones it did not.
