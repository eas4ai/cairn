# Initialization and authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cairn init` establishes a project (Git, settings, authority remote, developer-auth mode, init record, durable ref roots), `cairn authorize` binds the three protected digests in one developer-authenticated record, the kernel refuses a protected-path change no authorization names, and `cairn decisions --read` writes its developer-authenticated log record.

**Architecture:** `lib/auth.mjs` owns the two authentication modes (detached Ed25519 signature over a canonical payload, or a controlling-terminal confirmation that records the Git author as evidence), the three protected digests, the `authorization` record and the `isAuthorized` question. `lib/init.mjs` owns `cairn init` and the `init` record. Both take their interactive parts (terminal confirmation, signature source, developer answers) as injected functions so tests never touch `/dev/tty`. Every "refuses" sentence in spec sections 2, 3 and 8 that concerns these paths is one test.

**Tech Stack:** Node 24, ES modules, `node:crypto` (`verify`, `createPublicKey`, `randomBytes`), `node:readline`, `node:fs`, `node --test`, `node:assert/strict`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 "Paths and authority" and the Settings bullets `signing_key` and `authority_remote`; section 3 "Project initialization"; section 4 table rows `init`, `authorization`, `read` and the sentence "`cairn authorize` binds the protected digests in one record; a settings change is a new authorization naming the new digest"; section 8 "Scope and protected state" and "Escalation" (developer runs `cairn decisions --read`).

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Developer-owned protected paths are `.cairn/settings.json`, `docs/spec/**` and `AGENTS.md`. After project initialization, an accepted version of one needs a developer authorization that names its before and after digests."
- "`origin` may be proposed but is never assumed."
- "With a key, developer-only records must verify. With `null`, the command requires an explicit controlling-terminal confirmation and records the Git author; this is evidence, not cryptographic authentication."
- "Protection begins at the settings digest in that record. Initialization makes no evaluator call."
- "Re-running initialization against the same identity is idempotent."
- "In explicit unsigned-local mode the controlling-terminal confirmation and Git author are evidence only; Cairn says so wherever it reports the decision."
- Exit 1 with one stderr line beginning `cairn: ` for every refusal.

Consumed from plans 01 and 02, by the names in overview.md: `canonicalize`, `sha256`, `b64url`, `unb64url` (lib/canon.mjs); `git`, `readRef`, `updateRefCAS` (lib/gitx.mjs); `appendRecord`, `readLog`, `decodeRecord` (lib/records.mjs); `writeWorkspaceSnapshot` (lib/snapshots.mjs); `PROTECTED`, `matchGlob` (lib/paths.mjs); `loadSettings`, `validateSettings`, `SETTINGS_SCHEMA` (lib/settings.mjs). Test helper from plan 01: `makeRepo()` in `tests/helpers/repo.mjs` returns `{dir, git, write, commit, readRef, remove}`, a throwaway repository under `os.tmpdir()` on branch `main` with author `Cairn Test <test@example.invalid>`; each test file below wraps it as `repoWith(files)`, which writes and commits the fixture files and returns `{cwd, repo}`.

## Record shapes this plan writes

Payload keys are closed; plan 01's schema table lists these exact keys.

```
init          {settings_digest, authority_remote: string|null, auth_mode: 'signed'|'unsigned-local'}
authorization {spec_digest, agreement_digest, settings_digest, evidence, decision: string|null, intent: string|null}
read          {decision, evidence}
evidence (signed)         {mode:'signed', purpose, subject, nonce, signature}
evidence (unsigned-local) {mode:'unsigned-local', purpose, subject, nonce, author:{name,email}, confirmed:true}
```

`subject` is the canonical string the developer authenticates: for `authorize` it is `canonicalize({spec, agreement, settings})` of the three digests; for `read` it is the decision id. The signed payload bytes are `canonicalize({purpose, subject, nonce})` in UTF-8.

---

### Task 1: Protected digests

**Files:**
- Create: `lib/auth.mjs`
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Consumes: `sha256`, `canonicalize` (lib/canon.mjs); `loadSettings` (lib/settings.mjs).
- Produces: `specDigest(cwd) -> 'sha256:...'`, `agreementDigest(cwd) -> 'sha256:...'|null`, `protectedDigests(cwd) -> {spec, agreement, settings}`.

The spec digest is defined exactly as: walk `docs/spec` recursively, take every regular file (symlinks and directories are skipped), sort the slash-separated relative paths by UTF-8 byte order, and compute `sha256(canonicalize(entries))` where `entries` is the array `[[path, sha256(fileBytes)], ...]` in that order. An absent or empty `docs/spec` digests the empty array. `agreementDigest` is `sha256` of the bytes of `AGENTS.md`, or `null` when the file is absent.

- [ ] **Step 1: Write the failing test**

```js
// tests/auth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
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
import { sha256, canonicalize } from '../lib/canon.mjs';
import { specDigest, agreementDigest, protectedDigests } from '../lib/auth.mjs';

const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: [],
  interfaces: [], data: [], network_exclude: [], signing_key: null, attribution: 'forbidden',
  harness: {}, typesafeai: { enabled: false, mode: 'shadow', model: null } });

test('specDigest is the digest of sorted [path, digest] pairs', async () => {
  const { cwd } = await repoWith({ 'docs/spec/b.md': 'B\n', 'docs/spec/a/x.md': 'X\n' });
  const expected = sha256(canonicalize([
    ['docs/spec/a/x.md', sha256('X\n')], ['docs/spec/b.md', sha256('B\n')]]));
  assert.equal(specDigest(cwd), expected);
  writeFileSync(join(cwd, 'docs/spec/b.md'), 'changed\n');
  assert.notEqual(specDigest(cwd), expected);
});

test('specDigest ignores docs/spec/roadmap.md, which the kernel edits at start and promote', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove); const cwd = repo.dir;
  await repo.write('docs/spec/overview.md', '# keystone\n');
  const before = specDigest(cwd);
  await repo.write('docs/spec/roadmap.md', 'Current: hooks\n');
  assert.equal(specDigest(cwd), before);
});
test('specDigest of a missing docs/spec is the empty array digest', async () => {
  const { cwd } = await repoWith({});
  assert.equal(specDigest(cwd), sha256(canonicalize([])));
});

test('protectedDigests carries agreement null when AGENTS.md is absent', async () => {
  const { cwd } = await repoWith({ '.cairn/settings.json': SETTINGS });
  const d = protectedDigests(cwd);
  assert.equal(d.agreement, null);
  assert.match(d.settings, /^sha256:[0-9a-f]{64}$/);
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'AGENTS.md'), '# agreement\n');
  assert.equal(agreementDigest(cwd), sha256('# agreement\n'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/auth.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/auth.mjs
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, canonicalize } from './canon.mjs';
import { loadSettings } from './settings.mjs';

export class AuthError extends Error {}

function walk(root, rel, out) {
  const abs = rel ? join(root, rel) : root;
  for (const name of readdirSync(abs)) {
    const p = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(root, p));
    if (st.isDirectory()) walk(root, p, out);
    else if (st.isFile()) out.push(p);
  }
}

export function specDigest(cwd) {
  const files = [];
  if (existsSync(join(cwd, 'docs/spec'))) walk(cwd, 'docs/spec', files);
  // The roadmap is kernel-edited at start and promote (section 2, protected paths); it is bound structurally, not by digest.
  const kept = files.filter((f) => f !== 'docs/spec/roadmap.md');
  kept.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return sha256(canonicalize(kept.map((p) => [p, sha256(readFileSync(join(cwd, p)))])));
}

export function agreementDigest(cwd) {
  const p = join(cwd, 'AGENTS.md');
  return existsSync(p) ? sha256(readFileSync(p)) : null;
}

export function protectedDigests(cwd) {
  return { spec: specDigest(cwd), agreement: agreementDigest(cwd), settings: loadSettings(cwd).digest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auth.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.mjs tests/auth.test.mjs
git commit -m "Compute the three protected digests: spec tree, working agreement, settings"
```

---

### Task 2: Signed developer authentication

**Files:**
- Modify: `lib/auth.mjs`
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Consumes: `canonicalize`, `b64url`, `unb64url` (lib/canon.mjs); `node:crypto` `verify`, `createPublicKey`, `randomBytes`.
- Produces: `authenticateDeveloper(cwd, settings, {purpose, subject, sign, confirm, nonce}) -> evidence`; `verifyEvidence(settings, evidence) -> boolean`; `signingPayload({purpose, subject, nonce}) -> Uint8Array`; `describeEvidence(evidence) -> string`.

`settings.signing_key` is a PEM SPKI public key string (Ed25519). `sign` is an injected `async (payloadBytes) => Uint8Array` that produces the detached signature; the CLI default (Task 7) reads a base64url signature from `--signature` or from `CAIRN_SIGNATURE`, after printing the payload the developer must sign with `openssl pkeyutl -sign -inkey <private.pem> -rawin`. Tests inject a `sign` built from a throwaway key pair.

- [ ] **Step 1: Write the failing test**

```js
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { authenticateDeveloper, verifyEvidence, signingPayload, describeEvidence } from '../lib/auth.mjs';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }),
    sign: async (bytes) => new Uint8Array(cryptoSign(null, bytes, privateKey)) };
}

test('signed mode: a detached signature over the canonical payload verifies', async () => {
  const { cwd } = await repoWith({});
  const { pem, sign } = keyPair();
  const settings = { signing_key: pem };
  const ev = await authenticateDeveloper(cwd, settings, { purpose: 'authorize', subject: 's', sign, nonce: 'n1' });
  assert.equal(ev.mode, 'signed');
  assert.deepEqual(Object.keys(ev).sort(), ['mode', 'nonce', 'purpose', 'signature', 'subject']);
  assert.equal(verifyEvidence(settings, ev), true);
  assert.equal(verifyEvidence(settings, { ...ev, subject: 'other' }), false);
  assert.equal(verifyEvidence({ signing_key: keyPair().pem }, ev), false);
  assert.equal(describeEvidence(ev), 'signed by the developer key');
});

test('signed mode: a bad signature is refused, not recorded', async () => {
  const { cwd } = await repoWith({});
  const { pem } = keyPair();
  const bad = async (bytes) => new Uint8Array(64);
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: pem }, { purpose: 'authorize', subject: 's', sign: bad, nonce: 'n' }),
    /^AuthError: cairn: the signature does not verify against signing_key/);
});

test('signingPayload is the canonical JSON of purpose, subject and nonce', () => {
  const bytes = signingPayload({ purpose: 'read', subject: 'D1', nonce: 'x' });
  assert.equal(Buffer.from(bytes).toString(), '{"nonce":"x","purpose":"read","subject":"D1"}');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL, `authenticateDeveloper is not a function` (SyntaxError on the missing export).

- [ ] **Step 3: Write minimal implementation**

```js
import { verify as cryptoVerify, createPublicKey, randomBytes } from 'node:crypto';
import { b64url, unb64url } from './canon.mjs';

export function signingPayload({ purpose, subject, nonce }) {
  return new TextEncoder().encode(canonicalize({ purpose, subject, nonce }));
}

function verifySigned(pem, ev) {
  try {
    const key = createPublicKey(pem);
    return cryptoVerify(null, signingPayload(ev), key, unb64url(ev.signature));
  } catch { return false; }
}

export function verifyEvidence(settings, ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (settings.signing_key === null || settings.signing_key === undefined) {
    return ev.mode === 'unsigned-local' && ev.confirmed === true
      && typeof ev.author?.name === 'string' && typeof ev.author?.email === 'string';
  }
  return ev.mode === 'signed' && typeof ev.signature === 'string' && verifySigned(settings.signing_key, ev);
}

export function describeEvidence(ev) {
  return ev.mode === 'signed' ? 'signed by the developer key'
    : `unsigned-local: terminal confirmation by ${ev.author.name} <${ev.author.email}>; evidence, not authentication`;
}

export async function authenticateDeveloper(cwd, settings, { purpose, subject, sign, confirm, nonce } = {}) {
  nonce = nonce ?? b64url(randomBytes(16));
  if (settings.signing_key !== null && settings.signing_key !== undefined) {
    if (typeof sign !== 'function') throw new AuthError('cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE');
    const signature = b64url(await sign(signingPayload({ purpose, subject, nonce })));
    const ev = { mode: 'signed', purpose, subject, nonce, signature };
    if (!verifySigned(settings.signing_key, ev)) throw new AuthError('cairn: the signature does not verify against signing_key');
    return ev;
  }
  return unsignedLocal(cwd, { purpose, subject, nonce, confirm }); // Task 3
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auth.test.mjs`
Expected: PASS for the three new tests (the unsigned-local path is not exercised yet; `unsignedLocal` is defined in Task 3, so add `async function unsignedLocal() { throw new AuthError('cairn: unsigned-local not built'); }` for now and replace it in Task 3).

- [ ] **Step 5: Commit**

```bash
git add lib/auth.mjs tests/auth.test.mjs
git commit -m "Verify a detached developer signature over the canonical authentication payload"
```

---

### Task 3: Unsigned-local authentication through the controlling terminal

**Files:**
- Modify: `lib/auth.mjs`
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Consumes: `git` (lib/gitx.mjs); `node:readline`, `node:fs` `openSync`.
- Produces: `ttyConfirm(prompt) -> Promise<boolean>` (the default `confirm`; opens `/dev/tty`, refuses without one); `authenticateDeveloper` in `signing_key: null` mode returns unsigned-local evidence naming the Git author.

- [ ] **Step 1: Write the failing test**

```js
test('unsigned-local: terminal confirmation records the Git author as evidence', async () => {
  const { cwd } = await repoWith({});
  const prompts = [];
  const confirm = async (prompt) => { prompts.push(prompt); return true; };
  const ev = await authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', confirm, nonce: 'n' });
  assert.deepEqual(ev, { mode: 'unsigned-local', purpose: 'read', subject: 'D1', nonce: 'n',
    author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true });
  assert.match(prompts[0], /read D1/);
  assert.equal(verifyEvidence({ signing_key: null }, ev), true);
  assert.match(describeEvidence(ev), /evidence, not authentication/);
});

test('unsigned-local: a declined confirmation is refused', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', confirm: async () => false }),
    /^AuthError: cairn: the developer did not confirm read D1/);
});

test('unsigned-local: no controlling terminal is refused', async () => {
  const { cwd } = await repoWith({});
  const noTty = async () => { throw new AuthError('cairn: no controlling terminal; unsigned-local confirmation needs a TTY'); };
  await assert.rejects(
    authenticateDeveloper(cwd, { signing_key: null }, { purpose: 'read', subject: 'D1', confirm: noTty }),
    /no controlling terminal/);
});

test('verifyEvidence refuses unsigned-local evidence when a signing key is set', () => {
  const ev = { mode: 'unsigned-local', purpose: 'read', subject: 'D1', nonce: 'n',
    author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true };
  assert.equal(verifyEvidence({ signing_key: keyPair().pem }, ev), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL, `cairn: unsigned-local not built`.

- [ ] **Step 3: Write minimal implementation**

Replace the stub from Task 2 with:

```js
import { openSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { ReadStream, WriteStream } from 'node:tty';
import { git } from './gitx.mjs';

export async function ttyConfirm(prompt) {
  let fd;
  try { fd = openSync('/dev/tty', 'r+'); }
  catch { throw new AuthError('cairn: no controlling terminal; unsigned-local confirmation needs a TTY'); }
  const input = new ReadStream(fd); const output = new WriteStream(fd);
  const rl = createInterface({ input, output });
  try {
    const answer = await new Promise((res) => rl.question(`${prompt}\nType yes to confirm: `, res));
    return answer.trim() === 'yes';
  } finally { rl.close(); input.destroy(); output.destroy(); closeSync(fd); }
}

async function gitAuthor(cwd) {
  // git var honours GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL as well as user.name and user.email.
  const r = await git(['var', 'GIT_AUTHOR_IDENT'], { cwd });
  const m = /^(.*?) <([^>]*)> \d+ [-+]\d{4}$/.exec(r.stdout.trim());
  if (r.code !== 0 || !m || !m[1] || !m[2]) throw new AuthError('cairn: unsigned-local evidence needs a Git author (user.name and user.email)');
  return { name: m[1], email: m[2] };
}

async function unsignedLocal(cwd, { purpose, subject, nonce, confirm = ttyConfirm }) {
  const author = await gitAuthor(cwd);
  const ok = await confirm(`cairn ${purpose} ${subject}: confirm as ${author.name} <${author.email}> (unsigned-local; evidence, not authentication)`);
  if (!ok) throw new AuthError(`cairn: the developer did not confirm ${purpose} ${subject}`);
  return { mode: 'unsigned-local', purpose, subject, nonce, author, confirmed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auth.test.mjs`
Expected: PASS, all tests so far.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.mjs tests/auth.test.mjs
git commit -m "Unsigned-local authentication: confirm on the controlling terminal and record the Git author"
```

---

### Task 4: The authorization record

**Files:**
- Modify: `lib/auth.mjs`
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Consumes: `appendRecord`, `readLog`, `decodeRecord` (lib/records.mjs); `catCommit` (lib/gitx.mjs).
- Produces: `authorize(cwd, {sign, confirm, decision} = {}) -> sha`; `authorizations(log) -> [{sha, payload}]` (init record first, then every authorization, oldest first); `latestProtected(log) -> {spec, agreement, settings}` (digests the newest authorization binds; before any authorization, spec and agreement are `null` and settings is the init record's).

`authorize` refuses when `refs/cairn/log` has no init record ("cairn: run cairn init first"), when `docs/spec` or `AGENTS.md` is absent, and when the evidence does not verify.

- [ ] **Step 1: Write the failing test**

```js
import { appendRecord, readLog, decodeRecord } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { authorize, authorizations, latestProtected } from '../lib/auth.mjs';
import { init } from '../lib/init.mjs';

const yes = async () => true;
const BASE = { '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# agreement\n', 'docs/spec/overview.md': '# keystone\n' };
async function initialized(files = BASE) {
  const { cwd } = await repoWith(files);
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  return cwd;
}

test('authorize writes one record binding the three digests with verified evidence', async () => {
  const cwd = await initialized();
  const sha = await authorize(cwd, { confirm: yes });
  const log = await readLog(cwd);
  const rec = log.at(-1);
  assert.equal(rec.sha, sha);
  assert.equal(rec.kind, 'authorization');
  const d = protectedDigests(cwd);
  assert.equal(rec.payload.spec_digest, d.spec);
  assert.equal(rec.payload.agreement_digest, d.agreement);
  assert.equal(rec.payload.settings_digest, d.settings);
  assert.equal(rec.payload.decision, null);
  assert.equal(rec.payload.intent, null);
  assert.equal(rec.payload.evidence.mode, 'unsigned-local');
  assert.equal(rec.payload.evidence.subject, canonicalize({ spec: d.spec, agreement: d.agreement, settings: d.settings }));
  assert.equal((await catCommit(cwd, sha)).subject, 'cairn: authorization protected');
  assert.deepEqual(decodeRecord(await catCommit(cwd, sha)).payload, rec.payload);
  assert.deepEqual(latestProtected(log), d);
  assert.equal(authorizations(log).length, 2);
});

test('authorize refuses before init', async () => {
  const { cwd } = await repoWith(BASE);
  await assert.rejects(authorize(cwd, { confirm: yes }), /^AuthError: cairn: run cairn init first/);
});

test('authorize refuses without AGENTS.md', async () => {
  const cwd = await initialized({ '.cairn/settings.json': SETTINGS, 'docs/spec/overview.md': '# k\n' });
  await assert.rejects(authorize(cwd, { confirm: yes }), /cairn: AGENTS.md is missing; authorize binds the working agreement/);
});

test('authorize refuses a declined confirmation and writes nothing', async () => {
  const cwd = await initialized();
  const before = (await readLog(cwd)).length;
  await assert.rejects(authorize(cwd, { confirm: async () => false }), /did not confirm/);
  assert.equal((await readLog(cwd)).length, before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/init.mjs'` (init arrives in Task 5; write the `authorize` code now and keep this test failing until Task 5 passes it, or temporarily run only the "refuses before init" test with `--test-name-pattern 'before init'`).

- [ ] **Step 3: Write minimal implementation**

```js
import { appendRecord, readLog } from './records.mjs';

export function authorizations(log) {
  return log.filter((r) => r.kind === 'init' || r.kind === 'authorization');
}

export function latestProtected(log) {
  const recs = authorizations(log);
  const last = recs.at(-1);
  if (!last) return null;
  if (last.kind === 'init') return { spec: null, agreement: null, settings: last.payload.settings_digest };
  return { spec: last.payload.spec_digest, agreement: last.payload.agreement_digest, settings: last.payload.settings_digest };
}

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
  return appendRecord(cwd, 'authorization', 'protected',
    { spec_digest: d.spec, agreement_digest: d.agreement, settings_digest: d.settings, evidence, decision, intent: null });
}
```

`intent` is `null` here; plan 04 makes `authorize` a multi-store transaction and sets it to the command-intent SHA.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern 'before init' tests/auth.test.mjs`
Expected: PASS for that test; the others pass after Task 5.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.mjs tests/auth.test.mjs
git commit -m "Write the authorization record binding the spec, agreement and settings digests"
```

---

### Task 5: cairn init

**Files:**
- Create: `lib/init.mjs`
- Test: `tests/init.test.mjs`

**Interfaces:**
- Consumes: `git`, `readRef`, `updateRefCAS` (lib/gitx.mjs); `appendRecord`, `readLog` (lib/records.mjs); `writeWorkspaceSnapshot` (lib/snapshots.mjs); `loadSettings`, `validateSettings`, `SETTINGS_SCHEMA` (lib/settings.mjs); `authenticateDeveloper`, `verifyEvidence` (lib/auth.mjs).
- Produces: `init(cwd, answers) -> {sha, created: boolean}`; `DEFAULT_SETTINGS(remote, key) -> object`; `InitError`.

`answers` are injected developer interactions: `confirmRemote(candidates) -> string|null` (the developer names the authority remote or returns `null` for explicit local-only; `candidates` lists `git remote` names, `origin` is proposed, never assumed); `chooseKey() -> pem|null` (`null` is the explicit choice of unsigned-local evidence); `confirm` (the terminal confirmation passed through to `authenticateDeveloper`); `confirmDigest(digest) -> boolean` (adoption of existing settings). The CLI (Task 7) supplies terminal-backed defaults.

The sequence, in order and each step idempotent: (1) `git init` when `.git` is absent; (2) settings: if `.cairn/settings.json` exists, `loadSettings` validates it (a `SettingsError` is rethrown, listing every refusal); else write `DEFAULT_SETTINGS`; (3) the authority remote: an existing settings file's `authority_remote` must be `null` or a configured remote, else refuse; a new file takes `confirmRemote`; (4) the signing key: existing settings keep theirs; a new file takes `chooseKey`; (5) refs: if `refs/cairn/log` exists, read its init record; same settings digest means idempotent return; a different digest means "settings-without-refs" does not apply and the repair is `cairn authorize`; if no log ref but settings pre-existed, adopt only after `confirmDigest(digest)`; (6) authenticate the developer for purpose `init` with subject the settings digest; (7) write the init record with CAS from `null` and a root workspace snapshot on `refs/cairn/snapshots` with CAS from `null`.

- [ ] **Step 1: Write the failing test**

```js
// tests/init.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { readRef, git } from '../lib/gitx.mjs';
import { readLog } from '../lib/records.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { init, DEFAULT_SETTINGS } from '../lib/init.mjs';

const yes = async () => true;
const answers = (over = {}) => ({ confirmRemote: async () => null, chooseKey: async () => null,
  confirm: yes, confirmDigest: yes, ...over });

test('init on a plain directory initializes Git, writes settings, init record and ref roots', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cairn-init-'));
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 'Cairn Test', GIT_AUTHOR_EMAIL: 'test@example.invalid' });
  t.after(() => { delete process.env.GIT_AUTHOR_NAME; delete process.env.GIT_AUTHOR_EMAIL; Object.assign(process.env, saved); rmSync(cwd, { recursive: true, force: true }); });
  const r = await init(cwd, answers());
  assert.equal(r.created, true);
  assert.ok(existsSync(join(cwd, '.git')));
  const { settings, digest } = loadSettings(cwd);
  assert.equal(settings.authority_remote, null);
  assert.equal(settings.signing_key, null);
  const log = await readLog(cwd);
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, 'init');
  assert.deepEqual(log[0].payload, { settings_digest: digest, authority_remote: null, auth_mode: 'unsigned-local' });
  assert.equal(log[0].payload.evidence, undefined);
  assert.ok(await readRef(cwd, 'refs/cairn/log'));
  assert.ok(await readRef(cwd, 'refs/cairn/snapshots'));
});

test('init is idempotent on the same identity', async () => {
  const { cwd } = await repoWith({});
  const a = await init(cwd, answers());
  const b = await init(cwd, answers({ confirm: async () => { throw new Error('must not ask again'); } }));
  assert.equal(b.created, false);
  assert.equal(a.sha, b.sha);
  assert.equal((await readLog(cwd)).length, 1);
});

test('init never assumes origin: the developer must name the remote', async () => {
  const { cwd } = await repoWith({});
  await git(['remote', 'add', 'origin', 'https://example.invalid/r.git'], { cwd });
  const seen = [];
  await init(cwd, answers({ confirmRemote: async (c) => { seen.push(c); return 'origin'; } }));
  assert.deepEqual(seen, [['origin']]);
  assert.equal(loadSettings(cwd).settings.authority_remote, 'origin');
  assert.equal((await readLog(cwd))[0].payload.authority_remote, 'origin');
});

test('init refuses an authority remote that is not configured', async () => {
  const { cwd } = await repoWith({});
  await assert.rejects(init(cwd, answers({ confirmRemote: async () => 'upstream' })),
    /^InitError: cairn: authority_remote upstream is not a configured remote/);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
});

test('init with a chosen signing key records auth_mode signed', async () => {
  const { cwd } = await repoWith({});
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  await init(cwd, answers({ chooseKey: async () => pem,
    sign: async (b) => new Uint8Array(sign(null, b, privateKey)) }));
  assert.equal((await readLog(cwd))[0].payload.auth_mode, 'signed');
});

test('settings without refs are adopted only after the developer confirms the digest', async () => {
  const s = JSON.stringify(DEFAULT_SETTINGS(null, null));
  const { cwd } = await repoWith({ '.cairn/settings.json': s });
  const asked = [];
  await assert.rejects(init(cwd, answers({ confirmDigest: async (d) => { asked.push(d); return false; } })),
    /cairn: existing settings not confirmed/);
  assert.equal(asked[0], loadSettings(cwd).digest);
  assert.equal(await readRef(cwd, 'refs/cairn/log'), null);
  const r = await init(cwd, answers());
  assert.equal(r.created, true);
});

test('refs without settings refuse and name repair', async () => {
  const { cwd } = await repoWith({});
  await init(cwd, answers());
  const digest = loadSettings(cwd).digest;
  rmSync(join(cwd, '.cairn/settings.json'));
  await assert.rejects(init(cwd, answers()),
    new RegExp(`cairn: refs/cairn/log exists but .cairn/settings.json is missing; restore the file whose digest is ${digest} \\(git checkout -- .cairn/settings.json\\) or run cairn authorize after writing a new one`));
});

test('init refuses invalid settings and lists every refusal', async () => {
  const bad = JSON.stringify({ schema: 1, unknown_field: 1 });
  const { cwd } = await repoWith({ '.cairn/settings.json': bad });
  await assert.rejects(init(cwd, answers()), /unknown_field/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/init.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/init.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/init.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, readRef } from './gitx.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { loadSettings, SETTINGS_SCHEMA } from './settings.mjs';
import { authenticateDeveloper, verifyEvidence } from './auth.mjs';

export class InitError extends Error {}

export function DEFAULT_SETTINGS(remote, key) {
  return { schema: SETTINGS_SCHEMA, authority_remote: remote, outside: [], source: [], interfaces: [],
    data: [], network_exclude: [], signing_key: key, attribution: 'forbidden', harness: {},
    typesafeai: { enabled: false, mode: 'shadow', model: null } };
}

async function remotes(cwd) {
  return (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
}

export async function init(cwd, { confirmRemote, chooseKey, confirm, confirmDigest, sign } = {}) {
  if (!existsSync(join(cwd, '.git'))) await git(['init', '-q'], { cwd });
  const settingsPath = join(cwd, '.cairn/settings.json');
  const hadSettings = existsSync(settingsPath);
  const logHead = await readRef(cwd, 'refs/cairn/log');
  if (logHead && !hadSettings) {
    const rec = (await readLog(cwd)).find((r) => r.kind === 'init');
    throw new InitError(`cairn: refs/cairn/log exists but .cairn/settings.json is missing; restore the file whose digest is ${rec.payload.settings_digest} (git checkout -- .cairn/settings.json) or run cairn authorize after writing a new one`);
  }
  const names = await remotes(cwd);
  if (!hadSettings) {
    const remote = await confirmRemote(names);
    if (remote !== null && !names.includes(remote)) throw new InitError(`cairn: authority_remote ${remote} is not a configured remote`);
    const key = await chooseKey();
    mkdirSync(join(cwd, '.cairn'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS(remote, key), null, 2) + '\n');
  }
  const { settings, digest } = loadSettings(cwd); // throws SettingsError listing every refusal
  if (settings.authority_remote !== null && !names.includes(settings.authority_remote)) {
    throw new InitError(`cairn: authority_remote ${settings.authority_remote} is not a configured remote`);
  }
  if (logHead) {
    const rec = (await readLog(cwd)).find((r) => r.kind === 'init');
    if (rec.payload.settings_digest === digest) return { sha: rec.sha, created: false };
    throw new InitError(`cairn: settings digest ${digest} differs from the init record's ${rec.payload.settings_digest}; a settings change is a new authorization: run cairn authorize`);
  }
  if (hadSettings && !(await confirmDigest(digest))) throw new InitError(`cairn: existing settings not confirmed at digest ${digest}`);
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'init', subject: digest, sign, confirm });
  if (!verifyEvidence(settings, evidence)) throw new InitError('cairn: developer evidence does not verify');
  const auth_mode = settings.signing_key === null ? 'unsigned-local' : 'signed';
  const sha = await appendRecord(cwd, 'init', 'project', { settings_digest: digest, authority_remote: settings.authority_remote, auth_mode });
  if (!(await readRef(cwd, 'refs/cairn/snapshots'))) await writeWorkspaceSnapshot(cwd);
  return { sha, created: true };
}
```

Note: `appendRecord` performs the CAS from `null` on `refs/cairn/log`, and `writeWorkspaceSnapshot` performs it on `refs/cairn/snapshots`; a concurrent init loses the CAS and its `CasError` is the refusal. The init record carries the evidence's mode, not the evidence itself; the developer's confirmation at init is the act, and the digest it confirmed is the record's `settings_digest`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/init.test.mjs tests/auth.test.mjs`
Expected: PASS, including the Task 4 tests that needed `init`.

- [ ] **Step 5: Commit**

```bash
git add lib/init.mjs tests/init.test.mjs
git commit -m "cairn init: settings, confirmed remote, chosen auth mode, init record and ref roots"
```

---

### Task 6: Protected-path enforcement

**Files:**
- Modify: `lib/auth.mjs`
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Consumes: `PROTECTED`, `matchGlob` (lib/paths.mjs); `readLog` (lib/records.mjs).
- Produces: `protectedClass(path) -> 'spec'|'agreement'|'settings'|null`; `isAuthorized(cwd, path, beforeDigest, afterDigest) -> Promise<boolean>`; `refuseUnauthorizedProtected(cwd, log) -> void` (throws `AuthError` naming the first protected class whose current digest no authorization binds). Plan 06's `start` and plan 07's `preflight` call `refuseUnauthorizedProtected`; plan 07 also calls `isAuthorized` per path.

`isAuthorized` is true when some authorization record binds `afterDigest` for the path's class and the record before it in the `authorizations(log)` chain (an earlier authorization, or the init record for the settings class) binds `beforeDigest`. For the spec and agreement classes the init record binds `null`, so the first authorization after init satisfies `beforeDigest === null`. A settings path whose after digest equals the init record's digest is authorized with `beforeDigest === null` ("protection begins at the settings digest in that record").

- [ ] **Step 1: Write the failing test**

```js
import { isAuthorized, refuseUnauthorizedProtected, protectedClass } from '../lib/auth.mjs';

test('protectedClass names the three developer-owned classes', () => {
  assert.equal(protectedClass('.cairn/settings.json'), 'settings');
  assert.equal(protectedClass('AGENTS.md'), 'agreement');
  assert.equal(protectedClass('docs/spec/a/b.md'), 'spec');
  assert.equal(protectedClass('docs/decisions.jsonl'), null);
  assert.equal(protectedClass('src/x.mjs'), null);
});

test('a protected change is authorized only by a record naming its before and after digests', async () => {
  const cwd = await initialized();
  const log0 = await readLog(cwd);
  const initDigest = log0[0].payload.settings_digest;
  assert.equal(await isAuthorized(cwd, '.cairn/settings.json', null, initDigest), true);
  const d1 = protectedDigests(cwd);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d1.agreement), false);
  await authorize(cwd, { confirm: yes });
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d1.agreement), true);
  assert.equal(await isAuthorized(cwd, 'docs/spec/overview.md', null, d1.spec), true);
  writeFileSync(join(cwd, 'AGENTS.md'), '# changed\n');
  const d2 = protectedDigests(cwd);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', d1.agreement, d2.agreement), false);
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)),
    /^AuthError: cairn: AGENTS.md changed to sha256:[0-9a-f]{64} without a developer authorization; run cairn authorize/);
  await authorize(cwd, { confirm: yes });
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', d1.agreement, d2.agreement), true);
  assert.equal(await isAuthorized(cwd, 'AGENTS.md', null, d2.agreement), false, 'before digest must match the chain');
  await refuseUnauthorizedProtected(cwd, await readLog(cwd));
});

test('a settings change needs a new authorization naming the new digest', async () => {
  const cwd = await initialized();
  await authorize(cwd, { confirm: yes });
  const s = JSON.parse(SETTINGS); s.outside = ['README.md'];
  writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(s));
  await assert.rejects(refuseUnauthorizedProtected(cwd, await readLog(cwd)), /\.cairn\/settings\.json changed to/);
  await authorize(cwd, { confirm: yes });
  await refuseUnauthorizedProtected(cwd, await readLog(cwd));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL, `isAuthorized is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
import { matchGlob } from './paths.mjs';

export function protectedClass(p) {
  if (p === '.cairn/settings.json') return 'settings';
  if (p === 'AGENTS.md') return 'agreement';
  if (matchGlob('docs/spec/**', p)) return 'spec';
  return null;
}

const FIELD = { spec: 'spec_digest', agreement: 'agreement_digest', settings: 'settings_digest' };

function boundDigest(rec, cls) {
  if (rec.kind === 'init') return cls === 'settings' ? rec.payload.settings_digest : null;
  return rec.payload[FIELD[cls]];
}

export async function isAuthorized(cwd, path, beforeDigest, afterDigest) {
  const cls = protectedClass(path);
  if (!cls) return true;
  const chain = authorizations(await readLog(cwd));
  for (let i = 0; i < chain.length; i++) {
    if (boundDigest(chain[i], cls) !== afterDigest) continue;
    const prev = i === 0 ? null : boundDigest(chain[i - 1], cls);
    if (prev === beforeDigest) return true;
  }
  return false;
}

export function refuseUnauthorizedProtected(cwd, log) {
  const bound = latestProtected(log);
  if (!bound) throw new AuthError('cairn: run cairn init first');
  const now = protectedDigests(cwd);
  const names = { spec: 'docs/spec', agreement: 'AGENTS.md', settings: '.cairn/settings.json' };
  for (const cls of ['settings', 'agreement', 'spec']) {
    if (now[cls] !== bound[cls]) {
      throw new AuthError(`cairn: ${names[cls]} changed to ${now[cls]} without a developer authorization; run cairn authorize`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/auth.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.mjs tests/auth.test.mjs
git commit -m "Refuse a protected path change that no authorization binds by before and after digest"
```

---

### Task 7: The read record and the command handlers

**Files:**
- Modify: `lib/auth.mjs`, `lib/init.mjs`
- Modify: `lib/cli.mjs` (add three entries to plan 01's command table)
- Test: `tests/auth.test.mjs`, `tests/init.test.mjs`

**Interfaces:**
- Consumes: `appendRecord` (lib/records.mjs); `ttyConfirm` (this plan).
- Produces: `readDecision(cwd, decisionId, {sign, confirm}) -> sha` writing the `read` log record; `runInit(argv, io)`, `runAuthorize(argv, io)`, `runDecisionsRead(argv, io)`: each returns an exit code and writes one `cairn: ` line to `io.stderr` on refusal. Plan 06's `appendDecision(cwd, line)` writes the ADR `read` line naming the record this returns.

The CLI defaults: `sign` reads `--signature <b64url>` or `CAIRN_SIGNATURE`, after `io.stdout` prints `cairn: sign this payload: <canonical payload>` and `cairn: e.g. openssl pkeyutl -sign -rawin -inkey dev.pem | base64url` when neither is present and exits 1; `confirm` is `ttyConfirm`; `confirmRemote` prompts `authority remote [<names>] or local-only: ` via `ttyConfirm`-style readline and accepts a name or `local-only`; `chooseKey` prompts `signing key PEM path or unsigned-local: `; `confirmDigest` prompts `adopt existing settings at <digest>? `.

- [ ] **Step 1: Write the failing test**

```js
import { readDecision, runDecisionsRead } from '../lib/auth.mjs';

test('decisions --read writes a read record with developer evidence', async () => {
  const cwd = await initialized();
  const sha = await readDecision(cwd, '01J0000000000000000000ABCD', { confirm: yes });
  const rec = (await readLog(cwd)).at(-1);
  assert.equal(rec.sha, sha);
  assert.equal(rec.kind, 'read');
  assert.equal(rec.target, '01J0000000000000000000ABCD');
  assert.equal(rec.payload.decision, '01J0000000000000000000ABCD');
  assert.equal(rec.payload.evidence.purpose, 'read');
  assert.equal(rec.payload.evidence.subject, '01J0000000000000000000ABCD');
  assert.equal(verifyEvidence({ signing_key: null }, rec.payload.evidence), true);
});

test('decisions --read refuses a malformed decision id and an unconfirmed read', async () => {
  const cwd = await initialized();
  await assert.rejects(readDecision(cwd, 'not-a-ulid', { confirm: yes }), /^AuthError: cairn: decision id must be a 26-character ULID/);
  await assert.rejects(readDecision(cwd, '01J0000000000000000000ABCD', { confirm: async () => false }), /did not confirm read/);
});

test('runDecisionsRead exits 1 with one cairn: line when the signature is missing in signed mode', async () => {
  const { cwd } = await repoWith(BASE);
  const { generateKeyPairSync } = await import('node:crypto');
  const pem = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  const s = JSON.parse(SETTINGS); s.signing_key = pem;
  writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(s));
  const err = []; const out = [];
  const io = { cwd, env: {}, stdout: (l) => out.push(l), stderr: (l) => err.push(l) };
  const code = await runDecisionsRead(['--read', '01J0000000000000000000ABCD'], io);
  assert.equal(code, 1);
  assert.equal(err.length, 1);
  assert.match(err[0], /^cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE/);
  assert.match(out[0], /^cairn: sign this payload: \{"nonce":/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL, `readDecision is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/auth.mjs additions
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export async function readDecision(cwd, id, { sign, confirm } = {}) {
  if (!ULID.test(id)) throw new AuthError('cairn: decision id must be a 26-character ULID');
  const { settings } = loadSettings(cwd);
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'read', subject: id, sign, confirm });
  if (!verifyEvidence(settings, evidence)) throw new AuthError('cairn: developer evidence does not verify');
  return appendRecord(cwd, 'read', id, { decision: id, evidence });
}

export function cliSigner(argv, io, payloadPreview) {
  const i = argv.indexOf('--signature');
  const given = i >= 0 ? argv[i + 1] : io.env.CAIRN_SIGNATURE;
  if (!given) {
    return async (bytes) => {
      io.stdout(`cairn: sign this payload: ${Buffer.from(bytes).toString()}`);
      io.stdout('cairn: e.g. openssl pkeyutl -sign -rawin -inkey dev.pem | base64url');
      throw new AuthError('cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE');
    };
  }
  return async () => unb64url(given);
}

async function refusing(io, fn) {
  try { return await fn(); }
  catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
}

export function runDecisionsRead(argv, io) {
  return refusing(io, async () => {
    const id = argv[argv.indexOf('--read') + 1];
    const nonce = b64url(randomBytes(16));
    const sha = await readDecision(io.cwd, id, { sign: cliSigner(argv, io), confirm: ttyConfirm, nonce });
    io.stdout(`cairn: read ${id} recorded as ${sha}`);
    return 0;
  });
}

export function runAuthorize(argv, io) {
  return refusing(io, async () => {
    const sha = await authorize(io.cwd, { sign: cliSigner(argv, io), confirm: ttyConfirm });
    io.stdout(`cairn: authorization ${sha}`);
    return 0;
  });
}
```

`readDecision` passes `nonce` through to `authenticateDeveloper` (add the parameter: `{ sign, confirm, nonce }`), so a signed CLI run prints the exact payload the developer signs and then verifies that same payload on the second invocation with `--signature`. In `lib/init.mjs` add:

```js
import { ttyConfirm, cliSigner } from './auth.mjs';
import { createInterface } from 'node:readline';
import { openSync, closeSync, readFileSync } from 'node:fs';
import { ReadStream, WriteStream } from 'node:tty';

async function ask(prompt) {
  let fd;
  try { fd = openSync('/dev/tty', 'r+'); } catch { throw new InitError('cairn: init needs a controlling terminal for its questions'); }
  const input = new ReadStream(fd); const output = new WriteStream(fd);
  const rl = createInterface({ input, output });
  try { return (await new Promise((res) => rl.question(prompt, res))).trim(); }
  finally { rl.close(); input.destroy(); output.destroy(); closeSync(fd); }
}

export function runInit(argv, io) {
  return (async () => {
    try {
      const r = await init(io.cwd, {
        confirmRemote: async (names) => { const a = await ask(`authority remote [${names.join(', ')}] or local-only: `); return a === 'local-only' ? null : a; },
        chooseKey: async () => { const a = await ask('signing key PEM path or unsigned-local: '); return a === 'unsigned-local' ? null : readFileSync(a, 'utf8'); },
        confirmDigest: async (d) => (await ask(`adopt existing settings at ${d}? (yes/no) `)) === 'yes',
        confirm: ttyConfirm, sign: cliSigner(argv, io) });
      io.stdout(r.created ? `cairn: initialized; init record ${r.sha}` : `cairn: already initialized at ${r.sha}`);
      return 0;
    } catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
  })();
}
```

In `lib/cli.mjs`, add to plan 01's command table the three entries `init: runInit`, `authorize: runAuthorize`, and under `decisions` the branch `if (argv.includes('--read')) return runDecisionsRead(argv, io)` before plan 06's render, importing the three handlers from `./init.mjs` and `./auth.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS, every test file.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.mjs lib/init.mjs lib/cli.mjs tests/auth.test.mjs tests/init.test.mjs
git commit -m "cairn decisions --read writes the read record; wire init, authorize and read into the CLI"
```

---

### Task 8: Round-trip and refusal of the three record kinds through plan 01's decoder

**Files:**
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Consumes: `encodeRecord`, `decodeRecord` (lib/records.mjs); `catCommit` (lib/gitx.mjs).

- [ ] **Step 1: Write the failing test**

```js
import { encodeRecord } from '../lib/records.mjs';

test('init, authorization and read records round-trip and refuse unknown or missing keys', async () => {
  const cwd = await initialized();
  await authorize(cwd, { confirm: yes });
  await readDecision(cwd, '01J0000000000000000000ABCD', { confirm: yes });
  for (const rec of await readLog(cwd)) {
    const commit = await catCommit(cwd, rec.sha);
    assert.deepEqual(decodeRecord(commit), { kind: rec.kind, target: rec.target, payload: rec.payload });
    assert.throws(() => decodeRecord({ ...commit, body: commit.body.replace(/}$/, ',"extra":1}') }));
  }
  assert.throws(() => encodeRecord('init', 'project', { settings_digest: 'sha256:' + '0'.repeat(64) }), /authority_remote/);
  assert.throws(() => encodeRecord('read', 'X', { decision: 'X', evidence: {}, more: 1 }), /more/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/auth.test.mjs`
Expected: FAIL only if plan 01's schema table lacks the exact key sets above; then the fix is in plan 01's `lib/records.mjs` schema entries for `init`, `authorization` and `read`, which must read: `init: {settings_digest, authority_remote, auth_mode}`, `authorization: {spec_digest, agreement_digest, settings_digest, evidence, decision, intent}`, `read: {decision, evidence}`. Otherwise it passes immediately.

- [ ] **Step 3: Write minimal implementation**

No new code unless step 2 failed; then align the three schema entries in `lib/records.mjs` to the key sets above (closed keys, `authority_remote` and `decision` nullable strings, `evidence` an object).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/auth.test.mjs lib/records.mjs
git commit -m "Round-trip the init, authorization and read records through the record decoder"
```

---

### Task 9: `makeProject`: the initialized-project test helper every later plan uses

**Files:**
- Modify: `tests/helpers/repo.mjs` (append)
- Test: `tests/helpers.test.mjs` (append)

**Interfaces:**
- Consumes: `makeRepo` (plan 01), `init`, `DEFAULT_SETTINGS` from `lib/init.mjs` (Task 5), `authorize` from `lib/auth.mjs` (Task 4).
- Produces: `makeProject({settings, files}) -> {cwd, dir, git, write, commit, readRef, authorize, cleanup, remove}`. Plans 05, 06, 07, 08, 09, 10, 11 and 14 build every fixture with it. `cwd` and `dir` are the same path; `cleanup` and `remove` are the same function; both spellings exist because later plans use both.

- [ ] **Step 1: Append the failing test**

```js
// tests/helpers.test.mjs (append)
import { makeProject } from './helpers/repo.mjs';
import { readLog } from '../lib/records.mjs';
import { loadSettings } from '../lib/settings.mjs';

test('makeProject returns an initialized project with settings, an init record and an origin remote', async (t) => {
  const p = await makeProject({ settings: { source: ['src/**'] }, files: { 'src/a.js': 'x\n' } });
  t.after(p.cleanup);
  const { settings } = loadSettings(p.cwd);
  assert.equal(settings.authority_remote, 'origin');
  assert.deepEqual(settings.source, ['src/**']);
  const log = await readLog(p.cwd);
  assert.equal(log[0].kind, 'init');
  assert.equal(await p.readRef('refs/cairn/snapshots') !== null, true);
  const sha = await p.authorize();
  assert.equal((await readLog(p.cwd)).at(-1).sha, sha);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/helpers.test.mjs`. Expected: FAIL, `makeProject is not exported`.

- [ ] **Step 3: Implement**

```js
// tests/helpers/repo.mjs (append)
import { init, DEFAULT_SETTINGS } from '../../lib/init.mjs';
import { authorize } from '../../lib/auth.mjs';

const yes = async () => true;

export async function makeProject({ settings = {}, files = {} } = {}) {
  const repo = await makeRepo();
  const remote = await mkdtemp(join(tmpdir(), 'cairn-remote-'));
  await run('git', ['init', '-q', '--bare', remote]);
  await repo.git('remote', 'add', 'origin', remote);
  const merged = { ...DEFAULT_SETTINGS('origin', null), ...settings };
  await repo.write('.cairn/settings.json', JSON.stringify(merged, null, 2) + '\n');
  for (const [path, content] of Object.entries(files)) await repo.write(path, content);
  await repo.commit('fixture');
  await init(repo.dir, { confirmRemote: async () => 'origin', chooseKey: async () => null, confirm: yes, confirmDigest: yes });
  const remove = async () => { await repo.remove(); await rm(remote, { recursive: true, force: true }); };
  return {
    cwd: repo.dir, dir: repo.dir, git: repo.git, write: repo.write, commit: repo.commit, readRef: repo.readRef,
    authorize: () => authorize(repo.dir, { confirm: yes }),
    cleanup: remove, remove,
  };
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/helpers.test.mjs`. Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/repo.mjs tests/helpers.test.mjs
git commit -m "Add makeProject, the initialized-project fixture builder for later plans"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| Developer-owned protected paths are `.cairn/settings.json`, `docs/spec/**`, `AGENTS.md` (2) | 6 (`protectedClass`) |
| An accepted version of one needs a developer authorization naming its before and after digests (2, 8) | 6 |
| One `cairn authorize` at start binds the spec, agreement and settings final digests (2, 3 tail, 4) | 4 |
| `cairn start` refuses without that authorization (2) | 6 (`refuseUnauthorizedProtected`, called by plan 06 `start`) |
| `authority_remote` confirmed by the developer; `null` is explicit local-only; `origin` proposed, never assumed (2) | 5 |
| `signing_key`: with a key developer-only records must verify (2, 8) | 2, 7 |
| With `null`, controlling-terminal confirmation, Git author recorded, evidence not authentication (2, 8) | 3 |
| Cairn says so wherever it reports the decision (8) | 3 (`describeEvidence`) |
| `cairn init` initializes Git when absent (3) | 5 |
| validates or creates settings (3) | 5 |
| asks the developer to confirm the remote or explicit local-only (3) | 5 |
| asks the developer to choose a signing key or accept unsigned-local (3) | 5 |
| writes the init record; creates the durable ref roots with compare-and-swap (3) | 5 |
| Protection begins at the settings digest in that record (3) | 6 |
| Settings exist but refs do not: adopt only after the developer confirms the digest (3) | 5 |
| Refs exist but settings do not: refuse and name repair (3) | 5 |
| Re-running initialization against the same identity is idempotent (3) | 5 |
| `init` record fields (4 table) | 5, 8 |
| `authorization` record fields including optional decision ID (4 table) | 4, 8 |
| `read` record: decision ID and developer-auth evidence (4 table) | 7, 8 |
| A settings change is a new authorization naming the new digest (4, 8) | 6 |
| `cairn decisions --read` is developer-only (4, 8) | 7 |
| Initialization makes no evaluator call (3) | 5 (no import of lib/evaluate.mjs or bin/typesafeai.mjs; grep is the check) |

Left to other plans, deliberately:

- The ADR `read` line itself and `queue` (section 4 ADR schema): plan 06 `appendDecision`.
- Calling `refuseUnauthorizedProtected` from `cairn start` and from the scope preflight; the kernel-managed path exemption and breach records (sections 2, 5, 8): plans 06 and 07.
- Refspec installation on the authority remote at start (sections 3, 4): plan 12.
- Settings validation rules themselves (section 2 refusal list): plan 02 `validateSettings`; this plan only rethrows.
- "An active commitment's frozen Agreed requirement text is not amended in place" (2, 8): plan 06 (start freezes the set) and plan 08 (wake).
- The answer record's developer-auth evidence (section 2, 4): plan 09 consumes `authenticateDeveloper` and `verifyEvidence`.
- The new settings digest invalidating an evaluation policy or calibration (8): plan 11.
