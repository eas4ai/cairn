# Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `lib/scope.mjs`: the monotonic scope preflight that records a durable scope-breach for every undeclared, non-outside change the kernel first observes, the two dispositions that close one, and the lease-coverage rule the `record` and `commit` predicates use.

**Architecture:** The preflight is a pure comparison of the working tree against the newest allowed workspace snapshot plus the declarations active at the log head; it writes only scope-breach records and the first-observed snapshot they name. It runs at the front of every state-changing command through one wrapper in `lib/cli.mjs`, so `declare` can never legalize bytes it has already seen. A breach closes only by a `scope` record: `keep` needs an escalation answered `ok`, `restore` needs the path back at its allowed base. Nothing here reads branch history; a rebase or squash changes no record.

**Tech Stack:** Node 24, ES modules, Git plumbing through `lib/gitx.mjs`, tests with `node --test` and `node:assert/strict`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 (Allowed workspace snapshot; Scope breach; Kernel-managed paths; Action lease), section 5 (`scope PATH`, `declare REQ`, `record PATH`, `commit PATH`; Scope is monotonic), section 8 (Scope and protected state), section 13 decisions 31 and 44. Depends on plans 01, 04 and 06 (and reads plan 02, 03 and 05 modules by their overview names).

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Before any state-changing command, the kernel compares the current workspace with the latest allowed workspace snapshot and the declarations active at that log head."
- "The first-observed snapshot on an unresolved scope breach is not an allowed base."
- "Only the command assigned to a schema-valid mutation may write them. That exact mutation is not a scope breach. A direct edit, an extra byte, deletion, reordering, or a write by another command is a breach."
- "`outside` cannot exempt either class because the reservation is compiled into the kernel."
- "A later declaration cannot clear it." (decision 31) and "First-observed undeclared work is a log fact, so branch rewriting cannot erase it." (decision 44)
- Record subjects carry only ASCII tokens: the scope-breach subject target is the first 16 hex characters of `sha256(path)`; the path itself lives in the payload as a JSON string.

Payload keys used here are the ones plan 01's schema table assigns to these kinds. `scope-breach`: `path`, `first_observed`, `allowed_base`, `declarations`. `scope`: `breach`, `disposition`, `snapshot`, `escalation`, `answer` (the last two are `null` for `restore`). Plan 09's records, read here: `escalation` has `slug`, `question`, `recommendation`, `because`, `if_wrong`, `instead`, `concerns`, `evaluation`; `answer` has `escalation`, `kind`, `text`, `owner`, `evidence`. A keep disposition needs an escalation whose `concerns` is `scope-breach:<breach sha>` and an answer of kind `ok` naming it. Plan 03's `authorization` record has `spec`, `agreement`, `settings` digests; task 4 defines how this plan computes the same three values.

The test fixture: `tests/helpers/repo.mjs` (plan 03) exports `makeProject({settings, files})`, which builds an initialized project under `os.tmpdir()` (settings merged over the defaults, `cairn init` run, both durable refs created) and returns `{cwd, ...}`. Every test in this plan goes through `loopRepo()` from task 1, which adds a spec, a declared mechanism and a start record on top of it.

---

### Task 1: The loop fixture

**Files:**
- Create: `tests/helpers/loop.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `makeProject` (plan 03 helper); `git` from `lib/gitx.mjs`; `appendRecord`, `readLog` from `lib/records.mjs`; `writeWorkspaceSnapshot` from `lib/snapshots.mjs`; `parseDomainFile` from `lib/spec.mjs`; `declare` from `lib/mechanisms.mjs`.
- Produces: `loopRepo({reqs, slug, settings}) -> {cwd, slug, reqs, startSha, startSnapshot, write(path, text), remove(path), commit(msg), log(), add(kind, target, payload), snap()}`. Plan 08 extends this file.

- [ ] **Step 1: Write the failing test**

```js
// tests/scope.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopRepo } from './helpers/loop.mjs';

test('loopRepo opens a commitment with one declared requirement', async () => {
  const r = await loopRepo();
  const log = await r.log();
  const start = log.at(-1);
  assert.equal(start.kind, 'start');
  assert.deepEqual(start.payload.requirements.map((x) => x.requirement), ['DEMO-001']);
  assert.equal(start.payload.snapshot, r.startSnapshot);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `Cannot find module './helpers/loop.mjs'`.

- [ ] **Step 3: Write the fixture**

```js
// tests/helpers/loop.mjs
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { makeProject } from './repo.mjs';
import { git } from '../../lib/gitx.mjs';
import { appendRecord, readLog } from '../../lib/records.mjs';
import { writeWorkspaceSnapshot } from '../../lib/snapshots.mjs';
import { parseDomainFile } from '../../lib/spec.mjs';
import { declare } from '../../lib/mechanisms.mjs';

const domainFile = (reqs) => 'Prefix: DEMO\n\n' + reqs.map((r) =>
  `[${r}] The demo command prints hello for ${r}.\n` +
  `Falsifier: the flag file for ${r} says fail.\n` +
  `Mechanism: ${r.toLowerCase()}\nStatus: Agreed 2026-09-19\n`).join('\n');

export const mechanismFor = (r) => ({
  command: `node -e "process.stdout.write('cairn: ${r}: '+require('fs').readFileSync('flags/${r}','utf8').trim()+'\\n')"`,
  inputs: ['src/demo.mjs', `flags/${r}`], documents: [], requirements: [r],
  results: 'per-requirement', identity: {},
});

export async function loopRepo({ reqs = ['DEMO-001'], slug = 'first', settings = {} } = {}) {
  const { cwd } = await makeProject({ settings: { outside: ['README.md', 'notes/**'], source: ['src/**'], ...settings } });
  const write = async (p, text) => {
    await mkdir(dirname(join(cwd, p)), { recursive: true });
    await writeFile(join(cwd, p), text);
  };
  const remove = (p) => rm(join(cwd, p), { force: true });
  const commit = async (msg) => { await git(['add', '-A'], { cwd }); await git(['commit', '-q', '--allow-empty', '-m', msg], { cwd }); };
  await write('docs/spec/overview.md', '# Demo\n\nA demo program.\n\n| Domain | Prefix | File |\n|---|---|---|\n| demo | DEMO | demo.md |\n');
  await write('docs/spec/glossary.md', '# Glossary\n\n- demo: the sample program.\n');
  await write('docs/spec/roadmap.md', `Current: ${slug}\n\n## ${slug}\n\nRequirements: ${reqs.join(' ')}\n\nDelivers the demo.\n`);
  await write('docs/spec/demo.md', domainFile(reqs));
  await write('README.md', '# demo\n');
  await write('src/demo.mjs', 'console.log("hello");\n');
  for (const r of reqs) await write(`flags/${r}`, 'fail\n');
  await commit('Demo project');
  for (const r of reqs) await declare(cwd, r.toLowerCase(), mechanismFor(r));
  await commit('Declare demo mechanisms');
  const { blocks } = parseDomainFile(await readFile(join(cwd, 'docs/spec/demo.md'), 'utf8'));
  const startSnapshot = await writeWorkspaceSnapshot(cwd);
  const startSha = await appendRecord(cwd, 'start', slug, {
    slug, snapshot: startSnapshot, from_superseded: null,
    requirements: blocks.map((b) => ({ requirement: b.id, text_digest: b.textDigest })),
  });
  return {
    cwd, slug, reqs, startSha, startSnapshot, write, remove, commit,
    log: () => readLog(cwd),
    add: (kind, target, payload) => appendRecord(cwd, kind, target, payload),
    snap: () => writeWorkspaceSnapshot(cwd),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/loop.mjs tests/scope.test.mjs
git commit -m "Add the loop fixture: a started commitment with one declared requirement"
```

---

### Task 2: Read-only workspace delta

**Files:**
- Create: `lib/scope.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `git`, `listTree` from `lib/gitx.mjs`; `readSnapshot` from `lib/snapshots.mjs`.
- Produces: `workspaceDelta(cwd, treeSha) -> [{path, change: 'added'|'modified'|'deleted'}]` sorted by path. It writes no Git object: blob ids come from `git hash-object` without `-w`. Plan 08's wake uses it for every "current workspace snapshot" comparison.

- [ ] **Step 1: Write the failing test**

```js
import { readSnapshot } from '../lib/snapshots.mjs';
import { workspaceDelta } from '../lib/scope.mjs';

test('workspaceDelta lists added, modified and deleted paths against a snapshot tree', async () => {
  const r = await loopRepo();
  const { tree } = await readSnapshot(r.cwd, r.startSnapshot, 'workspace');
  assert.deepEqual(await workspaceDelta(r.cwd, tree), []);
  await r.write('src/new.mjs', 'export const n = 1;\n');
  await r.write('src/demo.mjs', 'console.log("hi");\n');
  await r.remove('README.md');
  assert.deepEqual(await workspaceDelta(r.cwd, tree), [
    { path: 'README.md', change: 'deleted' },
    { path: 'src/demo.mjs', change: 'modified' },
    { path: 'src/new.mjs', change: 'added' },
  ]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `Cannot find module '../lib/scope.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/scope.mjs
import { lstat, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { git, listTree } from './gitx.mjs';

export class ScopeError extends Error {}

async function workspacePaths(cwd) {
  const tracked = (await git(['ls-files', '-z'], { cwd })).stdout.split('\0').filter(Boolean);
  const untracked = (await git(['ls-files', '-z', '--others', '--exclude-standard'], { cwd })).stdout.split('\0').filter(Boolean);
  return new Set([...tracked, ...untracked].filter((p) => !p.startsWith('.cairn/output/')));
}

async function entryOf(cwd, p) {
  const st = await lstat(join(cwd, p));
  const bytes = st.isSymbolicLink() ? Buffer.from(await readlink(join(cwd, p))) : await readFile(join(cwd, p));
  const mode = st.isSymbolicLink() ? '120000' : (st.mode & 0o111) ? '100755' : '100644';
  const sha = (await git(['hash-object', '--stdin'], { cwd, input: bytes })).stdout.trim();
  return { mode, sha };
}

export async function workspaceDelta(cwd, treeSha) {
  const entries = new Map((await listTree(cwd, treeSha)).map((e) => [e.path, e]));
  const paths = await workspacePaths(cwd);
  const out = [];
  for (const p of paths) {
    const e = entries.get(p);
    const cur = await entryOf(cwd, p);
    if (!e) out.push({ path: p, change: 'added' });
    else if (e.sha !== cur.sha || e.mode !== cur.mode) out.push({ path: p, change: 'modified' });
  }
  for (const p of entries.keys()) if (!paths.has(p)) out.push({ path: p, change: 'deleted' });
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}
```

`listTree` (plan 01) returns the recursive listing of blobs with their modes; a gitlink or subtree never appears as a path here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/scope.mjs tests/scope.test.mjs
git commit -m "Compare the working tree with a snapshot tree without writing objects"
```

---

### Task 3: Declared paths and lease coverage

**Files:**
- Modify: `lib/scope.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: the `readMechanisms` shape from plan 05 (`{name: {definition: {inputs, documents, requirements, ...}, definitionDigest, review}}`); the `readLease` shape from plan 04 (`{action, target, snapshot, started, session, touch}`).
- Produces: `declaredPaths(mechanisms, lease) -> Set<string>`; `isDeclared(path, declared) -> boolean` (exact entry or below a directory entry); `leaseCovers(lease, mechanisms, path) -> boolean`, the rule the `record PATH` and `commit PATH` predicates use: a lease covers a path when the path is in its `touch` list, or the lease target is a requirement and the path is declared by a mechanism naming that requirement. `declarationSetDigest(mechanisms) -> 'sha256:...'`.

- [ ] **Step 1: Write the failing test**

```js
import { declaredPaths, isDeclared, leaseCovers, declarationSetDigest } from '../lib/scope.mjs';

const mechs = {
  demo: { definition: { inputs: ['src/demo.mjs', 'flags'], documents: [], requirements: ['DEMO-001'] }, definitionDigest: 'sha256:' + 'a'.repeat(64), review: {} },
  other: { definition: { inputs: ['lib'], documents: [], requirements: ['DEMO-002'] }, definitionDigest: 'sha256:' + 'b'.repeat(64), review: {} },
};

test('declared paths are mechanism inputs, documents and lease touches', () => {
  const d = declaredPaths(mechs, { action: 'implement', target: 'DEMO-001', touch: ['src/new.mjs'] });
  assert.ok(isDeclared('src/demo.mjs', d));
  assert.ok(isDeclared('flags/DEMO-001', d));
  assert.ok(isDeclared('src/new.mjs', d));
  assert.ok(!isDeclared('src/other.mjs', d));
  assert.ok(!isDeclared('flagsx', d));
});

test('a lease covers a path through its target requirement or its touch list', () => {
  const lease = { action: 'implement', target: 'DEMO-001', touch: ['src/new.mjs'] };
  assert.ok(leaseCovers(lease, mechs, 'src/demo.mjs'));
  assert.ok(leaseCovers(lease, mechs, 'src/new.mjs'));
  assert.ok(!leaseCovers(lease, mechs, 'lib/x.mjs'));
  assert.ok(!leaseCovers(null, mechs, 'src/demo.mjs'));
  assert.ok(leaseCovers({ action: 'build-decision', target: '01J', touch: ['lib/x.mjs'] }, mechs, 'lib/x.mjs'));
  assert.ok(!leaseCovers({ action: 'build-decision', target: '01J', touch: [] }, mechs, 'lib/x.mjs'));
});

test('the declaration-set digest changes when a definition digest changes', () => {
  const a = declarationSetDigest(mechs);
  const b = declarationSetDigest({ ...mechs, demo: { ...mechs.demo, definitionDigest: 'sha256:' + 'c'.repeat(64) } });
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `declaredPaths is not a function`.

- [ ] **Step 3: Implement**

```js
import { canonicalize, sha256 } from './canon.mjs';

export function declaredPaths(mechanisms, lease) {
  const out = new Set();
  for (const m of Object.values(mechanisms)) for (const p of [...m.definition.inputs, ...(m.definition.documents || [])]) out.add(p);
  for (const p of lease?.touch || []) out.add(p);
  return out;
}

export function isDeclared(path, declared) {
  for (const d of declared) if (path === d || path.startsWith(d + '/')) return true;
  return false;
}

export function leaseCovers(lease, mechanisms, path) {
  if (!lease) return false;
  if ((lease.touch || []).includes(path)) return true;
  const owning = Object.fromEntries(Object.entries(mechanisms).filter(([, m]) => m.definition.requirements.includes(lease.target)));
  return isDeclared(path, declaredPaths(owning, null));
}

export function declarationSetDigest(mechanisms) {
  const set = Object.fromEntries(Object.keys(mechanisms).sort().map((n) => [n, mechanisms[n].definitionDigest]));
  return sha256(canonicalize(set));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/scope.mjs tests/scope.test.mjs
git commit -m "Define declared paths, lease coverage and the declaration-set digest"
```

---

### Task 4: Protected digests and kernel-managed validity

**Files:**
- Modify: `lib/scope.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `parseStrict`, `sha256`, `canonicalize` from `lib/canon.mjs`; `readMechanisms` from `lib/mechanisms.mjs`; `readAdr`, `appendDecision` from `lib/adr.mjs`; `PROTECTED` from `lib/paths.mjs`; `git`, `listTree` from `lib/gitx.mjs`.
- Produces: `protectedDigests(cwd) -> {spec, agreement, settings}` where `settings` is `sha256` of `.cairn/settings.json` bytes, `agreement` is `sha256` of `AGENTS.md` bytes, and `spec` is `sha256(canonicalize([[path, sha256(bytes)], ...]))` over `docs/spec/**` sorted by path. Plan 03's `authorize` must write these same three values into the authorization record; plan 14's end-to-end fixture runs both together. `kernelManagedValid(cwd, path, baseTree) -> boolean`: the exemption for the two kernel-managed paths.

- [ ] **Step 1: Write the failing test**

```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appendDecision } from '../lib/adr.mjs';
import { protectedDigests, kernelManagedValid } from '../lib/scope.mjs';

const decisionLine = (r) => ({ kind: 'decision', level: 'Consequential', by: 'agent', title: 'Use a map', rests_on: [], wrong_if: 'lookups are rare', body: 'A map keeps lookups constant.', base_snap: r.startSnapshot, evaluation: null });

test('protectedDigests changes with the bytes of each protected file', async () => {
  const r = await loopRepo();
  const a = await protectedDigests(r.cwd);
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  const b = await protectedDigests(r.cwd);
  assert.notEqual(a.agreement, b.agreement);
  assert.equal(a.spec, b.spec);
  assert.equal(a.settings, b.settings);
});

test('an ADR line appended by cairn decide is a valid kernel-managed mutation; a hand edit is not', async () => {
  const r = await loopRepo();
  const { tree } = await readSnapshot(r.cwd, r.startSnapshot, 'workspace');
  await appendDecision(r.cwd, decisionLine(r));
  assert.equal(await kernelManagedValid(r.cwd, 'docs/decisions.jsonl', tree), true);
  const file = join(r.cwd, 'docs/decisions.jsonl');
  const text = await readFile(file, 'utf8');
  await r.write('docs/decisions.jsonl', text + '{"kind": "decision", "id": "X"}\n');   // noncanonical, unknown shape
  assert.equal(await kernelManagedValid(r.cwd, 'docs/decisions.jsonl', tree), false);
  await r.write('docs/decisions.jsonl', '');                                          // deletion of the appended line
  assert.equal(await kernelManagedValid(r.cwd, 'docs/decisions.jsonl', tree), false);
});

test('an extra byte in .cairn/mechanisms is not a valid mutation', async () => {
  const r = await loopRepo();
  const { tree } = await readSnapshot(r.cwd, r.startSnapshot, 'workspace');
  assert.equal(await kernelManagedValid(r.cwd, '.cairn/mechanisms', tree), true);
  const text = await readFile(join(r.cwd, '.cairn/mechanisms'), 'utf8');
  await r.write('.cairn/mechanisms', text + ' ');
  assert.equal(await kernelManagedValid(r.cwd, '.cairn/mechanisms', tree), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `protectedDigests is not a function`.

- [ ] **Step 3: Implement**

```js
import { readMechanisms } from './mechanisms.mjs';
import { readAdr } from './adr.mjs';

export async function protectedDigests(cwd) {
  const bytes = (p) => readFile(join(cwd, p));
  const specPaths = [...await workspacePaths(cwd)].filter((p) => p.startsWith('docs/spec/')).sort();
  const spec = [];
  for (const p of specPaths) spec.push([p, sha256(await bytes(p))]);
  return { spec: sha256(canonicalize(spec)), agreement: sha256(await bytes('AGENTS.md')), settings: sha256(await bytes('.cairn/settings.json')) };
}

async function baseBytes(cwd, treeSha, path) {
  const e = (await listTree(cwd, treeSha)).find((x) => x.path === path);
  if (!e) return Buffer.alloc(0);
  return Buffer.from((await git(['cat-file', 'blob', e.sha], { cwd })).stdout, 'utf8');
}

export async function kernelManagedValid(cwd, path, baseTree) {
  const now = await readFile(join(cwd, path)).catch(() => null);
  if (now === null) return false;                                   // deletion
  const base = await baseBytes(cwd, baseTree, path);
  if (path === 'docs/decisions.jsonl') {
    if (!now.subarray(0, base.length).equals(base)) return false;    // not append-only: edit, reorder or deletion
    try { await readAdr(cwd); } catch { return false; }             // readAdr throws on any breach of the line rules
    for (const line of now.subarray(base.length).toString('utf8').split('\n').filter(Boolean)) {
      try { parseStrict(line); } catch { return false; }
    }
    return true;
  }
  if (path === '.cairn/mechanisms') {
    try { parseStrict(now.toString('utf8')); await readMechanisms(cwd); } catch { return false; }
    return true;
  }
  return false;
}
```

`readMechanisms` (plan 05) already refuses review metadata still bound to a definition whose digest changed; that is what makes a hand edit with stale metadata invalid here. The `parseStrict` call is the exactness test: plan 05 writes `.cairn/mechanisms` as exactly one RFC 8785 canonical JSON document with no trailing newline, and plan 06 writes each ADR line as canonical JSON followed by one newline, so any byte the assigned command did not write fails the parse.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/scope.mjs tests/scope.test.mjs
git commit -m "Compute protected digests and the exact-schema exemption for kernel-managed paths"
```

---

### Task 5: The preflight records first-observed breaches

**Files:**
- Modify: `lib/scope.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `appendRecord`, `readLog`, `range` from `lib/records.mjs`; `writeWorkspaceSnapshot`, `readSnapshot`, `allowedBase` from `lib/snapshots.mjs`; `loadSettings` from `lib/settings.mjs`; `classify` from `lib/paths.mjs`; `readLease` from `lib/lease.mjs`.
- Produces: `openBreaches(log) -> [{sha, path, first_observed, allowed_base, declarations}]` (breach records with no later `scope` record naming them); `preflight(cwd, log, {command}) -> [breachSha]`.

- [ ] **Step 1: Write the failing test**

```js
import { preflight, openBreaches } from '../lib/scope.mjs';

test('an undeclared, non-outside change becomes one breach naming snapshot, base and declaration set', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'export const s = 1;\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.equal(shas.length, 1);
  const [b] = openBreaches(await r.log());
  assert.equal(b.sha, shas[0]);
  assert.equal(b.path, 'src/stray.mjs');
  assert.equal(b.allowed_base, r.startSnapshot);
  assert.notEqual(b.first_observed, r.startSnapshot);
  assert.equal((await readSnapshot(r.cwd, b.first_observed, 'workspace')).kind, 'workspace');
  assert.match(b.declarations, /^sha256:[0-9a-f]{64}$/);
});

test('declared inputs and outside paths are never breaches', async () => {
  const r = await loopRepo();
  await r.write('src/demo.mjs', 'console.log("hi");\n');
  await r.write('README.md', '# changed\n');
  await r.write('notes/todo.md', 'later\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});

test('a second preflight does not record the same observation twice', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  await preflight(r.cwd, await r.log(), { command: 'check' });
  await r.write('src/stray.mjs', 'y\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  assert.equal(openBreaches(await r.log()).length, 1);
});

test('a change removed before Cairn observes it leaves no breach', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  await r.remove('src/stray.mjs');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  assert.equal(openBreaches(await r.log()).length, 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `preflight is not a function`.

- [ ] **Step 3: Implement**

```js
import { appendRecord, range } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot, allowedBase } from './snapshots.mjs';
import { loadSettings } from './settings.mjs';
import { classify } from './paths.mjs';
import { readLease } from './lease.mjs';

export const pathToken = (path) => sha256(path).slice('sha256:'.length, 'sha256:'.length + 16);

export function openBreaches(log) {
  const disposed = new Set(log.filter((r) => r.kind === 'scope').map((r) => r.payload.breach));
  return log.filter((r) => r.kind === 'scope-breach' && !disposed.has(r.sha)).map((r) => ({ sha: r.sha, ...r.payload }));
}

function authorized(path, digests, log) {
  const key = path === 'AGENTS.md' ? 'agreement' : path === '.cairn/settings.json' ? 'settings' : 'spec';
  return log.some((r) => r.kind === 'authorization' && r.payload[key] === digests[key]);
}

export async function preflight(cwd, log, { command = null } = {}) {
  if (!log.some((r) => r.kind === 'start')) return [];    // before the first start there is no allowed base to compare with
  const { settings } = await loadSettings(cwd);
  const base = await allowedBase(cwd, log);
  const { tree } = await readSnapshot(cwd, base, 'workspace');
  const mechanisms = await readMechanisms(cwd);
  const lease = await readLease(cwd);
  const declared = declaredPaths(mechanisms, lease);
  const open = new Set(openBreaches(log).map((b) => b.path));
  const rangeOpen = Boolean(range(log).start) && !range(log).closed;
  const digests = await protectedDigests(cwd);
  const shas = [];
  let firstObserved = null;
  for (const { path } of await workspaceDelta(cwd, tree)) {
    const cls = classify(path, settings);
    if (cls === 'outside' || cls === 'output' || open.has(path)) continue;
    if (cls === 'kernel-managed' && await kernelManagedValid(cwd, path, tree)) continue;
    if (cls === 'protected' && (command === 'authorize' || !rangeOpen || authorized(path, digests, log))) continue;
    if (cls !== 'kernel-managed' && cls !== 'protected' && cls !== 'reserved' && isDeclared(path, declared)) continue;
    firstObserved ??= await writeWorkspaceSnapshot(cwd);
    shas.push(await appendRecord(cwd, 'scope-breach', pathToken(path), {
      path, first_observed: firstObserved, allowed_base: base, declarations: declarationSetDigest(mechanisms),
    }));
  }
  return shas;
}
```

The order of the `continue` lines is the authority split from section 2: `outside` is consulted first only for paths `classify` calls outside, and `classify` (plan 02) never returns `outside` for a reserved path, so `outside` cannot exempt a kernel-managed or protected path. A `reserved` path that is neither class (any other path under `.cairn/**`) is always a breach.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/scope.mjs tests/scope.test.mjs
git commit -m "Record a scope breach for each undeclared change the kernel first observes"
```

---

### Task 6: Leases, protected paths and the range boundary

**Files:**
- Modify: `lib/scope.mjs` (no new code expected; this task is the refusal tests for task 5's rules)
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `begin`, `end` from `lib/lease.mjs`; `protectedDigests`, `preflight` from task 4 and 5.

- [ ] **Step 1: Write the failing tests**

```js
import { begin, end } from '../lib/lease.mjs';

test('a path touched under a lease is declared from begin and is not a breach', async () => {
  const r = await loopRepo();
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: ['src/new.mjs'] });
  await r.write('src/new.mjs', 'export const n = 1;\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  await end(r.cwd);
});

test('a protected path changed during a commitment without an authorization is a breach', async () => {
  const r = await loopRepo();
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.equal(shas.length, 1);
  assert.equal(openBreaches(await r.log())[0].path, 'AGENTS.md');
});

test('a protected change named by an authorization record is not a breach', async () => {
  const r = await loopRepo();
  await r.write('AGENTS.md', '# Agreement\n\nchanged\n');
  const d = await protectedDigests(r.cwd);
  await r.add('authorization', 'developer', { spec: d.spec, agreement: d.agreement, settings: d.settings, evidence: { mode: 'unsigned-local', author: 'Dev <dev@example.test>' }, decision: null });
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});

test('cairn authorize itself and the gap between commitments exempt protected paths', async () => {
  const r = await loopRepo();
  await r.write('docs/spec/demo.md', (await readFile(join(r.cwd, 'docs/spec/demo.md'), 'utf8')) + '\n[DEMO-002] The demo exits zero.\nFalsifier: the exit code is not zero.\nMechanism: demo-002\nStatus: Draft\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'authorize' }), []);
  await r.add('done', r.slug, { slug: r.slug, snapshot: await r.snap() });
  await r.write('docs/spec/glossary.md', '# Glossary\n\n- demo: the sample program.\n- flag: a file that says pass or fail.\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (16 tests). If the lease test fails with a breach for `src/new.mjs`, `readLease` is not returning `touch`; that is a plan 04 defect to fix there, not here.

- [ ] **Step 3: Commit**

```bash
git add tests/scope.test.mjs
git commit -m "Test lease coverage, protected authorization and the between-commitments exemption"
```

---

### Task 7: Kernel-managed mutations through the preflight

**Files:**
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `appendDecision` from `lib/adr.mjs`; `declare` from `lib/mechanisms.mjs`; `mechanismFor` from the fixture.

- [ ] **Step 1: Write the tests**

```js
import { declare } from '../lib/mechanisms.mjs';
import { mechanismFor } from './helpers/loop.mjs';

test('the assigned command\'s exact mutation of a kernel-managed path is exempt', async () => {
  const r = await loopRepo();
  await appendDecision(r.cwd, decisionLine(r));
  await declare(r.cwd, 'demo-002', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] });
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
});

test('any other write to a kernel-managed path is a breach that outside cannot exempt', async () => {
  const r = await loopRepo({ settings: { outside: ['README.md'] } });
  await r.write('.cairn/mechanisms', (await readFile(join(r.cwd, '.cairn/mechanisms'), 'utf8')) + '\n');
  await r.write('docs/decisions.jsonl', '{"kind":"decision","id":"01HZZZZZZZZZZZZZZZZZZZZZZZ","ts":"2026-09-19T00:00:00Z"}\n');
  const shas = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path).sort(), ['.cairn/mechanisms', 'docs/decisions.jsonl']);
  assert.equal(shas.length, 2);
});

test('an unnamed path under .cairn is a breach', async () => {
  const r = await loopRepo();
  await r.write('.cairn/notes.txt', 'scratch\n');
  await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['.cairn/notes.txt']);
});
```

The settings override in the second test would be refused by plan 02 if it tried to list a reserved path under `outside`; the test therefore shows that no settings value reaches the reserved classes at all.

- [ ] **Step 2: Run them**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (19 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/scope.test.mjs
git commit -m "Test that only the assigned command's exact mutation of a kernel-managed path is exempt"
```

---

### Task 8: The allowed base skips snapshots taken while a breach is open

**Files:**
- Modify: `lib/snapshots.mjs` (`allowedBase`)
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `allowedBase(cwd, log)` from plan 01.
- Produces: the rule `allowedBase` must implement: walking the log oldest first, a workspace snapshot is allowed when it is named by a `start` record, by the `snapshot` of a `scope` record, or by the `snapshot` of any other record at a position where no scope-breach is undisposed; the `first_observed` of a scope-breach is never allowed. The newest allowed snapshot is the base.

- [ ] **Step 1: Write the failing test**

```js
import { allowedBase } from '../lib/snapshots.mjs';

test('the first-observed snapshot and snapshots written under an open breach are not allowed bases', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'review' });
  assert.equal(await allowedBase(r.cwd, await r.log()), r.startSnapshot);
  await r.add('review', r.slug, { slug: r.slug, snapshot: await r.snap(), examined: ['src'], answers: [], findings: [] });
  assert.equal(await allowedBase(r.cwd, await r.log()), r.startSnapshot);
  await r.remove('src/stray.mjs');
  const scopeSha = await dispose(r.cwd, b, 'restore');
  const log = await r.log();
  assert.equal(await allowedBase(r.cwd, log), log.find((x) => x.sha === scopeSha).payload.snapshot);
});
```

(`dispose` arrives in task 9; write this test now and expect the import failure until then.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `dispose is not a function` (or, once task 9 lands, an `allowedBase` mismatch if plan 01's rule was looser).

- [ ] **Step 3: Implement the rule in `lib/snapshots.mjs`**

Replace the body of `allowedBase` with:

```js
export async function allowedBase(cwd, log) {
  let base = null;
  const open = new Set();
  for (const r of log) {
    if (r.kind === 'scope-breach') { open.add(r.sha); continue; }
    if (r.kind === 'scope') { open.delete(r.payload.breach); base = r.payload.snapshot; continue; }
    if (r.kind === 'start') { base = r.payload.snapshot; continue; }
    if (r.payload && typeof r.payload.snapshot === 'string' && open.size === 0) base = r.payload.snapshot;
  }
  if (!base) throw new Error('cairn: no allowed workspace snapshot; run cairn start');
  await readSnapshot(cwd, base, 'workspace');
  return base;
}
```

- [ ] **Step 4: Run the tests after task 9**

Run: `node --test tests/scope.test.mjs tests/snapshots.test.mjs`
Expected: PASS; plan 01's own `allowedBase` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/snapshots.mjs tests/scope.test.mjs
git commit -m "Exclude breach-time snapshots from the allowed base"
```

---

### Task 9: Dispositions: keep needs an ok answer, restore needs the base bytes

**Files:**
- Modify: `lib/scope.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: `readLog`, `appendRecord`; plan 09's `escalation` and `answer` payloads as listed in Global Constraints.
- Produces: `dispose(cwd, breachSha, 'keep'|'restore') -> scopeSha`, throwing `ScopeError` whose message begins `cairn: ` on refusal.

- [ ] **Step 1: Write the failing tests**

```js
import { dispose, ScopeError } from '../lib/scope.mjs';

const escalate = (r, b) => r.add('escalation', r.slug, { slug: r.slug, question: 'Keep src/stray.mjs?', recommendation: 'keep', because: 'it is the helper the fix needs', if_wrong: 'delete it', instead: 'restore', concerns: `scope-breach:${b}`, evaluation: null });
const answer = (r, esc, kind) => r.add('answer', r.slug, { escalation: esc, kind, text: '', owner: null, evidence: { mode: 'unsigned-local', author: 'Dev <dev@example.test>' } });

test('keep is refused without an escalation answered ok, and closes the breach with one', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await assert.rejects(dispose(r.cwd, b, 'keep'), (e) => e instanceof ScopeError && e.message === `cairn: keep needs an escalation answered ok that concerns scope-breach:${b}`);
  const esc = await escalate(r, b);
  await answer(r, esc, 'ask');
  await assert.rejects(dispose(r.cwd, b, 'keep'), ScopeError);
  const ans = await answer(r, esc, 'ok');
  const s = await dispose(r.cwd, b, 'keep');
  const rec = (await r.log()).find((x) => x.sha === s);
  assert.deepEqual([rec.kind, rec.payload.breach, rec.payload.disposition, rec.payload.escalation, rec.payload.answer], ['scope', b, 'keep', esc, ans]);
  assert.equal(openBreaches(await r.log()).length, 0);
  assert.equal(await allowedBase(r.cwd, await r.log()), rec.payload.snapshot);
});

test('restore is refused while the path differs from its allowed base', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await assert.rejects(dispose(r.cwd, b, 'restore'), (e) => e.message === `cairn: src/stray.mjs still differs from its allowed base ${r.startSnapshot}`);
  await r.remove('src/stray.mjs');
  const s = await dispose(r.cwd, b, 'restore');
  const rec = (await r.log()).find((x) => x.sha === s);
  assert.deepEqual([rec.payload.disposition, rec.payload.escalation, rec.payload.answer], ['restore', null, null]);
  await assert.rejects(dispose(r.cwd, b, 'restore'), (e) => e.message === `cairn: scope-breach ${b} already has a disposition`);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `dispose is not a function`.

- [ ] **Step 3: Implement**

```js
import { readLog } from './records.mjs';

export async function dispose(cwd, breachSha, disposition) {
  if (disposition !== 'keep' && disposition !== 'restore') throw new ScopeError(`cairn: disposition is keep or restore, not ${disposition}`);
  const log = await readLog(cwd);
  const breach = log.find((r) => r.kind === 'scope-breach' && r.sha === breachSha);
  if (!breach) throw new ScopeError(`cairn: no scope-breach record ${breachSha}`);
  if (log.some((r) => r.kind === 'scope' && r.payload.breach === breachSha)) throw new ScopeError(`cairn: scope-breach ${breachSha} already has a disposition`);
  const { path, allowed_base } = breach.payload;
  let escalation = null, answer = null;
  if (disposition === 'keep') {
    const esc = log.filter((r) => r.kind === 'escalation' && r.payload.concerns === `scope-breach:${breachSha}`).at(-1);
    const ok = esc && log.filter((r) => r.kind === 'answer' && r.payload.escalation === esc.sha && r.payload.kind === 'ok').at(-1);
    if (!ok) throw new ScopeError(`cairn: keep needs an escalation answered ok that concerns scope-breach:${breachSha}`);
    escalation = esc.sha; answer = ok.sha;
  } else {
    const { tree } = await readSnapshot(cwd, allowed_base, 'workspace');
    if ((await workspaceDelta(cwd, tree)).some((d) => d.path === path)) throw new ScopeError(`cairn: ${path} still differs from its allowed base ${allowed_base}`);
  }
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'scope', pathToken(path), { breach: breachSha, disposition, snapshot, escalation, answer });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (22 tests, including task 8's).

- [ ] **Step 5: Commit**

```bash
git add lib/scope.mjs tests/scope.test.mjs
git commit -m "Close a scope breach by a developer-approved keep or a restore to the allowed base"
```

---

### Task 10: Declare legalizes only the future; a breach survives history rewriting

**Files:**
- Modify: `lib/scope.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Produces: `runWithPreflight(cwd, command, fn) -> fn's result`, the wrapper every state-changing command goes through: it reads the log, runs `preflight`, then `fn()`. Plan 08 composes its loop wrapper around this one. `STATE_CHANGING`: the set of command names it applies to.

- [ ] **Step 1: Write the failing tests**

```js
import { runWithPreflight, STATE_CHANGING } from '../lib/scope.mjs';
import { readMechanisms } from '../lib/mechanisms.mjs';

test('declare runs the preflight first, so a declaration legalizes only future changes', async () => {
  const r = await loopRepo();
  await r.write('src/util.mjs', 'export const u = 1;\n');
  await runWithPreflight(r.cwd, 'declare', () => declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] }));
  assert.ok((await readMechanisms(r.cwd))['demo-001'].definition.inputs.includes('src/util.mjs'));
  assert.deepEqual(openBreaches(await r.log()).map((b) => b.path), ['src/util.mjs']);
  await r.write('src/util.mjs', 'export const u = 2;\n');
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);   // later edits are declared
  assert.equal(openBreaches(await r.log()).length, 1);                                // the first observation stands
});

test('a breach is a log fact: squashing the branch does not clear it', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  await r.commit('stray work');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await r.write('src/demo.mjs', 'console.log("hello!");\n');
  await r.commit('touch demo');
  const root = (await git(['rev-list', '--max-parents=0', 'HEAD'], { cwd: r.cwd })).stdout.trim();
  await git(['reset', '--soft', root], { cwd: r.cwd });
  await git(['commit', '-q', '-m', 'squashed'], { cwd: r.cwd });
  assert.deepEqual(await preflight(r.cwd, await r.log(), { command: 'check' }), []);
  assert.deepEqual(openBreaches(await r.log()).map((x) => x.sha), [b]);
  await r.remove('src/stray.mjs');
  await r.commit('remove stray');
  assert.equal(openBreaches(await r.log()).length, 1);       // bytes gone, record not: only a disposition closes it
  await dispose(r.cwd, b, 'restore');
  assert.equal(openBreaches(await r.log()).length, 0);
});

test('the state-changing set names every writing command and no reader', () => {
  for (const c of ['begin', 'end', 'check', 'declare', 'review-mechanism', 'review', 'brief', 'report', 'resolve', 'accept', 'escalate', 'answer', 'reply', 'item', 'outside', 'fix', 'decide', 'realize', 'promote', 'authorize', 'start', 'done', 'supersede', 'scope', 'calibrate']) assert.ok(STATE_CHANGING.has(c), c);
  for (const c of ['wake', 'show', 'lint', 'decisions', 'recover', 'init']) assert.ok(!STATE_CHANGING.has(c), c);
});
```

`recover` is excluded because a preflight before recovery could block the recovery it needs; `init` runs before any allowed base exists. The names are the ones `lib/cli.mjs` dispatches by; `cairn review mechanism REQ` is dispatched as `review` (plan 05 registers it under `review` with `mechanism` as its first argument), and `review-mechanism` is kept so a separate registration is covered too.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `runWithPreflight is not a function`.

- [ ] **Step 3: Implement**

```js
export const STATE_CHANGING = new Set(['begin', 'end', 'check', 'declare', 'review-mechanism', 'review', 'brief', 'report', 'resolve', 'accept', 'escalate', 'answer', 'reply', 'item', 'outside', 'fix', 'decide', 'realize', 'promote', 'authorize', 'start', 'done', 'supersede', 'scope', 'calibrate']);

export async function runWithPreflight(cwd, command, fn) {
  if (STATE_CHANGING.has(command)) await preflight(cwd, await readLog(cwd), { command });
  return fn();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/scope.test.mjs`
Expected: PASS (25 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/scope.mjs tests/scope.test.mjs
git commit -m "Run the scope preflight before every state-changing command"
```

---

### Task 11: The `cairn scope` command and the CLI hook

**Files:**
- Modify: `lib/cli.mjs` (command table and dispatch)
- Modify: `lib/scope.mjs`
- Test: `tests/scope.test.mjs`

**Interfaces:**
- Consumes: plan 01's command table in `lib/cli.mjs`: an object `COMMANDS` mapping a name to `{usage, run(cwd, argv) -> exit code}`, and its `dispatch(name, cwd, argv)` function that looks the name up and runs it.
- Produces: `cmdScope(cwd, argv) -> 0`, and every state-changing command dispatched through `runWithPreflight`.

- [ ] **Step 1: Write the failing test**

```js
import { spawnSync } from 'node:child_process';
const cairn = (cwd, ...args) => spawnSync(process.execPath, [new URL('../bin/cairn.mjs', import.meta.url).pathname, ...args], { cwd, encoding: 'utf8' });

test('cairn scope <breach> restore writes the disposition and refuses a wrong one on stderr', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  const bad = cairn(r.cwd, 'scope', b, 'keep');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^cairn: keep needs an escalation answered ok/);
  await r.remove('src/stray.mjs');
  const ok = cairn(r.cwd, 'scope', b, 'restore');
  assert.equal(ok.status, 0);
  assert.equal(openBreaches(await r.log()).length, 0);
});

test('a state-changing command records the breach before its own work', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const out = cairn(r.cwd, 'begin', 'implement', 'DEMO-001');
  assert.equal(out.status, 0);
  assert.deepEqual(openBreaches(await r.log()).map((x) => x.path), ['src/stray.mjs']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/scope.test.mjs`
Expected: FAIL, `cairn: unknown command scope` on stderr (exit 1).

- [ ] **Step 3: Implement**

In `lib/scope.mjs`:

```js
export async function cmdScope(cwd, argv) {
  const [breach, disposition] = argv;
  if (!breach || !disposition) throw new ScopeError('cairn: usage: cairn scope <breach-sha> keep|restore');
  const sha = await dispose(cwd, breach, disposition);
  process.stdout.write(`scope ${sha} ${disposition} ${breach}\n`);
  return 0;
}
```

In `lib/cli.mjs`, add to `COMMANDS`:

```js
scope: { usage: 'scope <breach-sha> keep|restore', run: cmdScope },
```

and change `dispatch` so the command's `run` is invoked as

```js
const code = await runWithPreflight(cwd, name, () => COMMANDS[name].run(cwd, argv));
```

with `import { cmdScope, runWithPreflight, ScopeError } from './scope.mjs';` at the top. A `ScopeError` reaches the existing top-level handler, which prints its message on stderr and exits 1 (plan 01 already routes any error whose message begins `cairn: ` that way).

- [ ] **Step 4: Run every test**

Run: `node --test tests/*.test.mjs`
Expected: PASS. Plan 03 to 06 command tests still pass because their fixtures start from a clean allowed base; a failure there names a fixture that changes an undeclared path before calling a command, which is exactly the observation this plan adds.

- [ ] **Step 5: Commit**

```bash
git add lib/cli.mjs lib/scope.mjs tests/scope.test.mjs
git commit -m "Add cairn scope and hook the preflight into command dispatch"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| "compares the current workspace with the latest allowed workspace snapshot and the declarations active at that log head" (5) | 2, 3, 5 |
| "If it observes an undeclared, non-outside changed path, it records a scope breach before doing the requested work" (5) | 5, 11 |
| Scope breach "names that snapshot and the declaration-set digest"; table row `scope-breach` (2, 4) | 5 |
| "`cairn declare` performs this preflight before it can add an input. Thus a declaration legalizes only future changes" (5); decision 31 | 10 |
| "A path touched under a lease is declared from `cairn begin`, so implementing a requirement in a new file is not a breach" (5) | 3, 6 |
| "The breach survives rebases and squashes because it is a log fact"; decision 44 | 10 |
| "It closes only when the developer approves keeping the captured bytes or a workspace snapshot restores the path to its allowed base" (5); table row `scope`; `scope PATH` predicate | 9 |
| "If a change is removed before Cairn ever observes it ... there is no breach to preserve" (5) | 5 |
| "Only the command assigned to a schema-valid mutation may write them. That exact mutation is not a scope breach. A direct edit, an extra byte, deletion, reordering, or a write by another command is a breach" (2, 8) | 4, 7 |
| "Any other path under `.cairn/**` is refused unless this specification names it" (2) | 7 |
| "Protected paths need developer authorization" (8); "one `cairn authorize` at start must bind their final digests" (2); "Settings may change during a commitment only by a new authorization naming the new digest" (8) | 4, 6 |
| "`outside` cannot exempt either class because the reservation is compiled into the kernel" (8) | 5, 7 |
| "The first-observed snapshot on an unresolved scope breach is not an allowed base. Later scope comparisons use the newest allowed workspace snapshot" (2) | 8 |
| `record PATH` and `commit PATH`: "the action lease covers the path through its target's declared inputs" (5) | 3 (rule); plan 08 names the actions |
| "Kind and target are restricted ASCII tokens; arbitrary text and paths never appear in the subject" (4) | 5 (`pathToken`) |

Left to other plans, deliberately:

- Naming `scope PATH`, `record PATH`, `commit PATH` and `declare REQ` as verdicts, and their precedence: plan 08 (`lib/wake.mjs`), which consumes `openBreaches`, `leaseCovers` and `workspaceDelta` from here.
- Writing the escalation and answer records a keep disposition reads: plan 09. This plan builds them with `appendRecord` under plan 01's schema.
- "`cairn end` writes the addition into the definition, which unbinds its review metadata ... or drops it when the path is unchanged" (2): plan 04 (`end`) with plan 05 (`declare`); this plan only treats a touched path as declared while the lease lives.
- The realization delta check that stops on a reserved or `data` path (section 8, Decisions and realization): plan 06 (`realize`) and plan 08 (`build DECISION`).
- "An active commitment's frozen contract does not change under it" enforcement at `start` and `supersede`: plan 06.
