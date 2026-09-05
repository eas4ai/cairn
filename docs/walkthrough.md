# One small project with Cairn

Cairn tells the agent what needs attention. You decide what the software
should do. This example builds a name validator: it accepts `Ada` and
rejects an empty string. A *falsifier* is an observable failure of a
requirement; here, accepting an empty string is the falsifier.

Use Node, Git, and `cairn` installed as the [README](../README.md) describes.
Run the shell blocks in order in one new, empty directory. Configure your
Git author if you have not already. This is a disposable learning example;
an agent normally writes these files with the project skills.

## Agree on the behavior

For a new project, ask the agent to use `new-project`. For existing code,
use `existing-project`. The agent reads what exists, proposes requirements
and failure examples, and asks you to correct them. Only your confirmation
makes them Agreed. Ask for another explanation before deciding if anything
is unclear.

Assume you have confirmed: "Reject an empty name, and accept Ada as a
normal example." Start with this deliberately incomplete implementation:

```sh
git init -q
mkdir -p docs/spec docs/commitments .cairn/mechanisms .cairn/reviews src tests
printf '.cairn/in-progress\n.cairn/evidence/\n' > .gitignore
cat > docs/spec/names.md <<'EOF'
# Names

Status: Agreed
Prefix: APP

[APP-001] The validator MUST reject an empty name.
Falsifier: The validator accepts an empty string.
EOF
printf '# Roadmap\n\nCurrent: reject-empty-names\n' > docs/spec/roadmap.md
printf '# Reject empty names\n\nRequirements: APP-001\n' > docs/commitments/reject-empty-names.md
printf 'export const validName = (name) => true;\n' > src/names.mjs
cat > tests/names.mjs <<'EOF'
import assert from 'node:assert/strict';
import { validName } from '../src/names.mjs';
assert.equal(validName('Ada'), true, 'ordinary names remain valid');
assert.equal(validName(''), false, 'an empty name is rejected');
EOF
cat > .cairn/mechanisms/names <<'EOF'
command: node tests/names.mjs
inputs:
  - src/
  - tests/
requirements:
  - APP-001
EOF
git add .
git commit -qm 'Agree on empty names and add a failing check'
cairn wake
```

The result is `Resolvable: run APP-001`. A *mechanism* is simply the
declared command that checks a requirement. `Resolvable` means the agent
can take the named action. Its exit code is 1; that is normal here.

## Check the broken case, then fix it

```sh
cairn check
```

Cairn records a failure and says `Resolvable: implement APP-001`. Running
`node tests/names.mjs` directly shows the assertion: the empty string was
accepted. This demonstrates that the check catches the intended violation.
A missing dependency or a crash before the assertion would not do that.

The agent records its action before editing, then commits the correction:

```sh
printf 'action: implement\ntarget: APP-001\nbase: %s\nstarted: %s\n' \
  "$(git rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .cairn/in-progress
printf 'export const validName = (name) => name.length > 0;\n' > src/names.mjs
node tests/names.mjs
git add src/names.mjs
git commit -qm 'Reject empty names'
rm .cairn/in-progress
cairn check
```

The check now passes, and Cairn requests a review. It retains the earlier
failing receipt. Editing runs help the agent work; `cairn check` records
evidence against committed inputs.

## Review what the check might miss

The agent examines the work before recording the review. In this example,
the assertions cover an empty name and `Ada`. They do not define how spaces
or non-string values should behave. Those are limits to discuss, not
permission to invent extra requirements.

After that examination, record it:

```sh
printf 'commitment: reject-empty-names\ncommit: %s\nexamined:\n  - empty-name failure before the fix and success after it\n  - ordinary-name acceptance; spaces and non-string values are outside this agreement\nfindings: []\n' \
  "$(git rev-parse HEAD)" > .cairn/reviews/reject-empty-names.md
git add .cairn/reviews/reject-empty-names.md
git commit -qm 'Review empty-name behavior'
cairn wake
```

Cairn reports `Done`. The agent stops. A review record describes work
actually examined; copying this example into another project is not a review.

## Resolve a question that belongs to you

Suppose you request another change, but the agent needs your policy for a
name containing only spaces. It recommends rejecting it and explains why:

```sh
cairn escalate --concerns APP-002 \
  --question 'Should a name containing only spaces be rejected?' \
  --recommend 'Reject it.' \
  --because 'It would look empty to the person reading the name.' \
  --if-wrong 'A caller relying on spaces as a name would need to change.' \
  --instead 'Keep accepting spaces and reject only the empty string.'
cairn wake
```

Cairn reports `Escalate: present app-002` and stops the agent. You can read
`.cairn/escalations/app-002.md`. Ask the agent to explain the choice another
way if needed. A request for explanation is not approval.

If you accept the recommendation, answer it:

```sh
cairn answer app-002 ok
git add .cairn/escalations/app-002.md
git commit -qm 'Accept rejection of names containing only spaces'
```

You can instead use `cairn answer app-002 instead <your instruction>`.
Answering settles the question; the agent still needs the work named in
the specification and commitment.

## Choose the next commitment

Ask the agent to prepare the next commitment from your answer. Review its
requirement and falsifier before confirming them. The agent can write the
files for you; you own the choice of scope. For the accepted example:

```sh
cat >> docs/spec/names.md <<'EOF'

[APP-002] The validator MUST reject a name containing only spaces.
Falsifier: The validator accepts three spaces as a name.
EOF
printf '# Reject spaces\n\nRequirements: APP-002\n' > docs/commitments/reject-spaces.md
printf '# Roadmap\n\nCurrent: reject-spaces\n\nCompleted: reject-empty-names\n' > docs/spec/roadmap.md
printf '  - APP-002\n' >> .cairn/mechanisms/names
printf "assert.equal(validName('   '), false, 'spaces alone are rejected');\n" >> tests/names.mjs
git add docs/spec docs/commitments .cairn/mechanisms/names tests/names.mjs
git commit -qm 'Agree on rejecting names containing only spaces'
cairn wake
```

Cairn says `Resolvable: run APP-002`. The next loop begins with a check
that will expose the missing behavior. Ideas you have not selected stay
in `.cairn/backlog/`; the agent does not start them automatically.

## When you revise an existing requirement

Changing a requirement or its falsifier makes its previous evidence stale.
`wake` requests `review mechanism <REQ>` before another check. The agent
compares the check with your revised agreement, corrects it if needed,
tries a safe violating example, and records its findings in the existing
commitment review. It then adds the exact `REQ sha256:...` entry printed
by `wake` under `reviewed:` in that mechanism's declaration and commits.

The digest identifies the text reviewed. It does not prove the review was
good. Cairn enforces the recorded step; the agent remains responsible for
the reasoning, and you can ask to see the example it tested.

## When one command checks several requirements

If the command reports each requirement separately, put
`results: per-requirement` in its mechanism declaration. Its stdout uses
lines such as `cairn: APP-001: pass` and `cairn: APP-002: fail`. Every
omitted requirement stays `unverified`, including when no results arrive.
That cannot satisfy Done and does not count as a failed requirement attempt.

The receipt keeps the command's exit code, signal, execution error, and
stderr separately. A host check failing before a UI check runs is not
evidence that the UI requirement failed. Existing declarations without
the field retain the exit-code fallback when no valid results arrive.
