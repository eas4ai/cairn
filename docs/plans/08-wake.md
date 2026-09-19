# Wake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `lib/wake.mjs`, the read-only referee that turns the repository into one verdict with its action, reason and predicate in section 5's precedence, and `lib/cycle.mjs`, the local administrative-action counter whose bounds produce the cycle escalation and whose guard enforces the liveness invariant.

**Architecture:** `readState(cwd)` reads every store once (log, settings, spec lint, mechanisms, ADR, lease, transaction, working tree) into a plain object; `verdictOf(state)` runs the ordered predicate list and returns the first unmet one; `wake(cwd)` composes them and never writes: no `git status`, no `git diff`, no object write, only `ls-files`, `hash-object` without `-w`, `cat-file`, `rev-parse`, `for-each-ref` and `ls-tree`. Writing belongs to commands: every state-changing command is dispatched through `withLoop`, which runs the command, reads the post-state, and calls `settle`; `settle` counts the administrative action that just completed, resets on semantic progress, and appends the one Blocking cycle escalation when a bound is hit. `guardKernelWrite` is called by the two commands that write kernel-managed paths before their write and refuses a write whose own bookkeeping would create a violation of equal or higher precedence.

**Tech Stack:** Node 24, ES modules, `node --test`, `node:assert/strict`, Git plumbing through `lib/gitx.mjs`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 (Verdict, Predicate, Semantic progress), section 3 (The work loop), section 5 (all), section 6 (what wake prints for hooks), section 13 decisions 10, 22 and 50. Depends on plans 01 to 07.

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Wake writes nothing." "Outside a project, on missing durable refs, during a pending supersession, or with an interrupted transaction, it prints one line naming the command or skill that continues and exits 3; none is a verdict."
- "Wake tests in this order and names the first unmet predicate" (section 5, Precedence). The order is `ORDER` in task 3 and is never reordered.
- "It counts each completed administrative action ... in a local file below the Git directory, keyed by action class and target and reset on semantic progress. The count never travels."
- "A fourth occurrence of the same action class and target, or a twenty-eighth administrative transition of any class, without semantic progress creates one Blocking cycle escalation and preserves every pending obligation." "Three acceptance rounds after the report without reaching Done create the same kind of escalation." "These constants are in the kernel, not settings."
- "If its specified bookkeeping alone would create a new Cairn violation of equal or higher precedence, it refuses the mutation and writes the cycle escalation instead."
- Wake reads records of plans 09, 10 and 11 through `readLog`; fixtures append them with `appendRecord` under plan 01's schemas with these payload keys. `escalation`: `slug, question, recommendation, because, if_wrong, instead, concerns, evaluation`. `answer`: `escalation, kind, text, owner, evidence`. `reply`: `escalation, text`. `review`: `slug, snapshot, examined, answers:[{question, target, status, text}], findings:[{n, text}]`. `brief`: `slug, review, projection, payload, exclusions`. `report`: `slug, snapshot, brief, model, transport, boundary, projection, attempts:[{question, target}], findings, interface_attempts:[path]`. `resolution`: `source, finding, snapshot, explanation`. `acceptance`: `slug, report, snapshot, delta, accepted:[{resolution, reason}], rejected:[{resolution, reason}], findings`. `item`: `kind, slug, source, body`. `outside`: `item, reason, evaluation`. `fix`: `item, snapshot`. `done`: `slug, snapshot`. `superseded`: `slug, start, decision, transition, successor, carried`. `promotion`: `item, decision`. `command-intent`: `transaction, command, inputs, expected, writes`. A receipt's `results` is `[{requirement, text_digest, result}]` and its `status` is `ran` or `error`. An escalation concerning a finding has `concerns` `finding:<source sha>#<n>`; one concerning an item has `item:<sha>`; one concerning a requirement has the identifier; the cycle escalation has `cycle`.
- This plan appends the cycle `escalation` record itself through `appendRecord`, because plan 09 comes later. Plan 09 owns `cairn escalate`; `writeCycleEscalation` here is the one writer outside `lib/escalate.mjs`, and plan 09 keeps the schema.

---

### Task 1: The local counter

**Files:**
- Create: `lib/cycle.mjs`
- Test: `tests/cycle.test.mjs`

**Interfaces:**
- Consumes: `gitPath` from `lib/gitx.mjs`; `canonicalize`, `parseStrict` from `lib/canon.mjs`; `loopRepo` from `tests/helpers/loop.mjs`.
- Produces: `BOUNDS = {sameTarget: 4, total: 28, acceptanceRounds: 3}`; `ADMIN` (the nine classes); `readCounter(cwd) -> {counts, total, last, progress}`; `bump(cwd, actionClass, target) -> {sameTarget, total, bound: null|'sameTarget'|'total'}`; `resetOnProgress(cwd) -> void`.

- [ ] **Step 1: Write the failing test**

```js
// tests/cycle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { loopRepo } from './helpers/loop.mjs';
import { git, gitPath } from '../lib/gitx.mjs';
import { BOUNDS, ADMIN, bump, readCounter, resetOnProgress } from '../lib/cycle.mjs';

test('the counter lives below the Git directory, counts by class and target, and never travels', async () => {
  const r = await loopRepo();
  assert.deepEqual(BOUNDS, { sameTarget: 4, total: 28, acceptanceRounds: 3 });
  assert.equal(ADMIN.size, 9);
  const refsBefore = (await git(['for-each-ref'], { cwd: r.cwd })).stdout;
  let last;
  for (let i = 0; i < 3; i++) last = await bump(r.cwd, 'record', 'src/a.mjs');
  assert.deepEqual(last, { sameTarget: 3, total: 3, bound: null });
  assert.deepEqual(await bump(r.cwd, 'commit', 'src/a.mjs'), { sameTarget: 1, total: 4, bound: null });
  assert.deepEqual(await bump(r.cwd, 'record', 'src/a.mjs'), { sameTarget: 4, total: 5, bound: 'sameTarget' });
  const file = await gitPath(r.cwd, 'cairn-cycle.json');
  assert.ok((await stat(file)).isFile());
  assert.ok(!file.startsWith(r.cwd + '/src'));
  assert.equal((await git(['for-each-ref'], { cwd: r.cwd })).stdout, refsBefore);
  assert.equal((await git(['status', '--porcelain'], { cwd: r.cwd })).stdout, '');
  await resetOnProgress(r.cwd);
  assert.deepEqual((await readCounter(r.cwd)).counts, {});
  assert.equal((await readCounter(r.cwd)).total, 0);
});

test('the twenty-eighth transition of any class is the second bound', async () => {
  const r = await loopRepo();
  const classes = [...ADMIN];
  let res;
  for (let i = 0; i < 28; i++) res = await bump(r.cwd, classes[i % 9], 't' + Math.floor(i / 9));
  assert.equal(res.total, 28);
  assert.equal(res.bound, 'total');
  assert.ok(res.sameTarget < BOUNDS.sameTarget);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/cycle.test.mjs`
Expected: FAIL, `Cannot find module '../lib/cycle.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/cycle.mjs
import { readFile, writeFile, rename } from 'node:fs/promises';
import { gitPath } from './gitx.mjs';
import { canonicalize, parseStrict } from './canon.mjs';

export const BOUNDS = Object.freeze({ sameTarget: 4, total: 28, acceptanceRounds: 3 });
export const ADMIN = new Set(['repair', 'recover', 'reconcile', 'scope', 'record', 'commit', 'declare', 'review mechanism', 'capture']);
const EMPTY = () => ({ counts: {}, total: 0, last: null, progress: null });

const counterFile = (cwd) => gitPath(cwd, 'cairn-cycle.json');

export async function readCounter(cwd) {
  try { return parseStrict(await readFile(await counterFile(cwd), 'utf8')); } catch { return EMPTY(); }
}

export async function writeCounter(cwd, counter) {
  const file = await counterFile(cwd);
  await writeFile(file + '.tmp', canonicalize(counter));
  await rename(file + '.tmp', file);
}

export async function bump(cwd, actionClass, target) {
  const c = await readCounter(cwd);
  const key = `${actionClass}\t${target}`;
  c.counts[key] = (c.counts[key] || 0) + 1;
  c.total += 1;
  await writeCounter(cwd, c);
  const bound = c.counts[key] >= BOUNDS.sameTarget ? 'sameTarget' : c.total >= BOUNDS.total ? 'total' : null;
  return { sameTarget: c.counts[key], total: c.total, bound };
}

export async function resetOnProgress(cwd) {
  const c = await readCounter(cwd);
  await writeCounter(cwd, { ...c, counts: {}, total: 0 });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/cycle.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cycle.mjs tests/cycle.test.mjs
git commit -m "Count completed administrative actions in a local file with the two kernel bounds"
```

---

### Task 2: Fixture steps that reach each point of the loop

**Files:**
- Modify: `tests/helpers/loop.mjs`

**Interfaces:**
- Consumes: `check` from `lib/check.mjs`; `reviewMechanism` from `lib/mechanisms.mjs`; `appendDecision` from `lib/adr.mjs`; `ulid` from `lib/canon.mjs`.
- Produces, on the object `loopRepo` returns: `passReq(REQ)` (fail receipt, mechanism review, then a committed pass), `failReq(REQ)`, `review()`, `report(findings)`, `resolveFinding(source, n)`, `accept({accepted, rejected, findings})`, `escalate(concerns, slug)`, `answer(esc, kind)`, `item(kind, source)`, `decide()`, `runWake()`, `state()`.

- [ ] **Step 1: Add the steps**

Append inside `loopRepo`, before `return`, and add the new imports at the top of the file:

```js
import { check } from '../../lib/check.mjs';
import { reviewMechanism } from '../../lib/mechanisms.mjs';
import { appendDecision } from '../../lib/adr.mjs';
import { spawnSync } from 'node:child_process';
```

```js
  const add = (kind, target, payload) => appendRecord(cwd, kind, target, payload);
  const snap = () => writeWorkspaceSnapshot(cwd);
  const evidence = { mode: 'unsigned-local', author: 'Dev <dev@example.test>' };
  const steps = {
    async passReq(r) {
      await write(`flags/${r}`, 'fail\n'); await commit(`${r} flag fail`);
      const fail = await check(cwd, r);
      await reviewMechanism(cwd, r.toLowerCase(), r, fail);
      await commit(`${r} mechanism reviewed`);
      await write(`flags/${r}`, 'pass\n'); await commit(`${r} flag pass`);
      return check(cwd, r);
    },
    async failReq(r) { await write(`flags/${r}`, 'fail\n'); await commit(`${r} flag fail`); return check(cwd, r); },
    async review(findings = []) {
      const mech = reqs.map((r) => r.toLowerCase());
      const answers = [
        ...mech.flatMap((m) => ['Q1', 'Q2'].map((q) => ({ question: q, target: m, status: 'observed', text: 'flag fail receipt' }))),
        ...reqs.flatMap((r) => ['Q3', 'Q4'].map((q) => ({ question: q, target: r, status: 'observed', text: 'flag pass' }))),
        ...['Q5', 'Q6'].map((q) => ({ question: q, target: slug, status: 'not-checked', text: '' })),
      ];
      return add('review', slug, { slug, snapshot: await snap(), examined: ['src/demo.mjs'], answers, findings });
    },
    async report(findings = []) {
      const log = await readLog(cwd);
      const rev = log.filter((x) => x.kind === 'review').at(-1);
      const brief = await add('brief', slug, { slug, review: rev.sha, projection: 'sha256:' + '1'.repeat(64), payload: 'sha256:' + '2'.repeat(64), exclusions: 'sha256:' + '3'.repeat(64) });
      const attempts = rev.payload.answers.map(({ question, target }) => ({ question, target }));
      return add('report', slug, { slug, snapshot: rev.payload.snapshot, brief, model: 'test-model', transport: 'local', boundary: 'enforced', projection: 'sha256:' + '1'.repeat(64), attempts, findings, interface_attempts: [] });
    },
    resolveFinding: async (source, n) => add('resolution', slug, { source, finding: n, snapshot: await snap(), explanation: 'fixed' }),
    async accept({ accepted = [], rejected = [], findings = [] } = {}) {
      const rep = (await readLog(cwd)).filter((x) => x.kind === 'report').at(-1);
      return add('acceptance', slug, { slug, report: rep.sha, snapshot: await snap(), delta: 'sha256:' + '4'.repeat(64), accepted: accepted.map((s) => ({ resolution: s, reason: 'ok' })), rejected: rejected.map((s) => ({ resolution: s, reason: 'not fixed' })), findings });
    },
    escalate: (concerns, s = slug) => add('escalation', s, { slug: s, question: 'Q?', recommendation: 'R', because: 'B', if_wrong: 'W', instead: 'I', concerns, evaluation: null }),
    answer: (esc, kind, text = '') => add('answer', slug, { escalation: esc, kind, text, owner: null, evidence }),
    reply: (esc) => add('reply', slug, { escalation: esc, text: 'explained' }),
    item: (kind, source, s = 'idea') => add('item', s, { kind, slug: s, source, body: 'an idea' }),
    decide: () => appendDecision(cwd, { kind: 'decision', level: 'Consequential', by: 'agent', title: 'Use a map', rests_on: [], wrong_if: 'lookups are rare', body: 'A map keeps lookups constant.', base_snap: startSnapshot, evaluation: null }),
    runWake: () => spawnSync(process.execPath, [new URL('../../bin/cairn.mjs', import.meta.url).pathname, 'wake'], { cwd, encoding: 'utf8', env: { ...process.env, CAIRN_SESSION: 'test-session' } }),
  };
  return { cwd, slug, reqs, startSha, startSnapshot, write, remove, commit, log: () => readLog(cwd), add, snap, ...steps };
```

Replace the earlier `return { ... }` of task 1 in plan 07 with this one.

- [ ] **Step 2: Run the existing suites**

Run: `node --test tests/scope.test.mjs tests/cycle.test.mjs`
Expected: PASS; the fixture still builds.

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/loop.mjs
git commit -m "Extend the loop fixture with steps that reach review, report, acceptance and decisions"
```

---

### Task 3: Wake reads state, and the exit-3 cases

**Files:**
- Create: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

**Interfaces:**
- Consumes: `readLog`, `range` from `lib/records.mjs`; `readRef`, `catCommit`, `git` from `lib/gitx.mjs`; `readSnapshot` from `lib/snapshots.mjs`; `loadSettings`; `lint`; `readMechanisms`; `isCurrent`, `attempts` from `lib/check.mjs`; `readAdr`; `readLease`; `pendingTransaction` from `lib/tx.mjs`; `openBreaches`, `leaseCovers`, `workspaceDelta`, `declaredPaths`, `isDeclared` from `lib/scope.mjs`; `matchGlob` from `lib/paths.mjs`.
- Produces: `ORDER` (the precedence list), `PREDICATES` (action to predicate text, verbatim from section 5), `FETCH_LINE(remote)`, `readState(cwd, {now, session}) -> state`, `verdictOf(state)`, `wake(cwd) -> {verdict, action, target, reason, predicate} | {verdict:'Waiting', party:'developer', reason, escalation, predicate} | {exit: 3, line}`, `predicates` (the ordered `[{name, test}]`).

- [ ] **Step 1: Write the failing tests**

```js
// tests/wake.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loopRepo } from './helpers/loop.mjs';
import { git } from '../lib/gitx.mjs';
import { check } from '../lib/check.mjs';
import { wake, FETCH_LINE, ORDER } from '../lib/wake.mjs';

test('outside a project wake exits 3 naming the skills', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cairn-none-'));
  assert.deepEqual(await wake(dir), { exit: 3, line: 'cairn: outside a project; run /new-project or /existing-project' });
});

test('missing durable refs print the exact fetch command from section 4, or name init without a remote', async () => {
  const r = await loopRepo();
  await git(['update-ref', '-d', 'refs/cairn/log'], { cwd: r.cwd });
  assert.deepEqual(await wake(r.cwd), { exit: 3, line: 'cairn: missing refs/cairn/log; run cairn init' });
  await git(['remote', 'add', 'origin', 'https://example.invalid/demo.git'], { cwd: r.cwd });
  const settingsFile = join(r.cwd, '.cairn/settings.json');
  await r.write('.cairn/settings.json', JSON.stringify({ ...JSON.parse(await readFile(settingsFile, 'utf8')), authority_remote: 'origin' }));
  const v = await wake(r.cwd);
  assert.equal(v.exit, 3);
  assert.equal(v.line, "git fetch origin 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'");
  assert.equal(FETCH_LINE('origin'), v.line);
});

test('a pending supersession and an interrupted transaction are not verdicts', async () => {
  const r = await loopRepo();
  await r.add('command-intent', 'tx01', { transaction: 'tx01', command: 'start', inputs: {}, expected: {}, writes: [] });
  assert.deepEqual(await wake(r.cwd), { exit: 3, line: 'cairn recover tx01' });
  const r2 = await loopRepo();
  await r2.add('superseded', r2.slug, { slug: r2.slug, start: r2.startSha, decision: '01HZZZZZZZZZZZZZZZZZZZZZZZ', transition: 'tr01', successor: 'second', carried: [] });
  assert.deepEqual(await wake(r2.cwd), { exit: 3, line: 'cairn: pending supersession to second; run /existing-project' });
});

test('the precedence order is the one section 5 states', () => {
  assert.deepEqual(ORDER, ['repair', 'recover', 'reconcile', 'scope', 'waiting', 'fix', 'record', 'declare', 'run', 'review mechanism', 'capture', 'review', 'report', 'resolve', 'accept', 'build', 'done', 'promote']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `Cannot find module '../lib/wake.mjs'`.

- [ ] **Step 3: Implement the skeleton**

```js
// lib/wake.mjs
import { readLog, range } from './records.mjs';
import { readRef, catCommit, git, listTree } from './gitx.mjs';
import { readSnapshot } from './snapshots.mjs';
import { loadSettings } from './settings.mjs';
import { lint } from './spec.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { isCurrent, attempts } from './check.mjs';
import { readAdr } from './adr.mjs';
import { readLease } from './lease.mjs';
import { pendingTransaction } from './tx.mjs';
import { matchGlob } from './paths.mjs';
import { openBreaches, leaseCovers, workspaceDelta, declaredPaths, isDeclared } from './scope.mjs';

export const ORDER = ['repair', 'recover', 'reconcile', 'scope', 'waiting', 'fix', 'record', 'declare', 'run', 'review mechanism', 'capture', 'review', 'report', 'resolve', 'accept', 'build', 'done', 'promote'];
export const FETCH_LINE = (remote) => `git fetch ${remote} 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'`;
export const PREDICATES = {
  repair: 'the named hand-written file reads under its grammar and no unrelated byte changed',
  recover: 'the intent has one terminal domain or abort record and every store matches its resulting identity',
  reconcile: 'the local action lease is gone and the action it named finished or was explicitly abandoned',
  scope: 'every scope-breach record for the path has a developer-approved keep disposition or a restore snapshot equal to its allowed base',
  fix: 'a fix record names the item and a workspace snapshot that changes no protected contract; its requirement has a current pass at or after it',
  record: "the action lease covers the path through its target's declared inputs, or the path is clean",
  commit: 'the path is clean, or the action lease covers it',
  declare: 'a mechanism definition names the requirement and no pre-existing undeclared delta was legalized',
  run: 'a current receipt carries a result for the requirement',
  implement: 'a current receipt says pass and review metadata binds the requirement to the current definition and text digests with a fail receipt',
  escalate: 'after three distinct attempts without a pass, an escalation concerns the requirement before a fourth',
  'review mechanism': 'review metadata has that binding and fail receipt; no declared product input changed',
  capture: 'an outside record names the item, or an escalation concerns it',
  review: 'a review names the current workspace snapshot and answers every fixed question for every target',
  report: 'a current brief and report name the reviewed snapshot and projection; every question and interface obligation has an attempt',
  resolve: 'a resolution names finding N of its exact source record, or an escalation disputes it',
  accept: 'an acceptance at the current workspace snapshot examines the cumulative post-report delta and gives a verdict on every submitted resolution; new findings may remain for the next resolve action',
  build: "a realized ADR line names the decision's base and resulting snapshots and the realization check passed",
  done: 'a done record names the commitment and final workspace snapshot',
  promote: 'no commitment is open; one promotion names a backlog item and decision; Current: and a one-item successor start were written transactionally',
  reply: 'a reply record names the open ask escalation',
  waiting: 'an answer record names the escalation with ok or instead',
};

async function inProject(cwd) {
  const r = await git(['rev-parse', '--show-toplevel'], { cwd }).catch(() => null);
  return r && r.code === 0;
}

export async function readState(cwd, { now = Date.now(), session = process.env.CAIRN_SESSION ?? null } = {}) {
  const st = { cwd, now, session, unreadable: [] };
  const attempt = async (path, fn) => { try { return await fn(); } catch (e) { st.unreadable.push({ path, reason: e.message }); return null; } };
  st.settings = (await attempt('.cairn/settings.json', () => loadSettings(cwd)))?.settings ?? null;
  const findings = await attempt('docs/spec', () => lint(cwd));
  if (findings?.length) st.unreadable.push({ path: findings[0].path ?? 'docs/spec', reason: findings[0].message ?? String(findings[0]) });
  st.mechanisms = (await attempt('.cairn/mechanisms', () => readMechanisms(cwd))) ?? {};
  st.adr = (await attempt('docs/decisions.jsonl', () => readAdr(cwd))) ?? [];
  st.log = await readLog(cwd);
  st.range = range(st.log);
  st.start = st.range.start ?? null;
  st.records = st.range.records ?? [];
  st.closed = Boolean(st.range.closed);
  st.slug = st.start?.payload.slug ?? null;
  st.set = st.start?.payload.requirements ?? [];
  st.lease = await readLease(cwd);
  st.tx = pendingTransaction(cwd, st.log);
  const head = await readRef(cwd, 'HEAD');
  st.dirty = head ? await workspaceDelta(cwd, (await catCommit(cwd, head)).tree) : [];
  st.current = {};
  for (const { requirement } of st.set) st.current[requirement] = await currentReceipt(cwd, st.log, requirement, now);
  st.treeOf = async (snap) => (await readSnapshot(cwd, snap, 'workspace')).tree;
  st.atWorkspace = async (snap) => (await workspaceDelta(cwd, await st.treeOf(snap))).length === 0;
  return st;
}

async function currentReceipt(cwd, log, req, now) {
  for (const r of [...log].reverse()) {
    if (r.kind !== 'receipt') continue;
    const res = r.payload.results.find((x) => x.requirement === req);
    if (!res) continue;
    if (await isCurrent(cwd, r, req, now)) return { sha: r.sha, status: r.payload.status, result: res.result };
  }
  return null;
}

export async function wake(cwd, opts = {}) {
  if (!(await inProject(cwd))) return { exit: 3, line: 'cairn: outside a project; run /new-project or /existing-project' };
  for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots']) {
    if (await readRef(cwd, ref)) continue;
    const remote = (await loadSettings(cwd).catch(() => null))?.settings.authority_remote;
    return { exit: 3, line: remote ? FETCH_LINE(remote) : `cairn: missing ${ref}; run cairn init` };
  }
  return verdictOf(await readState(cwd, opts));
}

export const predicates = [];   // filled by the tasks below, in ORDER
export async function verdictOf(st) {
  for (const p of predicates) {
    const unmet = await p.test(st);
    if (unmet) return unmet.exit ? unmet : { predicate: PREDICATES[unmet.action ?? 'waiting'], ...unmet };
  }
  return { verdict: 'Done', action: null, target: st.slug, reason: `done record closes ${st.slug} and no backlog item waits`, predicate: PREDICATES.done };
}
const define = (name, test) => predicates.push({ name, test });
const unmet = (action, target, reason) => ({ verdict: 'Resolvable', action, target, reason });

define('repair', (st) => st.unreadable.length ? unmet('repair', st.unreadable[0].path, st.unreadable[0].reason) : null);
define('recover', (st) => st.tx ? { exit: 3, line: `cairn recover ${st.tx.payload.transaction}` } : null);
define('supersession', (st) => {
  if (!st.start) return { exit: 3, line: 'cairn: no commitment; run /new-project or /existing-project' };
  const sup = st.records.find((r) => r.kind === 'superseded');
  return sup ? { exit: 3, line: `cairn: pending supersession to ${sup.payload.successor}; run /existing-project` } : null;
});
```

`pendingTransaction` (plan 04) returns the nonterminal `command-intent` record or `null`. The `supersession` entry is not an action, which is why `ORDER` does not list it: it is the exit-3 case section 2 names, tested between `recover` and `reconcile`. Every later task appends its `define(...)` call below the previous one at the end of `lib/wake.mjs`, so the `predicates` array is in `ORDER` by construction; a task's test would name the wrong action if a define were placed higher.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/wake.test.mjs`
Expected: PASS (4 tests). The third test's first repository returns `cairn recover tx01` because `recover` precedes everything after `repair`.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Read the repository into one state object and name the exit-3 cases"
```

---

### Task 4: Wake writes nothing

**Files:**
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the test**

```js
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function treeHash(dir) {
  const h = createHash('sha256');
  for (const e of (await readdir(dir, { recursive: true, withFileTypes: true })).sort((a, b) => (a.parentPath + a.name < b.parentPath + b.name ? -1 : 1))) {
    if (!e.isFile()) continue;
    const p = join(e.parentPath, e.name);
    h.update(p).update(await readFile(p));
  }
  return h.digest('hex');
}

test('wake writes nothing: the Git directory and worktree hash the same before and after', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const gitDir = (await git(['rev-parse', '--absolute-git-dir'], { cwd: r.cwd })).stdout.trim();
  const before = [await treeHash(gitDir), await treeHash(r.cwd)];
  await wake(r.cwd);
  assert.equal(r.runWake().status, 0);
  assert.deepEqual([await treeHash(gitDir), await treeHash(r.cwd)], before);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/wake.test.mjs`
Expected: PASS once task 22 registers `cairn wake`; until then the `runWake` line fails with exit 1. Keep the test; it passes from task 22 on. If the Git-directory hash ever differs, the culprit is a `git status` or `git diff` that refreshed the index, or a `hash-object -w`; wake may use neither.

- [ ] **Step 3: Commit**

```bash
git add tests/wake.test.mjs
git commit -m "Assert that wake leaves the Git directory and worktree byte-identical"
```

---

### Task 5: `repair PATH`

**Files:**
- Modify: `lib/wake.mjs` (already defined in task 3; this task is its fixture)
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the test**

```js
test('an unreadable hand-written input names repair first', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');                       // would be scope, lower precedence
  await r.write('docs/spec/roadmap.md', 'Current: first\n');    // section for first is gone
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Resolvable');
  assert.equal(v.action, 'repair');
  assert.match(v.target, /^docs\/spec/);
  assert.equal(v.predicate, 'the named hand-written file reads under its grammar and no unrelated byte changed');
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/wake.test.mjs`
Expected: PASS. If `lint` (plan 02) reports the roadmap under a different `path` key, adapt the `findings[0].path` read in `readState`, not the test.

- [ ] **Step 3: Commit**

```bash
git add tests/wake.test.mjs
git commit -m "Test that an unreadable input is named before any other action"
```

---

### Task 6: `reconcile ACTION`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { begin, end } from '../lib/lease.mjs';

test('a stale lease is reconciled before scope', async () => {
  const r = await loopRepo();
  process.env.CAIRN_SESSION = 'test-session';               // begin (plan 04) records this as the lease's session
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] });
  delete process.env.CAIRN_SESSION;
  await r.write('src/stray.mjs', 'x\n');
  const other = await wake(r.cwd, { session: 'other-session' });
  assert.deepEqual([other.action, other.target], ['reconcile', 'implement DEMO-001']);
  const same = await wake(r.cwd, { session: null });
  assert.equal(same.action, 'scope');                            // live lease: not stale
  await end(r.cwd);
  await begin(r.cwd, { action: 'implement', target: 'DEMO-009', touch: [] });
  assert.equal((await wake(r.cwd, { session: null })).action, 'reconcile');   // target not in the set
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `other.action` is `'scope'`.

- [ ] **Step 3: Implement**

```js
function leaseStale(st) {
  const l = st.lease;
  if (!l) return null;
  if (l.session && st.session && l.session !== st.session) return 'its session ended';
  const inSet = st.set.some((x) => x.requirement === l.target);
  if (/^[A-Z]+-\d+$/.test(l.target) && !inSet) return `${l.target} is not in the commitment`;
  if (l.action === 'implement' && st.current[l.target]?.result === 'pass') return `${l.target} already passes`;
  if (st.closed) return 'the commitment is closed';
  return null;
}
define('reconcile', (st) => { const why = leaseStale(st); return why ? unmet('reconcile', `${st.lease.action} ${st.lease.target}`, `the action lease is stale: ${why}`) : null; });
```

`begin` (plan 04) records the session from `CAIRN_SESSION` when set; a lease with no session is never stale by session.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name reconcile for a lease whose session ended or whose action is finished"
```

---

### Task 7: `scope PATH`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { preflight, dispose } from '../lib/scope.mjs';

test('an undisposed breach is named before an unanswered escalation', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await r.escalate('DEMO-001');
  const v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'scope', 'src/stray.mjs']);
  await r.remove('src/stray.mjs');
  await dispose(r.cwd, b, 'restore');
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `v.action` is `'reconcile'` or undefined.

- [ ] **Step 3: Implement**

```js
define('scope', (st) => { const b = openBreaches(st.log)[0]; return b ? unmet('scope', b.path, `scope-breach ${b.sha.slice(0, 7)} observed ${b.path} undeclared at ${b.first_observed.slice(0, 7)}`) : null; });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name scope for the oldest undisposed breach"
```

---

### Task 8: Waiting, and `reply SLUG` after `ask`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('an escalation without a final answer is Waiting with the five fields verbatim; ask makes reply Resolvable', async () => {
  const r = await loopRepo();
  const esc = await r.escalate('DEMO-001');
  let v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.party, 'developer');
  assert.deepEqual(v.escalation, { sha: esc, slug: 'first', question: 'Q?', recommendation: 'R', because: 'B', if_wrong: 'W', instead: 'I' });
  await r.answer(esc, 'ask', 'why?');
  v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'reply', 'first']);
  await r.reply(esc);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc, 'instead', 'do this');
  assert.notEqual((await wake(r.cwd)).verdict, 'Waiting');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `v.verdict` is `'Resolvable'`.

- [ ] **Step 3: Implement**

```js
function openEscalations(log) {
  return log.filter((r) => r.kind === 'escalation').map((e) => {
    const after = log.slice(log.indexOf(e) + 1);
    const answers = after.filter((a) => a.kind === 'answer' && a.payload.escalation === e.sha);
    const final = answers.find((a) => a.payload.kind !== 'ask');
    const lastAsk = answers.at(-1)?.payload.kind === 'ask' ? answers.at(-1) : null;
    const replied = lastAsk && after.slice(after.indexOf(lastAsk) + 1).some((x) => x.kind === 'reply' && x.payload.escalation === e.sha);
    return { e, final, lastAsk, replied };
  }).filter((x) => !x.final);
}
define('waiting', (st) => {
  const o = openEscalations(st.log)[0];
  if (!o) return null;
  if (o.lastAsk && !o.replied) return unmet('reply', o.e.payload.slug, `the developer asked: ${o.lastAsk.payload.text}`);
  const { slug, question, recommendation, because, if_wrong, instead } = o.e.payload;
  return { verdict: 'Waiting', party: 'developer', reason: `escalation ${o.e.sha.slice(0, 7)} awaits an answer`, escalation: { sha: o.e.sha, slug, question, recommendation, because, if_wrong, instead }, predicate: PREDICATES.waiting };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Print Waiting for an unanswered escalation and reply after an ask"
```

---

### Task 9: `fix ITEM`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('an unfixed defect against a set requirement is named before dirty inputs', async () => {
  const r = await loopRepo();
  const item = await r.item('defect', 'DEMO-001', 'wrong-greeting');
  await r.write('src/demo.mjs', 'console.log("hey");\n');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['fix', 'wrong-greeting']);
  await r.commit('fix greeting');
  await r.add('fix', 'wrong-greeting', { item, snapshot: await r.snap() });
  assert.equal((await wake(r.cwd)).action, 'fix');           // no current pass at or after the fix yet
  await r.passReq('DEMO-001');
  assert.notEqual((await wake(r.cwd)).action, 'fix');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `v.action` is not `'fix'`.

- [ ] **Step 3: Implement**

```js
async function protectedChanged(st, fromSnap, toSnap) {
  const a = new Map((await listTree(st.cwd, await st.treeOf(fromSnap))).map((e) => [e.path, e.sha]));
  const b = new Map((await listTree(st.cwd, await st.treeOf(toSnap))).map((e) => [e.path, e.sha]));
  const isProt = (p) => p === 'AGENTS.md' || p === '.cairn/settings.json' || p.startsWith('docs/spec/');
  return [...new Set([...a.keys(), ...b.keys()])].filter((p) => isProt(p) && a.get(p) !== b.get(p));
}
define('fix', async (st) => {
  for (const it of st.log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && st.set.some((x) => x.requirement === r.payload.source))) {
    const fix = st.log.filter((r) => r.kind === 'fix' && r.payload.item === it.sha).at(-1);
    if (!fix) return unmet('fix', it.payload.slug, `defect ${it.payload.slug} against ${it.payload.source} has no fix record`);
    if ((await protectedChanged(st, st.start.payload.snapshot, fix.payload.snapshot)).length) return unmet('fix', it.payload.slug, 'the fix snapshot changes a protected path');
    const pass = st.current[it.payload.source];
    if (!pass || pass.result !== 'pass' || st.log.findIndex((r) => r.sha === pass.sha) < st.log.indexOf(fix)) return unmet('fix', it.payload.slug, `${it.payload.source} has no current pass at or after the fix`);
  }
  return null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name fix for a defect item until a fix record and a later current pass exist"
```

---

### Task 10: `record PATH` and `commit PATH`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('a dirty declared input is record without a lease, commit when the lease does not cover it, nothing when it does', async () => {
  const r = await loopRepo();
  await r.write('src/demo.mjs', 'console.log("hey");\n');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target, v.predicate], ['record', 'src/demo.mjs', "the action lease covers the path through its target's declared inputs, or the path is clean"]);
  await begin(r.cwd, { action: 'build-decision', target: '01HZZZZZZZZZZZZZZZZZZZZZZZ', touch: [] });
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['commit', 'src/demo.mjs']);
  await end(r.cwd);
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] });
  assert.notEqual((await wake(r.cwd)).action, 'commit');
  await end(r.cwd);
  await r.commit('clean');
  assert.notEqual((await wake(r.cwd)).action, 'record');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `v.action` is `'declare'` or later.

- [ ] **Step 3: Implement**

```js
define('record', (st) => {
  const declared = declaredPaths(st.mechanisms, null);
  for (const { path } of st.dirty) {
    if (!isDeclared(path, declared)) continue;
    if (!st.lease) return unmet('record', path, `${path} is a declared input with uncommitted changes and no action lease`);
    if (!leaseCovers(st.lease, st.mechanisms, path)) return unmet('commit', path, `${path} is dirty and the lease for ${st.lease.action} ${st.lease.target} does not cover it`);
  }
  return null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name record or commit for a dirty declared input the lease does not cover"
```

---

### Task 11: `declare REQ`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { readState, verdictOf } from '../lib/wake.mjs';

test('declare is named for the first set requirement no definition names', async () => {
  const r = await loopRepo({ reqs: ['DEMO-001', 'DEMO-002'] });
  assert.notEqual((await wake(r.cwd)).action, 'declare');                   // the fixture declares every requirement it starts
  const st = await readState(r.cwd);
  st.set = [...st.set, { requirement: 'DEMO-003', text_digest: 'sha256:' + '0'.repeat(64) }];
  const v = await verdictOf(st);
  assert.deepEqual([v.action, v.target], ['declare', 'DEMO-003']);
  assert.equal(v.predicate, 'a mechanism definition names the requirement and no pre-existing undeclared delta was legalized');
});
```

The test edits the state object because the fixture declares every requirement it starts; `verdictOf` is exported for exactly this kind of fixture.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, second test names `run`.

- [ ] **Step 3: Implement**

```js
const mechanismsFor = (st, req) => Object.entries(st.mechanisms).filter(([, m]) => m.definition.requirements.includes(req));
define('declare', (st) => {
  if (st.closed) return null;
  const missing = st.set.find((x) => mechanismsFor(st, x.requirement).length === 0);
  return missing ? unmet('declare', missing.requirement, `no mechanism definition names ${missing.requirement}`) : null;
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name declare for a set requirement without a mechanism"
```

---

### Task 12: `run REQ`, `implement REQ`, `escalate REQ`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('no current receipt is run; a current fail is implement; three attempts make escalate', async () => {
  const r = await loopRepo();
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['run', 'DEMO-001']);
  await r.failReq('DEMO-001');
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target, v.predicate], ['implement', 'DEMO-001', PREDICATES.implement]);
  for (const body of ['a', 'b']) { await r.write('src/demo.mjs', `// ${body}\n`); await r.failReq('DEMO-001'); }
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['escalate', 'DEMO-001']);
  const esc = await r.escalate('DEMO-001');
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc, 'ok');
  assert.equal((await wake(r.cwd)).action, 'implement');
});
```

Add `PREDICATES` to the import from `../lib/wake.mjs`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, first assertion names a later action.

- [ ] **Step 3: Implement**

```js
function lastPassIndex(st, req) {
  return st.log.findLastIndex((r) => r.kind === 'receipt' && r.payload.status === 'ran' && r.payload.results.some((x) => x.requirement === req && x.result === 'pass'));
}
define('run', (st) => {
  if (st.closed) return null;
  for (const { requirement: req } of st.set) {
    const c = st.current[req];
    if (c && c.status === 'ran' && c.result === 'pass') continue;
    const tried = attempts(st.log, req);
    const escalated = st.log.slice(lastPassIndex(st, req) + 1).some((r) => r.kind === 'escalation' && r.payload.concerns === req);
    if (tried >= 3 && !escalated) return unmet('escalate', req, `${tried} distinct failing attempts at ${req} without a pass`);
    if (!c) return unmet('run', req, `no current receipt carries a result for ${req}`);
    return unmet('implement', req, `the current receipt for ${req} says ${c.status === 'ran' ? c.result : 'error'}`);
  }
  return null;
});
```

`attempts` (plan 05) counts distinct failing input snapshots since the last pass, so the reruns in `passReq` and a documents-only change add nothing.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name run, implement or escalate from the current receipt and the attempt count"
```

---

### Task 13: `review mechanism REQ`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { declare, readMechanisms } from '../lib/mechanisms.mjs';
import { mechanismFor } from './helpers/loop.mjs';

test('a current pass whose review metadata is unbound is review mechanism', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  assert.equal((await wake(r.cwd)).action, 'review');
  await declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] });
  await r.write('src/util.mjs', '');
  await r.commit('widen inputs');
  await r.failReq('DEMO-001');
  await r.write('flags/DEMO-001', 'pass\n'); await r.commit('pass again');
  await (await import('../lib/check.mjs')).check(r.cwd, 'DEMO-001');
  const v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['review mechanism', 'DEMO-001']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, the last verdict is `review`.

- [ ] **Step 3: Implement**

```js
function reviewBound(st, req) {
  const frozen = st.set.find((x) => x.requirement === req)?.text_digest;
  return mechanismsFor(st, req).some(([, m]) => {
    const rv = m.review?.[req];
    if (!rv || rv.definitionDigest !== m.definitionDigest || rv.textDigest !== frozen) return false;
    const fr = st.log.find((r) => r.sha === rv.failReceipt);
    return Boolean(fr && fr.kind === 'receipt' && fr.payload.status === 'ran' && fr.payload.results.some((x) => x.requirement === req && x.result === 'fail'));
  });
}
define('review mechanism', (st) => {
  if (st.closed) return null;
  const stale = st.set.find((x) => !reviewBound(st, x.requirement));
  return stale ? unmet('review mechanism', stale.requirement, `review metadata for ${stale.requirement} is missing or bound to another definition or text digest`) : null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name review mechanism when a passing requirement's review metadata is unbound"
```

---

### Task 14: `capture ITEM`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('an item captured from a set requirement needs an outside record or an escalation', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  const item = await r.item('backlog', 'DEMO-001', 'nicer-greeting');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['capture', 'nicer-greeting']);
  await r.add('outside', 'nicer-greeting', { item, reason: 'the greeting text is not in DEMO-001', evaluation: null });
  assert.equal((await wake(r.cwd)).action, 'review');
  const item2 = await r.item('next-feature', 'DEMO-001', 'colour');
  await r.escalate(`item:${item2}`);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `v.action` is `'review'`.

- [ ] **Step 3: Implement**

```js
define('capture', (st) => {
  if (st.closed) return null;
  for (const it of st.records.filter((r) => r.kind === 'item' && r.payload.kind !== 'defect' && st.set.some((x) => x.requirement === r.payload.source))) {
    const covered = st.log.some((r) => (r.kind === 'outside' && r.payload.item === it.sha) || (r.kind === 'escalation' && r.payload.concerns === `item:${it.sha}`));
    if (!covered) return unmet('capture', it.payload.slug, `item ${it.payload.slug} surfaced from ${it.payload.source} and nothing says why it is outside`);
  }
  return null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name capture for an item from the commitment's own requirement"
```

---

### Task 15: `review SLUG`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('review is named until a review at the current workspace answers every fixed question for every target', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['review', 'first']);
  const rev = await r.review();
  assert.equal((await wake(r.cwd)).action, 'report');
  await r.write('src/demo.mjs', 'console.log("hello");\n// note\n'); await r.commit('later edit');
  await check(r.cwd, 'DEMO-001');                                   // keep the receipt current: src/demo.mjs is an input
  assert.equal((await wake(r.cwd)).action, 'review');              // no report yet: the review must be current
  const log = await r.log();
  const partial = { ...log.find((x) => x.sha === rev).payload, snapshot: await r.snap(), answers: [] };
  await r.add('review', 'first', partial);
  v = await wake(r.cwd);
  assert.equal(v.action, 'review');
  assert.match(v.reason, /Q1 for demo-001/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, first verdict is `Done` or `build`.

- [ ] **Step 3: Implement**

```js
function requiredQuestions(st) {
  const mech = [...new Set(st.set.flatMap((x) => mechanismsFor(st, x.requirement).map(([n]) => n)))];
  return [...mech.flatMap((m) => [['Q1', m], ['Q2', m]]), ...st.set.flatMap((x) => [['Q3', x.requirement], ['Q4', x.requirement]]), ['Q5', st.slug], ['Q6', st.slug]];
}
export const latest = (st, kind) => st.records.filter((r) => r.kind === kind).at(-1) ?? null;
define('review', async (st) => {
  if (st.closed) return null;
  const rev = latest(st, 'review');
  if (!rev) return unmet('review', st.slug, `no review names a workspace snapshot for ${st.slug}`);
  const missing = requiredQuestions(st).find(([q, t]) => !rev.payload.answers.some((a) => a.question === q && a.target === t));
  if (missing) return unmet('review', st.slug, `the review answers nothing for ${missing[0]} for ${missing[1]}`);
  if (!latest(st, 'report') && !(await st.atWorkspace(rev.payload.snapshot))) return unmet('review', st.slug, 'the workspace differs from the reviewed snapshot and no report exists yet');
  return null;
});
```

Once a report exists the review is the one the report names; later changes are the acceptance's concern (task 18), which is why currency is only checked before the report.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name review until a current review answers every fixed question for every target"
```

---

### Task 16: `report SLUG`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('report is named until a brief and report name the reviewed snapshot with every attempt', async () => {
  const r = await loopRepo({ settings: { interfaces: ['src/api/**'] } });
  await r.write('src/api/index.mjs', 'export const api = 1;\n');
  await r.commit('api');
  await declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/api'] });
  await r.commit('declare api');
  await r.passReq('DEMO-001');
  await r.review();
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['report', 'first']);
  const rep = await r.report();
  v = await wake(r.cwd);
  assert.equal(v.action, 'report');
  assert.match(v.reason, /interface src\/api\/index\.mjs/);
  const log = await r.log();
  await r.add('report', 'first', { ...log.find((x) => x.sha === rep).payload, interface_attempts: ['src/api/index.mjs'] });
  assert.notEqual((await wake(r.cwd)).action, 'report');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, first verdict is not `report`.

- [ ] **Step 3: Implement**

```js
async function interfaceObligations(st, rev) {
  const a = new Map((await listTree(st.cwd, await st.treeOf(st.start.payload.snapshot))).map((e) => [e.path, e.sha]));
  const b = new Map((await listTree(st.cwd, await st.treeOf(rev.payload.snapshot))).map((e) => [e.path, e.sha]));
  const globs = st.settings?.interfaces ?? [];
  return [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p) && globs.some((g) => matchGlob(g, p)));
}
define('report', async (st) => {
  if (st.closed) return null;
  const rev = latest(st, 'review');
  const rep = latest(st, 'report');
  const brief = rep && st.records.find((r) => r.kind === 'brief' && r.sha === rep.payload.brief);
  if (!rep || !brief || brief.payload.review !== rev.sha || rep.payload.snapshot !== rev.payload.snapshot || rep.payload.projection !== brief.payload.projection) return unmet('report', st.slug, `no report names the reviewed snapshot ${rev.payload.snapshot.slice(0, 7)} through a current brief`);
  const q = requiredQuestions(st).find(([q, t]) => !rep.payload.attempts.some((a) => a.question === q && a.target === t));
  if (q) return unmet('report', st.slug, `the report has no attempt at ${q[0]} for ${q[1]}`);
  const iface = (await interfaceObligations(st, rev)).find((p) => !rep.payload.interface_attempts.includes(p));
  if (iface) return unmet('report', st.slug, `the report has no caller-level attempt at interface ${iface}`);
  return null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name report until a brief and report cover every question and changed interface"
```

---

### Task 17: `resolve SLUG N`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('every finding on the review, report or an acceptance needs a resolution or a dispute; a rejection reopens it', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  await r.review([{ n: 1, text: 'builder finding' }]);
  const rep = await r.report([{ n: 1, text: 'adversary finding' }]);
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['resolve', 'first 1']);
  const rev = (await r.log()).find((x) => x.kind === 'review').sha;
  await r.resolveFinding(rev, 1);
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['resolve', 'first 1']);
  assert.match(v.reason, /report/);
  const res = await r.resolveFinding(rep, 1);
  assert.equal((await wake(r.cwd)).action, 'accept');
  await r.accept({ rejected: [res] });
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['resolve', 'first 1']);
  await r.escalate(`finding:${rep}#1`);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, first verdict is `accept` or later.

- [ ] **Step 3: Implement**

```js
function findingSources(st) {
  const rev = latest(st, 'review'), rep = latest(st, 'report');
  return [rev, rep, ...st.records.filter((r) => r.kind === 'acceptance')].filter(Boolean);
}
function openFindings(st) {
  const accs = st.records.filter((r) => r.kind === 'acceptance');
  const rejected = new Set(accs.flatMap((a) => a.payload.rejected.map((x) => x.resolution)));
  const rejections = (src, n) => accs.flatMap((a) => a.payload.rejected).filter((x) => { const res = st.log.find((r) => r.sha === x.resolution); return res && res.payload.source === src && res.payload.finding === n; }).length;
  const out = [];
  for (const src of findingSources(st)) for (const f of src.payload.findings) {
    const resolved = st.records.some((r) => r.kind === 'resolution' && r.payload.source === src.sha && r.payload.finding === f.n && !rejected.has(r.sha));
    const disputed = st.log.some((r) => r.kind === 'escalation' && r.payload.concerns === `finding:${src.sha}#${f.n}`);
    if (!resolved && !disputed) out.push({ source: src, n: f.n, rejections: rejections(src.sha, f.n) });
  }
  return out;
}
define('resolve', (st) => {
  if (st.closed) return null;
  const f = openFindings(st)[0];
  if (!f) return null;
  const why = f.rejections >= 2 ? `finding ${f.n} on the ${f.source.kind} was rejected twice; dispute it by escalation` : `finding ${f.n} on the ${f.source.kind} ${f.source.sha.slice(0, 7)} has no accepted resolution`;
  return unmet('resolve', `${st.slug} ${f.n}`, why);
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name resolve for each finding without an accepted resolution or a dispute"
```

---

### Task 18: `accept SLUG`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('post-report resolutions or a changed workspace need an acceptance at the current snapshot', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  await r.review();
  const rep = await r.report([{ n: 1, text: 'finding' }]);
  await r.write('src/demo.mjs', 'console.log("hello");\n// fixed\n'); await r.commit('fix');
  await check(r.cwd, 'DEMO-001');                                   // the fix touched an input: refresh the pass first
  const res = await r.resolveFinding(rep, 1);
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['accept', 'first']);
  await r.accept({ accepted: [res] });
  assert.notEqual((await wake(r.cwd)).action, 'accept');
  await r.write('src/demo.mjs', 'console.log("hello");\n// again\n'); await r.commit('unreviewed change');
  await check(r.cwd, 'DEMO-001');
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['accept', 'first']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, the first verdict is `build`, `done` or `Done`.

- [ ] **Step 3: Implement**

```js
define('accept', async (st) => {
  if (st.closed) return null;
  const rep = latest(st, 'report');
  const after = st.records.slice(st.records.indexOf(rep) + 1);
  const resolutions = after.filter((r) => r.kind === 'resolution');
  const acc = after.filter((r) => r.kind === 'acceptance').at(-1) ?? null;
  const lastRes = resolutions.at(-1);
  const unexamined = lastRes && (!acc || after.indexOf(acc) < after.indexOf(lastRes));
  const moved = !(await st.atWorkspace(acc ? acc.payload.snapshot : rep.payload.snapshot));
  if (unexamined) return unmet('accept', st.slug, `resolution ${lastRes.sha.slice(0, 7)} has no acceptance after it`);
  if (moved) return unmet('accept', st.slug, `the workspace differs from the ${acc ? 'last accepted' : 'reported'} snapshot; the cumulative delta needs an acceptance`);
  return null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name accept while resolutions or workspace changes lack an acceptance at the current snapshot"
```

---

### Task 19: `build DECISION`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { appendDecision } from '../lib/adr.mjs';

test('an unrealized Consequential decision is build until a realized line names it', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review(); await r.report();
  const id = await r.decide();
  await r.commit('record decision');
  await r.accept();                       // docs/decisions.jsonl is in the workspace: the delta needs an acceptance first
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['build', id]);
  await appendDecision(r.cwd, { kind: 'realized', of: id, base_snap: r.startSnapshot, snap: await r.snap(), subject: 'map in place' });
  await r.commit('realized');
  await r.accept();
  assert.notEqual((await wake(r.cwd)).action, 'build');
});
```

`build` sits after `accept` in precedence: the adversary examines every post-report realization at the final tree, so the acceptance comes first in this fixture.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `v.action` is `'done'`.

- [ ] **Step 3: Implement**

```js
define('build', (st) => {
  const closedIds = new Set(st.adr.filter((l) => l.kind === 'realized' || l.kind === 'superseded').map((l) => l.of));
  const open = st.adr.find((l) => l.kind === 'decision' && l.level === 'Consequential' && !closedIds.has(l.id));
  return open ? unmet('build', open.id, `decision ${open.id} (${open.title}) has no realized line`) : null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name build for a Consequential decision without a realized line"
```

---

### Task 20: The Done rule and `done SLUG`

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

**Interfaces:**
- Produces: `doneRule(state) -> {holds, failed: [bullet]}` where a bullet is one of `'evidence'`, `'review-report'`, `'acceptance'`, `'obligations'`, the four bullets of section 5 in order.

- [ ] **Step 1: Write the failing tests**

```js
import { doneRule, readState } from '../lib/wake.mjs';

async function finished() {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review(); await r.report();
  return r;
}

test('Done rule bullet 1: every frozen requirement has a current bound pass', async () => {
  const r = await finished();
  await r.write('src/demo.mjs', 'console.log("changed");\n'); await r.commit('stale the receipt');
  const st = await readState(r.cwd);
  assert.deepEqual(doneRule(st).failed, ['evidence', 'acceptance']);
  assert.equal((await wake(r.cwd)).action, 'run');
});

test('Done rule bullet 2: a review and report exist at the reviewed snapshot', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  assert.deepEqual(doneRule(await readState(r.cwd)).failed, ['review-report']);
  await r.review();
  assert.deepEqual(doneRule(await readState(r.cwd)).failed, ['review-report']);
});

test('Done rule bullet 3: the latest acceptance is at the final snapshot with every resolution accepted and every finding answered', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review();
  const rep = await r.report([{ n: 1, text: 'f' }]);
  assert.deepEqual(doneRule(await readState(r.cwd)).failed, ['acceptance']);
  const res = await r.resolveFinding(rep, 1);
  await r.accept({ rejected: [res] });
  assert.deepEqual(doneRule(await readState(r.cwd)).failed, ['acceptance']);
  const res2 = await r.resolveFinding(rep, 1);
  await r.accept({ accepted: [res2] });
  assert.equal(doneRule(await readState(r.cwd)).holds, true);
});

test('Done rule bullet 4: no escalation, breach, defect, transaction, lease, decision or cycle escalation is open', async () => {
  const r = await finished();
  const esc = await r.escalate('cycle');
  assert.deepEqual(doneRule(await readState(r.cwd)).failed, ['obligations']);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc, 'ok');
  assert.equal(doneRule(await readState(r.cwd)).holds, true);
  const v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'done', 'first']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, `doneRule is not a function`.

- [ ] **Step 3: Implement**

```js
export async function doneRule(st) {
  const failed = [];
  if (!st.set.every((x) => st.current[x.requirement]?.result === 'pass' && st.current[x.requirement].status === 'ran' && reviewBound(st, x.requirement))) failed.push('evidence');
  const rev = latest(st, 'review'), rep = latest(st, 'report');
  if (!rev || !rep || rep.payload.snapshot !== rev.payload.snapshot) failed.push('review-report');
  else {
    const after = st.records.slice(st.records.indexOf(rep) + 1);
    const acc = after.filter((r) => r.kind === 'acceptance').at(-1);
    const resolutions = after.filter((r) => r.kind === 'resolution');
    const accepted = new Set(after.flatMap((a) => a.kind === 'acceptance' ? a.payload.accepted.map((x) => x.resolution) : []));
    const needsAcc = resolutions.length > 0 || !(await st.atWorkspace(rep.payload.snapshot));
    const atFinal = acc ? await st.atWorkspace(acc.payload.snapshot) : !needsAcc;
    if (!atFinal || !resolutions.every((r) => accepted.has(r.sha) || after.some((a) => a.kind === 'acceptance' && a.payload.rejected.some((x) => x.resolution === r.sha))) || openFindings(st).length) failed.push('acceptance');
  }
  const closedIds = new Set(st.adr.filter((l) => l.kind !== 'decision').map((l) => l.of));
  if (openEscalations(st.log).length || openBreaches(st.log).length || st.tx || leaseStale(st) || st.adr.some((l) => l.kind === 'decision' && !closedIds.has(l.id))
    || st.log.some((r) => r.kind === 'item' && r.payload.kind === 'defect' && st.set.some((x) => x.requirement === r.payload.source) && !st.log.some((f) => f.kind === 'fix' && f.payload.item === r.sha))) failed.push('obligations');
  return { holds: failed.length === 0, failed };
}
define('done', async (st) => {
  if (st.closed) return null;
  const { holds, failed } = await doneRule(st);
  return holds ? unmet('done', st.slug, `the Done rule holds for ${st.slug} and no done record exists`) : unmet('done', st.slug, `the Done rule fails on ${failed.join(', ')} although every earlier predicate holds`);
});
```

The second branch is defensive: every earlier predicate holding implies the rule holds; if it ever fires, a predicate above it has a gap, and the reason says which bullet.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Evaluate the four bullets of the Done rule and name done when they hold"
```

---

### Task 21: `promote` and the Done verdict

**Files:**
- Modify: `lib/wake.mjs`
- Test: `tests/wake.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('a closed range with a backlog item names promote; without one the verdict is Done', async () => {
  const r = await finished();
  await r.add('done', 'first', { slug: 'first', snapshot: await r.snap() });
  let v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Done', null, 'first']);
  const item = await r.item('backlog', 'DEMO-001', 'nicer-greeting');
  await r.add('outside', 'nicer-greeting', { item, reason: 'later', evaluation: null });
  v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'promote', 'nicer-greeting']);
  await r.item('next-feature', 'DEMO-001', 'colour');
  await r.add('promotion', 'nicer-greeting', { item, decision: '01HZZZZZZZZZZZZZZZZZZZZZZZ' });
  assert.equal((await wake(r.cwd)).verdict, 'Done');   // a next-feature item waits for the developer
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, the second verdict is `Done`.

- [ ] **Step 3: Implement**

```js
define('promote', (st) => {
  if (!st.closed || st.records.some((r) => r.kind === 'superseded')) return null;
  const promoted = new Set(st.log.filter((r) => r.kind === 'promotion').map((r) => r.payload.item));
  const item = st.log.find((r) => r.kind === 'item' && r.payload.kind === 'backlog' && !promoted.has(r.sha));
  return item ? unmet('promote', item.payload.slug, `backlog item ${item.payload.slug} waits and no commitment is open`) : null;
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs tests/wake.test.mjs
git commit -m "Name promote for a waiting backlog item after done, otherwise Done"
```

---

### Task 22: `cairn wake` output for the agent and the hooks

**Files:**
- Modify: `lib/wake.mjs`, `lib/cli.mjs`
- Test: `tests/wake.test.mjs`

**Interfaces:**
- Produces: `render(result) -> string` and `cmdWake(cwd) -> 0|3`. Hooks (plan 13) print exactly this text; section 6 needs nothing more from wake.

- [ ] **Step 1: Write the failing test**

```js
test('cairn wake prints verdict, action or party, one reason line and the predicate; Waiting adds the five fields', async () => {
  const r = await loopRepo();
  let out = r.runWake();
  assert.equal(out.status, 0);
  assert.deepEqual(out.stdout.split('\n').slice(0, 4), ['verdict: Resolvable', 'action: run DEMO-001', 'reason: no current receipt carries a result for DEMO-001', `predicate: ${PREDICATES.run}`]);
  await r.escalate('DEMO-001');
  out = r.runWake();
  const lines = out.stdout.split('\n');
  assert.deepEqual(lines.slice(0, 2), ['verdict: Waiting', 'party: developer']);
  assert.match(lines[2], /^reason: escalation [0-9a-f]{7} awaits an answer$/);
  assert.deepEqual(lines.slice(3, 10), ['question: Q?', 'recommendation: R', 'because: B', 'if wrong: W', 'instead: I', `predicate: ${PREDICATES.waiting}`, 'answer: cairn answer first ok | instead <text> | ask <text>']);
  const dir = await mkdtemp(join(tmpdir(), 'cairn-none-'));
  const none = spawnSync(process.execPath, [new URL('../bin/cairn.mjs', import.meta.url).pathname, 'wake'], { cwd: dir, encoding: 'utf8' });
  assert.equal(none.status, 3);
  assert.equal(none.stdout, 'cairn: outside a project; run /new-project or /existing-project\n');
});
```

Add `import { spawnSync } from 'node:child_process';` to the test file.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/wake.test.mjs`
Expected: FAIL, exit 1 with `cairn: unknown command wake`.

- [ ] **Step 3: Implement**

In `lib/wake.mjs`:

```js
export function render(v) {
  if (v.exit === 3) return v.line + '\n';
  if (v.verdict === 'Waiting') {
    const e = v.escalation;
    return ['verdict: Waiting', 'party: developer', `reason: ${v.reason}`, `question: ${e.question}`, `recommendation: ${e.recommendation}`, `because: ${e.because}`, `if wrong: ${e.if_wrong}`, `instead: ${e.instead}`, `predicate: ${v.predicate}`, `answer: cairn answer ${e.slug} ok | instead <text> | ask <text>`].join('\n') + '\n';
  }
  const action = v.verdict === 'Done' ? `commitment: ${v.target}` : `action: ${v.action} ${v.target}`;
  return [`verdict: ${v.verdict}`, action, `reason: ${v.reason}`, `predicate: ${v.predicate}`].join('\n') + '\n';
}
export async function cmdWake(cwd) {
  const v = await wake(cwd);
  process.stdout.write(render(v));
  return v.exit === 3 ? 3 : 0;
}
```

In `lib/cli.mjs`, add `wake: { usage: 'wake', run: (cwd) => cmdWake(cwd) }` to `COMMANDS` and `import { cmdWake } from './wake.mjs';`. `wake` is not in `STATE_CHANGING`, so the dispatch from plan 07 runs no preflight for it.

- [ ] **Step 4: Run every wake test**

Run: `node --test tests/wake.test.mjs`
Expected: PASS, including task 4's purity test, which now also runs the binary.

- [ ] **Step 5: Commit**

```bash
git add lib/wake.mjs lib/cli.mjs tests/wake.test.mjs
git commit -m "Print the verdict, action or party, reason and predicate from cairn wake"
```

---

### Task 23: Semantic progress, `settle`, and the cycle escalation

**Files:**
- Modify: `lib/cycle.mjs`, `lib/wake.mjs`
- Test: `tests/cycle.test.mjs`

**Interfaces:**
- Consumes: `appendRecord` from `lib/records.mjs`; `readState`, `verdictOf`, `doneRule`, `ORDER`, `latest` helpers from `lib/wake.mjs`.
- Produces in `lib/wake.mjs`: `progressSummary(state) -> {passes, obligations, index, phase, answered}` and `progressMade(before, after) -> boolean` (section 2, Semantic progress). In `lib/cycle.mjs`: `settle(cwd, verdict, state) -> {bound: null | {kind, actionClass, target}}` and `writeCycleEscalation(cwd, slug, bound) -> sha`.

- [ ] **Step 1: Write the failing tests**

```js
import { settle } from '../lib/cycle.mjs';
import { readState, verdictOf, wake, progressMade, progressSummary } from '../lib/wake.mjs';
const V = (action, target) => ({ verdict: 'Resolvable', action, target, reason: '', predicate: '' });

test('a fourth same-target administrative completion writes one Blocking cycle escalation and keeps every obligation', async () => {
  const r = await loopRepo();
  await r.write('src/demo.mjs', 'console.log("dirty");\n');     // a dirty declared input: the record obligation
  const st = await readState(r.cwd);
  let bound = null, n = 0;
  while (!bound && n < 10) { bound = (await settle(r.cwd, V(n % 2 ? 'commit' : 'record', 'src/a.mjs'), st)).bound; n++; }
  assert.deepEqual(bound, { kind: 'sameTarget', actionClass: 'record', target: 'src/a.mjs' });
  assert.ok(n <= 8);
  const esc = (await r.log()).filter((x) => x.kind === 'escalation');
  assert.equal(esc.length, 1);
  assert.equal(esc[0].payload.concerns, 'cycle');
  assert.deepEqual((await settle(r.cwd, V('record', 'src/a.mjs'), st)).bound, null);   // one escalation, not one per completion
  assert.equal((await r.log()).filter((x) => x.kind === 'escalation').length, 1);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc[0].sha, 'ok');
  assert.deepEqual([(await wake(r.cwd)).action, (await wake(r.cwd)).target], ['record', 'src/demo.mjs']);   // still dirty: nothing was dropped
});

test('a rotating cycle is caught at the twenty-eighth transition', async () => {
  const r = await loopRepo();
  const st = await readState(r.cwd);
  const classes = ['repair', 'recover', 'reconcile', 'scope', 'record', 'commit', 'declare', 'review mechanism', 'capture'];
  let bound = null, n = 0;
  while (!bound) { bound = (await settle(r.cwd, V(classes[n % 9], 't' + (Math.floor(n / 9) % 3)), st)).bound; n++; }
  assert.equal(bound.kind, 'total');
  assert.ok(n <= 29);   // 28 completions are observed by the 29th settle
});

test('the third acceptance round without Done is the same escalation', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review();
  const rep = await r.report([{ n: 1, text: 'f' }]);
  for (let i = 0; i < 3; i++) { const res = await r.resolveFinding(rep, 1); await r.accept({ rejected: [res], findings: [{ n: i + 2, text: 'new' }] }); }
  const st = await readState(r.cwd);
  const { bound } = await settle(r.cwd, await verdictOf(st), st);
  assert.deepEqual(bound, { kind: 'acceptanceRounds', actionClass: 'accept', target: 'first' });
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});

test('semantic progress resets the count; a snapshot or record alone does not', async () => {
  const r = await loopRepo();
  const before = progressSummary(await readState(r.cwd));
  await r.snap(); await r.add('item', 'x', { kind: 'backlog', slug: 'x', source: 'DEMO-001', body: 'b' });
  assert.equal(progressMade(before, progressSummary(await readState(r.cwd))), false);
  await r.passReq('DEMO-001');
  assert.equal(progressMade(before, progressSummary(await readState(r.cwd))), true);
  await settle(r.cwd, V('record', 'a'), await readState(r.cwd));
  await settle(r.cwd, V('record', 'b'), await readState(r.cwd));            // completes record a
  const esc = await r.escalate('DEMO-001'); await r.answer(esc, 'ok');      // developer authorizes continuation
  await settle(r.cwd, V('record', 'c'), await readState(r.cwd));
  assert.equal((await (await import('../lib/cycle.mjs')).readCounter(r.cwd)).total, 1);   // reset, then the completion of record b starts the new window
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/cycle.test.mjs`
Expected: FAIL, `settle is not a function`.

- [ ] **Step 3: Implement**

In `lib/wake.mjs`:

```js
export function progressSummary(st) {
  const passes = st.set.filter((x) => st.current[x.requirement]?.result === 'pass').map((x) => x.requirement).sort();
  const rep = latest(st, 'report'), rev = latest(st, 'review');
  const phase = st.closed ? 3 : rep ? 2 : rev ? 1 : 0;
  const defects = st.log.filter((r) => r.kind === 'item' && r.payload.kind === 'defect' && !st.log.some((f) => f.kind === 'fix' && f.payload.item === r.sha)).length;
  const obligations = openFindings(st).length + defects + openEscalations(st.log).length + openBreaches(st.log).length;
  const answered = st.log.filter((r) => r.kind === 'answer' && r.payload.kind !== 'ask').length;
  return { passes, obligations, phase, answered, head: st.log.at(-1)?.sha ?? null };
}
export function progressMade(before, after) {
  if (!before) return false;
  if (after.passes.some((p) => !before.passes.includes(p))) return true;
  if (after.obligations < before.obligations) return true;
  if (after.phase > before.phase) return true;
  if (after.answered > before.answered) return true;
  return false;
}
```

`obligations` counts every open finding, defect, escalation and breach, so closing one while creating another of equal or higher precedence leaves the count unchanged and is not progress; that is the "without an equal-or-higher priority obligation being created" clause.

In `lib/cycle.mjs`:

```js
import { appendRecord } from './records.mjs';
import { progressSummary, progressMade, doneRule, latest } from './wake.mjs';

export function openCycleEscalation(log) {
  return log.find((r) => r.kind === 'escalation' && r.payload.concerns === 'cycle' && !log.some((a) => a.kind === 'answer' && a.payload.escalation === r.sha && a.payload.kind !== 'ask')) ?? null;
}

export async function writeCycleEscalation(cwd, slug, bound) {
  const open = openCycleEscalation(await readLog(cwd));
  if (open) return open.sha;                                    // one escalation per cycle, never one per completion
  const what = bound.kind === 'acceptanceRounds' ? `${BOUNDS.acceptanceRounds} acceptance rounds after the report have not reached Done`
    : bound.kind === 'sameTarget' ? `${bound.actionClass} ${bound.target} completed ${BOUNDS.sameTarget} times without semantic progress`
    : bound.kind === 'liveness' ? `${bound.actionClass} would write ${bound.target} in a form Cairn itself refuses`
    : `${BOUNDS.total} administrative actions completed without semantic progress`;
  return appendRecord(cwd, 'escalation', slug ?? 'none', {
    slug: slug ?? 'none', question: `The loop is cycling: ${what}. What should change?`,
    recommendation: 'Read the repeated actions with the developer before any further administrative action',
    because: 'the same bookkeeping keeps being redone while no requirement, finding or phase moves',
    if_wrong: 'the count is reset by an ok answer and the loop continues from the same verdict',
    instead: 'supersede the commitment or restore the workspace to its allowed base', concerns: 'cycle', evaluation: null,
  });
}

function acceptanceRounds(st) {
  const rep = latest(st, 'report');
  return rep ? st.records.slice(st.records.indexOf(rep) + 1).filter((r) => r.kind === 'acceptance').length : 0;
}

export async function settle(cwd, verdict, st) {
  let c = await readCounter(cwd);
  const now = progressSummary(st);
  if (progressMade(c.progress, now)) { await resetOnProgress(cwd); c = await readCounter(cwd); }
  let bound = null;
  const cur = verdict.verdict === 'Resolvable' ? { action: verdict.action, target: verdict.target } : null;
  if (c.last && ADMIN.has(c.last.action) && (!cur || cur.action !== c.last.action || cur.target !== c.last.target)) {
    const b = await bump(cwd, c.last.action, c.last.target);
    if (b.bound) bound = { kind: b.bound, actionClass: c.last.action, target: c.last.target };
  }
  if (!bound && acceptanceRounds(st) >= BOUNDS.acceptanceRounds && !(await doneRule(st)).holds && !st.closed) bound = { kind: 'acceptanceRounds', actionClass: 'accept', target: st.slug };
  const open = Boolean(openCycleEscalation(st.log));
  if (bound && !open) await writeCycleEscalation(cwd, st.slug, bound);
  await writeCounter(cwd, { ...(await readCounter(cwd)), last: cur, progress: now });
  return { bound: bound && !open ? bound : null };
}
```

Add `import { appendRecord, readLog } from './records.mjs';` at the top of `lib/cycle.mjs`. `settle` and `guardKernelWrite` (task 24) are the only writers of the cycle escalation; wake stays pure because the count and the record are written by the command that completed the counted action.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/cycle.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cycle.mjs lib/wake.mjs tests/cycle.test.mjs
git commit -m "Count completed administrative actions, reset on semantic progress and escalate at the bounds"
```

---

### Task 24: The liveness guard and the loop wrapper

**Files:**
- Modify: `lib/cycle.mjs`, `lib/cli.mjs`, `lib/mechanisms.mjs`, `lib/adr.mjs`
- Test: `tests/cycle.test.mjs`

**Interfaces:**
- Produces: `guardKernelWrite(cwd, path, bytes, {action}) -> void` (throws `LivenessError` after writing the cycle escalation); `withLoop(cwd, command, fn)`, the dispatch wrapper composed around plan 07's `runWithPreflight`.

- [ ] **Step 1: Write the failing tests**

```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { guardKernelWrite, LivenessError, withLoop } from '../lib/cycle.mjs';

test('a kernel-managed write whose bytes would create a violation of equal or higher precedence is refused with the cycle escalation', async () => {
  const r = await loopRepo();
  const good = await readFile(join(r.cwd, '.cairn/mechanisms'));
  await guardKernelWrite(r.cwd, '.cairn/mechanisms', good, { action: 'declare' });
  await assert.rejects(guardKernelWrite(r.cwd, '.cairn/mechanisms', Buffer.concat([good, Buffer.from(' ')]), { action: 'declare' }), LivenessError);
  const adr = await readFile(join(r.cwd, 'docs/decisions.jsonl')).catch(() => Buffer.alloc(0));
  await assert.rejects(guardKernelWrite(r.cwd, 'docs/decisions.jsonl', Buffer.concat([adr, Buffer.from('{"kind": "read"}\n')]), { action: 'decide' }), /would create a scope violation/);   // the space makes the line noncanonical
  await guardKernelWrite(r.cwd, 'docs/decisions.jsonl', Buffer.concat([adr, Buffer.from('{"id":"01HZZZZZZZZZZZZZZZZZZZZZZZ","kind":"read","of":"x","record":"y","ts":"2026-09-19T00:00:00Z"}\n')]), { action: 'decide' });
  assert.equal((await r.log()).filter((x) => x.kind === 'escalation' && x.payload.concerns === 'cycle').length, 1);
});

test('withLoop settles after a state-changing command and leaves wake pure', async () => {
  const r = await loopRepo();
  const result = await withLoop(r.cwd, 'begin', () => begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] }));
  assert.ok(result);
  const c = await (await import('../lib/cycle.mjs')).readCounter(r.cwd);
  assert.deepEqual(c.last, { action: 'run', target: 'DEMO-001' });
});
```

Add `import { begin } from '../lib/lease.mjs';` to the test file.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/cycle.test.mjs`
Expected: FAIL, `guardKernelWrite is not a function`.

- [ ] **Step 3: Implement**

In `lib/cycle.mjs`:

```js
import { join } from 'node:path';
import { readState, verdictOf, ORDER } from './wake.mjs';
import { runWithPreflight } from './scope.mjs';

export class LivenessError extends Error {}
// readFile is already imported at the top of this module (task 1); only join and the two module imports above are new.

async function bookkeepingViolation(cwd, path, bytes) {
  const text = bytes.toString('utf8');
  if (path === '.cairn/mechanisms') { try { parseStrict(text); return null; } catch { return 'repair'; } }
  if (path === 'docs/decisions.jsonl') {
    const base = await readFile(join(cwd, path)).catch(() => Buffer.alloc(0));
    if (!bytes.subarray(0, base.length).equals(base)) return 'scope';
    for (const line of text.slice(base.length).split('\n').filter(Boolean)) { try { parseStrict(line); } catch { return 'scope'; } }
    return null;
  }
  return 'scope';
}

export async function guardKernelWrite(cwd, path, bytes, { action }) {
  const violation = await bookkeepingViolation(cwd, path, bytes);
  if (!violation) return;
  const mine = ORDER.indexOf(action === 'decide' || action === 'realize' ? 'build' : action);
  if (ORDER.indexOf(violation) <= (mine < 0 ? ORDER.length : mine)) {
    const st = await readState(cwd);
    await writeCycleEscalation(cwd, st.slug, { kind: 'liveness', actionClass: action, target: path });
    throw new LivenessError(`cairn: writing ${path} for ${action} would create a ${violation} violation; cycle escalation written`);
  }
}

export async function withLoop(cwd, command, fn) {
  const result = await runWithPreflight(cwd, command, fn);
  const st = await readState(cwd);
  await settle(cwd, await verdictOf(st), st);
  return result;
}
```

`writeCycleEscalation` already renders the `liveness` kind and returns the open escalation instead of writing a second one, which is why the test above sees exactly one record after two refusals.

In `lib/mechanisms.mjs`, immediately before the one `writeFile` that writes `.cairn/mechanisms` inside `declare` and inside `reviewMechanism`, insert:

```js
await guardKernelWrite(cwd, '.cairn/mechanisms', bytes, { action: 'declare' });
```

where `bytes` is the exact buffer or string about to be written, and add `import { guardKernelWrite } from './cycle.mjs';`. In `lib/adr.mjs`, immediately before `appendDecision` appends to `docs/decisions.jsonl`, insert:

```js
await guardKernelWrite(cwd, 'docs/decisions.jsonl', Buffer.concat([existing, Buffer.from(line + '\n')]), { action: 'decide' });
```

where `existing` is the file's current bytes (empty when absent) and `line` the canonical line. Both modules import `cycle.mjs`, which imports `wake.mjs`, which imports them: ES modules resolve this cycle because every use is inside a function body; keep it that way.

In `lib/cli.mjs`, change the dispatch line from plan 07 to:

```js
const code = STATE_CHANGING.has(name) ? await withLoop(cwd, name, () => COMMANDS[name].run(cwd, argv)) : await COMMANDS[name].run(cwd, argv);
```

with `import { withLoop } from './cycle.mjs';` and `import { STATE_CHANGING } from './scope.mjs';`. `withLoop` already runs the preflight, so the earlier `runWithPreflight` call in `dispatch` is replaced, not doubled.

- [ ] **Step 4: Run everything**

Run: `node --test tests/*.test.mjs`
Expected: PASS. Plan 05 and 06 tests still pass because a valid mutation never trips the guard.

- [ ] **Step 5: Commit**

```bash
git add lib/cycle.mjs lib/cli.mjs lib/mechanisms.mjs lib/adr.mjs tests/cycle.test.mjs
git commit -m "Refuse a kernel-managed write that would create its own violation and settle the loop after each command"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| "Wake prints a verdict, the action or party, one line of reason and the action's predicate" (5); "Predicate ... is printed with the action" (2) | 22 |
| "Wake is read-only" (2); "Wake writes nothing" (4); decision 22 | 4 |
| "Outside a project, on missing durable refs, during a pending supersession, or with an interrupted transaction, it prints one line naming the command or skill that continues and exits 3" (2); the fetch command (4); "Wake names `recover <transaction>` for a nonterminal intent before any ordinary action" (4) | 3 |
| Precedence order (5) | 3 (`ORDER`), 5 to 21 |
| `repair PATH` | 5 |
| `reconcile ACTION`; "While it exists, its target's declared inputs are neither record nor commit findings" (2) | 6, 10 |
| `scope PATH` | 7 |
| "`Waiting` prints an unanswered escalation's five fields" (2); "`ask` stays open until an agent reply" (2); `reply SLUG` | 8, 22 |
| `fix ITEM`; "A defect against that commitment's requirement is worked under it and blocks Done" (8) | 9, 20 |
| `record PATH`, `commit PATH` | 10 |
| `declare REQ` | 11 |
| `run REQ`, `implement REQ`, `escalate REQ`; "After three distinct failing attempts without a pass, a fourth implementation attempt requires an escalation first" (8) | 12 |
| `review mechanism REQ`; "A mechanism reused for a revised requirement in a later commitment needs review mechanism before its evidence counts" (8) | 13 |
| `capture ITEM`; "An item captured from the commitment's own requirement needs an outside record or an escalation" (8) | 14 |
| `review SLUG`; the fixed questions Q1 to Q6 per target (9) | 15 |
| `report SLUG`; "Every changed interface gets a caller-level attempt" (9) | 16 |
| `resolve SLUG N`; "A second rejection of a resolution for the same finding escalates" (5) | 17 |
| `accept SLUG`; "Each acceptance examines the whole delta from that reported snapshot to the current one" (5) | 18 |
| `build DECISION` | 19 |
| The Done rule's four bullets; "When the rule holds, wake names `done`" (5) | 20 |
| `promote`; "With a backlog item waiting, the next wake names `promote` rather than Done" (3); "`Done` means a done record exists and no promotion waits" (2) | 21 |
| Section 6: the per-turn, stop and session-start hooks print the verdict, action, reason and predicate | 22 (the text they print) |
| "It counts each completed administrative action ... keyed by action class and target and reset on semantic progress. The count never travels" (5) | 1, 23 |
| Semantic progress, all four clauses and the non-progress sentence (2) | 23 |
| "A fourth occurrence of the same action class and target, or a twenty-eighth administrative transition of any class, without semantic progress creates one Blocking cycle escalation and preserves every pending obligation" (5); section 14 item 4 | 23 |
| "Three acceptance rounds after the report without reaching Done create the same kind of escalation" (5) | 23 |
| "administrative-cycle escalation unresolved" blocks Done (5) | 20 |
| The liveness invariant; "Cairn's own valid bookkeeping cannot create a Cairn violation merely because it wrote bookkeeping" (2); decision 50 | 24 |
| "A synthetic fixture that repeats administrative actions without semantic progress is a required regression test" (5) | 23 |

Left to other plans, deliberately:

- `cairn recover` itself, and the meaning of "every store matches its resulting identity": plan 04. Wake only names it.
- `cairn done`, `cairn promote` and the one-transaction promotion: plan 06. Wake names them.
- Writing escalations, answers and replies as commands, the ADR `answered` line, and developer authentication of an answer: plan 09. The cycle escalation written here uses plan 01's schema and plan 09's `cairn escalate` is its general form.
- Writing reviews, briefs, reports, resolutions and acceptances, the adversary projection, and `cairn report`'s own refusals (snapshot mismatch, stale brief, wrong model, unattempted question): plan 10. Wake re-checks only what its predicates state.
- The realization check that compares base and realized snapshots by protected category: plan 06 (`realize`); wake names `build` from the ADR alone.
- The hook shell scripts and their one-line session-start report of missing links, PATH entries or refs: plan 13.
- "After fetch, wake validates all cross-references and names the exact fetch or push repair" (4): plan 12 (`validateAfterFetch`), which plan 12 inserts into `wake` between the missing-refs check and `readState`.
