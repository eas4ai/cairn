# Transactions and leases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the four multi-store commands (`start`, `promote`, `supersede`, `authorize`) run as recoverable transactions with a repository-local lock, staged exact bytes, a command-intent record, idempotent ordered writes and a terminal record; `recover` completes forward or aborts by the spec's rule; and the local action lease (`cairn begin`, `cairn end`, `--touch`) and the separate check lock exist on compare-and-swap.

**Architecture:** `lib/tx.mjs` takes a declarative plan (ordered writes of four store kinds: `file`, `branch`, `log`, `snapshot`) so that `recover` can replay it from staging without the command's code. Every write is idempotent on the transaction id and its expected old identity; staging files land by atomic rename; the intent is a log record so wake sees it after a crash. `lib/lease.mjs` keeps `refs/cairn/in-progress` as an empty commit whose body is canonical JSON, advanced and removed with compare-and-swap, and holds `cairn-check.lock` only for the duration of one run. Tests crash a transaction by writing its intent and skipping its writes, then call `recover` and assert the exact record chain.

**Tech Stack:** Node 24, ES modules, `node:fs` (`openSync` with `wx`, `renameSync`), `node:process` (`kill(pid, 0)` liveness), `node --test`, `node:assert/strict`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 "Action lease" (both paragraphs); section 4 "Commands and crash recovery" (all but the evaluator-intent paragraph, which is plan 11's); section 4 table rows `command-intent` and `command-abort`; section 5 predicates `recover TRANSACTION` and `reconcile ACTION` and the precedence entries "incomplete transaction" and "stale action lease"; section 12 "The shared in-progress/check-lock slot. The action lease and check lock are separate."

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Four commands write to more than one store: `start`, `promote`, `supersede` and `authorize`. Every other command writes one store and needs no intent."
- "Each step is idempotent on the transaction ID and expected old identity; atomic rename prevents partial files."
- "Recovery completes forward after any planned append-only write beyond the intent or any external effect has occurred. It may instead restore staged pre-identities and append a command-abort only when neither has occurred. It never rewrites an append-only ref."
- "If a conflicting writer makes forward completion impossible, recovery preserves the intent and records or names the exact repair before a Blocking escalation; it never asks a human to infer what happened."
- "`refs/cairn/in-progress`, local to the repository and never pushed."
- "The separate check lock is `cairn-check.lock` below `git rev-parse --git-path`; `cairn check` holds it only for the run, so a check can nest inside an implementation action."
- "The action lease does not coordinate separate clones."

Consumed by the overview's names: `canonicalize`, `sha256`, `ulid` (lib/canon.mjs); `git`, `gitPath`, `readRef`, `updateRefCAS`, `commitTree`, `catCommit`, `CasError` (lib/gitx.mjs); `appendRecord`, `readLog`, `encodeRecord` (lib/records.mjs); `writeWorkspaceSnapshot`, `readSnapshot` (lib/snapshots.mjs); `validatePath`, `classify` (lib/paths.mjs); `loadSettings` (lib/settings.mjs); `authorize`, `protectedDigests`, `authenticateDeveloper`, `verifyEvidence` (lib/auth.mjs, plan 03); `init` (lib/init.mjs, plan 03). Test helper from plan 01: `makeRepo()` in `tests/helpers/repo.mjs` returns `{dir, git, write, commit, readRef, remove}`, a throwaway repository on branch `main` with author `Cairn Test <test@example.invalid>`; each test file below wraps it as `repoWith(files)`, which writes and commits the fixture files and returns `{cwd, repo}`.

## Record and staging shapes

```
command-intent {tx, command, identity, pre, writes:[{store, target, digest}]}
command-abort  {intent, failure_class, restored:{refs:{...}, files:{...}, head}}
terminal record: the command's own kind (authorization here; start, promotion, superseded in plan 06)
                 whose payload carries intent: <command-intent sha>

plan (input to withTransaction):
  {identity: object,                      // complete input identity the command computed
   writes: [
     {store:'file', path, bytes},          // exact bytes; pre = digest of the current file or null
     {store:'branch', paths:[...], message},// commit those paths on HEAD; pre = HEAD sha
     {store:'log', kind, target, payload}, // appendRecord; pre = refs/cairn/log after the intent
     {store:'snapshot'}                    // writeWorkspaceSnapshot; pre = refs/cairn/snapshots
   ],
   terminal: {kind, target, payload}}      // payload may hold {stepRef: n} for a step's resulting sha

staging, below `git rev-parse --git-path cairn-tx/<tx>/`:
  plan.json  canonical plan without bytes; bytes/<n> exact bytes per file write
  pre.json   {refs:{'refs/cairn/log':sha|null,'refs/cairn/snapshots':sha|null}, head:sha|null, files:{path:digest|null}}
  intent     the command-intent sha once appended
  done/<n>   the resulting identity of write n (sha or digest), written after the write
lock: `git rev-parse --git-path cairn-tx.lock`, contents `<pid> <tx>`
```

---

### Task 1: Transaction lock and staging by atomic rename

**Files:**
- Create: `lib/tx.mjs`
- Test: `tests/tx.test.mjs`

**Interfaces:**
- Consumes: `gitPath` (lib/gitx.mjs); `canonicalize`, `sha256`, `ulid` (lib/canon.mjs).
- Produces: `MULTI_STORE = new Set(['start','promote','supersede','authorize'])`; `acquireLock(cwd, tx) -> release()`; `stage(cwd, tx, plan, pre) -> dir`; `readStaging(cwd, tx) -> {plan, pre, bytes(n), intentSha, done}`; `writeAtomic(path, bytes)`; `TxError`.

- [ ] **Step 1: Write the failing test**

```js
// tests/tx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';

// Plan 01's makeRepo() returns {dir, git, write, commit, readRef, remove}; this wrapper
// writes the fixture files, commits them and exposes the directory as cwd.
async function repoWith(files) {
  const repo = await makeRepo();
  for (const [p, c] of Object.entries(files)) await repo.write(p, c);
  await repo.commit('fixture');
  return { cwd: repo.dir, repo };
}
import { gitPath } from '../lib/gitx.mjs';
import { sha256 } from '../lib/canon.mjs';
import { MULTI_STORE, acquireLock, stage, readStaging, writeAtomic } from '../lib/tx.mjs';

test('the four multi-store commands are the only transactional ones', () => {
  assert.deepEqual([...MULTI_STORE].sort(), ['authorize', 'promote', 'start', 'supersede']);
});

test('the lock is a repository-local file below the git path and refuses a live holder', async () => {
  const { cwd } = await repoWith({});
  const release = await acquireLock(cwd, 'TX1');
  const lock = await gitPath(cwd, 'cairn-tx.lock');
  assert.equal(readFileSync(lock, 'utf8'), `${process.pid} TX1`);
  await assert.rejects(acquireLock(cwd, 'TX2'), /^TxError: cairn: transaction TX1 holds cairn-tx.lock \(pid \d+ alive\); wait or run cairn recover TX1/);
  release();
  assert.equal(existsSync(lock), false);
});

test('a lock whose holder is dead is removed and retaken', async () => {
  const { cwd } = await repoWith({});
  writeFileSync(await gitPath(cwd, 'cairn-tx.lock'), '999999999 TXDEAD');
  const release = await acquireLock(cwd, 'TX3');
  assert.equal(readFileSync(await gitPath(cwd, 'cairn-tx.lock'), 'utf8'), `${process.pid} TX3`);
  release();
});

test('stage writes plan, pre-identities and exact bytes by rename, never a partial file', async () => {
  const { cwd } = await repoWith({});
  const plan = { identity: { a: 1 }, writes: [{ store: 'file', path: 'docs/x.md', bytes: Buffer.from('hello\n') }, { store: 'snapshot' }],
    terminal: { kind: 'authorization', target: 'protected', payload: { k: 1 } } };
  const pre = { refs: { 'refs/cairn/log': null, 'refs/cairn/snapshots': null }, head: 'a'.repeat(40), files: { 'docs/x.md': null } };
  const dir = await stage(cwd, 'TX4', plan, pre);
  assert.equal(dir, await gitPath(cwd, 'cairn-tx/TX4'));
  assert.deepEqual(readdirSync(dir).sort(), ['bytes', 'plan.json', 'pre.json']);
  assert.equal(readFileSync(join(dir, 'bytes/0'), 'utf8'), 'hello\n');
  const s = await readStaging(cwd, 'TX4');
  assert.deepEqual(s.plan.writes[0], { store: 'file', path: 'docs/x.md', digest: sha256('hello\n') });
  assert.deepEqual(s.pre, pre);
  assert.equal(s.intentSha, null);
  assert.deepEqual(s.done, {});
  assert.equal(readdirSync(dir).some((n) => n.endsWith('.tmp')), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tx.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/tx.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/tx.mjs
import { openSync, writeSync, closeSync, renameSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gitPath } from './gitx.mjs';
import { canonicalize, sha256, ulid } from './canon.mjs';

export class TxError extends Error {}
export const MULTI_STORE = new Set(['start', 'promote', 'supersede', 'authorize']);

export function writeAtomic(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${ulid()}.tmp`;
  const fd = openSync(tmp, 'w'); writeSync(fd, bytes); closeSync(fd);
  renameSync(tmp, path);
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

export async function acquireLock(cwd, tx) {
  const lock = await gitPath(cwd, 'cairn-tx.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, 'wx'); writeSync(fd, `${process.pid} ${tx}`); closeSync(fd);
      return () => { try { unlinkSync(lock); } catch {} };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const [pid, holder] = readFileSync(lock, 'utf8').split(' ');
      if (alive(Number(pid))) throw new TxError(`cairn: transaction ${holder} holds cairn-tx.lock (pid ${pid} alive); wait or run cairn recover ${holder}`);
      unlinkSync(lock);
    }
  }
  throw new TxError('cairn: could not take cairn-tx.lock');
}

export async function stagingDir(cwd, tx) { return gitPath(cwd, `cairn-tx/${tx}`); }

export async function stage(cwd, tx, plan, pre) {
  const dir = await stagingDir(cwd, tx);
  mkdirSync(join(dir, 'bytes'), { recursive: true });
  const writes = plan.writes.map((w, n) => {
    if (w.store !== 'file') return w;
    writeAtomic(join(dir, 'bytes', String(n)), w.bytes);
    return { store: 'file', path: w.path, digest: sha256(w.bytes) };
  });
  writeAtomic(join(dir, 'plan.json'), canonicalize({ identity: plan.identity, writes, terminal: plan.terminal }));
  writeAtomic(join(dir, 'pre.json'), canonicalize(pre));
  return dir;
}

export async function readStaging(cwd, tx) {
  const dir = await stagingDir(cwd, tx);
  if (!existsSync(join(dir, 'plan.json'))) return null;
  const done = {};
  if (existsSync(join(dir, 'done'))) for (const n of readdirSync(join(dir, 'done'))) done[n] = readFileSync(join(dir, 'done', n), 'utf8');
  return { dir, plan: JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')), pre: JSON.parse(readFileSync(join(dir, 'pre.json'), 'utf8')),
    bytes: (n) => readFileSync(join(dir, 'bytes', String(n))),
    intentSha: existsSync(join(dir, 'intent')) ? readFileSync(join(dir, 'intent'), 'utf8') : null, done };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tx.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tx.mjs tests/tx.test.mjs
git commit -m "Transaction lock below the git path and staging of plan, pre-identities and exact bytes by rename"
```

---

### Task 2: Pre-identities, the intent record and idempotent ordered writes

**Files:**
- Modify: `lib/tx.mjs`
- Test: `tests/tx.test.mjs`

**Interfaces:**
- Consumes: `git`, `readRef`, `updateRefCAS`, `CasError` (lib/gitx.mjs); `appendRecord`, `readLog` (lib/records.mjs); `writeWorkspaceSnapshot` (lib/snapshots.mjs); `sha256` (lib/canon.mjs).
- Produces: `preIdentities(cwd, plan) -> pre`; `applyWrites(cwd, staging) -> results[]` (idempotent; each write skipped when `done/<n>` exists or the store already shows the planned identity; a store that shows neither the pre nor the planned identity throws `TxConflict` naming the exact repair); `TxConflict`.

- [ ] **Step 1: Write the failing test**

```js
import { git, readRef, catCommit } from '../lib/gitx.mjs';
import { readLog, appendRecord } from '../lib/records.mjs';
import { init } from '../lib/init.mjs';
import { preIdentities, applyWrites } from '../lib/tx.mjs';

const yes = async () => true;
const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [],
  network_exclude: [], signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { enabled: false, mode: 'shadow', model: null } });
const BASE = { '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# a\n', 'docs/spec/overview.md': '# k\n' };
async function initialized() {
  const { cwd } = await repoWith(BASE);
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  return cwd;
}
const filePlan = (bytes = 'v2\n') => ({ identity: { i: 1 },
  writes: [{ store: 'file', path: 'docs/spec/overview.md', bytes: Buffer.from(bytes) },
    { store: 'branch', paths: ['docs/spec/overview.md'], message: 'Authorize the specification' },
    { store: 'snapshot' },
    { store: 'log', kind: 'read', target: '01J0000000000000000000ABCD', payload: { decision: '01J0000000000000000000ABCD', evidence: { mode: 'unsigned-local', purpose: 'read', subject: 'x', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true } } }],
  terminal: { kind: 'authorization', target: 'protected', payload: {} } });

test('preIdentities records every touched store before anything is written', async () => {
  const cwd = await initialized();
  const pre = await preIdentities(cwd, filePlan());
  assert.equal(pre.head, (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim());
  assert.equal(pre.refs['refs/cairn/log'], await readRef(cwd, 'refs/cairn/log'));
  assert.equal(pre.refs['refs/cairn/snapshots'], await readRef(cwd, 'refs/cairn/snapshots'));
  assert.deepEqual(pre.files, { 'docs/spec/overview.md': sha256('# k\n') });
});

test('applyWrites performs the ordered writes once and is idempotent when run again', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TX5', plan, pre);
  const results = await applyWrites(cwd, await readStaging(cwd, 'TX5'));
  assert.equal(readFileSync(join(cwd, 'docs/spec/overview.md'), 'utf8'), 'v2\n');
  const head = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
  assert.equal(results[1], head);
  assert.equal((await catCommit(cwd, head)).subject, 'Authorize the specification');
  assert.equal(results[2], await readRef(cwd, 'refs/cairn/snapshots'));
  assert.equal(results[3], await readRef(cwd, 'refs/cairn/log'));
  const again = await applyWrites(cwd, await readStaging(cwd, 'TX5'));
  assert.deepEqual(again, results);
  assert.equal((await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim(), head, 'no second commit');
  assert.equal((await readLog(cwd)).filter((r) => r.kind === 'read').length, 1, 'no second record');
});

test('a store showing neither the pre nor the planned identity is a conflict naming the repair', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TX6', plan, pre);
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'someone else\n');
  await assert.rejects(applyWrites(cwd, await readStaging(cwd, 'TX6')),
    new RegExp(`^TxConflict: cairn: transaction TX6 cannot complete: docs/spec/overview.md is ${sha256('someone else\n')}, expected ${sha256('# k\n')} or ${sha256('v2\n')}; restore it to ${sha256('# k\n')} then run cairn recover TX6`));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tx.test.mjs`
Expected: FAIL, `preIdentities is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
import { git, readRef, catCommit } from './gitx.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';

export class TxConflict extends TxError {}

async function headSha(cwd) { const r = await git(['rev-parse', '--verify', '-q', 'HEAD'], { cwd }); return r.code === 0 ? r.stdout.trim() : null; }
function fileDigest(cwd, p) { const a = join(cwd, p); return existsSync(a) ? sha256(readFileSync(a)) : null; }

export async function preIdentities(cwd, plan) {
  const files = {};
  for (const w of plan.writes) if (w.store === 'file') files[w.path] = fileDigest(cwd, w.path);
  return { refs: { 'refs/cairn/log': await readRef(cwd, 'refs/cairn/log'), 'refs/cairn/snapshots': await readRef(cwd, 'refs/cairn/snapshots') },
    head: await headSha(cwd), files };
}

function conflict(tx, what, actual, pre, planned) {
  return new TxConflict(`cairn: transaction ${tx} cannot complete: ${what} is ${actual}, expected ${pre} or ${planned}; restore it to ${pre} then run cairn recover ${tx}`);
}

function markDone(dir, n, value) { writeAtomic(join(dir, 'done', String(n)), value); }

export async function applyWrites(cwd, s) {
  const tx = s.dir.split('/').at(-1);
  const results = [];
  for (let n = 0; n < s.plan.writes.length; n++) {
    const w = s.plan.writes[n];
    if (s.done[n] !== undefined) { results.push(s.done[n]); continue; }
    let out;
    if (w.store === 'file') {
      const cur = fileDigest(cwd, w.path);
      if (cur !== w.digest) {
        if (cur !== s.pre.files[w.path]) throw conflict(tx, w.path, cur, s.pre.files[w.path], w.digest);
        writeAtomic(join(cwd, w.path), s.bytes(n));
      }
      out = w.digest;
    } else if (w.store === 'branch') {
      const head = await headSha(cwd);
      const prevBranch = results.findLast?.((r, i) => s.plan.writes[i].store === 'branch') ?? null;
      const expected = prevBranch ?? s.pre.head;
      if (head !== expected) {
        const c = head ? await catCommit(cwd, head) : null;
        if (!(c && c.subject === w.message && c.parents[0] === expected)) throw conflict(tx, 'HEAD', head, expected, `a commit "${w.message}" on ${expected}`);
        out = head;
      } else {
        await git(['add', '--', ...w.paths], { cwd });
        await git(['commit', '-q', '--allow-empty', '-m', w.message], { cwd });
        out = await headSha(cwd);
      }
    } else if (w.store === 'snapshot') {
      out = await writeWorkspaceSnapshot(cwd);
    } else if (w.store === 'log') {
      const log = await readLog(cwd);
      const after = s.intentSha ? log.slice(log.findIndex((r) => r.sha === s.intentSha) + 1) : log;
      const same = after.find((r) => r.kind === w.kind && r.target === w.target && canonicalize(r.payload) === canonicalize(w.payload));
      out = same ? same.sha : await appendRecord(cwd, w.kind, w.target, w.payload);
    } else throw new TxError(`cairn: unknown store ${w.store}`);
    markDone(s.dir, n, out);
    results.push(out);
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tx.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tx.mjs tests/tx.test.mjs
git commit -m "Ordered transaction writes idempotent on the staged pre-identity, with conflicts naming the repair"
```

---

### Task 3: withTransaction: intent, writes, terminal record

**Files:**
- Modify: `lib/tx.mjs`
- Test: `tests/tx.test.mjs`

**Interfaces:**
- Consumes: `appendRecord`, `readLog` (lib/records.mjs); `catCommit` (lib/gitx.mjs).
- Produces: `withTransaction(cwd, {command, plan}, fn) -> {tx, intentSha, terminalSha, results}`; `fn(ctx)` runs after the writes with `ctx = {tx, intentSha, results}` and returns the terminal payload (or `null` to use `plan.terminal.payload` with `{stepRef: n}` resolved); the terminal record's payload gains `intent: intentSha`. Refuses a command outside `MULTI_STORE`.

- [ ] **Step 1: Write the failing test**

```js
import { withTransaction } from '../lib/tx.mjs';

test('withTransaction refuses every command that is not one of the four', async () => {
  const cwd = await initialized();
  for (const command of ['check', 'begin', 'review', 'escalate', 'done', 'declare']) {
    await assert.rejects(withTransaction(cwd, { command, plan: filePlan() }, async () => ({})),
      new RegExp(`^TxError: cairn: ${command} writes one store and needs no transaction`));
  }
  assert.equal(existsSync(await gitPath(cwd, 'cairn-tx.lock')), false);
});

test('withTransaction appends intent, performs the writes, appends the terminal record naming the intent, and cleans staging', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const logBefore = (await readLog(cwd)).length;
  const r = await withTransaction(cwd, { command: 'authorize', plan }, async ({ results }) =>
    ({ spec_digest: sha256('v2\n'), agreement_digest: sha256('# a\n'), settings_digest: 'sha256:' + '0'.repeat(64),
       evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 's', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true },
       decision: null, snapshot_check: results[2] }));
  const log = await readLog(cwd);
  const kinds = log.slice(logBefore).map((x) => x.kind);
  assert.deepEqual(kinds, ['command-intent', 'read', 'authorization']);
  const intent = log[logBefore];
  assert.equal(intent.sha, r.intentSha);
  assert.equal(intent.target, r.tx);
  assert.equal(intent.payload.command, 'authorize');
  assert.deepEqual(intent.payload.identity, { i: 1 });
  assert.equal(intent.payload.pre.head.length, 40);
  assert.deepEqual(intent.payload.writes.map((w) => w.store), ['file', 'branch', 'snapshot', 'log']);
  assert.equal(intent.payload.writes[0].digest, sha256('v2\n'));
  assert.equal(log.at(-1).payload.intent, r.intentSha);
  assert.equal(log.at(-1).sha, r.terminalSha);
  assert.equal(existsSync(await gitPath(cwd, `cairn-tx/${r.tx}`)), false);
  assert.equal(existsSync(await gitPath(cwd, 'cairn-tx.lock')), false);
});
```

(The `snapshot_check` key is removed again in Task 6, where the authorization schema is closed; it exists here only to show `results` reaching `fn`. Replace the `fn` body with the closed payload when Task 6 lands.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tx.test.mjs`
Expected: FAIL, `withTransaction is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
function resolveRefs(payload, results) {
  if (Array.isArray(payload)) return payload.map((v) => resolveRefs(v, results));
  if (payload && typeof payload === 'object') {
    if (Object.keys(payload).length === 1 && 'stepRef' in payload) return results[payload.stepRef];
    return Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, resolveRefs(v, results)]));
  }
  return payload;
}

async function finish(cwd, s, tx, intentSha, fn) {
  const results = await applyWrites(cwd, s);
  const own = fn ? await fn({ tx, intentSha, results }) : null;
  const payload = { ...(own ?? resolveRefs(s.plan.terminal.payload, results)), intent: intentSha };
  const terminalSha = await appendRecord(cwd, s.plan.terminal.kind, s.plan.terminal.target, payload);
  rmSync(s.dir, { recursive: true, force: true });
  return { tx, intentSha, terminalSha, results };
}

export async function withTransaction(cwd, { command, plan }, fn) {
  if (!MULTI_STORE.has(command)) throw new TxError(`cairn: ${command} writes one store and needs no transaction`);
  const tx = ulid();
  const release = await acquireLock(cwd, tx);
  try {
    const pre = await preIdentities(cwd, plan);
    const dir = await stage(cwd, tx, plan, pre);
    const s = await readStaging(cwd, tx);
    const intentSha = await appendRecord(cwd, 'command-intent', tx, { tx, command, identity: plan.identity, pre, writes: s.plan.writes });
    writeAtomic(join(dir, 'intent'), intentSha);
    s.intentSha = intentSha;
    return await finish(cwd, s, tx, intentSha, fn);
  } finally { release(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tx.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tx.mjs tests/tx.test.mjs
git commit -m "withTransaction: lock, stage, command-intent, ordered writes, terminal record naming the intent"
```

---

### Task 4: recover: forward completion, abort, blocked repair

**Files:**
- Modify: `lib/tx.mjs`
- Test: `tests/tx.test.mjs`

**Interfaces:**
- Consumes: `readLog`, `appendRecord` (lib/records.mjs); `readRef` (lib/gitx.mjs).
- Produces: `pendingTransaction(cwd, log) -> intent|null` (the newest `command-intent` record with no later record whose payload `intent` names it and no `command-abort` naming it); `recover(cwd, txId) -> {completed:'forward'|'abort'|'blocked', repair?}`; `effectsHappened(cwd, staging, log) -> boolean`.

Rules, exactly as the spec: effects happened when any `done/<n>` marker exists, any log record follows the intent, `refs/cairn/snapshots` differs from the pre-identity, HEAD differs, or any planned file's digest differs from its pre-identity. Forward completion replays `applyWrites` and appends the terminal record from the staged `terminal` (with `stepRef`s resolved). Abort verifies each store equals its pre-identity, restores a planned file whose bytes differ (only possible when the crash was between staging and the intent, which leaves no intent on the log and is cleaned silently), appends `command-abort {intent, failure_class:'interrupted', restored}` and removes staging. A conflict during forward completion leaves the intent, keeps staging, writes the repair line to `<staging>/repair` and returns `blocked` with it; plan 09's `escalate` raises the Blocking escalation from that line. A crash that lost the staging directory but left the intent is `blocked` with the repair "restore the staging directory from the intent's write digests is impossible; run the command again after `cairn recover` aborts it" only when no effect happened; with effects it names each store and its expected identity from the intent record.

- [ ] **Step 1: Write the failing test**

```js
import { recover, pendingTransaction, stagingDir } from '../lib/tx.mjs';
import { rmSync } from 'node:fs';

async function crashAfterIntent(cwd, plan, tx = 'TXCRASH') {
  const pre = await preIdentities(cwd, plan);
  const dir = await stage(cwd, tx, plan, pre);
  const intentSha = await appendRecord(cwd, 'command-intent', tx, { tx, command: 'authorize', identity: plan.identity, pre, writes: (await readStaging(cwd, tx)).plan.writes });
  writeAtomic(join(dir, 'intent'), intentSha);
  return intentSha;
}
const terminalPlan = () => { const p = filePlan(); p.terminal.payload = { spec_digest: sha256('v2\n'), agreement_digest: sha256('# a\n'), settings_digest: 'sha256:' + '0'.repeat(64),
  evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 's', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true }, decision: null }; return p; };

test('an intent with no writes and no effect is aborted with restored pre-identities', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  assert.equal(pendingTransaction(cwd, await readLog(cwd)).sha, intentSha);
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'abort');
  const log = await readLog(cwd);
  assert.deepEqual(log.slice(-2).map((x) => x.kind), ['command-intent', 'command-abort']);
  const abort = log.at(-1).payload;
  assert.equal(abort.intent, intentSha);
  assert.equal(abort.failure_class, 'interrupted');
  assert.equal(abort.restored.head, log.at(-2).payload.pre.head);
  assert.equal(abort.restored.files['docs/spec/overview.md'], sha256('# k\n'));
  assert.equal(readFileSync(join(cwd, 'docs/spec/overview.md'), 'utf8'), '# k\n');
  assert.equal(pendingTransaction(cwd, log), null);
  assert.equal(existsSync(await stagingDir(cwd, 'TXCRASH')), false);
});

test('an intent followed by one file write completes forward: the exact chain is intent, read, authorization', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'v2\n'); // the first planned write landed, then the process died
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'forward');
  const log = await readLog(cwd);
  const from = log.findIndex((x) => x.sha === intentSha);
  assert.deepEqual(log.slice(from).map((x) => x.kind), ['command-intent', 'read', 'authorization']);
  assert.equal(log.at(-1).payload.intent, intentSha);
  assert.equal((await catCommit(cwd, (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim())).subject, 'Authorize the specification');
  assert.equal(pendingTransaction(cwd, log), null);
});

test('an intent followed by an append-only write completes forward and never rewrites the ref', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  const s = await readStaging(cwd, 'TXCRASH');
  const logHeadAfterIntent = await readRef(cwd, 'refs/cairn/log');
  await applyWrites(cwd, s); // all four writes landed, the terminal record did not
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'forward');
  const log = await readLog(cwd);
  assert.ok(log.some((x) => x.sha === logHeadAfterIntent), 'earlier log records remain reachable');
  assert.deepEqual(log.slice(log.findIndex((x) => x.sha === intentSha)).map((x) => x.kind), ['command-intent', 'read', 'authorization']);
});

test('recover of a completed transaction is a no-op', async () => {
  const cwd = await initialized();
  const r1 = await withTransaction(cwd, { command: 'authorize', plan: terminalPlan() }, null);
  const n = (await readLog(cwd)).length;
  const r2 = await recover(cwd, r1.tx);
  assert.equal(r2.completed, 'forward');
  assert.equal((await readLog(cwd)).length, n);
});

test('a conflicting writer blocks forward completion: the intent is preserved and the repair is named', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'v2\n');
  await git(['commit', '-q', '-am', 'Unrelated commit by another writer'], { cwd });
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'blocked');
  assert.match(r.repair, /^cairn: transaction TXCRASH cannot complete: HEAD is [0-9a-f]{40}, expected [0-9a-f]{40} or a commit "Authorize the specification" on [0-9a-f]{40}; restore it to [0-9a-f]{40} then run cairn recover TXCRASH$/);
  assert.equal(readFileSync(join(await stagingDir(cwd, 'TXCRASH'), 'repair'), 'utf8'), r.repair);
  const log = await readLog(cwd);
  assert.equal(pendingTransaction(cwd, log).sha, intentSha);
  assert.equal(log.at(-1).kind, 'command-intent');
});

test('lost staging with no effect is blocked and names the repair; staging without an intent is cleaned', async () => {
  const cwd = await initialized();
  await crashAfterIntent(cwd, terminalPlan());
  rmSync(await stagingDir(cwd, 'TXCRASH'), { recursive: true });
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'blocked');
  assert.match(r.repair, /staging for transaction TXCRASH is missing/);
  await stage(cwd, 'TXORPHAN', terminalPlan(), await preIdentities(cwd, terminalPlan()));
  assert.equal((await recover(cwd, 'TXORPHAN')).completed, 'abort');
  assert.equal(existsSync(await stagingDir(cwd, 'TXORPHAN')), false);
  assert.equal((await readLog(cwd)).at(-1).kind, 'command-intent', 'no abort record for a transaction that never reached the log');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tx.test.mjs`
Expected: FAIL, `recover is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
export function pendingTransaction(cwd, log) {
  const closed = new Set();
  for (const r of log) {
    if (r.kind === 'command-abort') closed.add(r.payload.intent);
    else if (r.kind !== 'command-intent' && typeof r.payload.intent === 'string') closed.add(r.payload.intent);
  }
  return log.findLast((r) => r.kind === 'command-intent' && !closed.has(r.sha)) ?? null;
}

export async function effectsHappened(cwd, s, log, intent) {
  if (Object.keys(s.done).length) return true;
  if (log.findIndex((r) => r.sha === intent.sha) < log.length - 1) return true;
  if ((await readRef(cwd, 'refs/cairn/snapshots')) !== s.pre.refs['refs/cairn/snapshots']) return true;
  if ((await headSha(cwd)) !== s.pre.head) return true;
  for (const [p, d] of Object.entries(s.pre.files)) if (fileDigest(cwd, p) !== d) return true;
  return false;
}

export async function recover(cwd, tx) {
  const release = await acquireLock(cwd, tx);
  try {
    const log = await readLog(cwd);
    const intent = log.find((r) => r.kind === 'command-intent' && r.target === tx) ?? null;
    const s = await readStaging(cwd, tx);
    if (intent && pendingTransaction(cwd, log)?.sha !== intent.sha) { if (s) rmSync(s.dir, { recursive: true, force: true }); return { completed: 'forward' }; }
    if (!intent) { if (s) rmSync(s.dir, { recursive: true, force: true }); return { completed: 'abort' }; }
    if (!s) {
      const repair = `cairn: staging for transaction ${tx} is missing; its intent ${intent.sha} names ${intent.payload.writes.length} writes with digests ${intent.payload.writes.map((w) => w.digest ?? w.store).join(', ')}; check each store against them, restore ${intent.payload.pre.head} as HEAD if no write landed, then run the command again`;
      return { completed: 'blocked', repair };
    }
    s.intentSha = intent.sha;
    if (await effectsHappened(cwd, s, log, intent)) {
      try { await finish(cwd, s, tx, intent.sha, null); return { completed: 'forward' }; }
      catch (e) {
        if (!(e instanceof TxConflict)) throw e;
        writeAtomic(join(s.dir, 'repair'), e.message);
        return { completed: 'blocked', repair: e.message };
      }
    }
    const restored = { refs: s.pre.refs, head: s.pre.head, files: Object.fromEntries(Object.entries(s.pre.files).map(([p]) => [p, fileDigest(cwd, p)])) };
    await appendRecord(cwd, 'command-abort', tx, { intent: intent.sha, failure_class: 'interrupted', restored });
    rmSync(s.dir, { recursive: true, force: true });
    return { completed: 'abort' };
  } finally { release(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tx.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tx.mjs tests/tx.test.mjs
git commit -m "recover: complete forward after any effect, abort with restored identities otherwise, name the repair when blocked"
```

---

### Task 5: The recover predicate and `cairn recover`

**Files:**
- Modify: `lib/tx.mjs`, `lib/cli.mjs` (one entry in plan 01's command table)
- Test: `tests/tx.test.mjs`

**Interfaces:**
- Consumes: `readLog` (lib/records.mjs).
- Produces: `recoverPredicate(cwd, log) -> {action:'recover', target: tx, reason} | null` (plan 08 places it second in precedence, after `repair`); `runRecover(argv, io) -> exit code`.

Spec: "Wake names `recover <transaction>` for a nonterminal intent before any ordinary action" and the predicate "the intent has one terminal domain or abort record and every store matches its resulting identity".

- [ ] **Step 1: Write the failing test**

```js
import { recoverPredicate, runRecover } from '../lib/tx.mjs';

test('recoverPredicate names the pending transaction and is null once it has a terminal or abort record', async () => {
  const cwd = await initialized();
  assert.equal(recoverPredicate(cwd, await readLog(cwd)), null);
  const intentSha = await crashAfterIntent(cwd, terminalPlan(), 'TXP');
  assert.deepEqual(recoverPredicate(cwd, await readLog(cwd)),
    { action: 'recover', target: 'TXP', reason: `command-intent ${intentSha} for authorize has no terminal record` });
  await recover(cwd, 'TXP');
  assert.equal(recoverPredicate(cwd, await readLog(cwd)), null);
});

test('cairn recover prints the result and exits 3 with the repair line when blocked', async () => {
  const cwd = await initialized();
  await crashAfterIntent(cwd, terminalPlan(), 'TXB');
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'v2\n');
  await git(['commit', '-q', '-am', 'Unrelated'], { cwd });
  const out = []; const err = [];
  const code = await runRecover(['TXB'], { cwd, stdout: (l) => out.push(l), stderr: (l) => err.push(l) });
  assert.equal(code, 3);
  assert.equal(out.length, 1);
  assert.match(out[0], /^cairn: transaction TXB cannot complete/);
  assert.equal(err.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tx.test.mjs`
Expected: FAIL, `recoverPredicate is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
export function recoverPredicate(cwd, log) {
  const p = pendingTransaction(cwd, log);
  return p ? { action: 'recover', target: p.target, reason: `command-intent ${p.sha} for ${p.payload.command} has no terminal record` } : null;
}

export async function runRecover(argv, io) {
  const tx = argv[0];
  if (!tx) { io.stderr('cairn: recover needs a transaction id'); return 1; }
  try {
    const r = await recover(io.cwd, tx);
    if (r.completed === 'blocked') { io.stdout(r.repair); return 3; }
    io.stdout(`cairn: transaction ${tx} ${r.completed === 'forward' ? 'completed' : 'aborted'}`);
    return 0;
  } catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
}
```

In `lib/cli.mjs` add `recover: runRecover` to the command table, imported from `./tx.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tx.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tx.mjs lib/cli.mjs tests/tx.test.mjs
git commit -m "Name the pending transaction for wake and add cairn recover"
```

---

### Task 6: `authorize` becomes a transaction

**Files:**
- Modify: `lib/auth.mjs` (plan 03's `authorize`)
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Consumes: `withTransaction` (this plan); `protectedDigests`, `authenticateDeveloper`, `verifyEvidence`, `AuthError` (lib/auth.mjs); `git` (lib/gitx.mjs).
- Produces: `authorize(cwd, {sign, confirm, decision})` unchanged in signature; its writes are one `branch` commit of the changed protected paths (`.cairn/settings.json`, `AGENTS.md`, `docs/spec`) followed by the terminal `authorization` record with `intent` set. When no protected path is dirty the branch write is omitted and the record is the only store, still inside the transaction so that the four commands share one path.

- [ ] **Step 1: Write the failing test**

```js
test('authorize commits the dirty protected paths and its record names the intent', async () => {
  const cwd = await initialized();
  writeFileSync(join(cwd, 'AGENTS.md'), '# changed\n');
  const sha = await authorize(cwd, { confirm: yes });
  const log = await readLog(cwd);
  assert.deepEqual(log.slice(-2).map((r) => r.kind), ['command-intent', 'authorization']);
  assert.equal(log.at(-1).payload.intent, log.at(-2).sha);
  assert.equal(log.at(-1).sha, sha);
  assert.equal((await git(['status', '--porcelain', '--', 'AGENTS.md'], { cwd })).stdout, '', 'AGENTS.md is committed');
  assert.equal((await git(['log', '-1', '--format=%s'], { cwd })).stdout.trim(), 'Authorize the specification, working agreement and settings');
  assert.equal(log.at(-1).payload.agreement_digest, sha256('# changed\n'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL, the record chain is `['init', 'authorization']` (no intent) and `intent` is `null`.

- [ ] **Step 3: Write minimal implementation**

Replace plan 03's `authorize` body after the evidence check with:

```js
import { withTransaction } from './tx.mjs';

export async function authorize(cwd, { sign, confirm, decision = null } = {}) {
  const log = await readLog(cwd);
  if (!log.some((r) => r.kind === 'init')) throw new AuthError('cairn: run cairn init first');
  if (!existsSync(join(cwd, 'AGENTS.md'))) throw new AuthError('cairn: AGENTS.md is missing; authorize binds the working agreement');
  if (!existsSync(join(cwd, 'docs/spec'))) throw new AuthError('cairn: docs/spec is missing; authorize binds the specification');
  const { settings } = loadSettings(cwd);
  const d = protectedDigests(cwd);
  const subject = canonicalize({ spec: d.spec, agreement: d.agreement, settings: d.settings });
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'authorize', subject, sign, confirm });
  if (!verifyEvidence(settings, evidence)) throw new AuthError('cairn: developer evidence does not verify');
  const dirty = (await git(['status', '--porcelain', '--', '.cairn/settings.json', 'AGENTS.md', 'docs/spec'], { cwd })).stdout
    .split('\n').filter(Boolean).map((l) => l.slice(3));
  const writes = dirty.length ? [{ store: 'branch', paths: dirty, message: 'Authorize the specification, working agreement and settings' }] : [];
  const payload = { spec_digest: d.spec, agreement_digest: d.agreement, settings_digest: d.settings, evidence, decision };
  const r = await withTransaction(cwd, { command: 'authorize', plan: { identity: { spec: d.spec, agreement: d.agreement, settings: d.settings, head: null },
    writes, terminal: { kind: 'authorization', target: 'protected', payload } } }, null);
  return r.terminalSha;
}
```

Also close the `authorization` schema in plan 01's `lib/records.mjs` to the keys `{spec_digest, agreement_digest, settings_digest, evidence, decision, intent}` and remove the `snapshot_check` key from the Task 3 test's `fn` payload.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auth.test.mjs tests/tx.test.mjs tests/init.test.mjs`
Expected: PASS (plan 03's `authorize` tests still hold; the record chain now includes the intent, so a plan 03 test that counted `authorizations(log).length` is unaffected because `command-intent` is not in that filter).

- [ ] **Step 5: Commit**

```bash
git add lib/auth.mjs lib/records.mjs tests/auth.test.mjs tests/tx.test.mjs
git commit -m "authorize runs as a transaction: commit the protected paths, then the record naming its intent"
```

---

### Task 7: `cairn begin`: the action lease on compare-and-swap

**Files:**
- Create: `lib/lease.mjs`
- Test: `tests/lease.test.mjs`

**Interfaces:**
- Consumes: `commitTree`, `catCommit`, `readRef`, `updateRefCAS`, `CasError` (lib/gitx.mjs); `writeWorkspaceSnapshot`, `readSnapshot` (lib/snapshots.mjs); `canonicalize`, `sha256` (lib/canon.mjs); `validatePath`, `classify` (lib/paths.mjs); `loadSettings` (lib/settings.mjs).
- Produces: `LEASE_REF = 'refs/cairn/in-progress'`; `begin(cwd, {action, target, touch = [], env = process.env}) -> leaseSha`; `readLease(cwd) -> {action, target, snapshot, started, session, touch} | null`; `ACTIONS` (the set `implement`, `build`, `run`, `review`, `declare`, `repair`, `promote`, `resolve`, `fix`, `scope`); `LeaseError`.

The lease is an empty commit whose tree is the start workspace snapshot's tree, no parents, body the canonical JSON `{action, target, snapshot, started, session, touch}`; `session` is `env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID ?? null`; `started` is ISO 8601 UTC. `begin` refuses an existing lease, an unknown action, a `--touch` path that fails `validatePath` or classifies `reserved`, `protected`, `kernel-managed` or `output`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lease.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';

// Plan 01's makeRepo() returns {dir, git, write, commit, readRef, remove}; this wrapper
// writes the fixture files, commits them and exposes the directory as cwd.
async function repoWith(files) {
  const repo = await makeRepo();
  for (const [p, c] of Object.entries(files)) await repo.write(p, c);
  await repo.commit('fixture');
  return { cwd: repo.dir, repo };
}
import { readRef, catCommit, git, gitPath } from '../lib/gitx.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { init } from '../lib/init.mjs';
import { begin, readLease, LEASE_REF } from '../lib/lease.mjs';

const yes = async () => true;
const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: ['src/**'], interfaces: [], data: [],
  network_exclude: [], signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { enabled: false, mode: 'shadow', model: null } });
async function initialized() {
  const { cwd } = await repoWith({ '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# a\n', 'docs/spec/overview.md': '# k\n', 'src/a.mjs': 'export const a = 1;\n' });
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  return cwd;
}

test('begin creates the lease with the action, target, start snapshot, timestamp, session and touch list', async () => {
  const cwd = await initialized();
  const sha = await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs'], env: { CAIRN_SESSION: 'sess-1' } });
  assert.equal(await readRef(cwd, LEASE_REF), sha);
  const lease = await readLease(cwd);
  assert.equal(lease.action, 'implement');
  assert.equal(lease.target, 'CORE-001');
  assert.equal(lease.session, 'sess-1');
  assert.deepEqual(lease.touch, ['src/new.mjs']);
  assert.match(lease.started, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  const snap = await readSnapshot(cwd, lease.snapshot, 'workspace');
  assert.equal(snap.kind, 'workspace');
  const c = await catCommit(cwd, sha);
  assert.equal(c.subject, 'cairn: lease implement CORE-001');
  assert.deepEqual(c.parents, []);
  assert.equal(c.tree, snap.tree);
  assert.equal(existsSync(join(cwd, '.cairn/in-progress')), false, 'no shared slot file');
});

test('begin refuses when a lease exists and names reconcile', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  await assert.rejects(begin(cwd, { action: 'run', target: 'CORE-002', env: {} }),
    /^LeaseError: cairn: action lease held: implement CORE-001; run cairn end or cairn reconcile/);
});

test('begin refuses an unknown action and a touch path that is reserved, protected, invalid or output', async () => {
  const cwd = await initialized();
  await assert.rejects(begin(cwd, { action: 'dance', target: 'X', env: {} }), /^LeaseError: cairn: unknown action dance/);
  for (const p of ['docs/spec/x.md', 'AGENTS.md', '.cairn/mechanisms', '.cairn/output/o', '../x', 'a\\b']) {
    await assert.rejects(begin(cwd, { action: 'implement', target: 'X', touch: [p], env: {} }), /cairn: --touch/);
  }
  assert.equal(await readRef(cwd, LEASE_REF), null);
});

test('readLease ignores a stray .cairn/in-progress file: the shared slot is gone', async () => {
  const cwd = await initialized();
  writeFileSync(join(cwd, '.cairn/in-progress'), 'action: implement\ntarget: X\n');
  assert.equal(await readLease(cwd), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lease.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/lease.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/lease.mjs
import { openSync, writeSync, closeSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { git, gitPath, readRef, updateRefCAS, commitTree, catCommit, CasError } from './gitx.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
import { canonicalize, parseStrict } from './canon.mjs';
import { validatePath, classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';

export class LeaseError extends Error {}
export const LEASE_REF = 'refs/cairn/in-progress';
export const ACTIONS = new Set(['implement', 'build', 'run', 'review', 'declare', 'repair', 'promote', 'resolve', 'fix', 'scope']);

function checkTouch(cwd, touch) {
  const { settings } = loadSettings(cwd);
  for (const p of touch) {
    try { validatePath(p); } catch (e) { throw new LeaseError(`cairn: --touch ${p}: ${e.message}`); }
    const cls = classify(p, settings);
    if (['reserved', 'protected', 'kernel-managed', 'output'].includes(cls)) throw new LeaseError(`cairn: --touch ${p} is a ${cls} path and cannot be a mechanism input`);
  }
}

export async function readLease(cwd) {
  const sha = await readRef(cwd, LEASE_REF);
  if (!sha) return null;
  return parseStrict((await catCommit(cwd, sha)).body);
}

export async function begin(cwd, { action, target, touch = [], env = process.env }) {
  if (!ACTIONS.has(action)) throw new LeaseError(`cairn: unknown action ${action}`);
  checkTouch(cwd, touch);
  const existing = await readLease(cwd);
  if (existing) throw new LeaseError(`cairn: action lease held: ${existing.action} ${existing.target}; run cairn end or cairn reconcile`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const { tree } = await readSnapshot(cwd, snapshot, 'workspace');
  const body = canonicalize({ action, target, snapshot, started: new Date().toISOString(), session: env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID ?? null, touch });
  const sha = await commitTree(cwd, { tree, parents: [], subject: `cairn: lease ${action} ${target}`, body, trailers: [] });
  try { await updateRefCAS(cwd, LEASE_REF, sha, null); }
  catch (e) { if (e instanceof CasError) throw new LeaseError('cairn: action lease held by a concurrent begin; run cairn end or cairn reconcile'); throw e; }
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lease.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lease.mjs tests/lease.test.mjs
git commit -m "cairn begin: the local action lease as a compare-and-swap ref carrying the start snapshot and touch list"
```

---

### Task 8: `cairn end`, the `--touch` rule and the `onEnd` hook

**Files:**
- Modify: `lib/lease.mjs`
- Test: `tests/lease.test.mjs`

**Interfaces:**
- Consumes: `git`, `readRef` (lib/gitx.mjs); `readSnapshot` (lib/snapshots.mjs); `sha256` (lib/canon.mjs).
- Produces: `end(cwd) -> void` (compare-and-swap delete; refuses without a lease); `onEnd(fn) -> unregister()` where `fn(cwd, lease, {changed: [paths], unchanged: [paths]})` runs before the ref is removed; `touchOutcome(cwd, lease) -> {changed, unchanged}` (a touched path is changed when its bytes differ from the start snapshot's tree entry or it is newly present); `covers(lease, path, declaredInputs) -> boolean` (the path is among the target's declared inputs or the touch list).

Plan 05 registers `onEnd` to write each `changed` touch path into the target's mechanism definition through `declare`, which unbinds its review metadata; an `unchanged` path is dropped. This module only computes and reports the outcome.

- [ ] **Step 1: Write the failing test**

```js
import { end, onEnd, touchOutcome, covers } from '../lib/lease.mjs';

test('end removes the lease with compare-and-swap and reports the touch outcome to the hook', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs', 'src/untouched.mjs'], env: {} });
  writeFileSync(join(cwd, 'src/new.mjs'), 'export const n = 1;\n');
  const seen = [];
  const off = onEnd(async (c, lease, outcome) => { seen.push({ c, target: lease.target, outcome }); });
  await end(cwd);
  off();
  assert.equal(await readRef(cwd, LEASE_REF), null);
  assert.deepEqual(seen, [{ c: cwd, target: 'CORE-001', outcome: { changed: ['src/new.mjs'], unchanged: ['src/untouched.mjs'] } }]);
});

test('a touched path whose bytes equal the start snapshot is unchanged; a modified existing file is changed', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/a.mjs'], env: {} });
  assert.deepEqual(await touchOutcome(cwd, await readLease(cwd)), { changed: [], unchanged: ['src/a.mjs'] });
  writeFileSync(join(cwd, 'src/a.mjs'), 'export const a = 2;\n');
  assert.deepEqual(await touchOutcome(cwd, await readLease(cwd)), { changed: ['src/a.mjs'], unchanged: [] });
  await end(cwd);
});

test('end without a lease is refused; a failing hook keeps the lease', async () => {
  const cwd = await initialized();
  await assert.rejects(end(cwd), /^LeaseError: cairn: no action lease to end/);
  await begin(cwd, { action: 'run', target: 'CORE-001', env: {} });
  const off = onEnd(async () => { throw new Error('declare failed'); });
  await assert.rejects(end(cwd), /declare failed/);
  off();
  assert.ok(await readRef(cwd, LEASE_REF), 'lease survives a failed end');
  await end(cwd);
});

test('covers: a lease covers its target inputs and its touch list', async () => {
  const lease = { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs'] };
  assert.equal(covers(lease, 'src/new.mjs', ['src/a.mjs']), true);
  assert.equal(covers(lease, 'src/a.mjs', ['src/a.mjs']), true);
  assert.equal(covers(lease, 'src/other.mjs', ['src/a.mjs']), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lease.test.mjs`
Expected: FAIL, `end is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
import { sha256 } from './canon.mjs';
import { join } from 'node:path';

const endHooks = new Set();
export function onEnd(fn) { endHooks.add(fn); return () => endHooks.delete(fn); }

export async function touchOutcome(cwd, lease) {
  const { tree } = await readSnapshot(cwd, lease.snapshot, 'workspace');
  const changed = []; const unchanged = [];
  for (const p of lease.touch) {
    const r = await git(['rev-parse', '--verify', '-q', `${tree}:${p}`], { cwd });
    const before = r.code === 0 ? r.stdout.trim() : null;
    const abs = join(cwd, p);
    const now = existsSync(abs) ? (await git(['hash-object', '--', p], { cwd })).stdout.trim() : null;
    (before === now ? unchanged : changed).push(p);
  }
  return { changed, unchanged };
}

export function covers(lease, path, declaredInputs) {
  return lease.touch.includes(path) || declaredInputs.includes(path);
}

export async function end(cwd) {
  const sha = await readRef(cwd, LEASE_REF);
  if (!sha) throw new LeaseError('cairn: no action lease to end');
  const lease = await readLease(cwd);
  const outcome = await touchOutcome(cwd, lease);
  for (const fn of endHooks) await fn(cwd, lease, outcome);
  const r = await git(['update-ref', '-d', LEASE_REF, sha], { cwd });
  if (r.code !== 0) throw new LeaseError(`cairn: action lease changed under cairn end; run cairn reconcile`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lease.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lease.mjs tests/lease.test.mjs
git commit -m "cairn end: compare-and-swap removal, touch outcome for the mechanism definition, onEnd hook"
```

---

### Task 9: The separate check lock, nesting inside an action

**Files:**
- Modify: `lib/lease.mjs`
- Test: `tests/lease.test.mjs`

**Interfaces:**
- Consumes: `gitPath` (lib/gitx.mjs).
- Produces: `withCheckLock(cwd, fn) -> result` (creates `cairn-check.lock` below the git path with `wx`, runs `fn`, removes the lock in `finally`; refuses a live holder naming its pid; removes a dead holder's lock). Plan 05's `check` wraps its run in it.

- [ ] **Step 1: Write the failing test**

```js
import { withCheckLock } from '../lib/lease.mjs';
import { readFileSync } from 'node:fs';

test('the check lock is held only for the run and nests inside an action lease', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  const lock = await gitPath(cwd, 'cairn-check.lock');
  const out = await withCheckLock(cwd, async () => { assert.equal(readFileSync(lock, 'utf8'), String(process.pid)); return 'ran'; });
  assert.equal(out, 'ran');
  assert.equal(existsSync(lock), false);
  assert.ok(await readRef(cwd, LEASE_REF), 'the action lease is untouched by a check');
  await end(cwd);
});

test('a live check holder refuses a second run; a dead holder is cleared', async () => {
  const cwd = await initialized();
  const lock = await gitPath(cwd, 'cairn-check.lock');
  await withCheckLock(cwd, async () => {
    await assert.rejects(withCheckLock(cwd, async () => {}), new RegExp(`^LeaseError: cairn: cairn-check.lock held by pid ${process.pid}; wait for that check`));
  });
  writeFileSync(lock, '999999999');
  assert.equal(await withCheckLock(cwd, async () => 1), 1);
  await assert.rejects(withCheckLock(cwd, async () => { throw new Error('check crashed'); }), /check crashed/);
  assert.equal(existsSync(lock), false, 'released after a throw');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lease.test.mjs`
Expected: FAIL, `withCheckLock is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

export async function withCheckLock(cwd, fn) {
  const lock = await gitPath(cwd, 'cairn-check.lock');
  for (let attempt = 0; ; attempt++) {
    try { const fd = openSync(lock, 'wx'); writeSync(fd, String(process.pid)); closeSync(fd); break; }
    catch (e) {
      if (e.code !== 'EEXIST' || attempt) throw e;
      const pid = Number(readFileSync(lock, 'utf8'));
      if (alive(pid)) throw new LeaseError(`cairn: cairn-check.lock held by pid ${pid}; wait for that check`);
      unlinkSync(lock);
    }
  }
  try { return await fn(); } finally { try { unlinkSync(lock); } catch {} }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lease.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lease.mjs tests/lease.test.mjs
git commit -m "The check lock is a separate file held only for one run so a check nests inside an action"
```

---

### Task 10: Stale lease predicate, separate clones, and the CLI entries

**Files:**
- Modify: `lib/lease.mjs`, `lib/cli.mjs` (three entries)
- Test: `tests/lease.test.mjs`

**Interfaces:**
- Consumes: `git` (lib/gitx.mjs).
- Produces: `isStale(lease, env) -> boolean` (true when the lease names a session and the environment's session differs, or the lease names none and the environment has one); `reconcilePredicate(cwd, env) -> {action:'reconcile', target:'<action> <target>', reason} | null` (plan 08 places it third); `runBegin(argv, io)`, `runEnd(argv, io)` parsing `cairn begin <action> <target> [--touch <path>]...` and `cairn end`.

The lease does not coordinate separate clones: a second clone can `begin` independently, and a fetch with the durable refspecs never brings the lease across.

- [ ] **Step 1: Write the failing test**

```js
import { isStale, reconcilePredicate, runBegin, runEnd } from '../lib/lease.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('a lease from another session is stale and wake would name reconcile; the same session is not', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: { CAIRN_SESSION: 's1' } });
  const lease = await readLease(cwd);
  assert.equal(isStale(lease, { CAIRN_SESSION: 's1' }), false);
  assert.equal(isStale(lease, { CAIRN_SESSION: 's2' }), true);
  assert.equal(isStale(lease, {}), false, 'a session-less wake cannot tell and does not nag');
  assert.deepEqual(await reconcilePredicate(cwd, { CAIRN_SESSION: 's2' }),
    { action: 'reconcile', target: 'implement CORE-001', reason: 'action lease from session s1 is stale in session s2' });
  assert.equal(await reconcilePredicate(cwd, { CAIRN_SESSION: 's1' }), null);
  await end(cwd);
  assert.equal(await reconcilePredicate(cwd, { CAIRN_SESSION: 's2' }), null);
});

test('the lease does not coordinate separate clones and never travels with the durable refs', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
  await git(['clone', '-q', cwd, clone], { cwd });
  await git(['fetch', '-q', 'origin', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'], { cwd: clone });
  assert.equal(await readRef(clone, LEASE_REF), null);
  await begin(clone, { action: 'run', target: 'CORE-002', env: {} }); // independent of the first clone's lease
  assert.equal((await readLease(clone)).target, 'CORE-002');
  assert.equal((await readLease(cwd)).target, 'CORE-001');
});

test('cairn begin and cairn end parse their arguments and refuse with one cairn: line', async () => {
  const cwd = await initialized();
  const err = []; const out = [];
  const io = { cwd, env: {}, stdout: (l) => out.push(l), stderr: (l) => err.push(l) };
  assert.equal(await runBegin(['implement', 'CORE-001', '--touch', 'src/new.mjs', '--touch', 'src/b.mjs'], io), 0);
  assert.deepEqual((await readLease(cwd)).touch, ['src/new.mjs', 'src/b.mjs']);
  assert.equal(await runBegin(['implement', 'CORE-001'], io), 1);
  assert.match(err.at(-1), /^cairn: action lease held/);
  assert.equal(await runEnd([], io), 0);
  assert.equal(await runEnd([], io), 1);
  assert.equal(err.at(-1), 'cairn: no action lease to end');
  assert.equal(await runBegin(['implement'], io), 1);
  assert.equal(err.at(-1), 'cairn: usage: cairn begin <action> <target> [--touch <path>]...');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lease.test.mjs`
Expected: FAIL, `isStale is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
export function isStale(lease, env = process.env) {
  const here = env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID ?? null;
  if (here === null) return false;
  return lease.session !== here;
}

export async function reconcilePredicate(cwd, env = process.env) {
  const lease = await readLease(cwd);
  if (!lease || !isStale(lease, env)) return null;
  const here = env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID;
  return { action: 'reconcile', target: `${lease.action} ${lease.target}`,
    reason: `action lease from session ${lease.session ?? 'none'} is stale in session ${here}` };
}

function refusing(io, fn) {
  return fn().then(() => 0, (e) => { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; });
}

export function runBegin(argv, io) {
  return refusing(io, async () => {
    const [action, target, ...rest] = argv;
    const touch = [];
    for (let i = 0; i < rest.length; i++) { if (rest[i] === '--touch' && rest[i + 1]) touch.push(rest[++i]); else throw new LeaseError('cairn: usage: cairn begin <action> <target> [--touch <path>]...'); }
    if (!action || !target) throw new LeaseError('cairn: usage: cairn begin <action> <target> [--touch <path>]...');
    const sha = await begin(io.cwd, { action, target, touch, env: io.env });
    io.stdout(`cairn: lease ${action} ${target} ${sha}`);
  });
}

export function runEnd(argv, io) {
  return refusing(io, async () => { await end(io.cwd); io.stdout('cairn: lease ended'); });
}
```

In `lib/cli.mjs` add `begin: runBegin` and `end: runEnd` to the command table, imported from `./lease.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS, every test file.

- [ ] **Step 5: Commit**

```bash
git add lib/lease.mjs lib/cli.mjs tests/lease.test.mjs
git commit -m "Stale lease predicate, clone independence, and the begin and end commands"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| Four commands write to more than one store: start, promote, supersede, authorize; every other command needs no intent (4) | 3 (refusal test), 6 |
| A multi-store command holds a repository-local transaction lock (4) | 1 |
| first stages exact bytes, commit metadata and pre-identities below the Git directory (4) | 1, 2 |
| appends a command-intent (4 table: transaction ID, command, complete input identity, expected pre-identities, ordered planned writes and digests) | 3 |
| performs the ordered writes, and appends a terminal domain record naming that intent (4) | 3, 6 |
| Each step is idempotent on the transaction ID and expected old identity; atomic rename prevents partial files (4) | 1, 2 |
| Wake names `recover <transaction>` for a nonterminal intent before any ordinary action (4, 5 precedence "incomplete transaction") | 5 |
| Recovery completes forward after any planned append-only write beyond the intent or any external effect (4) | 4 |
| It may restore staged pre-identities and append a command-abort only when neither has occurred (4 table: intent SHA, failure class, verified restored identities) | 4 |
| It never rewrites an append-only ref (4) | 4 (the forward test checks the earlier log head stays reachable) |
| A conflicting writer: preserve the intent and record or name the exact repair before a Blocking escalation (4) | 4, 5 |
| `recover TRANSACTION` predicate: one terminal domain or abort record and every store matches (5) | 4, 5 |
| `cairn begin <action> <target>` creates the lease with compare-and-swap before the agent changes a declared input (2) | 7 |
| `cairn end` removes it with compare-and-swap after the action is committed (2) | 8 |
| `--touch <path>` provisionally adds a path to the target's mechanism inputs for the life of the lease (2) | 7, 8 (`covers`) |
| `cairn end` writes the addition into the definition or drops it when the path is unchanged (2) | 8 (`touchOutcome`, `onEnd`; the definition write is plan 05's `declare`) |
| It carries the action, target, workspace snapshot at start, timestamp and harness session when available (2) | 7 |
| The separate check lock `cairn-check.lock` below `git rev-parse --git-path`, held only for the run, nests inside an implementation action (2) | 9 |
| `refs/cairn/in-progress` is local and never pushed (2) | 10 |
| The action lease does not coordinate separate clones (2) | 10 |
| `reconcile ACTION` predicate and "stale action lease" precedence (5) | 10 (`reconcilePredicate`, `isStale`) |
| The shared in-progress/check-lock slot is removed (12) | 7 (no `.cairn/in-progress` written or read), 9 |

Left to other plans, deliberately:

- "An evaluator intent is written before network I/O ... `indeterminate` call" (4): plan 11.
- The `start`, `promotion` and `superseded` terminal records and their `withTransaction` plans, including "`Current:` moves in the same recoverable start transaction" (3, 8): plan 06.
- "While it exists, its target's declared inputs are neither `record` nor `commit` findings" (2) and the predicate text for `record` and `commit` (5): plan 08 consumes `readLease` and `covers`.
- "the action it named finished or was explicitly abandoned" (5, reconcile completion): plan 08 decides finished; abandonment is `cairn end` from this plan.
- "Concurrent clones meet at the authority remote: a non-fast-forward or failed lease push stops the later writer" (2, 4 travel): plan 12.
- The Blocking escalation raised from a `blocked` recovery's repair line (4): plan 09 `escalate`.
- Writing a changed touch path into the mechanism definition and unbinding review metadata (2): plan 05 `declare` registered through `onEnd`.
- Counting `recover` and `reconcile` as administrative actions for the cycle bound (5): plan 08 with `lib/cycle.mjs`.
