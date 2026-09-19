# Foundation: canonical records and refs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the layer every other plan writes through: RFC 8785 canonical JSON, a Git plumbing wrapper with compare-and-swap ref updates, the closed schema table and encoder/decoder for every log record kind, typed input and workspace snapshots, and a CLI skeleton with `cairn show`.

**Architecture:** Four small modules with one responsibility each. `lib/canon.mjs` is pure (no Git). `lib/gitx.mjs` spawns `git` plumbing and never porcelain. `lib/records.mjs` owns the schema table and the log ref; `lib/snapshots.mjs` owns the snapshots ref and reuses the records module's schema checker. `lib/cli.mjs` maps errors to exit codes. Every test builds a throwaway repository with `tests/helpers/repo.mjs`.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`, `node:crypto`, `node:child_process`; Git 2.40 or later. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 "Snapshots and refs"; section 4 "Canonical encoding", "Logical record schemas" and the paragraph on raw bytes. Map and shared export names: `docs/plans/overview.md`.

## Global constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Every log record is an empty commit with subject `cairn: <kind> <target>`. Kind and target are restricted ASCII tokens; arbitrary text and paths never appear in the subject."
- "The commit has exactly two trailers ... The trailers carry only the schema and the digest; content never lives in a trailer."
- "The parser rejects invalid UTF-8, control characters outside JSON escapes, noncanonical JSON, a body whose digest does not match the trailer, wrong field counts and out-of-range numbers. It never delegates content parsing to `git interpret-trailers`."
- "The kernel alone writes them, never rewrites them, and advances each with compare-and-swap: the expected old OID is required and a mismatch refuses the write."
- "Both kinds include dirty bytes without changing the index. The kind is checked at every reference".
- "An input or workspace snapshot refuses a non-ignored untracked path matched by `network_exclude` or a built-in credential pattern".
- "A logical byte string, including a raw response, is represented inside canonical JSON as unpadded base64url."

Choices this plan fixes: object names are SHA-1 (40 lowercase hex); a log record's tree is Git's empty tree; a snapshot commit's subject is `cairn: snapshot <kind>` and its body is canonical JSON with the same two trailers; a target token matches `-` or `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; settings do not exist yet, so `writeWorkspaceSnapshot(cwd, {exclude})` takes glob patterns and plan 02 wires `network_exclude` in.

## File structure

- `package.json`: name, version, private, test script, bin.
- `bin/cairn.mjs`: entry; calls `main` from `lib/cli.mjs`.
- `lib/canon.mjs`: `canonicalize`, `parseStrict`, `sha256`, `b64url`, `unb64url`, `ulid`, `CanonError`.
- `lib/gitx.mjs`: `git`, `gitPath`, `readRef`, `updateRefCAS`, `deleteRefCAS`, `emptyTree`, `commitTree`, `catCommit`, `writeTreeFromPaths`, `listTree`, `GitError`, `CasError`, `ZERO`.
- `lib/records.mjs`: schema descriptors, `SCHEMAS`, `KINDS`, `check`, `encodeRecord`, `decodeRecord`, `appendRecord`, `readLog`, `range`, `LOG_REF`, `RecordError`.
- `lib/snapshots.mjs`: `writeInputSnapshot`, `writeWorkspaceSnapshot`, `readSnapshot`, `allowedBase`, `globToRegExp`, `CREDENTIAL_PATTERNS`, `SNAPSHOTS_REF`, `SnapshotError`, `KindError`.
- `lib/cli.mjs`: `main`, `COMMANDS`, `usage`, `Refusal`, `NoVerdict`, `FETCH_LINE`.
- `tests/helpers/repo.mjs`: `makeRepo`.
- `tests/helpers.test.mjs`, `tests/canon.test.mjs`, `tests/gitx.test.mjs`, `tests/records.test.mjs`, `tests/snapshots.test.mjs`, `tests/cli.test.mjs`.

---

### Task 1: Package and the throwaway repository helper

**Files:**
- Create: `package.json`, `tests/helpers/repo.mjs`
- Test: `tests/helpers.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `makeRepo() -> {dir, git(...args) -> stdout, write(path, content, {mode}) -> fullPath, link(path, target), commit(message) -> sha, readRef(ref) -> sha|null, remove()}`. Every later test file uses it.

- [ ] **Step 1: Write the failing test**

```js
// tests/helpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { makeRepo } from './helpers/repo.mjs';

test('helper builds a throwaway repo with a commit', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  assert.ok(repo.dir.startsWith(tmpdir()));
  await repo.write('a.txt', 'hello\n');
  const sha = await repo.commit('first');
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(await repo.readRef('HEAD'), sha);
  assert.equal(await repo.readRef('refs/cairn/log'), null);
  assert.equal(await repo.git('config', 'user.name'), 'Cairn Test');
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/helpers.test.mjs`. Expected: FAIL, `Cannot find module './helpers/repo.mjs'`.

- [ ] **Step 3: Write package.json and the helper**

```json
{
  "name": "cairn",
  "version": "2.0.0-dev",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "bin": { "cairn": "bin/cairn.mjs" },
  "scripts": { "test": "node --test tests/*.test.mjs" },
  "engines": { "node": ">=24" }
}
```

```js
// tests/helpers/repo.mjs
import { mkdtemp, mkdir, writeFile, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', HOME: tmpdir() };

export async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'cairn-test-'));
  const git = async (...args) => (await run('git', args, { cwd: dir, env: ENV })).stdout.trim();
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.name', 'Cairn Test');
  await git('config', 'user.email', 'test@example.invalid');
  await git('config', 'commit.gpgsign', 'false');
  const write = async (path, content, { mode } = {}) => {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
    if (mode) await chmod(full, mode);
    return full;
  };
  const link = async (path, target) => {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await symlink(target, full);
  };
  const commit = async (message = 'work') => {
    await git('add', '-A');
    await git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const readRef = async (ref) => { try { return await git('rev-parse', '--verify', '--quiet', ref); } catch { return null; } };
  const remove = () => rm(dir, { recursive: true, force: true });
  return { dir, git, write, link, commit, readRef, remove };
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/helpers.test.mjs`. Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add package.json tests/helpers/repo.mjs tests/helpers.test.mjs
git commit -m "Add the package manifest and the throwaway repository test helper"
```

---

### Task 2: Canonical JSON: canonicalize and parseStrict

**Files:**
- Create: `lib/canon.mjs`
- Test: `tests/canon.test.mjs`

**Interfaces:**
- Produces: `canonicalize(value) -> string` (RFC 8785), `parseStrict(textOrBytes) -> value` (throws `CanonError`), `CanonError`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/canon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, parseStrict, CanonError } from '../lib/canon.mjs';

test('canonicalize sorts keys, drops whitespace, escapes minimally', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalize({ s: 'tab\t\u001b\u00e9' }), '{"s":"tab\\t\\u001b\u00e9"}');
  assert.equal(canonicalize(-0), '0');
  assert.equal(canonicalize(1e21), '1e+21');
});
test('canonicalize rejects non-finite numbers and lone surrogates', () => {
  assert.throws(() => canonicalize(Infinity), CanonError);
  assert.throws(() => canonicalize({ x: NaN }), CanonError);
  assert.throws(() => canonicalize('\ud800'), CanonError);
  assert.throws(() => canonicalize({ f() {} }), CanonError);
});
test('parseStrict accepts exactly the canonical form', () => {
  assert.deepEqual(parseStrict('{"a":1,"b":[2]}'), { a: 1, b: [2] });
  assert.deepEqual(parseStrict(Buffer.from('{"k":"\u00e9"}', 'utf8')), { k: '\u00e9' });
});
test('parseStrict rejects noncanonical JSON: whitespace, order, number form, escapes', () => {
  for (const bad of ['{"a": 1}', '{"b":1,"a":2}', '{"a":1.0}', '{"a":"\\u00e9"}', '{"a":"\\u001B"}', '{"a":1}\n'])
    assert.throws(() => parseStrict(bad), /noncanonical/);
});
test('parseStrict rejects duplicate keys', () => {
  assert.throws(() => parseStrict('{"a":1,"a":2}'), /noncanonical/);
});
test('parseStrict rejects out-of-range numbers', () => {
  assert.throws(() => parseStrict('{"a":1e400}'), CanonError);
});
test('parseStrict rejects control characters outside JSON escapes', () => {
  assert.throws(() => parseStrict('{"a":"x\u0001y"}'), /invalid JSON/);
});
test('parseStrict rejects invalid UTF-8', () => {
  assert.throws(() => parseStrict(Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])), /invalid UTF-8/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/canon.test.mjs`. Expected: FAIL, `Cannot find module '../lib/canon.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/canon.mjs
export class CanonError extends Error { constructor(m) { super(m); this.name = 'CanonError'; } }

export function canonicalize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') { if (!Number.isFinite(value)) throw new CanonError('non-finite number'); return JSON.stringify(value); }
  if (t === 'string') { if (!value.isWellFormed()) throw new CanonError('lone surrogate in string'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).sort(); // default sort is UTF-16 code unit order, as RFC 8785 requires
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new CanonError(`cannot canonicalize ${t}`);
}

const fatal = new TextDecoder('utf-8', { fatal: true });
export function parseStrict(input) {
  let text = input;
  if (input instanceof Uint8Array) { try { text = fatal.decode(input); } catch { throw new CanonError('invalid UTF-8'); } }
  let value;
  try { value = JSON.parse(text); } catch (e) { throw new CanonError(`invalid JSON: ${e.message}`); }
  if (canonicalize(value) !== text) throw new CanonError('noncanonical JSON');
  return value;
}
```

`JSON.parse` already refuses raw control characters inside strings; the round trip through `canonicalize` refuses whitespace, key order, `1.0`, uppercase or unnecessary escapes and duplicate keys (the parsed object re-serializes shorter). `1e400` parses to `Infinity`, which `canonicalize` refuses.

- [ ] **Step 4: Run it**

Run: `node --test tests/canon.test.mjs`. Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/canon.mjs tests/canon.test.mjs
git commit -m "Add RFC 8785 canonical JSON with a strict parser"
```

---

### Task 3: Digests, base64url and ULIDs

**Files:**
- Modify: `lib/canon.mjs` (append)
- Test: `tests/canon.test.mjs` (append)

**Interfaces:**
- Produces: `sha256(bytes|string) -> 'sha256:<64 hex>'`, `b64url(bytes) -> string`, `unb64url(string) -> Uint8Array`, `ulid(now = Date.now()) -> string`.

- [ ] **Step 1: Append the failing tests**

```js
import { sha256, b64url, unb64url, ulid } from '../lib/canon.mjs';

test('sha256 hashes strings as UTF-8 and bytes as given', () => {
  assert.equal(sha256('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(Buffer.from('abc')), sha256('abc'));
});
test('base64url is unpadded and round-trips; padding and stray chars are refused', () => {
  const bytes = new Uint8Array([0, 255, 16, 3]);
  assert.equal(b64url(bytes), 'AP8QAw');
  assert.deepEqual(unb64url('AP8QAw'), bytes);
  assert.throws(() => unb64url('AP8QAw=='), CanonError);
  assert.throws(() => unb64url('AP8Q+w'), CanonError);
});
test('ulid is 26 Crockford chars and monotonic within a millisecond', () => {
  const a = ulid(1700000000000), b = ulid(1700000000000), c = ulid(1700000000001);
  for (const u of [a, b, c]) assert.match(u, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.ok(a < b && b < c);
  assert.equal(a.slice(0, 10), b.slice(0, 10));
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/canon.test.mjs`. Expected: FAIL, `does not provide an export named 'sha256'`.

- [ ] **Step 3: Implement**

```js
// append to lib/canon.mjs
import { createHash, randomBytes } from 'node:crypto';

export function sha256(data) {
  return 'sha256:' + createHash('sha256').update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data).digest('hex');
}
export function b64url(bytes) { return Buffer.from(bytes).toString('base64url'); }
export function unb64url(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new CanonError('invalid base64url');
  const out = Buffer.from(s, 'base64url');
  if (out.toString('base64url') !== s) throw new CanonError('invalid base64url');
  return new Uint8Array(out);
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = -1, lastRand = 0n;
function enc(n, chars) { let s = ''; for (let i = 0; i < chars; i++) { s = B32[Number(n & 31n)] + s; n >>= 5n; } return s; }
export function ulid(now = Date.now()) {
  if (now <= lastTime) { now = lastTime; lastRand += 1n; }
  else lastRand = BigInt('0x' + randomBytes(10).toString('hex'));
  lastTime = now;
  return enc(BigInt(now), 10) + enc(lastRand, 16);
}
```

Move the `import` line to the top of the file with the class.

- [ ] **Step 4: Run it**

Run: `node --test tests/canon.test.mjs`. Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/canon.mjs tests/canon.test.mjs
git commit -m "Add sha256 digests, unpadded base64url and monotonic ULIDs"
```

---

### Task 4: Git wrapper, refs and compare-and-swap

**Files:**
- Create: `lib/gitx.mjs`
- Test: `tests/gitx.test.mjs`

**Interfaces:**
- Produces: `git(args, {cwd, input, env, expect}) -> {stdout, raw, stderr, code}` (throws `GitError` on an exit code not in `expect`, default `[0]`), `gitPath(cwd, name) -> absolute path`, `readRef(cwd, ref) -> sha|null`, `updateRefCAS(cwd, ref, newSha, oldShaOrNull)` (throws `CasError` on mismatch), `deleteRefCAS(cwd, ref, oldSha)`, `ZERO`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/gitx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';
import { git, gitPath, readRef, updateRefCAS, deleteRefCAS, GitError, CasError } from '../lib/gitx.mjs';

test('git returns stdout and throws GitError with stderr on failure', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const r = await git(['rev-parse', '--is-inside-work-tree'], { cwd: repo.dir });
  assert.equal(r.stdout.trim(), 'true');
  await assert.rejects(git(['cat-file', '-p', 'nothing'], { cwd: repo.dir }), (e) => e instanceof GitError && /nothing/.test(e.stderr));
  const tolerated = await git(['rev-parse', '--verify', '--quiet', 'refs/none'], { cwd: repo.dir, expect: [0, 1] });
  assert.equal(tolerated.code, 1);
});
test('gitPath resolves below the Git directory', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const p = await gitPath(repo.dir, 'cairn-check.lock');
  assert.ok(isAbsolute(p) && p.endsWith('/.git/cairn-check.lock'));
});
test('updateRefCAS creates, advances and refuses a stale old OID', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const a = await repo.commit('a'); const b = await repo.commit('b');
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), null);
  await updateRefCAS(repo.dir, 'refs/cairn/log', a, null);
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), a);
  await assert.rejects(updateRefCAS(repo.dir, 'refs/cairn/log', b, null), CasError);
  await updateRefCAS(repo.dir, 'refs/cairn/log', b, a);
  await assert.rejects(updateRefCAS(repo.dir, 'refs/cairn/log', a, a), CasError);
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), b);
  await assert.rejects(deleteRefCAS(repo.dir, 'refs/cairn/log', a), CasError);
  await deleteRefCAS(repo.dir, 'refs/cairn/log', b);
  assert.equal(await readRef(repo.dir, 'refs/cairn/log'), null);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/gitx.test.mjs`. Expected: FAIL, `Cannot find module '../lib/gitx.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/gitx.mjs
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export class GitError extends Error { constructor(m, info = {}) { super(m); this.name = 'GitError'; Object.assign(this, info); } }
export class CasError extends GitError { constructor(m, info) { super(m, info); this.name = 'CasError'; } }
export const ZERO = '0'.repeat(40);

export function git(args, { cwd, input, env, expect = [0] } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd, env: env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const raw = Buffer.concat(out), stderr = Buffer.concat(err).toString('utf8');
      if (!expect.includes(code)) reject(new GitError(`git ${args[0]} exited ${code}: ${stderr.trim()}`, { args, stderr, code }));
      else resolvePromise({ stdout: raw.toString('utf8'), raw, stderr, code });
    });
    child.stdin.end(input ?? '');
  });
}
export async function gitPath(cwd, name) {
  return resolve(cwd, (await git(['rev-parse', '--git-path', name], { cwd })).stdout.trim());
}
export async function readRef(cwd, ref) {
  const r = await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd, expect: [0, 1] });
  return r.code === 0 ? r.stdout.trim() : null;
}
const CAS_STDERR = /cannot lock ref|reference already exists|but expected|unable to resolve reference/;
async function updateRef(cwd, args, info) {
  const r = await git(['update-ref', ...args], { cwd, expect: [0, 1, 128] });
  if (r.code === 0) return;
  if (CAS_STDERR.test(r.stderr)) throw new CasError(`refusing ${info.ref}: expected ${info.old ?? 'absent'}`, { ...info, stderr: r.stderr });
  throw new GitError(`git update-ref failed: ${r.stderr.trim()}`, { ...info, stderr: r.stderr });
}
export function updateRefCAS(cwd, ref, newSha, oldShaOrNull) {
  return updateRef(cwd, [ref, newSha, oldShaOrNull ?? ZERO], { ref, newSha, old: oldShaOrNull });
}
export function deleteRefCAS(cwd, ref, oldSha) {
  return updateRef(cwd, ['-d', ref, oldSha], { ref, old: oldSha });
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/gitx.test.mjs`. Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/gitx.mjs tests/gitx.test.mjs
git commit -m "Add the git plumbing wrapper with compare-and-swap ref updates"
```

---

### Task 5: Commit objects: commitTree, catCommit, emptyTree

**Files:**
- Modify: `lib/gitx.mjs` (append)
- Test: `tests/gitx.test.mjs` (append)

**Interfaces:**
- Produces: `emptyTree(cwd) -> sha`, `commitTree(cwd, {tree, parents, subject, body, trailers}) -> sha`, `catCommit(cwd, sha) -> {tree, parents, subject, body, bodyBytes, trailers: [[k, v]]}`. `bodyBytes` is the exact body as stored; the digest is computed over it.

- [ ] **Step 1: Append the failing tests**

```js
import { emptyTree, commitTree, catCommit } from '../lib/gitx.mjs';

test('commitTree and catCommit round-trip subject, body and trailers without interpret-trailers', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const tree = await emptyTree(repo.dir);
  assert.equal(tree, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  const body = '{"a":"line\\nbreak","b":[1]}';
  const sha = await commitTree(repo.dir, { tree, parents: [], subject: 'cairn: done slug', body, trailers: [['Cairn-Schema', '1'], ['Cairn-Digest', 'sha256:00']] });
  const c = await catCommit(repo.dir, sha);
  assert.deepEqual([c.tree, c.parents, c.subject, c.body], [tree, [], 'cairn: done slug', body]);
  assert.deepEqual(c.trailers, [['Cairn-Schema', '1'], ['Cairn-Digest', 'sha256:00']]);
  assert.ok(Buffer.isBuffer(c.bodyBytes) && c.bodyBytes.toString() === body);
  const child = await commitTree(repo.dir, { tree, parents: [sha], subject: 'plain', body: 'no trailers here' });
  const d = await catCommit(repo.dir, child);
  assert.deepEqual([d.parents, d.body, d.trailers], [[sha], 'no trailers here', []]);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/gitx.test.mjs`. Expected: FAIL, `does not provide an export named 'emptyTree'`.

- [ ] **Step 3: Implement**

```js
// append to lib/gitx.mjs
export async function emptyTree(cwd) { return (await git(['mktree'], { cwd, input: '' })).stdout.trim(); }

export async function commitTree(cwd, { tree, parents = [], subject, body = '', trailers = [] }) {
  const trailerBlock = trailers.map(([k, v]) => `${k}: ${v}`).join('\n');
  const message = [subject, body, trailerBlock].filter((s) => s !== '').join('\n\n') + '\n';
  const args = ['commit-tree', tree];
  for (const p of parents) args.push('-p', p);
  return (await git(args, { cwd, input: message })).stdout.trim();
}

function splitBytes(buf, sep) {
  const parts = []; let from = 0, at;
  while ((at = buf.indexOf(sep, from)) !== -1) { parts.push(buf.subarray(from, at)); from = at + sep.length; }
  parts.push(buf.subarray(from)); return parts;
}
const TRAILER = /^([A-Za-z][A-Za-z0-9-]*): (.*)$/;
export async function catCommit(cwd, sha) {
  const { raw } = await git(['cat-file', 'commit', sha], { cwd });
  const cut = raw.indexOf('\n\n');
  const header = raw.subarray(0, cut).toString('utf8');
  let msg = raw.subarray(cut + 2);
  if (msg.at(-1) === 10) msg = msg.subarray(0, -1);
  const tree = /^tree ([0-9a-f]{40})$/m.exec(header)[1];
  const parents = [...header.matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]);
  const parts = splitBytes(msg, '\n\n');
  const subject = parts[0].toString('utf8');
  let trailers = [], bodyParts = parts.slice(1);
  if (parts.length >= 2) {
    const parsed = parts.at(-1).toString('utf8').split('\n').map((l) => TRAILER.exec(l));
    if (parsed.every(Boolean)) { trailers = parsed.map((m) => [m[1], m[2]]); bodyParts = parts.slice(1, -1); }
  }
  const bodyBytes = Buffer.concat(bodyParts.flatMap((b, i) => (i ? [Buffer.from('\n\n'), b] : [b])));
  return { tree, parents, subject, body: bodyBytes.toString('utf8'), bodyBytes, trailers };
}
```

Canonical JSON contains no raw newline, so splitting the message on a blank line is exact for records. The last paragraph is the trailer block only when every line of it is `Key: value`; otherwise it is body.

- [ ] **Step 4: Run it**

Run: `node --test tests/gitx.test.mjs`. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/gitx.mjs tests/gitx.test.mjs
git commit -m "Read and write commit objects with subject, body and trailer block"
```

---

### Task 6: Trees from dirty working-tree bytes

**Files:**
- Modify: `lib/gitx.mjs` (append)
- Test: `tests/gitx.test.mjs` (append)

**Interfaces:**
- Produces: `writeTreeFromPaths(cwd, {paths, exclude}) -> treeSha` (`paths` are entry paths relative to the worktree; `exclude` is a list of path prefixes silently skipped; bytes are read from disk, symlinks stored as link text, special files refused; the repository index is untouched), `listTree(cwd, treeSha) -> [{path, mode, sha}]`.

- [ ] **Step 1: Append the failing tests**

```js
import { writeTreeFromPaths, listTree } from '../lib/gitx.mjs';

test('writeTreeFromPaths stores dirty bytes, modes and link text without touching the index', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'committed\n'); await repo.commit('base');
  await repo.write('a.txt', 'dirty\n');
  await repo.write('b/c.txt', 'new\n');
  await repo.write('run.sh', '#!/bin/sh\n', { mode: 0o755 });
  await repo.link('lnk', '../outside.pem');
  await repo.write('.cairn/output/x', 'ignored\n');
  const before = await repo.git('ls-files', '--stage');
  const tree = await writeTreeFromPaths(repo.dir, { paths: ['a.txt', 'b/c.txt', 'run.sh', 'lnk', '.cairn/output/x', 'gone.txt'], exclude: ['.git', '.cairn/output'] });
  const entries = await listTree(repo.dir, tree);
  assert.deepEqual(entries.map((e) => [e.path, e.mode]), [['a.txt', '100644'], ['b/c.txt', '100644'], ['lnk', '120000'], ['run.sh', '100755']]);
  const blob = entries.find((e) => e.path === 'a.txt').sha;
  assert.equal((await git(['cat-file', 'blob', blob], { cwd: repo.dir })).stdout, 'dirty\n');
  const link = entries.find((e) => e.path === 'lnk').sha;
  assert.equal((await git(['cat-file', 'blob', link], { cwd: repo.dir })).stdout, '../outside.pem');
  assert.equal(await repo.git('ls-files', '--stage'), before);
  assert.equal(await repo.git('diff', '--cached', '--name-only'), '');
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/gitx.test.mjs`. Expected: FAIL, `does not provide an export named 'writeTreeFromPaths'`.

- [ ] **Step 3: Implement**

```js
// append to lib/gitx.mjs
import { lstat, readlink, readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function writeTreeFromPaths(cwd, { paths, exclude = [] }) {
  const skip = (p) => exclude.some((x) => p === x || p.startsWith(x.endsWith('/') ? x : x + '/'));
  const entries = [];
  for (const p of [...new Set(paths)].sort()) {
    if (skip(p)) continue;
    let st; try { st = await lstat(join(cwd, p)); } catch { continue; } // deleted in the worktree: absent from the tree
    if (st.isSymbolicLink()) entries.push({ mode: '120000', path: p, bytes: Buffer.from(await readlink(join(cwd, p))) });
    else if (st.isFile()) entries.push({ mode: st.mode & 0o111 ? '100755' : '100644', path: p, bytes: await readFile(join(cwd, p)) });
    else throw new GitError(`refusing special file ${p}`);
  }
  for (const e of entries) e.sha = (await git(['hash-object', '-w', '--stdin'], { cwd, input: e.bytes })).stdout.trim();
  const dir = await mkdtemp(join(tmpdir(), 'cairn-index-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
    const info = entries.map((e) => `${e.mode} ${e.sha}\t${e.path}\n`).join('');
    await git(['update-index', '--add', '--index-info'], { cwd, input: info, env });
    return (await git(['write-tree'], { cwd, env })).stdout.trim();
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function listTree(cwd, treeSha) {
  const { stdout } = await git(['ls-tree', '-r', '-z', treeSha], { cwd });
  return stdout.split('\0').filter(Boolean).map((line) => {
    const [meta, path] = line.split('\t'); const [mode, , sha] = meta.split(' ');
    return { path, mode, sha };
  });
}
```

Move the three `import` lines to the top of the file. A private index file under `GIT_INDEX_FILE` is how the tree is built without touching the repository index; `hash-object --stdin` applies no filters, so the blob holds the bytes on disk.

- [ ] **Step 4: Run it**

Run: `node --test tests/gitx.test.mjs`. Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/gitx.mjs tests/gitx.test.mjs
git commit -m "Build trees from working-tree bytes through a private index"
```

---

### Task 7: The record schema table, encodeRecord and decodeRecord

**Files:**
- Create: `lib/records.mjs`
- Test: `tests/records.test.mjs`

**Interfaces:**
- Consumes: `canonicalize`, `parseStrict`, `sha256` from `lib/canon.mjs`; `catCommit`, `commitTree`, `emptyTree`, `git` from `lib/gitx.mjs`.
- Produces: `SCHEMAS` (kind -> shape), `KINDS` (Set of 27), descriptor builders `ws, input, ref, sha, digest, str, token, int, unit, bool, ulid, b64, json, nullable(of), list(of), oneOf(...values), obj(shape)`, `check(desc, value, path, reasons)`, `encodeRecord(kind, target, payload) -> {subject, body, trailers}`, `decodeRecord(commit) -> {kind, target, payload}`, `RecordError` (with `.reasons`), `SCHEMA = '1'`, `TARGET_RE`. Writer plans use the field names in `SCHEMAS` verbatim; a writer plan that needs another field edits this table and its round-trip test.

- [ ] **Step 1: Write the failing tests**

```js
// tests/records.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/repo.mjs';
import { sha256 } from '../lib/canon.mjs';
import { git, emptyTree, catCommit } from '../lib/gitx.mjs';
import { KINDS, SCHEMAS, encodeRecord, decodeRecord, RecordError } from '../lib/records.mjs';

const WS = 'a'.repeat(40), D = 'sha256:' + 'b'.repeat(64);
const START = { slug: 'hooks', snapshot: WS, requirements: [{ requirement: 'LOOP-001', text_digest: D }], from_superseded: null };
async function rawCommit(repo, message) {
  const tree = await emptyTree(repo.dir);
  const head = Buffer.from(`tree ${tree}\nauthor A <a@b.c> 0 +0000\ncommitter A <a@b.c> 0 +0000\n\n`);
  const r = await git(['hash-object', '-t', 'commit', '-w', '--literally', '--stdin'], { cwd: repo.dir, input: Buffer.concat([head, Buffer.from(message)]) });
  return catCommit(repo.dir, r.stdout.trim());
}
const msg = (subject, body, trailers = [['Cairn-Schema', '1'], ['Cairn-Digest', sha256(body)]]) =>
  Buffer.concat([Buffer.from(`${subject}\n\n`), body, Buffer.from('\n\n' + trailers.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n')]);
const decodeRaw = (repo, subject, body, trailers) => rawCommit(repo, msg(subject, Buffer.isBuffer(body) ? body : Buffer.from(body), trailers)).then(decodeRecord);

test('the table has the 27 kinds of section 4 and no admin-transition', () => {
  assert.equal(KINDS.size, 27);
  assert.ok(KINDS.has('read') && !KINDS.has('admin-transition'));
  for (const k of KINDS) assert.ok(Object.keys(SCHEMAS[k]).length > 0, k);
});
test('encodeRecord emits the subject, canonical body and exactly two trailers', () => {
  const r = encodeRecord('start', 'hooks', START);
  assert.equal(r.subject, 'cairn: start hooks');
  assert.equal(r.body, '{"from_superseded":null,"requirements":[{"requirement":"LOOP-001","text_digest":"' + D + '"}],"slug":"hooks","snapshot":"' + WS + '"}');
  assert.deepEqual(r.trailers, [['Cairn-Schema', '1'], ['Cairn-Digest', sha256(r.body)]]);
});
test('encodeRecord refuses unknown kinds, path targets, unknown keys, missing keys and wrong types', () => {
  assert.throws(() => encodeRecord('admin-transition', 'x', {}), RecordError);
  assert.throws(() => encodeRecord('start', 'docs/a.md', START), RecordError);
  assert.throws(() => encodeRecord('start', 'hooks', { ...START, extra: 1 }), (e) => e.reasons.some((r) => /unknown key extra/.test(r)));
  assert.throws(() => encodeRecord('done', 'hooks', { slug: 'hooks' }), (e) => e.reasons.some((r) => /missing snapshot/.test(r)));
  assert.throws(() => encodeRecord('resolution', 'hooks', { source: WS, finding: -1, snapshot: WS, explanation: 'x' }), (e) => e.reasons.some((r) => /finding/.test(r)));
  assert.throws(() => encodeRecord('calibration', 'p', { policy_digest: D, log_head: WS, predicted_agent: 60, false_downgrades: 0, bound: 1.5, criterion: 'c', result: 'pass' }), (e) => e.reasons.some((r) => /bound/.test(r)));
});
test('decodeRecord round-trips a well-formed record', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const { body } = encodeRecord('start', 'hooks', START);
  assert.deepEqual(await decodeRaw(repo, 'cairn: start hooks', body), { kind: 'start', target: 'hooks', payload: START });
});
test('the parser rejects invalid UTF-8 in the body', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = Buffer.concat([Buffer.from('{"slug":"'), Buffer.from([0xff]), Buffer.from(`","snapshot":"${WS}"}`)]);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body), /invalid UTF-8/);
});
test('the parser rejects control characters outside JSON escapes', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"slug":"a\u0001b","snapshot":"${WS}"}`), /invalid JSON/);
});
test('the parser rejects noncanonical JSON even with a matching digest', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"snapshot":"${WS}","slug":"hooks"}`), /noncanonical/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"slug":"hooks","slug":"x","snapshot":"${WS}"}`), /noncanonical/);
});
test('the parser rejects a body whose digest does not match the trailer', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = encodeRecord('done', 'hooks', { slug: 'hooks', snapshot: WS }).body;
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Schema', '1'], ['Cairn-Digest', sha256('other')]]), /digest/);
});
test('the parser rejects wrong field counts', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', '{"slug":"hooks"}'), /missing snapshot/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"note":"x","slug":"hooks","snapshot":"${WS}"}`), /unknown key note/);
});
test('the parser rejects out-of-range numbers', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: resolution hooks', `{"explanation":"x","finding":1e400,"snapshot":"${WS}","source":"${WS}"}`), RecordError);
  await assert.rejects(decodeRaw(repo, 'cairn: resolution hooks', `{"explanation":"x","finding":1.5,"snapshot":"${WS}","source":"${WS}"}`), /finding/);
});
test('the parser rejects trailer sets other than the two, and content in trailers', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = encodeRecord('done', 'hooks', { slug: 'hooks', snapshot: WS }).body;
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Digest', sha256(body)]]), /two trailers/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Schema', '1'], ['Cairn-Digest', sha256(body)], ['Cairn-Slug', 'hooks']]), /two trailers/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Schema', '2'], ['Cairn-Digest', sha256(body)]]), /schema/);
});
test('the parser rejects subjects that are not kind and token', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = encodeRecord('done', 'hooks', { slug: 'hooks', snapshot: WS }).body;
  await assert.rejects(decodeRaw(repo, 'cairn: admin-transition hooks', body), /kind/);
  await assert.rejects(decodeRaw(repo, 'cairn: done docs/spec/a.md', body), /target/);
  await assert.rejects(decodeRaw(repo, 'Release 2.0', body), /subject/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/records.test.mjs`. Expected: FAIL, `Cannot find module '../lib/records.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/records.mjs
import { canonicalize, parseStrict, sha256 } from './canon.mjs';

export class RecordError extends Error { constructor(m, reasons = []) { super(reasons.length ? `${m}: ${reasons.join('; ')}` : m); this.name = 'RecordError'; this.reasons = reasons; } }
export const SCHEMA = '1';
export const TARGET_RE = /^(-|[A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;

const T = (t) => ({ t });
export const ws = T('ws'), input = T('input'), ref = T('ref'), sha = T('sha'), digest = T('digest'), str = T('str'), token = T('token'),
  int = T('int'), unit = T('unit'), bool = T('bool'), ulid = T('ulid'), b64 = T('b64'), json = T('json');
export const nullable = (of) => ({ t: 'nullable', of }), list = (of) => ({ t: 'list', of }),
  oneOf = (...values) => ({ t: 'enum', values }), obj = (shape) => ({ t: 'obj', shape });

const SHA = /^[0-9a-f]{40}$/, DIGEST = /^sha256:[0-9a-f]{64}$/, ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/, B64 = /^[A-Za-z0-9_-]*$/;
export function check(desc, v, path, out) {
  const ok = (cond, what) => { if (!cond) out.push(`${path}: ${what}`); };
  const s = typeof v === 'string';
  switch (desc.t) {
    case 'ws': case 'input': case 'ref': case 'sha': return ok(s && SHA.test(v), 'expected 40 lowercase hex');
    case 'digest': return ok(s && DIGEST.test(v), 'expected sha256:<64 hex>');
    case 'str': return ok(s, 'expected string');
    case 'token': return ok(s && TARGET_RE.test(v), 'expected token');
    case 'int': return ok(Number.isSafeInteger(v) && v >= 0, 'expected non-negative integer');
    case 'unit': return ok(typeof v === 'number' && v >= 0 && v <= 1, 'expected number in [0,1]');
    case 'bool': return ok(typeof v === 'boolean', 'expected boolean');
    case 'ulid': return ok(s && ULID.test(v), 'expected ULID');
    case 'b64': return ok(s && B64.test(v), 'expected unpadded base64url');
    case 'json': return ok(v !== undefined, 'expected JSON value');
    case 'enum': return ok(desc.values.includes(v), `expected one of ${desc.values.join('|')}`);
    case 'nullable': return v === null ? undefined : check(desc.of, v, path, out);
    case 'list': if (!Array.isArray(v)) return ok(false, 'expected array'); return v.forEach((x, i) => check(desc.of, x, `${path}[${i}]`, out));
    case 'obj': {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return ok(false, 'expected object');
      const keys = Object.keys(v), want = Object.keys(desc.shape);
      for (const k of want) ok(k in v, `missing ${k}`);
      for (const k of keys) ok(k in desc.shape, `unknown key ${k}`);
      ok(keys.length === want.length, `expected ${want.length} fields, found ${keys.length}`);
      for (const k of want) if (k in v) check(desc.shape[k], v[k], `${path}.${k}`, out);
      return;
    }
    default: throw new Error(`bad descriptor ${desc.t}`);
  }
}

const evidence = obj({ mode: oneOf('signed', 'unsigned-local'), author: str, signature: nullable(b64) });
const finding = obj({ n: int, text: str });
const reqDigest = obj({ requirement: token, text_digest: digest });
const storeIdentity = obj({ store: str, identity: str });
const verdict = obj({ resolution: ref, reason: str });
const question = oneOf('Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6');
const route = oneOf('agent', 'developer', 'capture');
export const SCHEMAS = {
  'init': { settings_digest: digest, authority_remote: nullable(str), auth_mode: oneOf('signed', 'unsigned-local') },
  'authorization': { spec_digest: digest, agreement_digest: digest, settings_digest: digest, evidence, decision: nullable(ulid) },
  'command-intent': { tx: ulid, command: oneOf('start', 'promote', 'supersede', 'authorize'), input_identity: digest, pre_identities: list(storeIdentity), planned_writes: list(obj({ store: str, digest })) },
  'command-abort': { intent: ref, failure_class: token, restored: list(storeIdentity) },
  'start': { slug: token, snapshot: ws, requirements: list(reqDigest), from_superseded: nullable(ref) },
  'receipt': { mechanism: token, definition_digest: digest, snapshot: input, outcome: oneOf('ran', 'error'), environment: list(obj({ name: str, value: str })), results: list(obj({ requirement: token, text_digest: digest, result: oneOf('pass', 'fail', 'unverified') })), output_digest: digest, exit_code: nullable(int), signal: nullable(str) },
  'review': { slug: token, snapshot: ws, examined: list(str), answers: list(obj({ question, target: str, status: oneOf('observed', 'not-checked'), text: str })), findings: list(finding) },
  'brief': { slug: token, review: ref, projection_digest: digest, payload_digest: digest, exclusions_digest: digest },
  'report': { slug: token, snapshot: ws, brief: ref, model: str, transport: oneOf('local', 'remote'), boundary: oneOf('enforced', 'unenforced'), builder_model: nullable(str), projection_digest: digest, attempts: list(obj({ question, target: str, text: str })), findings: list(finding), interface_attempts: list(obj({ path: str, text: str })) },
  'resolution': { source: ref, finding: int, snapshot: ws, explanation: str },
  'acceptance': { slug: token, report: ref, snapshot: ws, delta_digest: digest, accepted: list(verdict), rejected: list(verdict), findings: list(finding) },
  'escalation': { slug: token, question: str, recommendation: str, because: str, if_wrong: str, instead: str, concerns: str, evaluation: nullable(ref) },
  'answer': { escalation: ref, kind: oneOf('ok', 'instead', 'ask'), text: str, owner: nullable(str), evidence },
  'reply': { escalation: ref, text: str },
  'read': { decision: ulid, evidence },
  'evaluation-intent': { draft_digest: digest, snapshot: ws, log_head: ref, adr_digest: digest, settings_digest: digest, policy_digest: digest, owner_request: nullable(digest), option_request: nullable(digest) },
  'evaluation-call': { intent: ref, call: oneOf('owner', 'option'), request_digest: digest, outcome: oneOf('not_sent', 'response', 'failure', 'indeterminate'), model: nullable(str), raw: nullable(b64), failure_class: nullable(str), answers: nullable(list(obj({ id: str, value: json }))), usage: nullable(obj({ input_tokens: int, output_tokens: int })) },
  'evaluation': { intent: ref, gates: list(obj({ gate: str, value: json, passed: bool })), route, would_route: nullable(route), reason: str, owner_call: nullable(ref), option_call: nullable(ref) },
  'calibration': { policy_digest: digest, log_head: ref, predicted_agent: int, false_downgrades: int, bound: unit, criterion: str, result: oneOf('pass', 'fail') },
  'item': { kind: oneOf('backlog', 'next-feature', 'defect'), slug: token, source: str, body: str },
  'outside': { item: ref, reason: str, evaluation: nullable(ref) },
  'promotion': { item: ref, decision: ulid },
  'fix': { item: ref, snapshot: ws },
  'scope-breach': { path: str, snapshot: ws, base: ws, declarations_digest: digest },
  'scope': { breach: ref, disposition: oneOf('keep', 'restore'), snapshot: ws, escalation: nullable(ref), answer: nullable(ref) },
  'done': { slug: token, snapshot: ws },
  'superseded': { slug: token, start: ref, decision: ulid, transition: ulid, successor: token, carried: list(ref) },
};
export const KINDS = new Set(Object.keys(SCHEMAS));

export function encodeRecord(kind, target, payload) {
  if (!KINDS.has(kind)) throw new RecordError(`unknown record kind ${kind}`);
  if (typeof target !== 'string' || !TARGET_RE.test(target)) throw new RecordError(`invalid target token ${JSON.stringify(target)}`);
  const reasons = []; check(obj(SCHEMAS[kind]), payload, kind, reasons);
  if (reasons.length) throw new RecordError(`invalid ${kind} record`, reasons);
  const body = canonicalize(payload);
  return { subject: `cairn: ${kind} ${target}`, body, trailers: [['Cairn-Schema', SCHEMA], ['Cairn-Digest', sha256(body)]] };
}
export function decodeRecord(commit) {
  const m = /^cairn: (\S+) (\S+)$/.exec(commit.subject);
  if (!m) throw new RecordError(`not a record subject: ${commit.subject}`);
  const [, kind, target] = m;
  if (!KINDS.has(kind)) throw new RecordError(`unknown record kind ${kind}`);
  if (!TARGET_RE.test(target)) throw new RecordError(`invalid target token ${target}`);
  const tr = commit.trailers;
  if (tr.length !== 2 || tr[0][0] !== 'Cairn-Schema' || tr[1][0] !== 'Cairn-Digest') throw new RecordError('expected exactly the two trailers Cairn-Schema and Cairn-Digest');
  if (tr[0][1] !== SCHEMA) throw new RecordError(`unreadable schema ${tr[0][1]}`);
  const bytes = commit.bodyBytes ?? Buffer.from(commit.body, 'utf8');
  if (tr[1][1] !== sha256(bytes)) throw new RecordError('body digest does not match Cairn-Digest');
  let payload; try { payload = parseStrict(bytes); } catch (e) { throw new RecordError(`body: ${e.message}`); }
  const reasons = []; check(obj(SCHEMAS[kind]), payload, kind, reasons);
  if (reasons.length) throw new RecordError(`invalid ${kind} record`, reasons);
  return { kind, target, payload };
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/records.test.mjs`. Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/records.mjs tests/records.test.mjs
git commit -m "Add the closed record schema table with the canonical encoder and strict decoder"
```

---

### Task 8: The log ref: appendRecord, readLog, range

**Files:**
- Modify: `lib/records.mjs` (append)
- Test: `tests/records.test.mjs` (append)

**Interfaces:**
- Produces: `LOG_REF = 'refs/cairn/log'`, `appendRecord(cwd, kind, target, payload) -> sha`, `readLog(cwd) -> [{sha, kind, target, payload, parent}]` oldest first, `range(log) -> {start, records, closed}`.

- [ ] **Step 1: Append the failing tests**

```js
import { updateRefCAS, CasError } from '../lib/gitx.mjs';
import { appendRecord, readLog, range, LOG_REF } from '../lib/records.mjs';

test('appendRecord chains empty commits on refs/cairn/log and readLog returns them oldest first', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const s1 = await appendRecord(repo.dir, 'start', 'hooks', START);
  const s2 = await appendRecord(repo.dir, 'done', 'hooks', { slug: 'hooks', snapshot: WS });
  const log = await readLog(repo.dir);
  assert.deepEqual(log.map((r) => [r.sha, r.kind, r.parent]), [[s1, 'start', null], [s2, 'done', s1]]);
  assert.equal((await catCommit(repo.dir, s2)).tree, await emptyTree(repo.dir));
  assert.equal(await repo.git('rev-parse', 'refs/cairn/log'), s2);
});
test('the log ref refuses a stale old OID', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const s1 = await appendRecord(repo.dir, 'start', 'hooks', START);
  const s2 = await appendRecord(repo.dir, 'done', 'hooks', { slug: 'hooks', snapshot: WS });
  await assert.rejects(updateRefCAS(repo.dir, LOG_REF, s1, s1), CasError);
  assert.equal(await repo.git('rev-parse', LOG_REF), s2);
});
test('readLog refuses a commit on the log that is not a record', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const plain = await repo.commit('not a record');
  await updateRefCAS(repo.dir, LOG_REF, plain, null);
  await assert.rejects(readLog(repo.dir), RecordError);
});
test('range is the log after the last start and knows whether it is closed', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  assert.deepEqual(range([]), { start: null, records: [], closed: false });
  await appendRecord(repo.dir, 'start', 'a', { ...START, slug: 'a' });
  await appendRecord(repo.dir, 'done', 'a', { slug: 'a', snapshot: WS });
  const s2 = await appendRecord(repo.dir, 'start', 'b', { ...START, slug: 'b' });
  const item = await appendRecord(repo.dir, 'item', 'b', { kind: 'backlog', slug: 'b', source: 'LOOP-001', body: 'idea' });
  let r = range(await readLog(repo.dir));
  assert.deepEqual([r.start.sha, r.records.map((x) => x.sha), r.closed], [s2, [item], false]);
  await appendRecord(repo.dir, 'done', 'b', { slug: 'b', snapshot: WS });
  r = range(await readLog(repo.dir));
  assert.equal(r.closed, true);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/records.test.mjs`. Expected: FAIL, `does not provide an export named 'appendRecord'`.

- [ ] **Step 3: Implement**

```js
// append to lib/records.mjs
import { git, readRef, updateRefCAS, commitTree, catCommit, emptyTree } from './gitx.mjs';
export const LOG_REF = 'refs/cairn/log';

export async function appendRecord(cwd, kind, target, payload) {
  const { subject, body, trailers } = encodeRecord(kind, target, payload);
  const head = await readRef(cwd, LOG_REF);
  const sha = await commitTree(cwd, { tree: await emptyTree(cwd), parents: head ? [head] : [], subject, body, trailers });
  await updateRefCAS(cwd, LOG_REF, sha, head);
  return sha;
}
export async function readLog(cwd) {
  const head = await readRef(cwd, LOG_REF);
  if (!head) return [];
  const shas = (await git(['rev-list', '--first-parent', '--reverse', head], { cwd })).stdout.trim().split('\n');
  const out = [];
  for (const sha of shas) {
    const c = await catCommit(cwd, sha);
    const { kind, target, payload } = decodeRecord(c);
    out.push({ sha, kind, target, payload, parent: c.parents[0] ?? null });
  }
  return out;
}
export function range(log) {
  let i = log.length - 1;
  while (i >= 0 && log[i].kind !== 'start') i--;
  const start = i >= 0 ? log[i] : null, records = log.slice(i + 1);
  const closed = start !== null && records.some((r) => (r.kind === 'done' || r.kind === 'superseded') && r.payload.slug === start.payload.slug);
  return { start, records, closed };
}
```

Move the `import` line to the top. `appendRecord` passes the head it read as the expected old OID, so a writer that advanced the ref in between makes the update-ref call fail with `CasError` rather than overwrite.

- [ ] **Step 4: Run it**

Run: `node --test tests/records.test.mjs`. Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/records.mjs tests/records.test.mjs
git commit -m "Append and read the record log with compare-and-swap on refs/cairn/log"
```

---

### Task 9: Workspace snapshots

**Files:**
- Create: `lib/snapshots.mjs`
- Test: `tests/snapshots.test.mjs`

**Interfaces:**
- Consumes: `git`, `readRef`, `updateRefCAS`, `commitTree`, `catCommit`, `writeTreeFromPaths`, `listTree` from `lib/gitx.mjs`; `check`, `obj`, `oneOf`, `str`, `token`, `list`, `SCHEMA` from `lib/records.mjs`; `canonicalize`, `parseStrict`, `sha256` from `lib/canon.mjs`.
- Produces: `SNAPSHOTS_REF = 'refs/cairn/snapshots'`, `CREDENTIAL_PATTERNS`, `ALWAYS_EXCLUDED`, `globToRegExp(pattern) -> RegExp` (`**` matches zero or more whole segments, `*` and `?` never cross `/`; plan 02 moves it to `lib/paths.mjs` as `matchGlob`), `writeWorkspaceSnapshot(cwd, {exclude = []}) -> sha`, `readSnapshot(cwd, sha, expectedKind) -> {kind, tree, parent, payload}` (throws `KindError`), `SnapshotError`, `KindError`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/snapshots.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/repo.mjs';
import { git, listTree, updateRefCAS, CasError } from '../lib/gitx.mjs';
import { writeWorkspaceSnapshot, readSnapshot, globToRegExp, SnapshotError, KindError, SNAPSHOTS_REF } from '../lib/snapshots.mjs';

const paths = async (repo, sha, kind) => (await listTree(repo.dir, (await readSnapshot(repo.dir, sha, kind)).tree)).map((e) => e.path);

test('globToRegExp: ** spans segments, * and ? stay inside one', () => {
  const m = (p, s) => globToRegExp(p).test(s);
  assert.ok(m('**/.env', '.env') && m('**/.env', 'a/b/.env') && !m('**/.env', '.envrc'));
  assert.ok(m('.github/**', '.github/w/ci.yml') && !m('.github/**', '.githubx'));
  assert.ok(m('config/*.secret.*', 'config/db.secret.json') && !m('config/*.secret.*', 'config/x/db.secret.json'));
  assert.ok(m('a/**/b', 'a/b') && m('a/**/b', 'a/x/y/b') && m('*.pem', 'k.pem') && !m('*.pem', 'd/k.pem'));
});
test('a workspace snapshot holds tracked dirty bytes and untracked files, not .git or .cairn/output, and leaves the index alone', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'clean\n'); await repo.write('.gitignore', 'ignored.log\n.cairn/output/\n'); await repo.commit('base');
  await repo.write('a.txt', 'dirty\n'); await repo.write('new.txt', 'new\n'); await repo.write('ignored.log', 'x'); await repo.write('.cairn/output/o', 'x');
  const before = await repo.git('ls-files', '--stage');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  assert.deepEqual(await paths(repo, sha, 'workspace'), ['.gitignore', 'a.txt', 'new.txt']);
  const s = await readSnapshot(repo.dir, sha, 'workspace');
  assert.deepEqual([s.kind, s.parent, s.payload], ['workspace', null, { kind: 'workspace' }]);
  const blob = (await listTree(repo.dir, s.tree)).find((e) => e.path === 'a.txt').sha;
  assert.equal((await git(['cat-file', 'blob', blob], { cwd: repo.dir })).stdout, 'dirty\n');
  assert.equal(await repo.git('ls-files', '--stage'), before);
  assert.equal(await repo.git('rev-parse', SNAPSHOTS_REF), sha);
  const second = await writeWorkspaceSnapshot(repo.dir);
  assert.equal((await readSnapshot(repo.dir, second, 'workspace')).parent, sha);
});
test('the kind is checked at every reference', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a\n'); await repo.commit('base');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  await assert.rejects(readSnapshot(repo.dir, sha, 'input'), KindError);
  await assert.rejects(readSnapshot(repo.dir, await repo.readRef('HEAD'), 'workspace'), KindError);
});
test('a snapshot refuses untracked credential paths and network_exclude matches, by entry path only', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('.env', 'TRACKED=1\n'); await repo.commit('tracked env is the developer\'s choice');
  await writeWorkspaceSnapshot(repo.dir);
  for (const p of ['.env.local', 'deploy/id_rsa', 'certs/x.pem', 'k.p12', 'k.pfx', 'k.key']) {
    await repo.write(p, 'secret');
    await assert.rejects(writeWorkspaceSnapshot(repo.dir), (e) => e instanceof SnapshotError && e.message.includes(p));
    await repo.git('clean', '-fdq');
  }
  await repo.write('fixtures/private/a.json', '{}');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir, { exclude: ['fixtures/private/**'] }), /fixtures\/private\/a.json/);
  await repo.git('clean', '-fdq');
  await repo.link('notes.txt', '../elsewhere/secret.pem');
  const sha = await writeWorkspaceSnapshot(repo.dir);
  assert.ok((await paths(repo, sha, 'workspace')).includes('notes.txt'));
  await repo.link('leak.pem', 'README');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir), /leak.pem/);
});
test('the snapshots ref refuses a stale old OID', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a\n'); await repo.commit('base');
  const s1 = await writeWorkspaceSnapshot(repo.dir);
  await repo.write('a.txt', 'b\n');
  const s2 = await writeWorkspaceSnapshot(repo.dir);
  await assert.rejects(updateRefCAS(repo.dir, SNAPSHOTS_REF, s1, s1), CasError);
  assert.equal(await repo.git('rev-parse', SNAPSHOTS_REF), s2);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/snapshots.test.mjs`. Expected: FAIL, `Cannot find module '../lib/snapshots.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/snapshots.mjs
import { git, readRef, updateRefCAS, commitTree, catCommit, writeTreeFromPaths } from './gitx.mjs';
import { check, obj, oneOf, str, token, list, SCHEMA } from './records.mjs';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';

export class SnapshotError extends Error { constructor(m) { super(m); this.name = 'SnapshotError'; } }
export class KindError extends SnapshotError { constructor(m) { super(m); this.name = 'KindError'; } }
export const SNAPSHOTS_REF = 'refs/cairn/snapshots';
export const ALWAYS_EXCLUDED = ['.git', '.cairn/output'];
export const CREDENTIAL_PATTERNS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.p12', '**/*.pfx', '**/*.key', '**/id_rsa', '**/id_dsa', '**/id_ecdsa', '**/id_ed25519'];
export const SNAPSHOT_SCHEMAS = { workspace: { kind: oneOf('workspace') }, input: { kind: oneOf('input'), mechanism: token, inputs: list(str) } };

export function globToRegExp(pattern) {
  const segs = pattern.split('/');
  const re = segs.map((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') return last ? '.*' : '(?:[^/]+/)*';
    const lit = seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    return last ? lit : lit + '/';
  }).join('');
  return new RegExp('^' + re + '$');
}
export async function listPaths(cwd, pathspec = []) {
  const ls = async (flags) => (await git(['ls-files', '-z', ...flags, '--', ...pathspec], { cwd })).stdout.split('\0').filter(Boolean);
  return { tracked: await ls(['--cached']), untracked: await ls(['--others', '--exclude-standard']) };
}
export function refuseSensitive(untracked, exclude) {
  const patterns = [...CREDENTIAL_PATTERNS, ...exclude].map((p) => [p, globToRegExp(p)]);
  const hits = untracked.flatMap((p) => patterns.filter(([, re]) => re.test(p)).map(([pat]) => `${p} (matches ${pat})`));
  if (hits.length) throw new SnapshotError(`refusing to snapshot untracked sensitive paths: ${hits.join(', ')}`);
}
export async function writeSnapshot(cwd, payload, paths) {
  const reasons = []; check(obj(SNAPSHOT_SCHEMAS[payload.kind] ?? {}), payload, 'snapshot', reasons);
  if (reasons.length) throw new SnapshotError(reasons.join('; '));
  const tree = await writeTreeFromPaths(cwd, { paths, exclude: ALWAYS_EXCLUDED });
  const body = canonicalize(payload), head = await readRef(cwd, SNAPSHOTS_REF);
  const sha = await commitTree(cwd, { tree, parents: head ? [head] : [], subject: `cairn: snapshot ${payload.kind}`, body, trailers: [['Cairn-Schema', SCHEMA], ['Cairn-Digest', sha256(body)]] });
  await updateRefCAS(cwd, SNAPSHOTS_REF, sha, head);
  return sha;
}
export async function writeWorkspaceSnapshot(cwd, { exclude = [] } = {}) {
  const { tracked, untracked } = await listPaths(cwd);
  refuseSensitive(untracked, exclude);
  return writeSnapshot(cwd, { kind: 'workspace' }, [...tracked, ...untracked]);
}
export async function readSnapshot(cwd, sha, expectedKind) {
  const c = await catCommit(cwd, sha);
  const m = /^cairn: snapshot (workspace|input)$/.exec(c.subject);
  if (!m) throw new KindError(`${sha} is not a snapshot commit`);
  const tr = c.trailers;
  if (tr.length !== 2 || tr[0][0] !== 'Cairn-Schema' || tr[0][1] !== SCHEMA || tr[1][0] !== 'Cairn-Digest' || tr[1][1] !== sha256(c.bodyBytes)) throw new SnapshotError(`${sha}: snapshot trailers or digest invalid`);
  let payload; try { payload = parseStrict(c.bodyBytes); } catch (e) { throw new SnapshotError(`${sha}: ${e.message}`); }
  const reasons = []; check(obj(SNAPSHOT_SCHEMAS[m[1]]), payload, 'snapshot', reasons);
  if (reasons.length) throw new SnapshotError(`${sha}: ${reasons.join('; ')}`);
  if (payload.kind !== expectedKind) throw new KindError(`expected a ${expectedKind} snapshot, ${sha} is ${payload.kind}`);
  return { kind: payload.kind, tree: c.tree, parent: c.parents[0] ?? null, payload };
}
```

Only untracked paths are screened: a tracked `.env` is already in the developer's history, so the snapshot cannot smuggle it. Matching uses the entry path from `git ls-files`, never a symlink's target.

- [ ] **Step 4: Run it**

Run: `node --test tests/snapshots.test.mjs`. Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/snapshots.mjs tests/snapshots.test.mjs
git commit -m "Write typed workspace snapshots that refuse untracked credential paths"
```

---

### Task 10: Input snapshots and the allowed base

**Files:**
- Modify: `lib/snapshots.mjs` (append)
- Test: `tests/snapshots.test.mjs` (append)

**Interfaces:**
- Consumes: `appendRecord`, `readLog` from `lib/records.mjs` (tests only).
- Produces: `writeInputSnapshot(cwd, {mechanism, inputs, exclude = []}) -> sha`, `allowedBase(cwd, log) -> sha|null` (async; the newest `start.snapshot` or `scope.snapshot` in the log, kind-checked as workspace), `ALLOWED_BASE_FIELDS` (plan 07 may extend it).

- [ ] **Step 1: Append the failing tests**

```js
import { appendRecord, readLog } from '../lib/records.mjs';
import { writeInputSnapshot, allowedBase } from '../lib/snapshots.mjs';
const D = 'sha256:' + 'b'.repeat(64);

test('an input snapshot holds exactly the declared inputs, tracked or untracked', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('src/a.js', '1'); await repo.write('src/b.js', '2'); await repo.write('README.md', 'r'); await repo.commit('base');
  await repo.write('src/c.js', '3'); await repo.write('tests/t.js', 't');
  const sha = await writeInputSnapshot(repo.dir, { mechanism: 'unit', inputs: ['src', 'tests/t.js'] });
  assert.deepEqual(await paths(repo, sha, 'input'), ['src/a.js', 'src/b.js', 'src/c.js', 'tests/t.js']);
  assert.deepEqual((await readSnapshot(repo.dir, sha, 'input')).payload, { kind: 'input', mechanism: 'unit', inputs: ['src', 'tests/t.js'] });
  await assert.rejects(readSnapshot(repo.dir, sha, 'workspace'), KindError);
  await repo.write('src/.env', 'x');
  await assert.rejects(writeInputSnapshot(repo.dir, { mechanism: 'unit', inputs: ['src'] }), SnapshotError);
  await assert.rejects(writeInputSnapshot(repo.dir, { mechanism: 'unit', inputs: [] }), SnapshotError);
});
test('allowedBase is the newest start or scope snapshot, never merely the newest snapshot', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), null);
  const A = await writeWorkspaceSnapshot(repo.dir);
  await appendRecord(repo.dir, 'start', 's', { slug: 's', snapshot: A, requirements: [], from_superseded: null });
  await repo.write('a.txt', 'b'); const B = await writeWorkspaceSnapshot(repo.dir);
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), A);
  await appendRecord(repo.dir, 'scope-breach', 'a.txt', { path: 'a.txt', snapshot: B, base: A, declarations_digest: D });
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), A);
  const log = await readLog(repo.dir);
  await appendRecord(repo.dir, 'scope', 'a.txt', { breach: log.at(-1).sha, disposition: 'keep', snapshot: B, escalation: null, answer: null });
  assert.equal(await allowedBase(repo.dir, await readLog(repo.dir)), B);
  const I = await writeInputSnapshot(repo.dir, { mechanism: 'm', inputs: ['a.txt'] });
  await appendRecord(repo.dir, 'start', 'bad', { slug: 'bad', snapshot: I, requirements: [], from_superseded: null });
  await assert.rejects(allowedBase(repo.dir, await readLog(repo.dir)), KindError);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/snapshots.test.mjs`. Expected: FAIL, `does not provide an export named 'writeInputSnapshot'`.

- [ ] **Step 3: Implement**

```js
// append to lib/snapshots.mjs
export async function writeInputSnapshot(cwd, { mechanism, inputs, exclude = [] }) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new SnapshotError('an input snapshot needs at least one declared input');
  const { tracked, untracked } = await listPaths(cwd, inputs);
  refuseSensitive(untracked, exclude);
  return writeSnapshot(cwd, { kind: 'input', mechanism, inputs: [...inputs] }, [...tracked, ...untracked]);
}
export const ALLOWED_BASE_FIELDS = { start: 'snapshot', scope: 'snapshot' };
export async function allowedBase(cwd, log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const field = ALLOWED_BASE_FIELDS[log[i].kind];
    if (!field) continue;
    const sha = log[i].payload[field];
    await readSnapshot(cwd, sha, 'workspace');
    return sha;
  }
  return null;
}
```

A `scope-breach` record's first-observed snapshot is deliberately not in `ALLOWED_BASE_FIELDS`.

- [ ] **Step 4: Run it**

Run: `node --test tests/snapshots.test.mjs`. Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/snapshots.mjs tests/snapshots.test.mjs
git commit -m "Add input snapshots and the allowed workspace base lookup"
```

---

### Task 11: CLI skeleton with --help, exit codes and cairn show

**Files:**
- Create: `lib/cli.mjs`, `bin/cairn.mjs`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `git`, `readRef`, `catCommit` from `lib/gitx.mjs`; `decodeRecord`, `SCHEMAS`, `obj`, `LOG_REF` from `lib/records.mjs`; `readSnapshot`, `SNAPSHOTS_REF` from `lib/snapshots.mjs`.
- Produces: `main(argv, {cwd, stdout, stderr}) -> exit code`, `COMMANDS` (name -> `{usage, run(args, ctx)}`; later plans add entries), `usage()`, `requireRefs(cwd)`, `Refusal` (exit 1, one `cairn: ` line on stderr), `NoVerdict` (exit 3, one line on stdout), `FETCH_LINE`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makeRepo } from './helpers/repo.mjs';
import { appendRecord } from '../lib/records.mjs';
import { writeWorkspaceSnapshot, writeInputSnapshot } from '../lib/snapshots.mjs';
import { main, FETCH_LINE } from '../lib/cli.mjs';

const run = async (argv, cwd) => { let out = '', err = ''; const code = await main(argv, { cwd, stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } }); return { code, out, err }; };

test('--help exits 0 and lists commands; an unknown command exits 1 with one cairn: line', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const help = await run(['--help'], repo.dir);
  assert.equal(help.code, 0); assert.match(help.out, /cairn show <sha>/);
  const bad = await run(['bogus'], repo.dir);
  assert.equal(bad.code, 1); assert.match(bad.err, /^cairn: unknown command bogus/); assert.equal(bad.err.split('\n').length, 2);
});
test('show exits 3 and names the fetch when the durable refs are missing', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const r = await run(['show', 'a'.repeat(40)], repo.dir);
  assert.equal(r.code, 3); assert.equal(r.out, `cairn: durable refs missing; run: ${FETCH_LINE}\n`);
});
test('show renders a record with its references resolved and kind-checked', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  const ws = await writeWorkspaceSnapshot(repo.dir);
  const start = await appendRecord(repo.dir, 'start', 'hooks', { slug: 'hooks', snapshot: ws, requirements: [], from_superseded: null });
  const done = await appendRecord(repo.dir, 'done', 'hooks', { slug: 'hooks', snapshot: ws });
  const r = await run(['show', done], repo.dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /^cairn: done hooks\n/); assert.match(r.out, /"slug": "hooks"/); assert.match(r.out, new RegExp(`done.snapshot: workspace snapshot ${ws}, tree [0-9a-f]{40}`));
  const inp = await writeInputSnapshot(repo.dir, { mechanism: 'm', inputs: ['a.txt'] });
  const wrong = await appendRecord(repo.dir, 'fix', 'x', { item: start, snapshot: inp });
  const w = await run(['show', wrong], repo.dir);
  assert.equal(w.code, 1); assert.match(w.err, /^cairn: expected a workspace snapshot/);
  const plain = await run(['show', await repo.readRef('HEAD')], repo.dir);
  assert.equal(plain.code, 1); assert.match(plain.err, /^cairn: not a record subject/);
});
test('bin/cairn.mjs runs', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['bin/cairn.mjs', '--help']);
  assert.match(stdout, /usage: cairn/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/cli.test.mjs`. Expected: FAIL, `Cannot find module '../lib/cli.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/cli.mjs
import { git, readRef, catCommit } from './gitx.mjs';
import { decodeRecord, SCHEMAS, obj, LOG_REF } from './records.mjs';
import { readSnapshot, SNAPSHOTS_REF } from './snapshots.mjs';

export class Refusal extends Error { constructor(m) { super(m); this.name = 'Refusal'; } }
export class NoVerdict extends Error { constructor(m) { super(m); this.name = 'NoVerdict'; } }
export const FETCH_LINE = "git fetch <authority> 'refs/cairn/log:refs/cairn/log' 'refs/cairn/snapshots:refs/cairn/snapshots'";

export async function requireRefs(cwd) {
  const inside = await git(['rev-parse', '--is-inside-work-tree'], { cwd, expect: [0, 128] });
  if (inside.code !== 0) throw new NoVerdict('not inside a Git repository; run /new-project or /existing-project');
  if (!(await readRef(cwd, LOG_REF)) || !(await readRef(cwd, SNAPSHOTS_REF))) throw new NoVerdict(`durable refs missing; run: ${FETCH_LINE}`);
}
function collectRefs(desc, v, path, out) {
  switch (desc.t) {
    case 'ws': case 'input': case 'ref': out.push([path, desc.t, v]); return;
    case 'nullable': if (v !== null) collectRefs(desc.of, v, path, out); return;
    case 'list': v.forEach((x, i) => collectRefs(desc.of, x, `${path}[${i}]`, out)); return;
    case 'obj': for (const k of Object.keys(desc.shape)) collectRefs(desc.shape[k], v[k], `${path}.${k}`, out); return;
    default: return;
  }
}
async function describe(cwd, type, sha) {
  if (type === 'ref') return `record ${sha}: ${decodeRecord(await catCommit(cwd, sha)).kind}`;
  const s = await readSnapshot(cwd, sha, type === 'ws' ? 'workspace' : 'input');
  return `${s.kind} snapshot ${sha}, tree ${s.tree}`;
}
async function show([sha], { cwd, stdout }) {
  if (!sha || !/^[0-9a-f]{4,40}$/.test(sha)) throw new Refusal('show needs a record SHA');
  await requireRefs(cwd);
  const full = await git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], { cwd, expect: [0, 1] });
  if (full.code !== 0) throw new Refusal(`no commit ${sha}`);
  const commit = await catCommit(cwd, full.stdout.trim());
  const { kind, payload } = decodeRecord(commit);
  const lines = [commit.subject, `sha: ${full.stdout.trim()}`, `parent: ${commit.parents[0] ?? 'none'}`, JSON.stringify(payload, null, 2)];
  const refs = []; collectRefs(obj(SCHEMAS[kind]), payload, kind, refs);
  if (refs.length) lines.push('references:');
  for (const [path, type, value] of refs) lines.push(`  ${path}: ${await describe(cwd, type, value)}`);
  stdout.write(lines.join('\n') + '\n');
}
export const COMMANDS = { show: { usage: 'show <sha>', run: show } };
export function usage() {
  return ['usage: cairn <command> [args]', '', ...Object.values(COMMANDS).map((c) => `  cairn ${c.usage}`), '  cairn --help', ''].join('\n');
}
export async function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const [name, ...args] = argv;
  try {
    if (!name || name === '--help' || name === 'help') { stdout.write(usage()); return 0; }
    const cmd = COMMANDS[name];
    if (!cmd) throw new Refusal(`unknown command ${name}; run cairn --help`);
    await cmd.run(args, { cwd, stdout, stderr });
    return 0;
  } catch (e) {
    if (e instanceof NoVerdict) { stdout.write(`cairn: ${e.message}\n`); return 3; }
    stderr.write(`cairn: ${e.message.split('\n')[0]}\n`);
    return 1;
  }
}
```

```js
#!/usr/bin/env node
// bin/cairn.mjs
import { main } from '../lib/cli.mjs';
process.exitCode = await main(process.argv.slice(2));
```

- [ ] **Step 4: Run it**

Run: `chmod +x bin/cairn.mjs && node --test tests/*.test.mjs`. Expected: PASS, every file (44 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cli.mjs bin/cairn.mjs tests/cli.test.mjs
git commit -m "Add the cairn entry point with help, exit codes and show"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| Snapshot: commit on refs/cairn/snapshots, tree header, parent is the preceding snapshot, payload names the kind (2) | 9 |
| Input snapshot contains exactly one mechanism's declared inputs as in the working tree (2) | 10 |
| Workspace snapshot: tracked plus non-ignored untracked, excluding .git/** and .cairn/output/** (2) | 9 |
| Both kinds include dirty bytes without changing the index (2) | 6, 9 |
| The kind is checked at every reference; a synthetic input tree cannot be compared with a workspace tree (2) | 9, 10, 11 |
| Refuses a non-ignored untracked path matched by network_exclude or a built-in credential pattern; built-in list (2) | 9 (`exclude` parameter; settings wiring is plan 02 task 11) |
| Allowed workspace snapshot: start, keep or restore result; first-observed breach snapshot is not a base; newest allowed, never merely newest (2) | 10 (clean-preflight snapshots: plan 07 extends `ALLOWED_BASE_FIELDS`) |
| Durable refs written only by the kernel, never rewritten, compare-and-swap with expected old OID (2) | 4, 8, 9 |
| Records reference records by log SHA and code by kind-checked snapshot SHA (2) | 7 (`ref`, `ws`, `input` descriptors), 11 |
| Empty commit, subject `cairn: <kind> <target>`, restricted tokens (4) | 7, 8 |
| Body is one UTF-8 RFC 8785 canonical JSON object (4) | 2, 7 |
| Exactly two trailers; content never in a trailer (4) | 7 |
| Closed schema: required keys, no unknown or duplicate keys, fixed scalar types, ordered arrays, fixed-length lowercase hex (4) | 7 |
| Parser rejects invalid UTF-8 / control characters / noncanonical / digest mismatch / wrong field counts / out-of-range numbers (4) | 2, 7 (one test each) |
| Never delegates to git interpret-trailers (4) | 5 |
| Same rules apply to snapshot payloads (4) | 9 |
| cairn show renders records with references resolved (4) | 11 |
| Logical record schema table, 27 kinds (4) | 7 |
| Raw bytes as unpadded base64url (4) | 3, 7 (`b64` descriptor) |
| Exit codes 0 / 1 with `cairn: ` line / 3 with one line naming the continuation (overview) | 11 |

Left to other plans: ADR lines as canonical JSON (plan 06); the action lease ref and check lock (plan 04); the `git fetch` line naming the real authority remote (plan 12); the settings source of `network_exclude` (plan 02); the record writers themselves (plans 03 to 11, each adding a round-trip test for its kinds).
