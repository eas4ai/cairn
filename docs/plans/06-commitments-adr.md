# Commitments and the ADR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build `lib/adr.mjs` (the append-only `docs/decisions.jsonl` with its breach rules, queue and digest) and `lib/commitment.mjs` (`start`, `done`, `supersede`, `promote`, `item`, `outside`, `fix`, and the realization check behind `build DECISION`).

**Architecture:** the ADR is one canonical JSON object per line; every reader validates the whole file and refuses on the first breach, and every writer names the command it runs under so a line from the wrong command is refused before it is written. A commitment is opened by a `start` record whose frozen set is resolved and digested before any write, inside plan 04's `withTransaction`, and closed by `done` or `superseded`. Supersession is two-phase: `supersede` closes the old range with a transition ID and intended successor and never moves `Current:`; the successor's `start` names it and moves `Current:` in its own transaction. `promote` is decision, promotion record, `Current:` move and successor `start` in one transaction. `realize` compares the decision's base snapshot with the realized workspace snapshot and stops on any protected class in the actual delta.

**Tech Stack:** Node 24 ES modules, `node:fs/promises`, `node --test` with `node:assert/strict`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5, sections 2 (Commitment, Item, Start, Done, Superseded, Range, ADR and other terms), 3 (Existing project: supersession; the shared tail: `cairn start`), 4 (ADR schema; the promotion, fix, outside, item, start, done, superseded kinds), 5 (`fix`, `capture`, `build`, `done`, `promote` predicates), 8 (Decisions and realization; Capture and promotion).

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "A commitment is not a Git commit and normally spans many. At most one is open." (2)
- "`cairn start` resolves the whole set and digests it before writing anything." (4)
- "`cairn start` refuses without that authorization." (2)
- "It does not move `Current:` and cannot name a start that does not exist." (3, supersede)
- "A line written outside its assigned command, a duplicate ID, a noncanonical line, an unknown key, or a reference to a missing record is a breach." (4)
- "The queue is every decision without a later read line." (4)
- "Promotion, roadmap change and successor start form one recoverable transaction, and the new roadmap section may name only Agreed requirements. A next-feature item waits for the developer. Defect items are fixed before promotion." (8)
- "A delta touching a `data` path, frozen Agreed text, the working agreement, protected settings, or any other reserved path stops and escalates regardless of the evaluation. Named paths in the draft do not limit the comparison: every changed path in the actual delta is classified." (8)
- "Promotion never Agrees text." (7)

Decisions this plan fixes (an executor does not revisit them):

- ADR line keys, closed and sorted by `canonicalize`. `decision`: `kind, id, ts, level, by, title, rests_on, wrong_if, body, base_snap, evaluation, interfaces`. `realized`: `kind, id, ts, of, base_snap, snap, subject, interfaces`. `superseded`: `kind, id, ts, of, by, cause`. `answered`: `kind, id, ts, escalation, answer`. `read`: `kind, id, ts, of, record`. `interfaces` is the array of interface paths section 8 says the kernel "records on the decision and on the realized delta"; it is an addition to the section 4 shape and is always present.
- Assigned writers: `decision` by `decide`, `escalate`, `supersede` and `promote` (the last two write the Consequential decision the spec says they write); `realized` by `realize`; `superseded` by `decide`; `answered` by `answer` (plan 09); `read` by `decisions --read` (plan 03). `appendDecision(cwd, line, {command})` refuses any other pairing.
- Record payload keys, closed. `start`: `slug, snapshot, requirements: [{requirement, text_digest}], from_superseded` (SHA or `null`). `done`: `slug, snapshot`. `superseded`: `slug, start, decision, transition, successor, carried, evidence` (`evidence` holds the developer authentication plan 03 returns; it is the ninth logical field). `item`: `kind, slug, source, body`. `outside`: `item, reason, evaluation` (`null` until plan 11). `promotion`: `item, decision`. `fix`: `item, snapshot`. Plan 01's schema table lists exactly these keys; Task 4 round-trips them.
- Protected digests for the authorization check: `spec` is `sha256(canonicalize([[path, sha256(bytes)], ...]))` over `docs/spec/**` sorted by path and excluding `docs/spec/roadmap.md`; `agreement` is `sha256` of `AGENTS.md`; `settings` is `loadSettings(cwd).digest`. The roadmap is outside the spec digest because the kernel edits its `Current:` line and `promote` runs without the developer; the roadmap is bound structurally instead: `lint` passes and every `Requirements:` identifier in the started section is Agreed. Plan 03's `authorize` writes `spec_digest`, `agreement_digest` and `settings_digest` by this same rule; Task 4 states it as a test against plan 03's record.
- The `Current:` edit is exactly this: the first line matching `/^Current:[ \t]*.*$/m` is replaced by `Current: <slug>`; every other byte of `docs/spec/roadmap.md` is unchanged; a roadmap without that line is refused. Only `start` (for a supersession successor) and `promote` perform it.
- `installRefspecs` is plan 12's export from `lib/travel.mjs`. `start` and `promote` take it as an option defaulting to a no-op; plan 12's CLI wiring passes `travel.installRefspecs`. Tests here pass a recording stub.
- Test repositories come from `tests/helpers/repo.mjs` (plans 01 and 03): `makeProject({settings, files})` returns `{cwd, write(path, text), commit(message), authorize(), cleanup()}`; its default settings are the section 2 example (so `authority_remote` is `origin`) merged with the given fields; `authorize()` writes a current authorization record with the test evidence plan 03's own tests use, and `makeProject` configures plan 03's non-interactive developer confirmation so `authenticateDeveloper` returns test evidence.

---

### Task 1: ADR lines: canonical append, breach rules, queue and digest

**Files:**
- Create: `lib/adr.mjs`
- Create: `tests/adr.test.mjs`
- Create: `tests/helpers/commitment-fixture.mjs`

**Interfaces:**
- Consumes: `canonicalize`, `parseStrict`, `sha256`, `ulid` (lib/canon.mjs); `readLog`, `appendRecord` (lib/records.mjs); `readSnapshot`, `writeWorkspaceSnapshot` (lib/snapshots.mjs); `classify` (lib/paths.mjs); `loadSettings` (lib/settings.mjs); `makeProject` (tests/helpers/repo.mjs).
- Produces: `appendDecision(cwd, line, {command}) -> id`; `readAdr(cwd) -> [lines]`; `queue(cwd) -> [ids]`; `adrDigest(cwd) -> 'sha256:...'`; `decide(cwd, draft) -> id`; `supersedeDecision(cwd, of, by, cause) -> id`; `ADR_PATH`, `ASSIGNED`, `CAUSES`, `AdrError`.

- [ ] **Step 1: Write the fixture helper**

```js
// tests/helpers/commitment-fixture.mjs
import { makeProject } from './repo.mjs';

export const OVERVIEW = `# Demo

The demo greets people. It is not a chat system.

## Spec map

| File | Prefix |
|---|---|
| demo.md | DEMO |
| core.md | CORE |
`;
export const DEMO = `Prefix: DEMO

[DEMO-001] The greeter prints hello when run with no arguments.
Falsifier: running the greeter with no arguments prints anything other than hello.
Mechanism: greeter
Status: Agreed 2026-09-19

[DEMO-002] The greeter accepts a name argument.
Falsifier: running the greeter with a name prints a greeting without it.
Mechanism: greeter
Status: Agreed 2026-09-19

[DEMO-003] The greeter supports a quiet flag.
Falsifier: the quiet flag still prints.
Mechanism: greeter
Status: Draft
`;
export const CORE = `Prefix: CORE
Scope: every commitment

[CORE-001] The tool exits 0 on success.
Falsifier: a successful run exits nonzero.
Mechanism: exit-code
Status: Agreed 2026-09-19
`;
export const ROADMAP = `# Roadmap

Current: first

## first

Requirements: DEMO-001

Delivers the greeting. Done when hello prints.

## second

Requirements: DEMO-002

Delivers the name argument. Done when the name is greeted.

## drafty

Requirements: DEMO-003

Delivers the quiet flag.
`;
export async function project(settings = {}) {
  const repo = await makeProject({ settings: { source: ['src/**'], interfaces: ['src/api/**'], data: ['migrations/**'], ...settings } });
  await repo.write('docs/spec/overview.md', OVERVIEW);
  await repo.write('docs/spec/glossary.md', '# Glossary\n\ngreeter: the program.\n');
  await repo.write('docs/spec/demo.md', DEMO);
  await repo.write('docs/spec/core.md', CORE);
  await repo.write('docs/spec/roadmap.md', ROADMAP);
  await repo.write('AGENTS.md', '# Working agreement\n\nRun cairn wake.\n');
  await repo.write('src/main.mjs', 'console.log("hello");\n');
  await repo.commit('Add the demo specification');
  await repo.authorize();
  return repo;
}
export const roadmapWith = (current) => ROADMAP.replace('Current: first', `Current: ${current}`);
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/adr.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalize, sha256, ulid } from '../lib/canon.mjs';
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';
import { readLog } from '../lib/records.mjs';
import { appendDecision, readAdr, queue, adrDigest, decide, supersedeDecision, AdrError, ADR_PATH } from '../lib/adr.mjs';
import { project } from './helpers/commitment-fixture.mjs';

const draft = { title: 'Use a map', rests_on: ['DEMO-001'], wrong_if: 'the map is slower', body: 'A map replaces the list.' };

test('decide appends one canonical line with a base snapshot; readAdr returns it; the queue holds it', async () => {
  const repo = await project();
  const id = await decide(repo.cwd, draft);
  const text = await readFile(join(repo.cwd, ADR_PATH), 'utf8');
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '');
  const obj = JSON.parse(lines[0]);
  assert.equal(lines[0], canonicalize(obj));
  assert.deepEqual(Object.keys(obj).sort(), ['base_snap', 'body', 'by', 'evaluation', 'id', 'interfaces', 'kind', 'level', 'rests_on', 'title', 'ts', 'wrong_if']);
  assert.deepEqual([obj.id, obj.level, obj.by, obj.evaluation, obj.interfaces], [id, 'Consequential', 'agent', null, []]);
  assert.match(obj.base_snap, /^[0-9a-f]{40}$/);
  assert.deepEqual(await readAdr(repo.cwd), [obj]);
  assert.deepEqual(await queue(repo.cwd), [id]);
  assert.equal(await adrDigest(repo.cwd), sha256(text));
});

test('a decision naming an interface path records the interface hit', async () => {
  const repo = await project();
  const id = await decide(repo.cwd, { ...draft, named_paths: ['src/api/greet.mjs', 'src/main.mjs'] });
  const [line] = await readAdr(repo.cwd);
  assert.deepEqual([line.id, line.interfaces], [id, ['src/api/greet.mjs']]);
});

test('an empty or missing ADR reads as no lines and digests as the empty file', async () => {
  const repo = await project();
  assert.deepEqual(await readAdr(repo.cwd), []);
  assert.equal(await adrDigest(repo.cwd), sha256(''));
});

test('a read line removes the decision from the queue; a superseded line does not', async () => {
  const repo = await project();
  const a = await decide(repo.cwd, draft);
  const b = await decide(repo.cwd, { ...draft, title: 'Use a set' });
  await supersedeDecision(repo.cwd, a, b, 'the premise was false');
  assert.deepEqual(await queue(repo.cwd), [a, b]);
  const anyLogRecord = (await readLog(repo.cwd)).at(-1).sha;
  await appendDecision(repo.cwd, { kind: 'read', of: a, record: anyLogRecord }, { command: 'decisions --read' });
  assert.deepEqual(await queue(repo.cwd), [b]);
  const notOnLog = await writeWorkspaceSnapshot(repo.cwd);
  await assert.rejects(appendDecision(repo.cwd, { kind: 'read', of: b, record: notOnLog }, { command: 'decisions --read' }), /names a missing record/);
  assert.deepEqual(await queue(repo.cwd), [b]);
});

test('breach: a line written outside its assigned command is refused before it is written', async () => {
  const repo = await project();
  const snap = await writeWorkspaceSnapshot(repo.cwd);
  const line = { kind: 'decision', level: 'Consequential', by: 'agent', ...draft, base_snap: snap, evaluation: null, interfaces: [] };
  await assert.rejects(appendDecision(repo.cwd, line, { command: 'realize' }), (e) => e instanceof AdrError && /decision lines are written only by decide, escalate, supersede or promote, not realize/.test(e.message));
  await assert.rejects(appendDecision(repo.cwd, { kind: 'realized', of: 'x', base_snap: snap, snap, subject: 's', interfaces: [] }, { command: 'decide' }), /realized lines are written only by realize/);
  assert.deepEqual(await readAdr(repo.cwd), []);
});

for (const [name, mutate, message] of [
  ['a duplicate ID', (l) => l, /duplicate id/],
  ['a noncanonical line', (l) => ' ' + l, /not canonical JSON/],
  ['an unknown key', (l) => canonicalize({ ...JSON.parse(l), extra: 1, id: ulid() }), /unknown key extra/],
  ['a missing key', (l) => { const o = JSON.parse(l); delete o.wrong_if; o.id = ulid(); return canonicalize(o); }, /lacks wrong_if/],
  ['an unknown kind', (l) => canonicalize({ ...JSON.parse(l), kind: 'note', id: ulid() }), /unknown kind/],
  ['a reference to a missing decision', (l) => canonicalize({ kind: 'superseded', id: ulid(), ts: JSON.parse(l).ts, of: JSON.parse(l).id, by: '01ARZ3NDEKTSV4RRFFQ69G5FAV', cause: 'the premise was false' }), /by names missing/],
  ['a reference to a missing workspace snapshot', (l) => canonicalize({ ...JSON.parse(l), id: ulid(), base_snap: '0'.repeat(40) }), /not a workspace snapshot/],
  ['an unknown supersession cause', (l) => canonicalize({ kind: 'superseded', id: ulid(), ts: JSON.parse(l).ts, of: JSON.parse(l).id, by: JSON.parse(l).id, cause: 'we changed our minds' }), /cause/],
  ['a bad level', (l) => canonicalize({ ...JSON.parse(l), id: ulid(), level: 'Blocking' }), /level/],
]) {
  test(`breach: ${name} makes readAdr, queue and appendDecision refuse`, async () => {
    const repo = await project();
    await decide(repo.cwd, draft);
    const good = (await readFile(join(repo.cwd, ADR_PATH), 'utf8')).trimEnd();
    await appendFile(join(repo.cwd, ADR_PATH), mutate(good) + '\n');
    await assert.rejects(readAdr(repo.cwd), (e) => e instanceof AdrError && message.test(e.message));
    await assert.rejects(queue(repo.cwd), AdrError);
    await assert.rejects(decide(repo.cwd, draft), AdrError);
  });
}

test('breach: a final line without its newline', async () => {
  const repo = await project();
  await decide(repo.cwd, draft);
  const text = await readFile(join(repo.cwd, ADR_PATH), 'utf8');
  await writeFile(join(repo.cwd, ADR_PATH), text.trimEnd());
  await assert.rejects(readAdr(repo.cwd), /newline/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/adr.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/adr.mjs'`.

- [ ] **Step 4: Write the implementation**

```js
// lib/adr.mjs
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { canonicalize, parseStrict, sha256, ulid } from './canon.mjs';
import { readLog } from './records.mjs';
import { readSnapshot, writeWorkspaceSnapshot } from './snapshots.mjs';
import { classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';

export const ADR_PATH = 'docs/decisions.jsonl';
export class AdrError extends Error {}
export const CAUSES = ['the stated condition occurred', 'an unforeseen condition occurred', 'it was wrong when it was made', 'the premise was false'];
export const ASSIGNED = {
  decision: ['decide', 'escalate', 'supersede', 'promote'], realized: ['realize'], superseded: ['decide'],
  answered: ['answer'], read: ['decisions --read'],
};
const KEYS = {
  decision: ['kind', 'id', 'ts', 'level', 'by', 'title', 'rests_on', 'wrong_if', 'body', 'base_snap', 'evaluation', 'interfaces'],
  realized: ['kind', 'id', 'ts', 'of', 'base_snap', 'snap', 'subject', 'interfaces'],
  superseded: ['kind', 'id', 'ts', 'of', 'by', 'cause'],
  answered: ['kind', 'id', 'ts', 'escalation', 'answer'],
  read: ['kind', 'id', 'ts', 'of', 'record'],
};
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SHA = /^[0-9a-f]{40}$/;
const breach = (n, m) => { throw new AdrError(`breach: line ${n} ${m}`); };
const isStr = (v) => typeof v === 'string';
const strList = (v) => Array.isArray(v) && v.every(isStr);

async function validateLine(cwd, obj, n, ids, logShas) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) breach(n, 'is not an object');
  const keys = KEYS[obj.kind];
  if (!keys) breach(n, `has unknown kind ${JSON.stringify(obj.kind)}`);
  for (const k of Object.keys(obj)) if (!keys.includes(k)) breach(n, `has unknown key ${k}`);
  for (const k of keys) if (!Object.hasOwn(obj, k)) breach(n, `lacks ${k}`);
  if (!isStr(obj.id) || !ULID.test(obj.id)) breach(n, 'has a malformed id');
  if (ids.has(obj.id)) breach(n, `is a duplicate id ${obj.id}`);
  if (!isStr(obj.ts) || Number.isNaN(Date.parse(obj.ts))) breach(n, 'has a malformed ts');
  const ref = (id, field, kind) => {
    const t = ids.get(id);
    if (!t) breach(n, `${field} names missing ${id}`);
    if (kind && t.kind !== kind) breach(n, `${field} names a ${t.kind}, not a ${kind}`);
    return t;
  };
  const sha = (s, field) => { if (!isStr(s) || !SHA.test(s) || !logShas.has(s)) breach(n, `${field} names a missing record`); };
  const ws = async (s, field) => {
    if (!isStr(s) || !SHA.test(s)) breach(n, `${field} is not a workspace snapshot`);
    try { await readSnapshot(cwd, s, 'workspace'); } catch { breach(n, `${field} is not a workspace snapshot`); }
  };
  switch (obj.kind) {
    case 'decision':
      if (obj.level !== 'Consequential') breach(n, 'has a level other than Consequential');
      if (!['agent', 'developer', 'joint'].includes(obj.by)) breach(n, 'has an unknown by');
      if (!isStr(obj.title) || !isStr(obj.wrong_if) || !isStr(obj.body) || !strList(obj.rests_on) || !strList(obj.interfaces)) breach(n, 'has a wrongly typed field');
      await ws(obj.base_snap, 'base_snap');
      if (obj.evaluation !== null) sha(obj.evaluation, 'evaluation');
      break;
    case 'realized': {
      const d = ref(obj.of, 'of', 'decision');
      if (obj.base_snap !== d.base_snap) breach(n, 'base_snap differs from the decision base');
      if (!isStr(obj.subject) || !strList(obj.interfaces)) breach(n, 'has a wrongly typed field');
      await ws(obj.snap, 'snap');
      break;
    }
    case 'superseded':
      ref(obj.of, 'of', 'decision'); ref(obj.by, 'by', 'decision');
      if (!CAUSES.includes(obj.cause)) breach(n, 'names an unknown cause');
      break;
    case 'answered': sha(obj.escalation, 'escalation'); sha(obj.answer, 'answer'); break;
    case 'read': ref(obj.of, 'of', 'decision'); sha(obj.record, 'record'); break;
  }
}

async function readRaw(cwd) {
  try { return await readFile(join(cwd, ADR_PATH), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
}

export async function readAdr(cwd) {
  const text = await readRaw(cwd);
  if (text !== '' && !text.endsWith('\n')) throw new AdrError('breach: the last line is not newline-terminated');
  const lines = text === '' ? [] : text.slice(0, -1).split('\n');
  const logShas = new Set((await readLog(cwd)).map((r) => r.sha));
  const ids = new Map();
  const out = [];
  for (const [i, raw] of lines.entries()) {
    let obj;
    try { obj = parseStrict(raw); } catch { breach(i + 1, 'is not canonical JSON'); }
    if (canonicalize(obj) !== raw) breach(i + 1, 'is not canonical JSON');
    await validateLine(cwd, obj, i + 1, ids, logShas);
    ids.set(obj.id, obj);
    out.push(obj);
  }
  return out;
}

export async function appendDecision(cwd, line, { command }) {
  const writers = ASSIGNED[line.kind];
  if (!writers) throw new AdrError(`unknown ADR kind ${JSON.stringify(line.kind)}`);
  if (!writers.includes(command)) {
    const list = writers.length > 1 ? writers.slice(0, -1).join(', ') + ' or ' + writers.at(-1) : writers[0];
    throw new AdrError(`${line.kind} lines are written only by ${list}, not ${command}`);
  }
  const existing = await readAdr(cwd);
  const obj = { ...line, id: line.id ?? ulid(), ts: line.ts ?? new Date().toISOString() };
  const ids = new Map(existing.map((l) => [l.id, l]));
  const logShas = new Set((await readLog(cwd)).map((r) => r.sha));
  await validateLine(cwd, obj, existing.length + 1, ids, logShas);
  await mkdir(dirname(join(cwd, ADR_PATH)), { recursive: true });
  await appendFile(join(cwd, ADR_PATH), canonicalize(obj) + '\n');
  return obj.id;
}

export async function queue(cwd) {
  const lines = await readAdr(cwd);
  const read = new Set(lines.filter((l) => l.kind === 'read').map((l) => l.of));
  return lines.filter((l) => l.kind === 'decision' && !read.has(l.id)).map((l) => l.id);
}

export async function adrDigest(cwd) { return sha256(await readRaw(cwd)); }

export async function decide(cwd, { title, rests_on, wrong_if, body, by = 'agent', evaluation = null, named_paths = [] }, command = 'decide') {
  const { settings } = await loadSettings(cwd);
  const interfaces = named_paths.filter((p) => classify(p, settings) === 'interface').sort();
  const base_snap = await writeWorkspaceSnapshot(cwd);
  return appendDecision(cwd, { kind: 'decision', level: 'Consequential', by, title, rests_on, wrong_if, body, base_snap, evaluation, interfaces }, { command });
}

export async function supersedeDecision(cwd, of, by, cause) {
  return appendDecision(cwd, { kind: 'superseded', of, by, cause }, { command: 'decide' });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/adr.test.mjs`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/adr.mjs tests/adr.test.mjs tests/helpers/commitment-fixture.mjs
git commit -m "Add the append-only ADR with breach rules, queue and digest"
```

---

### Task 2: Items, outside and fix

**Files:**
- Create: `lib/commitment.mjs`
- Create: `tests/commitment.test.mjs`

**Interfaces:**
- Consumes: `appendRecord`, `readLog` (lib/records.mjs); `writeWorkspaceSnapshot`, `readSnapshot` (lib/snapshots.mjs); `listTree` (lib/gitx.mjs); `parseDomainFile` (lib/spec.mjs); `classify` (lib/paths.mjs); `loadSettings` (lib/settings.mjs).
- Produces: `item(cwd, {kind, slug, source, body}) -> sha`; `outside(cwd, itemSha, reason, {evaluation = null} = {}) -> sha` (the evaluation SHA is the section 4 table's optional field, set by plan 09 on a capture route); `fix(cwd, itemSha) -> sha`; `openCommitment(log) -> {open, pending}`; `specBlocks(cwd) -> Map<id, Block>`; `treeDelta(cwd, treeA, treeB) -> [{path, before, after}]`; `CommitmentError`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/commitment.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLog, decodeRecord } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { item, outside, fix, start, openCommitment, CommitmentError } from '../lib/commitment.mjs';
import { project } from './helpers/commitment-fixture.mjs';

const last = async (cwd, kind) => (await readLog(cwd)).filter((r) => r.kind === kind).at(-1);

test('item records backlog, next-feature and defect items with closed payloads', async () => {
  const repo = await project();
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'greet-twice', source: 'DEMO-001', body: 'Greet twice on request.' });
  const n = await item(repo.cwd, { kind: 'next-feature', slug: 'farewell', source: 'DEMO-001 falsifier', body: 'Add goodbye; changes DEMO-001.' });
  const d = await item(repo.cwd, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'Prints helo.' });
  const rec = await last(repo.cwd, 'item');
  assert.equal(rec.sha, d);
  assert.deepEqual(rec.payload, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'Prints helo.' });
  assert.equal(rec.target, 'hello-typo');
  assert.equal(decodeRecord(await catCommit(repo.cwd, b)).kind, 'item');
  assert.equal(decodeRecord(await catCommit(repo.cwd, n)).payload.kind, 'next-feature');
});

test('item refuses an unknown kind, a taken slug, an empty body, and a defect against a non-Agreed requirement', async () => {
  const repo = await project();
  await item(repo.cwd, { kind: 'backlog', slug: 'taken', source: 'DEMO-001', body: 'x' });
  await assert.rejects(item(repo.cwd, { kind: 'idea', slug: 'a', source: 'DEMO-001', body: 'x' }), /kind/);
  await assert.rejects(item(repo.cwd, { kind: 'backlog', slug: 'taken', source: 'DEMO-001', body: 'x' }), /slug taken is taken/);
  await assert.rejects(item(repo.cwd, { kind: 'backlog', slug: 'b', source: 'DEMO-001', body: '  ' }), /body/);
  await assert.rejects(item(repo.cwd, { kind: 'defect', slug: 'c', source: 'DEMO-003', body: 'x' }), /DEMO-003 is not an Agreed requirement/);
  await assert.rejects(item(repo.cwd, { kind: 'backlog', slug: 'd', source: 'DEMO-999', body: 'x' }), /DEMO-999 is not an Agreed requirement/);
});

test('outside names an item and a reason; it refuses a non-item SHA', async () => {
  const repo = await project();
  const i = await item(repo.cwd, { kind: 'backlog', slug: 'greet-twice', source: 'DEMO-001', body: 'x' });
  await outside(repo.cwd, i, 'Repeating the greeting is not part of printing hello.');
  const rec = await last(repo.cwd, 'outside');
  assert.deepEqual(rec.payload, { item: i, reason: 'Repeating the greeting is not part of printing hello.', evaluation: null });
  await assert.rejects(outside(repo.cwd, rec.sha, 'x'), /not an item record/);
  await assert.rejects(outside(repo.cwd, i, ''), /reason/);
});

test('fix names a defect item and a workspace snapshot under an open commitment', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const d = await item(repo.cwd, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'Prints helo.' });
  await repo.write('src/main.mjs', 'console.log("hello!");\n');
  const sha = await fix(repo.cwd, d);
  const rec = await last(repo.cwd, 'fix');
  assert.equal(rec.sha, sha);
  assert.equal(rec.payload.item, d);
  assert.match(rec.payload.snapshot, /^[0-9a-f]{40}$/);
});

test('fix refuses a backlog item, no open commitment, and a snapshot that changes protected contract', async () => {
  const repo = await project();
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'greet-twice', source: 'DEMO-001', body: 'x' });
  const d = await item(repo.cwd, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'x' });
  await assert.rejects(fix(repo.cwd, d), /open commitment/);
  await start(repo.cwd, 'first');
  await assert.rejects(fix(repo.cwd, b), /only a defect item is fixed/);
  await repo.write('AGENTS.md', '# Working agreement\n\nChanged.\n');
  await assert.rejects(fix(repo.cwd, d), (e) => e instanceof CommitmentError && /fix changes protected contract AGENTS.md/.test(e.message));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/commitment.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/commitment.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/commitment.mjs
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
import { listTree } from './gitx.mjs';
import { parseDomainFile } from './spec.mjs';
import { classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';

export class CommitmentError extends Error {}
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KINDS = ['backlog', 'next-feature', 'defect'];
const refuse = (m) => { throw new CommitmentError(m); };

export function openCommitment(log) {
  let open = null, pending = null;
  for (const r of log) {
    if (r.kind === 'start') { open = r; pending = null; }
    else if (r.kind === 'done' && open) open = null;
    else if (r.kind === 'superseded' && open) { pending = r; open = null; }
  }
  return { open, pending };
}

export async function specBlocks(cwd) {
  const dir = join(cwd, 'docs/spec');
  const blocks = new Map();
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const text = await readFile(join(dir, f), 'utf8');
    if (!/^Prefix:/m.test(text)) continue;
    const parsed = parseDomainFile(text);
    for (const b of parsed.blocks) blocks.set(b.id, { ...b, scopeEvery: parsed.header.scopeEvery === true });
  }
  return blocks;
}

export async function treeDelta(cwd, treeA, treeB) {
  const a = new Map((await listTree(cwd, treeA)).map((e) => [e.path, e.sha]));
  const b = new Map((await listTree(cwd, treeB)).map((e) => [e.path, e.sha]));
  const out = [];
  for (const p of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    if (a.get(p) !== b.get(p)) out.push({ path: p, before: a.get(p) ?? null, after: b.get(p) ?? null });
  }
  return out;
}

async function findItem(log, sha) {
  const it = log.find((r) => r.sha === sha && r.kind === 'item');
  if (!it) refuse(`${sha} is not an item record`);
  return it;
}

export async function item(cwd, { kind, slug, source, body }) {
  if (!KINDS.includes(kind)) refuse(`item kind is one of ${KINDS.join(', ')}`);
  if (typeof slug !== 'string' || !SLUG.test(slug)) refuse(`invalid item slug ${slug}`);
  if (typeof body !== 'string' || body.trim() === '') refuse('an item needs a body');
  if (typeof source !== 'string' || source.trim() === '') refuse('an item names its source requirement or the contract it changes');
  if (kind !== 'next-feature') {
    const b = (await specBlocks(cwd)).get(source);
    if (!b || !b.status.startsWith('Agreed')) refuse(`${source} is not an Agreed requirement`);
  }
  const log = await readLog(cwd);
  if (log.some((r) => r.kind === 'item' && r.payload.slug === slug)) refuse(`item slug ${slug} is taken`);
  return appendRecord(cwd, 'item', slug, { kind, slug, source, body });
}

export async function outside(cwd, itemSha, reason, { evaluation = null } = {}) {
  const it = await findItem(await readLog(cwd), itemSha);
  if (typeof reason !== 'string' || reason.trim() === '') refuse('outside needs a reason');
  return appendRecord(cwd, 'outside', it.payload.slug, { item: itemSha, reason, evaluation });
}

export async function protectedDelta(cwd, snapA, snapB) {
  const { settings } = await loadSettings(cwd);
  const a = await readSnapshot(cwd, snapA, 'workspace');
  const b = await readSnapshot(cwd, snapB, 'workspace');
  return (await treeDelta(cwd, a.tree, b.tree)).map((d) => d.path).filter((p) => classify(p, settings) === 'protected');
}

export async function fix(cwd, itemSha) {
  const log = await readLog(cwd);
  const it = await findItem(log, itemSha);
  if (it.payload.kind !== 'defect') refuse('only a defect item is fixed');
  const { open } = openCommitment(log);
  if (!open) refuse('a fix is recorded under an open commitment');
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const changed = await protectedDelta(cwd, open.payload.snapshot, snapshot);
  if (changed.length) refuse(`fix changes protected contract ${changed[0]}`);
  return appendRecord(cwd, 'fix', it.payload.slug, { item: itemSha, snapshot });
}
```

`start` is Task 3; until then the two `fix` tests fail on `start`. Run the three item and outside tests now.

- [ ] **Step 4: Run the tests to verify the item and outside tests pass**

Run: `node --test --test-name-pattern="item|outside" tests/commitment.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/commitment.mjs tests/commitment.test.mjs
git commit -m "Record backlog, next-feature and defect items with outside and fix records"
```

---

### Task 3: `cairn start`: the frozen set, the authorization, one transaction

**Files:**
- Modify: `lib/commitment.mjs`
- Modify: `tests/commitment.test.mjs`

**Interfaces:**
- Consumes: `withTransaction` (lib/tx.mjs); `parseRoadmap`, `lint` (lib/spec.mjs); `git` (lib/gitx.mjs); `canonicalize`, `sha256` (lib/canon.mjs); `writeFile` (node:fs/promises).
- Produces: `start(cwd, slug, {installRefspecs}) -> sha`; `frozenSet(cwd, slug) -> [{requirement, text_digest}]`; `protectedDigests(cwd) -> {spec, agreement, settings}`; `currentAuthorization(cwd, log) -> record|null`; `setCurrent(text, slug) -> text`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/commitment.test.mjs`:

```js
import { frozenSet, protectedDigests, currentAuthorization, setCurrent } from '../lib/commitment.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { git } from '../lib/gitx.mjs';

test('start freezes the roadmap section plus every Scope: every commitment Agreed block, at one workspace snapshot', async () => {
  const repo = await project();
  const calls = [];
  const sha = await start(repo.cwd, 'first', { installRefspecs: async (cwd, remote) => calls.push(remote) });
  const rec = await last(repo.cwd, 'start');
  assert.equal(rec.sha, sha);
  assert.equal(rec.target, 'first');
  assert.deepEqual(Object.keys(rec.payload).sort(), ['from_superseded', 'requirements', 'slug', 'snapshot']);
  assert.deepEqual(rec.payload.requirements.map((r) => r.requirement), ['CORE-001', 'DEMO-001']);
  assert.deepEqual(rec.payload.requirements, await frozenSet(repo.cwd, 'first'));
  assert.equal(rec.payload.from_superseded, null);
  assert.equal((await readSnapshot(repo.cwd, rec.payload.snapshot, 'workspace')).kind, 'workspace');
  assert.equal(decodeRecord(await catCommit(repo.cwd, sha)).kind, 'start');
  assert.deepEqual(calls, ['origin']);
  const status = (await git(['status', '--porcelain', '--', 'docs/spec', 'AGENTS.md', '.cairn/settings.json'], { cwd: repo.cwd })).stdout;
  assert.equal(status, '', 'start committed the contract bytes');
  assert.deepEqual(openCommitment(await readLog(repo.cwd)).open.sha, sha);
});

test('start with a local-only authority remote installs nothing', async () => {
  const repo = await project({ authority_remote: null });
  const calls = [];
  await start(repo.cwd, 'first', { installRefspecs: async () => calls.push(1) });
  assert.deepEqual(calls, []);
});

test('at most one commitment is open', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  await assert.rejects(start(repo.cwd, 'second'), (e) => e instanceof CommitmentError && /commitment first is open; at most one commitment is open/.test(e.message));
  assert.equal((await readLog(repo.cwd)).filter((r) => r.kind === 'start').length, 1);
});

test('start refuses a section naming a non-Agreed requirement, a missing section and a bad slug before writing anything', async () => {
  const repo = await project();
  const before = await readLog(repo.cwd);
  await assert.rejects(start(repo.cwd, 'drafty'), /DEMO-003 is Draft; a commitment names only Agreed requirements/);
  await assert.rejects(start(repo.cwd, 'nowhere'), /roadmap has no section nowhere/);
  await assert.rejects(start(repo.cwd, 'Bad Slug'), /invalid slug/);
  assert.equal((await readLog(repo.cwd)).length, before.length);
});

test('start refuses without a current authorization, and after a protected file changed since it', async () => {
  const repo = await project();
  await repo.write('AGENTS.md', '# Working agreement\n\nEdited after authorize.\n');
  await assert.rejects(start(repo.cwd, 'first'), /no current authorization/);
  assert.equal(await currentAuthorization(repo.cwd, await readLog(repo.cwd)), null);
  await repo.authorize();
  await assert.doesNotReject(start(repo.cwd, 'first'));
});

test('protectedDigests excludes the roadmap and covers every other spec file, the agreement and settings', async () => {
  const repo = await project();
  const a = await protectedDigests(repo.cwd);
  await repo.write('docs/spec/roadmap.md', (await readFile(join(repo.cwd, 'docs/spec/roadmap.md'), 'utf8')) + '\nMore prose.\n');
  const b = await protectedDigests(repo.cwd);
  assert.equal(a.spec, b.spec);
  await repo.write('docs/spec/glossary.md', '# Glossary\n\nchanged\n');
  assert.notEqual((await protectedDigests(repo.cwd)).spec, a.spec);
  assert.equal(a.agreement, sha256(await readFile(join(repo.cwd, 'AGENTS.md'))));
});

test('setCurrent replaces exactly the Current: line', async () => {
  const text = '# Roadmap\n\nCurrent: first\n\n## first\n\nCurrent: not a header\n';
  assert.equal(setCurrent(text, 'second'), '# Roadmap\n\nCurrent: second\n\n## first\n\nCurrent: not a header\n');
  assert.throws(() => setCurrent('# Roadmap\n', 'x'), /no Current: line/);
});
```

Add `import { sha256 } from '../lib/canon.mjs';` to the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/commitment.test.mjs`
Expected: FAIL, `start is not a function` (and the two `fix` tests from Task 2 fail the same way).

- [ ] **Step 3: Write the implementation**

Append to `lib/commitment.mjs`:

```js
import { writeFile, access } from 'node:fs/promises';
import { canonicalize, sha256 } from './canon.mjs';
import { git } from './gitx.mjs';
import { parseRoadmap, lint } from './spec.mjs';
import { withTransaction } from './tx.mjs';

const ROADMAP = 'docs/spec/roadmap.md';
const noop = async () => {};

export function setCurrent(text, slug) {
  const m = /^Current:[ \t]*.*$/m.exec(text);
  if (!m) throw new CommitmentError(`${ROADMAP} has no Current: line`);
  return text.slice(0, m.index) + `Current: ${slug}` + text.slice(m.index + m[0].length);
}

export async function frozenSet(cwd, slug) {
  const roadmap = parseRoadmap(await readFile(join(cwd, ROADMAP), 'utf8'));
  const section = roadmap.sections[slug];
  if (!section) refuse(`roadmap has no section ${slug}`);
  const blocks = await specBlocks(cwd);
  const ids = new Set(section.requirements);
  for (const [id, b] of blocks) if (b.scopeEvery && b.status.startsWith('Agreed')) ids.add(id);
  const set = [];
  for (const id of [...ids].sort()) {
    const b = blocks.get(id);
    if (!b) refuse(`${id} is not in docs/spec`);
    if (!b.status.startsWith('Agreed')) refuse(`${id} is ${b.status.split(' ')[0]}; a commitment names only Agreed requirements`);
    set.push({ requirement: id, text_digest: b.textDigest });
  }
  return set;
}

export async function protectedDigests(cwd) {
  const dir = join(cwd, 'docs/spec');
  const files = (await readdir(dir, { recursive: true })).map((f) => f.replaceAll('\\', '/')).filter((f) => f !== 'roadmap.md').sort();
  const pairs = [];
  for (const f of files) {
    let bytes;
    try { bytes = await readFile(join(dir, f)); } catch (e) { if (e.code === 'EISDIR') continue; throw e; }
    pairs.push([`docs/spec/${f}`, sha256(bytes)]);
  }
  return { spec: sha256(canonicalize(pairs)), agreement: sha256(await readFile(join(cwd, 'AGENTS.md'))), settings: (await loadSettings(cwd)).digest };
}

export async function currentAuthorization(cwd, log) {
  const auth = log.filter((r) => r.kind === 'authorization').at(-1);
  if (!auth) return null;
  const now = await protectedDigests(cwd);
  const p = auth.payload;
  return p.spec_digest === now.spec && p.agreement_digest === now.agreement && p.settings_digest === now.settings ? auth : null;
}

async function prepareStart(cwd, slug, log) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) refuse(`invalid slug ${slug}`);
  const { open, pending } = openCommitment(log);
  if (open) refuse(`commitment ${open.payload.slug} is open; at most one commitment is open`);
  if (pending && pending.payload.successor !== slug) refuse(`pending supersession names successor ${pending.payload.successor}, not ${slug}`);
  const findings = await lint(cwd);
  if (findings.length) refuse(`docs/spec does not lint: ${findings[0]}`);
  const roadmapText = await readFile(join(cwd, ROADMAP), 'utf8');
  const set = await frozenSet(cwd, slug);
  if (!(await currentAuthorization(cwd, log))) refuse('no current authorization binds the specification, working agreement and settings; run cairn authorize');
  const { settings } = await loadSettings(cwd);
  return { pending, set, roadmapText, settings };
}

async function writeStart(cwd, slug, { pending, set, roadmapText, settings }, subject, installRefspecs) {
  const current = parseRoadmap(roadmapText).current;
  if (current !== slug) await writeFile(join(cwd, ROADMAP), setCurrent(roadmapText, slug));
  const paths = ['docs/spec', 'AGENTS.md', '.cairn'];
  if (await access(join(cwd, 'docs/decisions.jsonl')).then(() => true, () => false)) paths.push('docs/decisions.jsonl');
  await git(['add', '-A', '--', ...paths], { cwd });
  await git(['commit', '-q', '--allow-empty', '-m', subject], { cwd });
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const sha = await appendRecord(cwd, 'start', slug, { slug, snapshot, requirements: set, from_superseded: pending ? pending.sha : null });
  if (settings.authority_remote !== null) await installRefspecs(cwd, settings.authority_remote);
  return sha;
}

export async function start(cwd, slug, { installRefspecs = noop } = {}) {
  const log = await readLog(cwd);
  const prepared = await prepareStart(cwd, slug, log);
  const plan = { slug, requirements: prepared.set, from_superseded: prepared.pending ? prepared.pending.sha : null, roadmap_digest: sha256(setCurrent(prepared.roadmapText, slug)) };
  return withTransaction(cwd, { command: 'start', plan }, () => writeStart(cwd, slug, prepared, `Start commitment ${slug}`, installRefspecs));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/commitment.test.mjs`
Expected: PASS, all tests including the two `fix` tests from Task 2. If `decodeRecord` refuses the `start` payload, plan 01's schema table for `start` differs from the key list in Global Constraints; align the table to the writer's list and rerun.

- [ ] **Step 5: Commit**

```bash
git add lib/commitment.mjs tests/commitment.test.mjs
git commit -m "Open a commitment with its frozen set inside one transaction"
```

---

### Task 4: `done`, and the record round-trips

**Files:**
- Modify: `lib/commitment.mjs`
- Modify: `tests/commitment.test.mjs`

**Interfaces:**
- Produces: `done(cwd, slug) -> sha`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/commitment.test.mjs`:

```js
import { done } from '../lib/commitment.mjs';

test('done closes the open commitment at its final workspace snapshot', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  await repo.write('src/main.mjs', 'console.log("hello");\n// final\n');
  const sha = await done(repo.cwd, 'first');
  const rec = await last(repo.cwd, 'done');
  assert.equal(rec.sha, sha);
  assert.deepEqual(Object.keys(rec.payload).sort(), ['slug', 'snapshot']);
  assert.equal(rec.payload.slug, 'first');
  assert.equal((await readSnapshot(repo.cwd, rec.payload.snapshot, 'workspace')).kind, 'workspace');
  assert.equal(openCommitment(await readLog(repo.cwd)).open, null);
  await assert.doesNotReject(start(repo.cwd, 'second'));
});

test('done refuses when no commitment is open or the slug is another commitment', async () => {
  const repo = await project();
  await assert.rejects(done(repo.cwd, 'first'), /no commitment is open/);
  await start(repo.cwd, 'first');
  await assert.rejects(done(repo.cwd, 'second'), /commitment first is open, not second/);
});

test('every record kind of this plan round-trips through decodeRecord', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const d = await item(repo.cwd, { kind: 'defect', slug: 'typo', source: 'DEMO-001', body: 'x' });
  await outside(repo.cwd, d, 'not this commitment');
  await fix(repo.cwd, d);
  await done(repo.cwd, 'first');
  const log = await readLog(repo.cwd);
  for (const kind of ['start', 'item', 'outside', 'fix', 'done']) {
    const rec = log.filter((r) => r.kind === kind).at(-1);
    assert.deepEqual(decodeRecord(await catCommit(repo.cwd, rec.sha)).payload, rec.payload, kind);
  }
});

test('the authorization record carries the three digests by the shared rule', async () => {
  const repo = await project();
  const auth = (await readLog(repo.cwd)).filter((r) => r.kind === 'authorization').at(-1);
  const now = await protectedDigests(repo.cwd);
  assert.deepEqual([auth.payload.spec_digest, auth.payload.agreement_digest, auth.payload.settings_digest], [now.spec, now.agreement, now.settings]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/commitment.test.mjs`
Expected: FAIL, `done is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/commitment.mjs`:

```js
export async function done(cwd, slug) {
  const log = await readLog(cwd);
  const { open } = openCommitment(log);
  if (!open) refuse('no commitment is open');
  if (open.payload.slug !== slug) refuse(`commitment ${open.payload.slug} is open, not ${slug}`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'done', slug, { slug, snapshot });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/commitment.test.mjs`
Expected: PASS. If the authorization test fails, plan 03's `authorize` digests differently from `protectedDigests`; change plan 03 to the rule in Global Constraints (the roadmap is excluded so that `promote` can run without the developer) and rerun.

- [ ] **Step 5: Commit**

```bash
git add lib/commitment.mjs tests/commitment.test.mjs
git commit -m "Close a commitment with a done record at its final snapshot"
```

---

### Task 5: Two-phase supersession

**Files:**
- Modify: `lib/commitment.mjs`
- Modify: `tests/commitment.test.mjs`

**Interfaces:**
- Consumes: `authenticateDeveloper` (lib/auth.mjs); `appendDecision` (lib/adr.mjs); `ulid` (lib/canon.mjs); `withTransaction` (lib/tx.mjs). Carried-record detection reads plan 09's `answer` payload (`escalation`, `kind`), plan 10's `resolution` payload (`source`, `finding`) and the `findings` arrays of `review`, `report` and `acceptance`; those plans keep these key names.
- Produces: `supersede(cwd, successor, {quote}) -> sha`; `carriedRecords(log, open) -> [sha]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/commitment.test.mjs`:

```js
import { supersede, carriedRecords } from '../lib/commitment.mjs';
import { readAdr } from '../lib/adr.mjs';
import { appendRecord } from '../lib/records.mjs';

test('supersede writes the developer-quoted decision and a superseded record, and does not move Current:', async () => {
  const repo = await project();
  const s = await start(repo.cwd, 'first');
  const d = await item(repo.cwd, { kind: 'defect', slug: 'typo', source: 'DEMO-001', body: 'x' });
  const sha = await supersede(repo.cwd, 'second', { quote: 'Drop the greeting work; the name argument matters more.' });
  const rec = await last(repo.cwd, 'superseded');
  assert.equal(rec.sha, sha);
  assert.deepEqual(Object.keys(rec.payload).sort(), ['carried', 'decision', 'evidence', 'slug', 'start', 'successor', 'transition']);
  assert.deepEqual([rec.payload.slug, rec.payload.start, rec.payload.successor, rec.payload.carried], ['first', s, 'second', [d]]);
  assert.match(rec.payload.transition, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  const decision = (await readAdr(repo.cwd)).find((l) => l.id === rec.payload.decision);
  assert.deepEqual([decision.kind, decision.by, decision.body], ['decision', 'developer', 'Drop the greeting work; the name argument matters more.']);
  assert.match(await readFile(join(repo.cwd, 'docs/spec/roadmap.md'), 'utf8'), /^Current: first$/m);
  const state = openCommitment(await readLog(repo.cwd));
  assert.equal(state.open, null);
  assert.equal(state.pending.sha, sha);
  assert.equal(decodeRecord(await catCommit(repo.cwd, sha)).kind, 'superseded');
});

test('the successor start names the superseded record and moves Current: in its own transaction', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const sup = await supersede(repo.cwd, 'second', { quote: 'Switch.' });
  await assert.rejects(start(repo.cwd, 'drafty'), /pending supersession names successor second, not drafty/);
  const s2 = await start(repo.cwd, 'second');
  const rec = await last(repo.cwd, 'start');
  assert.deepEqual([rec.sha, rec.payload.from_superseded, rec.payload.slug], [s2, sup, 'second']);
  assert.match(await readFile(join(repo.cwd, 'docs/spec/roadmap.md'), 'utf8'), /^Current: second$/m);
  assert.equal(openCommitment(await readLog(repo.cwd)).pending, null);
});

test('supersede refuses without an open commitment, without the developer quote, or with a bad successor', async () => {
  const repo = await project();
  await assert.rejects(supersede(repo.cwd, 'second', { quote: 'x' }), /no commitment is open/);
  await start(repo.cwd, 'first');
  await assert.rejects(supersede(repo.cwd, 'second', { quote: '' }), /developer's words/);
  await assert.rejects(supersede(repo.cwd, 'Bad', { quote: 'x' }), /invalid slug/);
});

test('carriedRecords carries unanswered escalations and unfixed defects, not answered or fixed ones', async () => {
  const repo = await project();
  const s = await start(repo.cwd, 'first');
  const log0 = await readLog(repo.cwd);
  const open = openCommitment(log0).open;
  const d1 = await item(repo.cwd, { kind: 'defect', slug: 'one', source: 'DEMO-001', body: 'x' });
  const d2 = await item(repo.cwd, { kind: 'defect', slug: 'two', source: 'DEMO-001', body: 'x' });
  await fix(repo.cwd, d2);
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'later', source: 'DEMO-001', body: 'x' });
  const log = await readLog(repo.cwd);
  assert.deepEqual(carriedRecords(log, open), [d1]);
  assert.equal(carriedRecords(log0, open).length, 0);
  assert.equal(s, open.sha);
  assert.equal(log.some((r) => r.sha === b), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/commitment.test.mjs`
Expected: FAIL, `supersede is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/commitment.mjs`:

```js
import { ulid } from './canon.mjs';
import { authenticateDeveloper } from './auth.mjs';
import { appendDecision } from './adr.mjs';

export function carriedRecords(log, open) {
  const after = log.slice(log.findIndex((r) => r.sha === open.sha) + 1);
  const has = (kind, pred) => after.some((r) => r.kind === kind && pred(r));
  const carried = [];
  for (const r of after) {
    if (r.kind === 'escalation' && !has('answer', (a) => a.payload.escalation === r.sha && ['ok', 'instead'].includes(a.payload.kind))) carried.push(r.sha);
    else if (r.kind === 'item' && r.payload.kind === 'defect' && !has('fix', (f) => f.payload.item === r.sha)) carried.push(r.sha);
    else if (['review', 'report', 'acceptance'].includes(r.kind)) {
      const n = Array.isArray(r.payload.findings) ? r.payload.findings.length : 0;
      const unresolved = [...Array(n).keys()].some((i) => !has('resolution', (x) => x.payload.source === r.sha && x.payload.finding === i + 1));
      if (unresolved) carried.push(r.sha);
    }
  }
  return carried;
}

export async function supersede(cwd, successor, { quote } = {}) {
  if (typeof successor !== 'string' || !SLUG.test(successor)) refuse(`invalid slug ${successor}`);
  const log = await readLog(cwd);
  const { open } = openCommitment(log);
  if (!open) refuse('no commitment is open to supersede');
  if (typeof quote !== 'string' || quote.trim() === '') refuse("supersede needs the developer's words: --quote \"<text>\"");
  const { settings } = await loadSettings(cwd);
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: `supersede ${open.payload.slug} with ${successor}` });
  const carried = carriedRecords(log, open);
  const transition = ulid();
  const plan = { slug: open.payload.slug, start: open.sha, successor, transition, carried };
  return withTransaction(cwd, { command: 'supersede', plan }, async () => {
    const base_snap = await writeWorkspaceSnapshot(cwd);
    const decision = await appendDecision(cwd, {
      kind: 'decision', level: 'Consequential', by: 'developer', title: `Supersede ${open.payload.slug} with ${successor}`,
      rests_on: [`start ${open.sha}`], wrong_if: 'the developer did not choose this successor', body: quote, base_snap, evaluation: null, interfaces: [],
    }, { command: 'supersede' });
    await git(['add', '-A', '--', 'docs/decisions.jsonl'], { cwd });
    await git(['commit', '-q', '-m', `Supersede commitment ${open.payload.slug} with ${successor}`], { cwd });
    return appendRecord(cwd, 'superseded', open.payload.slug, { slug: open.payload.slug, start: open.sha, decision, transition, successor, carried, evidence });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/commitment.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commitment.mjs tests/commitment.test.mjs
git commit -m "Supersede a commitment in two phases with a transition and carried records"
```

---

### Task 6: `promote`: item, decision, `Current:` move and successor start as one transaction

**Files:**
- Modify: `lib/commitment.mjs`
- Modify: `tests/commitment.test.mjs`

**Interfaces:**
- Produces: `promote(cwd, itemSha, {installRefspecs}) -> sha` (the successor start SHA).

- [ ] **Step 1: Write the failing tests**

Append to `tests/commitment.test.mjs`:

```js
import { promote } from '../lib/commitment.mjs';
import { queue } from '../lib/adr.mjs';

async function finished(repo) {
  await start(repo.cwd, 'first');
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'second', source: 'DEMO-002', body: 'Greet by name.' });
  await done(repo.cwd, 'first');
  return b;
}

test('promote writes decision, promotion, Current: move and successor start as one transaction', async () => {
  const repo = await project();
  const b = await finished(repo);
  const calls = [];
  const sha = await promote(repo.cwd, b, { installRefspecs: async (cwd, remote) => calls.push(remote) });
  const log = await readLog(repo.cwd);
  const promotion = log.filter((r) => r.kind === 'promotion').at(-1);
  const startRec = log.at(-1);
  assert.equal(startRec.sha, sha);
  assert.deepEqual([startRec.kind, startRec.payload.slug, startRec.payload.from_superseded], ['start', 'second', null]);
  assert.deepEqual(startRec.payload.requirements.map((r) => r.requirement), ['CORE-001', 'DEMO-002']);
  assert.deepEqual(Object.keys(promotion.payload).sort(), ['decision', 'item']);
  assert.equal(promotion.payload.item, b);
  const decision = (await readAdr(repo.cwd)).find((l) => l.id === promotion.payload.decision);
  assert.deepEqual([decision.by, decision.title], ['agent', 'Promote second']);
  assert.deepEqual(await queue(repo.cwd), [decision.id]);
  assert.match(await readFile(join(repo.cwd, 'docs/spec/roadmap.md'), 'utf8'), /^Current: second$/m);
  assert.equal((await git(['status', '--porcelain', '--', 'docs/spec/roadmap.md', 'docs/decisions.jsonl'], { cwd: repo.cwd })).stdout, '');
  assert.deepEqual(calls, ['origin']);
  assert.equal(decodeRecord(await catCommit(repo.cwd, promotion.sha)).kind, 'promotion');
});

test('promote refuses a next-feature item', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const n = await item(repo.cwd, { kind: 'next-feature', slug: 'second', source: 'DEMO-002 falsifier', body: 'x' });
  await done(repo.cwd, 'first');
  await assert.rejects(promote(repo.cwd, n), (e) => e instanceof CommitmentError && /next-feature item waits for the developer/.test(e.message));
});

test('promote refuses while a defect item is unfixed', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'second', source: 'DEMO-002', body: 'x' });
  await item(repo.cwd, { kind: 'defect', slug: 'typo', source: 'DEMO-001', body: 'x' });
  await done(repo.cwd, 'first');
  await assert.rejects(promote(repo.cwd, b), /defect item typo is unfixed; defects are fixed before promotion/);
});

test('promote refuses while a commitment is open, a section naming Draft text, an already promoted item, and a non-item', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'drafty', source: 'DEMO-001', body: 'x' });
  await assert.rejects(promote(repo.cwd, b), /commitment first is open/);
  await done(repo.cwd, 'first');
  await assert.rejects(promote(repo.cwd, b), /DEMO-003 is Draft/);
  const b2 = await item(repo.cwd, { kind: 'backlog', slug: 'second', source: 'DEMO-002', body: 'x' });
  const s = await promote(repo.cwd, b2);
  await done(repo.cwd, 'second');
  await assert.rejects(promote(repo.cwd, b2), /already promoted/);
  await assert.rejects(promote(repo.cwd, s), /not an item record/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/commitment.test.mjs`
Expected: FAIL, `promote is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/commitment.mjs`:

```js
export async function promote(cwd, itemSha, { installRefspecs = noop } = {}) {
  const log = await readLog(cwd);
  const it = await findItem(log, itemSha);
  const { open, pending } = openCommitment(log);
  if (open) refuse(`commitment ${open.payload.slug} is open; promote runs only after done`);
  if (pending) refuse(`a supersession to ${pending.payload.successor} is pending; start it first`);
  if (it.payload.kind === 'next-feature') refuse('a next-feature item waits for the developer; it is never promoted');
  if (it.payload.kind !== 'backlog') refuse('only a backlog item is promoted');
  if (log.some((r) => r.kind === 'promotion' && r.payload.item === itemSha)) refuse(`item ${it.payload.slug} was already promoted`);
  const unfixed = log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && !log.some((f) => f.kind === 'fix' && f.payload.item === r.sha));
  if (unfixed.length) refuse(`defect item ${unfixed[0].payload.slug} is unfixed; defects are fixed before promotion`);
  const slug = it.payload.slug;
  const prepared = await prepareStart(cwd, slug, log);
  const plan = { item: itemSha, slug, requirements: prepared.set, roadmap_digest: sha256(setCurrent(prepared.roadmapText, slug)) };
  return withTransaction(cwd, { command: 'promote', plan }, async () => {
    const base_snap = await writeWorkspaceSnapshot(cwd);
    const decision = await appendDecision(cwd, {
      kind: 'decision', level: 'Consequential', by: 'agent', title: `Promote ${slug}`, rests_on: [`item ${itemSha}`],
      wrong_if: 'the item is not covered by the Agreed requirements its roadmap section names', body: it.payload.body, base_snap, evaluation: null, interfaces: [],
    }, { command: 'promote' });
    await appendRecord(cwd, 'promotion', slug, { item: itemSha, decision });
    return writeStart(cwd, slug, prepared, `Promote ${slug}`, installRefspecs);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/commitment.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commitment.mjs tests/commitment.test.mjs
git commit -m "Promote one backlog item into a successor commitment in one transaction"
```

---

### Task 7: The realization check behind `build DECISION`

**Files:**
- Modify: `lib/commitment.mjs`
- Modify: `tests/commitment.test.mjs`

**Interfaces:**
- Consumes: `readAdr`, `appendDecision`, `decide` (lib/adr.mjs); `KERNEL_MANAGED`, `matchGlob`, `classify` (lib/paths.mjs).
- Produces: `realize(cwd, decisionId, {subject}) -> id`; `realizationDelta(cwd, decision) -> {snap, delta, stops, interfaces}`; `RealizationError` with `.paths`. Plan 08 turns a `RealizationError` into plan 09's escalation.

- [ ] **Step 1: Write the failing tests**

Append to `tests/commitment.test.mjs`:

```js
import { realize, RealizationError } from '../lib/commitment.mjs';
import { decide } from '../lib/adr.mjs';

const draft = { title: 'Split main', rests_on: ['DEMO-001'], wrong_if: 'the split hides the greeting', body: 'Move the greeting into a module.' };

test('realize records base and realized snapshots for a plain delta and the interface hits it touched', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const id = await decide(repo.cwd, draft);
  await repo.write('src/greet.mjs', 'export const greet = () => "hello";\n');
  await repo.write('src/api/index.mjs', 'export { greet } from "../greet.mjs";\n');
  const rid = await realize(repo.cwd, id, { subject: 'Greeting module and API export' });
  const line = (await readAdr(repo.cwd)).find((l) => l.id === rid);
  const decision = (await readAdr(repo.cwd)).find((l) => l.id === id);
  assert.deepEqual([line.kind, line.of, line.base_snap, line.interfaces], ['realized', id, decision.base_snap, ['src/api/index.mjs']]);
  assert.equal((await readSnapshot(repo.cwd, line.snap, 'workspace')).kind, 'workspace');
});

const appendNewline = (path) => async (repo) => repo.write(path, (await readFile(join(repo.cwd, path), 'utf8')) + '\n');
for (const [name, path, change, cls] of [
  ['a data path', 'migrations/001.sql', (repo) => repo.write('migrations/001.sql', 'create table t;\n'), 'data'],
  ['frozen Agreed text', 'docs/spec/demo.md', appendNewline('docs/spec/demo.md'), 'protected'],
  ['the working agreement', 'AGENTS.md', appendNewline('AGENTS.md'), 'protected'],
  ['protected settings', '.cairn/settings.json', appendNewline('.cairn/settings.json'), 'protected'],
  ['another reserved path', '.cairn/notes.txt', (repo) => repo.write('.cairn/notes.txt', 'x\n'), 'reserved'],
]) {
  test(`realize stops on ${name} in the actual delta`, async () => {
    const repo = await project();
    await start(repo.cwd, 'first');
    const id = await decide(repo.cwd, { ...draft, named_paths: ['src/greet.mjs'] });
    await repo.write('src/greet.mjs', 'export const greet = () => "hello";\n');
    await change(repo);
    await assert.rejects(realize(repo.cwd, id, { subject: 's' }), (e) => e instanceof RealizationError && e.paths.some((p) => p.path === path && p.class === cls) && /the decision is the developer's/.test(e.message));
    assert.equal((await readAdr(repo.cwd)).some((l) => l.kind === 'realized'), false);
  });
}

test('the ADR line the decision itself appended is not a stop; a second realization and an unknown id are refused', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const id = await decide(repo.cwd, draft);
  await realize(repo.cwd, id, { subject: 'no code change' });
  await assert.rejects(realize(repo.cwd, id, { subject: 'again' }), /already realized/);
  await assert.rejects(realize(repo.cwd, '01ARZ3NDEKTSV4RRFFQ69G5FAV', { subject: 'x' }), /no decision/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/commitment.test.mjs`
Expected: FAIL, `realize is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/commitment.mjs`:

```js
import { readAdr } from './adr.mjs';
import { KERNEL_MANAGED, matchGlob } from './paths.mjs';

export class RealizationError extends CommitmentError {
  constructor(message, paths) { super(message); this.paths = paths; }
}
const STOPS = ['data', 'protected', 'reserved'];

export async function realizationDelta(cwd, decision) {
  const { settings } = await loadSettings(cwd);
  const snap = await writeWorkspaceSnapshot(cwd);
  const base = await readSnapshot(cwd, decision.base_snap, 'workspace');
  const realized = await readSnapshot(cwd, snap, 'workspace');
  const delta = await treeDelta(cwd, base.tree, realized.tree);
  const stops = [], interfaces = [];
  for (const { path } of delta) {
    if (KERNEL_MANAGED.some((g) => matchGlob(g, path))) continue;
    const c = classify(path, settings);
    if (STOPS.includes(c)) stops.push({ path, class: c });
    else if (c === 'interface') interfaces.push(path);
  }
  return { snap, delta, stops, interfaces };
}

export async function realize(cwd, decisionId, { subject }) {
  if (typeof subject !== 'string' || subject.trim() === '') refuse('realize needs a subject');
  const adr = await readAdr(cwd);
  const decision = adr.find((l) => l.kind === 'decision' && l.id === decisionId);
  if (!decision) refuse(`no decision ${decisionId}`);
  if (adr.some((l) => l.kind === 'realized' && l.of === decisionId)) refuse(`decision ${decisionId} is already realized`);
  const { snap, stops, interfaces } = await realizationDelta(cwd, decision);
  if (stops.length) {
    const list = stops.map((s) => `${s.path} (${s.class})`).join(', ');
    throw new RealizationError(`realization of ${decisionId} touches ${list}; the decision is the developer's`, stops);
  }
  return appendDecision(cwd, { kind: 'realized', of: decisionId, base_snap: decision.base_snap, snap, subject, interfaces }, { command: 'realize' });
}
```

`KERNEL_MANAGED` (plan 02) matches `.cairn/mechanisms/**` and `docs/decisions.jsonl`; a mutation there is policed by plan 07's preflight before `realize` runs, so the realization delta skips it. Everything else under `.cairn/**` or `docs/spec/**` classifies as `reserved` or `protected` and stops.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/commitment.test.mjs tests/adr.test.mjs`
Expected: PASS in both files.

- [ ] **Step 5: Commit**

```bash
git add lib/commitment.mjs tests/commitment.test.mjs
git commit -m "Check a realization against protected categories before recording it"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| ADR "append-only and kernel-managed. Each line is one canonical JSON object written by `cairn decide`, `cairn escalate` ..., `cairn answer`, `cairn decisions --read`, or `cairn realize`" (2, 4) | 1 (`ASSIGNED`; the writers for `answered` and `read` are plans 09 and 03) |
| Kinds `decision`, `realized`, `superseded`, `answered`, `read` with the section 4 fields (2, 4) | 1 |
| "A decision carries `by`, `rests_on`, `wrong_if`, `body`, and the workspace snapshot from which realization will be measured" (2) | 1 |
| "A realized line names that base and the realized workspace snapshot" (2) | 7 |
| "A later ADR supersession names one of four causes" (8) | 1 |
| "The queue is every decision without a later read line" (4) | 1 |
| "A line written outside its assigned command, a duplicate ID, a noncanonical line, an unknown key, or a reference to a missing record is a breach" (4) | 1, one test each |
| "Commitment ... opened by a start record and closed by a done or superseded record. At most one is open" (2) | 3, 4, 5 |
| Start "set is every requirement in the roadmap section plus every Agreed `Scope: every commitment` block, each with the exact text digest" (2) | 3 |
| "A commitment may name only Agreed requirements" (2) | 3 |
| "`cairn start` resolves the whole set and digests it before writing anything" (4) | 3 |
| "`cairn start` refuses without that authorization" (2) | 3, 4 (the shared digest rule) |
| "`cairn start` stages a command intent, commits the prepared contract, agreement and mechanism bytes, and writes the workspace snapshot and start record as one recoverable transaction, including the frozen set and optional supersession link" (3) | 3 |
| "It installs exact fetch and push refspecs ... only when one is configured" (3) | 3 (calls plan 12's `installRefspecs`) |
| Done "closes a commitment at its final workspace snapshot"; `cairn done` writes the record (2, 3) | 4 |
| Superseded: old start, developer decision, transition ID, successor slug, carried open records; "does not name a future start" (2) | 5 |
| "`cairn supersede` writes the developer-quoted Consequential decision ... It does not move `Current:` and cannot name a start that does not exist" (3) | 5 |
| "The successor's start names the superseded record and `Current:` moves in the same recoverable start transaction" (3) | 3, 5 |
| "Unanswered escalations, unresolved findings and unfixed defect items carry" (2) | 5 |
| Item kinds and what each names; "Outside, promotion and fix records later reference the item" (2, 4) | 2, 6 |
| "An item captured from the commitment's own requirement needs an outside record or an escalation" (8) | 2 (the record; the predicate is plan 08's) |
| `fix ITEM`: "a fix record names the item and a workspace snapshot that changes no protected contract" (5) | 2 |
| "Promotion, roadmap change and successor start form one recoverable transaction, and the new roadmap section may name only Agreed requirements" (8) | 6 |
| "A next-feature item waits for the developer. Defect items are fixed before promotion" (8) | 6 |
| `promote` predicate: "no commitment is open; one promotion names a backlog item and decision; `Current:` and a one-item successor start were written transactionally" (5) | 6 |
| "Promotion never Agrees text" (7) | 3, 6 (`frozenSet` refuses non-Agreed text; nothing writes a Status line) |
| "Each Consequential decision names a base workspace snapshot. `build DECISION` compares that base with the proposed realized workspace snapshot before it accepts the realized line" (8) | 1, 7 |
| "A delta touching a `data` path, frozen Agreed text, the working agreement, protected settings, or any other reserved path stops ... every changed path in the actual delta is classified" (8) | 7, one test per class |
| "An interface hit ... The kernel records it on the decision and on the realized delta" (8) | 1, 7 |
| "The realization check is a postcondition" (8) | 7 (the check runs against the real snapshot at `realize`) |
| Records `start`, `done`, `superseded`, `item`, `outside`, `promotion`, `fix` round-trip through plan 01's decoder (4) | 4, 5, 6 |

Left to other plans, deliberately:

- The `Waiting`, `build`, `done`, `promote`, `capture` and `fix` verdicts and predicates as wake output (5): plan 08 reads `openCommitment`, `queue`, `readAdr` and the records written here.
- "stops and escalates regardless of the evaluation" (8): `realize` stops with `RealizationError`; plan 08 hands it to plan 09's `escalate`.
- `cairn done` refusing while the Done rule does not hold (5): plan 08's CLI guard around `done`, since the rule needs plans 05, 07, 09 and 10.
- The `answered` and `read` ADR lines (4): plans 09 and 03 call `appendDecision` with commands `answer` and `decisions --read`.
- The `Blocking` level as an escalation and the evaluation SHA on a decision (2, 10): plans 09 and 11.
- "While no successor start exists, wake names the pending transition and the existing-project skill resumes it" (2): plan 08 exits 3 from `openCommitment(log).pending`; plan 13 writes the skill.
- Refspec installation (3, 4): plan 12's `installRefspecs`; plan 12 wires it into the CLI calls of `start` and `promote`.
- Recovery of an interrupted `start`, `promote` or `supersede` (4): plan 04's `recover` with the `plan` object these commands pass to `withTransaction`.
- The scope preflight before `start`, `promote`, `supersede`, `realize` and every other state-changing command (5): plan 07.
- The exact-mutation exemption for `docs/decisions.jsonl` writes (2): plan 07 compares the file with the bytes the assigned command appended.
