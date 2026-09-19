# Mechanisms and evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build `lib/mechanisms.mjs` and `lib/check.mjs`: the mechanism entry with its two digested parts, `cairn declare`, `cairn review mechanism`, `cairn check` with receipts and command output, the five-identity currency test, the `--touch` write-back, and attempt counting.

**Architecture:** a mechanism is one canonical JSON file under `.cairn/mechanisms/`, written only by `declare` and `reviewMechanism`; its definition and its review metadata are digested separately, and a definition change drops the review metadata. `check` selects the mechanism for a requirement, takes plan 04's check lock, snapshots the declared inputs with plan 01's `writeInputSnapshot`, runs the command, stores the output under `.cairn/output/` by digest, and appends one `receipt` record. `isCurrent` recomputes the five identities of section 2 "Current" and compares; `attempts` counts distinct failing product digests since the last pass from the log alone.

**Tech Stack:** Node 24 ES modules, `node:child_process`, `node:fs/promises`, `node --test` with `node:assert/strict`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5, sections 2 (Kernel-written state; Records and evidence: Receipt, Current, Attempt), 5 (`declare`, `run`, `implement`, `review mechanism`, `escalate REQ` predicates), 7, 8 (Freshness; Deferral and attempts), 9 (Q1, Q2 cite the fail receipt).

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "No `outside`, `source`, `interfaces` or `data` entry may match them, and no mechanism may declare them as an input." (reserved paths, section 2)
- "It records declared values verbatim. It never hashes or records undeclared environment values." (execution identity, section 2)
- "A changed definition unbinds its review metadata." (section 2)
- "A **fail receipt** for a requirement has `ran` and result `fail`; `error` never counts." (section 2)
- "A `documents` path must also be an input and must not lie below a `source` root; `cairn declare` refuses otherwise." (section 8)
- "A receipt remains current when its ignored output file is absent on a clone; the output digest lets Cairn report the absence." (section 8)
- "A rerun at a seen input snapshot and a change only to documents or outside paths are not new attempts." (section 8)
- "Only Agreed blocks are digested and checked." (section 2)

Decisions this plan fixes (an executor does not revisit them):

- Mechanism file: `.cairn/mechanisms/<name>.json`, `name` matching `^[a-z0-9][a-z0-9-]{0,63}$`, body `{"schema":1,"definition":{...},"review":{...}}` in canonical JSON. `definitionDigest = sha256(canonicalize(definition))`; `reviewDigest = sha256(canonicalize(review))`.
- Definition keys, closed: `command` (string), `cwd` (path or `null`), `inputs` (sorted unique paths), `documents` (sorted unique paths, each also in `inputs`), `requirements` (sorted unique identifiers), `results` (`"per-requirement"` or `null`), `identity` (`{tools: {name: versionCommand}, env: [names], image: string|null}`).
- Observed identity: `{tools: {name: trimmedStdoutOrNull}, env: {name: valueOrNull}, image}`. Only names in the declaration are read. An env name matching `/(KEY|TOKEN|SECRET|PASSW|CREDENTIAL)/i` is refused at declare.
- Receipt payload keys, closed: `mechanism`, `definition_digest`, `input` (input snapshot SHA), `product_digest`, `status` (`ran|error`), `identity`, `results` (`[{requirement, text_digest, result}]` in declaration order, result `pass|fail|unverified`), `output` (`sha256:<hex>`), `exit` (`{code: int|null, signal: string|null}`). Plan 01's schema table for `receipt` lists exactly these keys; Task 3 round-trips them through `decodeRecord`. `product_digest` is the digest of the input tree's entries outside `documents`; it is what "not new attempts" for document-only changes and "no declared product input changed" for `review mechanism` compare.
- `status` is `error` when the command could not be started (declared `cwd` missing or spawn failure). A command that started and exited, by code or by signal, `ran`.
- `check` snapshots the definition's `inputs` only. A path touched under a lease becomes an input when `cairn end` writes it (Task 7); the receipt taken before that is stale afterwards because the definition digest changed.
- Test repositories come from `tests/helpers/repo.mjs` (plans 01 and 03): `makeProject({settings, files})` returns `{cwd, write(path, text), commit(message), cleanup()}` with a valid settings file merged over the defaults, an init record and both durable refs. Every test in this plan uses it through `tests/helpers/mechanism-fixture.mjs` (Task 1).

---

### Task 1: Mechanism entry, digests and `declare` refusals

**Files:**
- Create: `lib/mechanisms.mjs`
- Create: `tests/helpers/mechanism-fixture.mjs`
- Create: `tests/mechanisms.test.mjs`

**Interfaces:**
- Consumes: `canonicalize`, `parseStrict`, `sha256` (lib/canon.mjs); `validatePath`, `classify`, `matchGlob` (lib/paths.mjs); `loadSettings` (lib/settings.mjs); `parseDomainFile` (lib/spec.mjs); `makeProject` (tests/helpers/repo.mjs).
- Produces: `declare(cwd, name, definition) -> {definitionDigest}`; `readMechanisms(cwd) -> {name: {definition, definitionDigest, review, reviewDigest}}`; `definitionDigest(def)`, `reviewDigest(review)`; `normalizeDefinition(raw, settings)`; `requirementDigest(cwd, REQ) -> {textDigest, agreed}`; `MechanismError`; `MECHANISMS_DIR = '.cairn/mechanisms'`.

- [ ] **Step 1: Write the fixture helper**

```js
// tests/helpers/mechanism-fixture.mjs
import { makeProject } from './repo.mjs';
import { declare } from '../../lib/mechanisms.mjs';

export const SPEC = `Prefix: DEMO

[DEMO-001] The greeter prints hello when run with no arguments.
Falsifier: running the greeter with no arguments prints anything other than hello.
Mechanism: greeter
Status: Agreed 2026-09-19

[DEMO-002] The greeter exits 0 when run with no arguments.
Falsifier: running the greeter with no arguments exits nonzero.
Mechanism: greeter
Status: Draft

[DEMO-003] The greeter accepts a name argument.
Falsifier: running the greeter with a name prints a greeting without it.
Mechanism: other
Status: Agreed 2026-09-19
`;
export const CHECK = `import { readFileSync } from 'node:fs';
const text = readFileSync('hello.txt', 'utf8').trim();
console.log('cairn: DEMO-001: ' + (text === 'hello' ? 'pass' : 'fail'));
`;
export const DEFINITION = {
  command: 'node check.mjs', cwd: null,
  inputs: ['check.mjs', 'hello.txt', 'notes.md'], documents: ['notes.md'],
  requirements: ['DEMO-001', 'DEMO-002'], results: 'per-requirement',
  identity: { tools: { node: 'node --version' }, env: ['CAIRN_FIXTURE_ENV'], image: null },
};
export async function project() {
  const repo = await makeProject({ settings: { source: ['bin/**'], outside: ['README.md'] } });
  await repo.write('docs/spec/demo.md', SPEC);
  await repo.write('check.mjs', CHECK);
  await repo.write('hello.txt', 'hello\n');
  await repo.write('notes.md', 'notes\n');
  await repo.write('README.md', 'readme\n');
  await repo.commit('Add the demo spec and greeter fixture');
  return repo;
}
export async function declared(overrides = {}) {
  const repo = await project();
  await declare(repo.cwd, 'greeter', { ...DEFINITION, ...overrides });
  return repo;
}
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/mechanisms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalize, sha256 } from '../lib/canon.mjs';
import { declare, readMechanisms, definitionDigest, reviewDigest, MechanismError, requirementDigest } from '../lib/mechanisms.mjs';
import { project, declared, DEFINITION } from './helpers/mechanism-fixture.mjs';

test('declare writes one canonical file with two separately digested parts', async () => {
  const repo = await project();
  const { definitionDigest: d } = await declare(repo.cwd, 'greeter', DEFINITION);
  const text = await readFile(join(repo.cwd, '.cairn/mechanisms/greeter.json'), 'utf8');
  const obj = JSON.parse(text);
  assert.equal(text, canonicalize(obj));
  assert.deepEqual(Object.keys(obj).sort(), ['definition', 'review', 'schema']);
  assert.equal(d, sha256(canonicalize(obj.definition)));
  assert.equal(definitionDigest(obj.definition), d);
  assert.equal(reviewDigest({}), sha256('{}'));
  const all = await readMechanisms(repo.cwd);
  assert.equal(all.greeter.definitionDigest, d);
  assert.deepEqual(all.greeter.review, {});
  assert.notEqual(all.greeter.reviewDigest, d);
});

test('the definition records declared identity values verbatim and nothing else', async () => {
  const repo = await declared({ identity: { tools: { node: 'node --version' }, env: ['CAIRN_FIXTURE_ENV'], image: 'ubuntu:24.04' } });
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.identity, { tools: { node: 'node --version' }, env: ['CAIRN_FIXTURE_ENV'], image: 'ubuntu:24.04' });
  assert.equal(JSON.stringify(greeter).includes(process.env.HOME), false);
});

test('requirementDigest reads only Agreed blocks as checkable', async () => {
  const repo = await project();
  const a = await requirementDigest(repo.cwd, 'DEMO-001');
  assert.equal(a.agreed, true);
  assert.match(a.textDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal((await requirementDigest(repo.cwd, 'DEMO-002')).agreed, false);
  await assert.rejects(requirementDigest(repo.cwd, 'DEMO-999'), /not in docs\/spec/);
});

for (const [name, overrides, message] of [
  ['a document that is not an input', { documents: ['other.md'] }, /must also be an input/],
  ['a document below a source root', { inputs: [...DEFINITION.inputs, 'bin/guide.md'], documents: ['bin/guide.md'] }, /below a source root/],
  ['a reserved input', { inputs: [...DEFINITION.inputs, '.cairn/settings.json'] }, /reserved path/],
  ['an outside input', { inputs: [...DEFINITION.inputs, 'README.md'] }, /outside path/],
  ['an absolute input', { inputs: ['/etc/hosts'] }, /path/i],
  ['a secret-shaped env name', { identity: { tools: {}, env: ['API_KEY'], image: null } }, /secret-shaped/],
  ['an unknown definition key', { timeout: 5 }, /unknown definition key timeout/],
  ['an unknown identity key', { identity: { tools: {}, env: [], image: null, host: 'x' } }, /unknown identity key host/],
  ['an unknown results value', { results: 'exit-code' }, /results/],
  ['no requirements', { requirements: [] }, /at least one requirement/],
  ['a malformed requirement id', { requirements: ['demo1'] }, /requirement identifier/],
  ['an empty command', { command: '' }, /command/],
]) {
  test(`declare refuses ${name}`, async () => {
    const repo = await project();
    await assert.rejects(declare(repo.cwd, 'greeter', { ...DEFINITION, ...overrides }), (e) => e instanceof MechanismError && message.test(e.message));
    assert.deepEqual(await readMechanisms(repo.cwd), {});
  });
}

test('declare refuses a bad mechanism name and readMechanisms refuses a noncanonical file', async () => {
  const repo = await project();
  await assert.rejects(declare(repo.cwd, 'Greeter One', DEFINITION), /mechanism name/);
  await repo.write('.cairn/mechanisms/bad.json', '{ "schema": 1 }\n');
  await assert.rejects(readMechanisms(repo.cwd), /bad\.json/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/mechanisms.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/mechanisms.mjs'`.

- [ ] **Step 4: Write the implementation**

```js
// lib/mechanisms.mjs
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { validatePath, classify, matchGlob } from './paths.mjs';
import { loadSettings } from './settings.mjs';
import { parseDomainFile } from './spec.mjs';

export const MECHANISMS_DIR = '.cairn/mechanisms';
export class MechanismError extends Error {}
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REQ_ID = /^[A-Z][A-Z0-9]*-[0-9]{3,}$/;
const SECRET = /(KEY|TOKEN|SECRET|PASSW|CREDENTIAL)/i;
const DEF_KEYS = ['command', 'cwd', 'inputs', 'documents', 'requirements', 'results', 'identity'];
const ID_KEYS = ['tools', 'env', 'image'];

export const definitionDigest = (def) => sha256(canonicalize(def));
export const reviewDigest = (review) => sha256(canonicalize(review));
const uniqSorted = (xs) => [...new Set(xs)].sort();
const fail = (m) => { throw new MechanismError(m); };
const path = (p) => { try { return validatePath(p); } catch (e) { fail(`invalid path ${JSON.stringify(p)}: ${e.message}`); } };

export function normalizeDefinition(raw, settings) {
  if (raw === null || typeof raw !== 'object') fail('definition must be an object');
  for (const k of Object.keys(raw)) if (!DEF_KEYS.includes(k)) fail(`unknown definition key ${k}`);
  if (typeof raw.command !== 'string' || raw.command.trim() === '') fail('command must be a non-empty string');
  const cwd = raw.cwd == null ? null : path(raw.cwd);
  const inputs = uniqSorted((raw.inputs ?? []).map(path));
  if (inputs.length === 0) fail('inputs must name at least one path');
  const documents = uniqSorted((raw.documents ?? []).map(path));
  for (const p of inputs) {
    if (classify(p, settings) === 'reserved') fail(`reserved path ${p} cannot be an input`);
    if (settings.outside.some((g) => matchGlob(g, p))) fail(`outside path ${p} cannot be an input`);
  }
  for (const d of documents) {
    if (!inputs.includes(d)) fail(`document ${d} must also be an input`);
    if (settings.source.some((g) => matchGlob(g, d))) fail(`document ${d} lies below a source root`);
  }
  const requirements = uniqSorted(raw.requirements ?? []);
  if (requirements.length === 0) fail('requirements must name at least one requirement');
  for (const r of requirements) if (!REQ_ID.test(r)) fail(`${r} is not a requirement identifier`);
  const results = raw.results ?? null;
  if (results !== null && results !== 'per-requirement') fail('results is "per-requirement" or absent');
  const id = raw.identity ?? { tools: {}, env: [], image: null };
  for (const k of Object.keys(id)) if (!ID_KEYS.includes(k)) fail(`unknown identity key ${k}`);
  const tools = {};
  for (const [n, c] of Object.entries(id.tools ?? {})) {
    if (typeof c !== 'string' || !c) fail(`tool ${n} needs a version command`);
    if (SECRET.test(n)) fail(`secret-shaped tool name ${n}`);
    tools[n] = c;
  }
  const env = uniqSorted(id.env ?? []);
  for (const n of env) { if (typeof n !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) fail(`bad env name ${n}`); if (SECRET.test(n)) fail(`secret-shaped env name ${n}`); }
  const image = id.image ?? null;
  if (image !== null && typeof image !== 'string') fail('image is a string or null');
  return { command: raw.command, cwd, inputs, documents, requirements, results, identity: { tools, env, image } };
}

async function writeEntry(cwd, name, entry) {
  const dir = join(cwd, MECHANISMS_DIR);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${name}.json.tmp`);
  await writeFile(tmp, canonicalize(entry));
  await rename(tmp, join(dir, `${name}.json`));
}

export async function readMechanisms(cwd) {
  let files;
  try { files = await readdir(join(cwd, MECHANISMS_DIR)); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  const out = {};
  for (const f of files.filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()) {
    const name = basename(f, '.json');
    let obj;
    try { obj = parseStrict(await readFile(join(cwd, MECHANISMS_DIR, f), 'utf8')); } catch (e) { fail(`${MECHANISMS_DIR}/${f} is not canonical JSON: ${e.message}`); }
    if (!NAME.test(name) || obj.schema !== 1 || !obj.definition || !obj.review || Object.keys(obj).length !== 3) fail(`${MECHANISMS_DIR}/${f} is not a mechanism entry`);
    out[name] = { definition: obj.definition, definitionDigest: definitionDigest(obj.definition), review: obj.review, reviewDigest: reviewDigest(obj.review) };
  }
  return out;
}

export async function declare(cwd, name, rawDefinition) {
  if (!NAME.test(name)) fail(`invalid mechanism name ${name}`);
  const { settings } = await loadSettings(cwd);
  const definition = normalizeDefinition(rawDefinition, settings);
  const existing = (await readMechanisms(cwd))[name];
  const digest = definitionDigest(definition);
  const review = existing && existing.definitionDigest === digest ? existing.review : {};
  await writeEntry(cwd, name, { schema: 1, definition, review });
  return { definitionDigest: digest };
}

export async function requirementDigest(cwd, REQ) {
  const dir = join(cwd, 'docs/spec');
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const text = await readFile(join(dir, f), 'utf8');
    if (!/^Prefix:/m.test(text)) continue;
    const block = parseDomainFile(text).blocks.find((b) => b.id === REQ);
    if (block) return { textDigest: block.textDigest, agreed: block.status.startsWith('Agreed') };
  }
  fail(`${REQ} is not in docs/spec`);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/mechanisms.test.mjs`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/mechanisms.mjs tests/mechanisms.test.mjs tests/helpers/mechanism-fixture.mjs
git commit -m "Add mechanism entries with separately digested definition and review parts"
```

---

### Task 2: Mechanism selection and observed execution identity

**Files:**
- Create: `lib/check.mjs`
- Create: `tests/check.test.mjs`

**Interfaces:**
- Consumes: `readMechanisms`, `requirementDigest`, `MechanismError` (Task 1); `spawn` (node:child_process).
- Produces: `selectMechanism(cwd, REQ) -> {name, entry}`; `observeIdentity(cwd, identity) -> {tools, env, image}`; `runCommand(cwd, command) -> {spawned, out: Buffer, code, signal}`; `CheckError`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectMechanism, observeIdentity, runCommand, CheckError } from '../lib/check.mjs';
import { declare } from '../lib/mechanisms.mjs';
import { project, declared, DEFINITION } from './helpers/mechanism-fixture.mjs';

test('selectMechanism finds the one declaration naming the requirement', async () => {
  const repo = await declared();
  const { name } = await selectMechanism(repo.cwd, 'DEMO-001');
  assert.equal(name, 'greeter');
  await assert.rejects(selectMechanism(repo.cwd, 'DEMO-009'), (e) => e instanceof CheckError && /no mechanism declares DEMO-009/.test(e.message));
  await declare(repo.cwd, 'greeter-two', DEFINITION);
  await assert.rejects(selectMechanism(repo.cwd, 'DEMO-001'), /two mechanisms declare DEMO-001: greeter, greeter-two/);
});

test('observeIdentity reads only declared names and records absence as null', async () => {
  const repo = await declared();
  delete process.env.CAIRN_FIXTURE_ENV;
  const a = await observeIdentity(repo.cwd, DEFINITION.identity);
  assert.deepEqual(a, { tools: { node: process.version }, env: { CAIRN_FIXTURE_ENV: null }, image: null });
  process.env.CAIRN_FIXTURE_ENV = 'one';
  const b = await observeIdentity(repo.cwd, DEFINITION.identity);
  assert.equal(b.env.CAIRN_FIXTURE_ENV, 'one');
  assert.equal(Object.keys(b.env).length, 1);
  const c = await observeIdentity(repo.cwd, { tools: { missing: 'no-such-tool-xyz --version' }, env: [], image: 'img:1' });
  assert.deepEqual(c, { tools: { missing: null }, env: {}, image: 'img:1' });
});

test('runCommand captures combined output, exit code and signal', async () => {
  const repo = await project();
  const ok = await runCommand(repo.cwd, 'printf a; printf b >&2; exit 3');
  assert.deepEqual([ok.spawned, ok.out.toString(), ok.code, ok.signal], [true, 'ab', 3, null]);
  const killed = await runCommand(repo.cwd, 'kill -TERM $$');
  assert.deepEqual([killed.spawned, killed.code, killed.signal], [true, null, 'SIGTERM']);
  const nodir = await runCommand(repo.cwd + '/does-not-exist', 'true');
  assert.equal(nodir.spawned, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/check.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/check.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/check.mjs
import { spawn } from 'node:child_process';
import { readMechanisms, MechanismError } from './mechanisms.mjs';

export class CheckError extends Error {}

export async function selectMechanism(cwd, REQ) {
  const all = await readMechanisms(cwd);
  const names = Object.keys(all).filter((n) => all[n].definition.requirements.includes(REQ));
  if (names.length === 0) throw new CheckError(`no mechanism declares ${REQ}`);
  if (names.length > 1) throw new CheckError(`${names.length === 2 ? 'two' : names.length} mechanisms declare ${REQ}: ${names.join(', ')}`);
  return { name: names[0], entry: all[names[0]] };
}

export function runCommand(cwd, command) {
  return new Promise((resolve) => {
    const chunks = [];
    let child;
    try {
      child = spawn('sh', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return resolve({ spawned: false, out: Buffer.alloc(0), code: null, signal: null }); }
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    child.on('error', () => resolve({ spawned: false, out: Buffer.concat(chunks), code: null, signal: null }));
    child.on('close', (code, signal) => resolve({ spawned: true, out: Buffer.concat(chunks), code, signal }));
  });
}

export async function observeIdentity(cwd, identity) {
  const tools = {};
  for (const name of Object.keys(identity.tools).sort()) {
    const r = await runCommand(cwd, identity.tools[name]);
    tools[name] = r.spawned && r.code === 0 ? r.out.toString('utf8').trim() : null;
  }
  const env = {};
  for (const name of identity.env) env[name] = Object.hasOwn(process.env, name) ? process.env[name] : null;
  return { tools, env, image: identity.image };
}

export { MechanismError };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/check.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/check.mjs tests/check.test.mjs
git commit -m "Select a requirement's mechanism and observe its declared execution identity"
```

---

### Task 3: `cairn check`: lock, input snapshot, run, output file, receipt

**Files:**
- Modify: `lib/check.mjs`
- Modify: `tests/check.test.mjs`

**Interfaces:**
- Consumes: `withCheckLock` (lib/lease.mjs); `writeInputSnapshot`, `readSnapshot` (lib/snapshots.mjs); `listTree`, `catCommit` (lib/gitx.mjs); `appendRecord`, `readLog`, `decodeRecord` (lib/records.mjs); `canonicalize`, `sha256` (lib/canon.mjs).
- Produces: `check(cwd, REQ) -> receiptSha`; `productDigest(cwd, tree, documents) -> 'sha256:...'`; `outputPath(cwd, digest)`; `outputPresent(cwd, receipt) -> boolean`; `OUTPUT_DIR = '.cairn/output'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/check.test.mjs`:

```js
import { readFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { check, productDigest, outputPresent, OUTPUT_DIR } from '../lib/check.mjs';
import { readLog, decodeRecord } from '../lib/records.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { readMechanisms } from '../lib/mechanisms.mjs';
import { sha256 } from '../lib/canon.mjs';

async function lastReceipt(cwd) { const log = await readLog(cwd); return log.filter((r) => r.kind === 'receipt').at(-1); }

test('check writes an input snapshot, an output file named by digest, and a receipt', async () => {
  const repo = await declared();
  const sha = await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  assert.equal(rec.sha, sha);
  assert.equal(rec.target, 'greeter');
  const p = rec.payload;
  assert.deepEqual(Object.keys(p).sort(), ['definition_digest', 'exit', 'identity', 'input', 'mechanism', 'output', 'product_digest', 'results', 'status']);
  assert.equal(p.status, 'ran');
  assert.deepEqual(p.exit, { code: 0, signal: null });
  assert.equal(p.definition_digest, (await readMechanisms(repo.cwd)).greeter.definitionDigest);
  const snap = await readSnapshot(repo.cwd, p.input, 'input');
  assert.equal(snap.kind, 'input');
  assert.deepEqual(p.results.map((r) => [r.requirement, r.result]), [['DEMO-001', 'pass'], ['DEMO-002', 'unverified']]);
  assert.match(p.results[0].text_digest, /^sha256:/);
  const bytes = await readFile(join(repo.cwd, OUTPUT_DIR, p.output.slice(7)));
  assert.equal(bytes.toString(), 'cairn: DEMO-001: pass\n');
  assert.equal(p.output, sha256(bytes));
  assert.equal(await outputPresent(repo.cwd, rec), true);
  assert.equal(decodeRecord(await catCommit(repo.cwd, sha)).kind, 'receipt');
  await assert.doesNotReject(access(join(repo.cwd, OUTPUT_DIR, '.gitignore')));
});

test('a violating example yields a fail receipt: ran and fail', async () => {
  const repo = await declared();
  await repo.write('hello.txt', 'bye\n');
  await check(repo.cwd, 'DEMO-001');
  const p = (await lastReceipt(repo.cwd)).payload;
  assert.equal(p.status, 'ran');
  assert.equal(p.results[0].result, 'fail');
});

test('a command that cannot start is an error receipt with every result unverified', async () => {
  const repo = await declared({ cwd: 'missing-dir' });
  await check(repo.cwd, 'DEMO-001');
  const p = (await lastReceipt(repo.cwd)).payload;
  assert.equal(p.status, 'error');
  assert.deepEqual(p.results.map((r) => r.result), ['unverified', 'unverified']);
  assert.deepEqual(p.exit, { code: null, signal: null });
});

test('without per-requirement results the exit code decides; a killed command ran', async () => {
  const repo = await declared({ command: 'exit 2', results: null });
  await check(repo.cwd, 'DEMO-001');
  let p = (await lastReceipt(repo.cwd)).payload;
  assert.deepEqual([p.status, p.results[0].result, p.exit.code], ['ran', 'fail', 2]);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, command: 'kill -KILL $$', results: null });
  await check(repo.cwd, 'DEMO-001');
  p = (await lastReceipt(repo.cwd)).payload;
  assert.deepEqual([p.status, p.results[0].result, p.exit.signal], ['ran', 'fail', 'SIGKILL']);
});

test('per-requirement lines: any fail wins, undeclared identifiers are ignored', async () => {
  const repo = await declared({ command: 'echo "cairn: DEMO-001: pass"; echo "cairn: DEMO-001: fail"; echo "cairn: DEMO-777: pass"' });
  await check(repo.cwd, 'DEMO-001');
  const p = (await lastReceipt(repo.cwd)).payload;
  assert.deepEqual(p.results.map((r) => [r.requirement, r.result]), [['DEMO-001', 'fail'], ['DEMO-002', 'unverified']]);
});

test('check refuses a requirement that is not Agreed', async () => {
  const repo = await declared();
  await assert.rejects(check(repo.cwd, 'DEMO-002'), /DEMO-002 is not Agreed/);
});

test('product_digest ignores documents', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const a = (await lastReceipt(repo.cwd)).payload;
  await repo.write('notes.md', 'changed notes\n');
  await check(repo.cwd, 'DEMO-001');
  const b = (await lastReceipt(repo.cwd)).payload;
  assert.notEqual(a.input, b.input);
  assert.equal(a.product_digest, b.product_digest);
  await repo.write('hello.txt', 'hello!\n');
  await check(repo.cwd, 'DEMO-001');
  assert.notEqual((await lastReceipt(repo.cwd)).payload.product_digest, a.product_digest);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/check.test.mjs`
Expected: FAIL, `check is not a function` (named export missing).

- [ ] **Step 3: Write the implementation**

Append to `lib/check.mjs`:

```js
import { access, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalize, sha256 } from './canon.mjs';
import { requirementDigest } from './mechanisms.mjs';
import { withCheckLock } from './lease.mjs';
import { writeInputSnapshot, readSnapshot } from './snapshots.mjs';
import { listTree } from './gitx.mjs';
import { appendRecord } from './records.mjs';

export const OUTPUT_DIR = '.cairn/output';
const LINE = /^cairn: ([A-Z][A-Z0-9]*-[0-9]{3,}): (pass|fail)$/;

export async function productDigest(cwd, tree, documents) {
  const under = (p) => documents.some((d) => p === d || p.startsWith(d + '/'));
  const entries = (await listTree(cwd, tree)).filter((e) => !under(e.path)).map((e) => [e.path, e.mode, e.sha]);
  return sha256(canonicalize(entries));
}

export const outputPath = (cwd, digest) => join(cwd, OUTPUT_DIR, digest.slice('sha256:'.length));

async function writeOutput(cwd, bytes) {
  const digest = sha256(bytes);
  await mkdir(join(cwd, OUTPUT_DIR), { recursive: true });
  await writeFile(join(cwd, OUTPUT_DIR, '.gitignore'), '*\n');
  const tmp = join(cwd, OUTPUT_DIR, `.tmp-${process.pid}-${Date.now()}`);
  await writeFile(tmp, bytes);
  await rename(tmp, outputPath(cwd, digest));
  return digest;
}

export async function outputPresent(cwd, receipt) {
  try { await access(outputPath(cwd, receipt.payload.output)); return true; } catch { return false; }
}

function resultFor(def, run, id) {
  if (!run.spawned) return 'unverified';
  if (def.results === 'per-requirement') {
    const mine = run.out.toString('utf8').split('\n').map((l) => LINE.exec(l)).filter((m) => m && m[1] === id);
    if (mine.length === 0) return 'unverified';
    return mine.some((m) => m[2] === 'fail') ? 'fail' : 'pass';
  }
  return run.code === 0 ? 'pass' : 'fail';
}

export async function check(cwd, REQ) {
  const target = await requirementDigest(cwd, REQ);
  if (!target.agreed) throw new CheckError(`${REQ} is not Agreed; only Agreed requirements are checked`);
  const { name, entry } = await selectMechanism(cwd, REQ);
  const def = entry.definition;
  return withCheckLock(cwd, async () => {
    const input = await writeInputSnapshot(cwd, { mechanism: name, inputs: def.inputs });
    const { tree } = await readSnapshot(cwd, input, 'input');
    const product = await productDigest(cwd, tree, def.documents);
    const identity = await observeIdentity(cwd, def.identity);
    const runCwd = def.cwd ? join(cwd, def.cwd) : cwd;
    let run = { spawned: false, out: Buffer.alloc(0), code: null, signal: null };
    try { await access(runCwd); run = await runCommand(runCwd, def.command); } catch { /* status error */ }
    const output = await writeOutput(cwd, run.out);
    const results = [];
    for (const id of def.requirements) {
      const { textDigest, agreed } = await requirementDigest(cwd, id);
      results.push({ requirement: id, text_digest: textDigest, result: agreed ? resultFor(def, run, id) : 'unverified' });
    }
    const payload = {
      mechanism: name, definition_digest: entry.definitionDigest, input, product_digest: product,
      status: run.spawned ? 'ran' : 'error', identity, results, output,
      exit: { code: run.spawned ? run.code : null, signal: run.spawned ? run.signal : null },
    };
    return appendRecord(cwd, 'receipt', name, payload);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/check.test.mjs`
Expected: PASS, 10 tests. If `decodeRecord` refuses the receipt, plan 01's `receipt` schema differs from the key list in Global Constraints; align plan 01's table to this list (it is the writer's list) and rerun.

- [ ] **Step 5: Commit**

```bash
git add lib/check.mjs tests/check.test.mjs
git commit -m "Run a mechanism under the check lock and record its receipt and output"
```

---

### Task 4: `isCurrent`: the five identities, one at a time

**Files:**
- Modify: `lib/check.mjs`
- Modify: `tests/check.test.mjs`

**Interfaces:**
- Consumes: `writeTreeFromPaths`, `catCommit`, `commitTree`, `readRef`, `updateRefCAS` (lib/gitx.mjs); `readLog` (lib/records.mjs).
- Produces: `identitiesNow(cwd, REQ) -> {mechanism, definitionDigest, textDigest, tree, identity}`; `isCurrent(cwd, receipt, REQ, now) -> boolean`; `latestReceipt(log, REQ) -> record|null`; `evidence(cwd, log, REQ) -> {receipt, current, result, outputPresent}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/check.test.mjs`:

```js
import { isCurrent, identitiesNow, evidence } from '../lib/check.mjs';
import { commitTree, readRef, updateRefCAS } from '../lib/gitx.mjs';

test('a fresh receipt is current, and stays current when its output file is absent', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), true);
  await rm(join(repo.cwd, OUTPUT_DIR, rec.payload.output.slice(7)));
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), true);
  const ev = await evidence(repo.cwd, await readLog(repo.cwd), 'DEMO-001');
  assert.deepEqual([ev.current, ev.result, ev.outputPresent], [true, 'pass', false]);
});

test('identity 1: the input snapshot tree', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  await repo.write('hello.txt', 'hello there\n');
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), false);
  await repo.write('hello.txt', 'hello\n');
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), true);
});

test('identity 2: the definition digest', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, command: 'node check.mjs --strict' });
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), false);
});

test('identity 3: the requirement text digest', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  const spec = await readFile(join(repo.cwd, 'docs/spec/demo.md'), 'utf8');
  await repo.write('docs/spec/demo.md', spec.replace('prints anything other than hello', 'prints anything but hello'));
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), false);
});

test('identity 4: the observed declared execution identity', async () => {
  const repo = await declared();
  delete process.env.CAIRN_FIXTURE_ENV;
  await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  process.env.CAIRN_FIXTURE_ENV = 'changed';
  try { assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), false); } finally { delete process.env.CAIRN_FIXTURE_ENV; }
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001'), true);
});

test('identity 5: a readable schema', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  const c = await catCommit(repo.cwd, rec.sha);
  const trailers = c.trailers.map(([k, v]) => [k, k === 'Cairn-Schema' ? '2' : v]);
  const head = await readRef(repo.cwd, 'refs/cairn/log');
  const sha = await commitTree(repo.cwd, { tree: c.tree, parents: [head], subject: c.subject, body: c.body, trailers });
  await updateRefCAS(repo.cwd, 'refs/cairn/log', sha, head);
  assert.equal(await isCurrent(repo.cwd, { sha, payload: rec.payload }, 'DEMO-001'), false);
});

test('isCurrent accepts precomputed identities and refuses another requirement', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  const now = await identitiesNow(repo.cwd, 'DEMO-001');
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-001', now), true);
  assert.equal(await isCurrent(repo.cwd, rec, 'DEMO-002', now), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/check.test.mjs`
Expected: FAIL, `isCurrent is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/check.mjs`:

```js
import { writeTreeFromPaths, catCommit } from './gitx.mjs';

export async function identitiesNow(cwd, REQ) {
  const { name, entry } = await selectMechanism(cwd, REQ);
  const { textDigest } = await requirementDigest(cwd, REQ);
  const tree = await writeTreeFromPaths(cwd, { paths: entry.definition.inputs });
  const identity = await observeIdentity(cwd, entry.definition.identity);
  return { mechanism: name, definitionDigest: entry.definitionDigest, textDigest, tree, identity };
}

export async function isCurrent(cwd, receipt, REQ, now) {
  try { now = now ?? await identitiesNow(cwd, REQ); } catch { return false; }
  let commit;
  try { commit = await catCommit(cwd, receipt.sha); } catch { return false; }
  const trailers = Object.fromEntries(commit.trailers);
  if (trailers['Cairn-Schema'] !== '1' || trailers['Cairn-Digest'] !== sha256(commit.body)) return false;
  const p = receipt.payload;
  if (p.mechanism !== now.mechanism || p.definition_digest !== now.definitionDigest) return false;
  const r = p.results.find((x) => x.requirement === REQ);
  if (!r || r.text_digest !== now.textDigest) return false;
  if (canonicalize(p.identity) !== canonicalize(now.identity)) return false;
  let snap;
  try { snap = await readSnapshot(cwd, p.input, 'input'); } catch { return false; }
  return snap.tree === now.tree;
}

export function latestReceipt(log, REQ) {
  return log.filter((r) => r.kind === 'receipt' && r.payload.results.some((x) => x.requirement === REQ)).at(-1) ?? null;
}

export async function evidence(cwd, log, REQ) {
  const receipt = latestReceipt(log, REQ);
  if (!receipt) return { receipt: null, current: false, result: null, outputPresent: false };
  const result = receipt.payload.results.find((x) => x.requirement === REQ).result;
  return { receipt, current: await isCurrent(cwd, receipt, REQ), result, outputPresent: await outputPresent(cwd, receipt) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/check.test.mjs`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/check.mjs tests/check.test.mjs
git commit -m "Decide receipt currency from the five recorded identities"
```

---

### Task 5: `review mechanism`: the fail-receipt binding, and unbinding on redeclare

**Files:**
- Modify: `lib/mechanisms.mjs`
- Modify: `tests/mechanisms.test.mjs`

**Interfaces:**
- Consumes: `catCommit` (lib/gitx.mjs); `decodeRecord`, `readLog` (lib/records.mjs); `check` (Task 3, tests only).
- Produces: `reviewMechanism(cwd, name, REQ, failReceiptSha) -> void`; `reviewBinds(entry, REQ, textDigest) -> boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/mechanisms.test.mjs`:

```js
import { reviewMechanism, reviewBinds } from '../lib/mechanisms.mjs';
import { check } from '../lib/check.mjs';
import { readLog } from '../lib/records.mjs';

async function failReceipt(repo) {
  await repo.write('hello.txt', 'bye\n');
  const sha = await check(repo.cwd, 'DEMO-001');
  await repo.write('hello.txt', 'hello\n');
  return sha;
}

test('review mechanism binds the requirement to the definition and text digests with a fail receipt', async () => {
  const repo = await declared();
  const sha = await failReceipt(repo);
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', sha);
  const { greeter } = await readMechanisms(repo.cwd);
  const { textDigest } = await requirementDigest(repo.cwd, 'DEMO-001');
  assert.deepEqual(greeter.review, { 'DEMO-001': { definitionDigest: greeter.definitionDigest, textDigest, failReceipt: sha } });
  assert.equal(reviewBinds(greeter, 'DEMO-001', textDigest), true);
  assert.equal(reviewBinds(greeter, 'DEMO-001', 'sha256:' + '0'.repeat(64)), false);
  assert.notEqual(greeter.reviewDigest, reviewDigest({}));
});

test('a fail receipt written before any start record is accepted: currency is by identity, not position', async () => {
  const repo = await declared();
  const sha = await failReceipt(repo);
  assert.equal((await readLog(repo.cwd)).some((r) => r.kind === 'start'), false);
  await assert.doesNotReject(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', sha));
});

test('a changed definition unbinds the review metadata; an identical redeclare keeps it', async () => {
  const repo = await declared();
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', await failReceipt(repo));
  await declare(repo.cwd, 'greeter', { ...DEFINITION, requirements: ['DEMO-002', 'DEMO-001'] });
  assert.equal(Object.keys((await readMechanisms(repo.cwd)).greeter.review).length, 1);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, inputs: [...DEFINITION.inputs, 'extra.txt'] });
  assert.deepEqual((await readMechanisms(repo.cwd)).greeter.review, {});
});

test('review mechanism refuses a pass receipt, an error receipt, another mechanism, a stale definition and stale text', async () => {
  const repo = await declared();
  const pass = await check(repo.cwd, 'DEMO-001');
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', pass), /does not record fail for DEMO-001/);
  const good = await failReceipt(repo);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, cwd: 'missing' });
  const err = await check(repo.cwd, 'DEMO-001');
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', err), /error receipt never counts/);
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', good), /definition digest/);
  await declare(repo.cwd, 'greeter', DEFINITION);
  await declare(repo.cwd, 'other', { ...DEFINITION, requirements: ['DEMO-003'] });
  await assert.rejects(reviewMechanism(repo.cwd, 'other', 'DEMO-003', good), /names mechanism greeter/);
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-002', good), /does not record fail for DEMO-002/);
  const spec = await readFile(join(repo.cwd, 'docs/spec/demo.md'), 'utf8');
  await repo.write('docs/spec/demo.md', spec.replace('anything other than hello', 'anything else'));
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', good), /text digest/);
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', '0'.repeat(40)), /not a record on refs\/cairn\/log/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/mechanisms.test.mjs`
Expected: FAIL, `reviewMechanism is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/mechanisms.mjs`:

```js
import { catCommit } from './gitx.mjs';
import { decodeRecord, readLog } from './records.mjs';

export function reviewBinds(entry, REQ, textDigest) {
  const m = entry.review[REQ];
  return !!m && m.definitionDigest === entry.definitionDigest && m.textDigest === textDigest;
}

export async function reviewMechanism(cwd, name, REQ, failReceiptSha) {
  const entry = (await readMechanisms(cwd))[name];
  if (!entry) fail(`no mechanism named ${name}`);
  if (!entry.definition.requirements.includes(REQ)) fail(`${name} does not declare ${REQ}`);
  const log = await readLog(cwd);
  if (!log.some((r) => r.sha === failReceiptSha)) fail(`${failReceiptSha} is not a record on refs/cairn/log`);
  const rec = decodeRecord(await catCommit(cwd, failReceiptSha));
  if (rec.kind !== 'receipt') fail(`${failReceiptSha} is a ${rec.kind} record, not a receipt`);
  const p = rec.payload;
  if (p.mechanism !== name) fail(`receipt names mechanism ${p.mechanism}, not ${name}`);
  if (p.status !== 'ran') fail('an error receipt never counts as the violating example');
  if (p.definition_digest !== entry.definitionDigest) fail(`receipt definition digest ${p.definition_digest} is not the current ${entry.definitionDigest}`);
  const r = p.results.find((x) => x.requirement === REQ);
  if (!r || r.result !== 'fail') fail(`receipt does not record fail for ${REQ}`);
  const { textDigest } = await requirementDigest(cwd, REQ);
  if (r.text_digest !== textDigest) fail(`receipt text digest ${r.text_digest} is not the current ${textDigest} for ${REQ}`);
  const review = { ...entry.review, [REQ]: { definitionDigest: entry.definitionDigest, textDigest, failReceipt: failReceiptSha } };
  await writeEntry(cwd, name, { schema: 1, definition: entry.definition, review });
}
```

The fixture's `DEMO-003` block (Task 1) names mechanism `other`, which the refusal test declares.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/mechanisms.test.mjs tests/check.test.mjs`
Expected: PASS, all tests in both files.

- [ ] **Step 5: Commit**

```bash
git add lib/mechanisms.mjs tests/mechanisms.test.mjs
git commit -m "Bind mechanism review metadata to a fail receipt and unbind it on redeclare"
```

---

### Task 6: Attempts: distinct failing product digests since the last pass

**Files:**
- Modify: `lib/check.mjs`
- Modify: `tests/check.test.mjs`

**Interfaces:**
- Consumes: `readLog` (lib/records.mjs).
- Produces: `attempts(log, REQ) -> number`. Plan 08's `escalate REQ` predicate reads `attempts(log, REQ) >= 3`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/check.test.mjs`:

```js
import { attempts } from '../lib/check.mjs';

test('attempts counts distinct failing product digests since the last pass', async () => {
  const repo = await declared();
  const count = async () => attempts(await readLog(repo.cwd), 'DEMO-001');
  assert.equal(await count(), 0);
  await repo.write('hello.txt', 'bye\n');
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 1);
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 1, 'a rerun at a seen input snapshot is not an attempt');
  await repo.write('notes.md', 'edited notes\n');
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 1, 'a change only to documents is not an attempt');
  await repo.write('hello.txt', 'nope\n');
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 2);
  await repo.write('hello.txt', 'bye\n');
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 2, 'a return to a tried input is not an attempt');
  await declare(repo.cwd, 'greeter', { ...DEFINITION, cwd: 'missing' });
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 2, 'an error receipt is not an attempt');
  await declare(repo.cwd, 'greeter', DEFINITION);
  await repo.write('hello.txt', 'still wrong\n');
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 3);
  await repo.write('hello.txt', 'hello\n');
  await check(repo.cwd, 'DEMO-001');
  assert.equal(await count(), 0, 'a pass resets the count');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/check.test.mjs`
Expected: FAIL, `attempts is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/check.mjs`:

```js
export function attempts(log, REQ) {
  const seen = new Set();
  for (const rec of log) {
    if (rec.kind !== 'receipt' || rec.payload.status !== 'ran') continue;
    const r = rec.payload.results.find((x) => x.requirement === REQ);
    if (!r) continue;
    if (r.result === 'pass') seen.clear();
    else if (r.result === 'fail') seen.add(rec.payload.product_digest);
  }
  return seen.size;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/check.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/check.mjs tests/check.test.mjs
git commit -m "Count attempts as distinct failing product digests since the last pass"
```

---

### Task 7: `cairn end` writes a changed `--touch` path into the definition

**Files:**
- Modify: `lib/mechanisms.mjs`
- Modify: `lib/lease.mjs` (the `end` function from plan 04)
- Modify: `tests/mechanisms.test.mjs`

**Interfaces:**
- Consumes: `begin`, `end`, `readLease` (lib/lease.mjs); `readSnapshot` (lib/snapshots.mjs); `listTree`, `writeTreeFromPaths` (lib/gitx.mjs).
- Produces: `applyTouch(cwd, lease) -> {added: [paths], dropped: [paths]}`; `end(cwd)` now calls it before removing the lease.

- [ ] **Step 1: Write the failing tests**

Append to `tests/mechanisms.test.mjs`:

```js
import { begin, end, readLease } from '../lib/lease.mjs';
import { applyTouch } from '../lib/mechanisms.mjs';

test('end writes a changed touched path into the definition and unbinds review metadata', async () => {
  const repo = await declared();
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', await failReceipt(repo));
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['helper.mjs'] });
  await repo.write('helper.mjs', 'export const x = 1;\n');
  await end(repo.cwd);
  assert.equal(await readLease(repo.cwd), null);
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.inputs, ['check.mjs', 'hello.txt', 'helper.mjs', 'notes.md']);
  assert.deepEqual(greeter.review, {});
});

test('end drops an unchanged touched path and leaves the definition and review alone', async () => {
  const repo = await declared();
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', await failReceipt(repo));
  const before = await readMechanisms(repo.cwd);
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['helper.mjs'] });
  const r = await applyTouch(repo.cwd, await readLease(repo.cwd));
  assert.deepEqual(r, { added: [], dropped: ['helper.mjs'] });
  await end(repo.cwd);
  assert.deepEqual(await readMechanisms(repo.cwd), before);
});

test('a touched path that changed and was removed again is dropped', async () => {
  const repo = await declared();
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['scratch.txt'] });
  await repo.write('scratch.txt', 'x\n');
  await rm(join(repo.cwd, 'scratch.txt'));
  assert.deepEqual(await applyTouch(repo.cwd, await readLease(repo.cwd)), { added: [], dropped: ['scratch.txt'] });
  await end(repo.cwd);
});
```

Add `import { rm } from 'node:fs/promises';` at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/mechanisms.test.mjs`
Expected: FAIL, `applyTouch is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `lib/mechanisms.mjs`:

```js
import { readSnapshot } from './snapshots.mjs';
import { listTree, writeTreeFromPaths } from './gitx.mjs';

export async function applyTouch(cwd, lease) {
  if (!lease || !Array.isArray(lease.touch) || lease.touch.length === 0) return { added: [], dropped: [] };
  const all = await readMechanisms(cwd);
  const names = Object.keys(all).filter((n) => all[n].definition.requirements.includes(lease.target));
  if (names.length !== 1) fail(`lease target ${lease.target} has ${names.length} mechanisms; declare exactly one before end`);
  const name = names[0];
  const base = await readSnapshot(cwd, lease.snapshot, 'workspace');
  const baseEntries = await listTree(cwd, base.tree);
  const added = [], dropped = [];
  for (const p of lease.touch) {
    const under = (e) => e.path === p || e.path.startsWith(p + '/');
    const was = baseEntries.filter(under).map((e) => [e.path, e.mode, e.sha]);
    const now = (await listTree(cwd, await writeTreeFromPaths(cwd, { paths: [p] }))).filter(under).map((e) => [e.path, e.mode, e.sha]);
    (canonicalize(was) !== canonicalize(now) ? added : dropped).push(p);
  }
  if (added.length) await declare(cwd, name, { ...all[name].definition, inputs: [...all[name].definition.inputs, ...added] });
  return { added, dropped };
}
```

In `lib/lease.mjs`, at the top of plan 04's `end(cwd)`, before the compare-and-swap that deletes `refs/cairn/in-progress`, add:

```js
import { applyTouch } from './mechanisms.mjs';
// inside end(cwd), first statement:
await applyTouch(cwd, await readLease(cwd));
```

`writeTreeFromPaths` with a path that no longer exists returns the empty tree for it; `listTree` of that tree is `[]`, so a created-then-deleted path is `dropped`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/mechanisms.test.mjs tests/lease.test.mjs`
Expected: PASS in both files; plan 04's lease tests still pass because a lease without `touch` is a no-op.

- [ ] **Step 5: Commit**

```bash
git add lib/mechanisms.mjs lib/lease.mjs tests/mechanisms.test.mjs
git commit -m "Write a changed touched path into the mechanism definition when the lease ends"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| Mechanism "written only by `cairn declare` and `cairn review mechanism`" (2) | 1, 5 (the only writers; the exact-mutation exemption is plan 07's preflight) |
| "two separately digested parts" definition and review metadata (2) | 1 |
| Definition fields: command, working directory, inputs, documents, requirements, `results: per-requirement`, execution identity (2) | 1 |
| "records declared values verbatim. It never hashes or records undeclared environment values" (2) | 1 (declaration), 2 (observation reads only declared names) |
| Review metadata: definition digest, text digest, fail receipt per requirement (2) | 5 |
| "A changed definition unbinds its review metadata" (2, 8) | 5 |
| "no mechanism may declare them [reserved paths] as an input" (2) | 1 |
| `outside` path overlapping a mechanism input (2, settings refusal mirrored at declare) | 1 |
| "`documents` path must also be an input and must not lie below a `source` root; `cairn declare` refuses otherwise" (8) | 1 |
| Command output under `.cairn/output/` "named by the digest in its receipt", ignored by Git (2, 8) | 3 |
| Receipt: definition digest, input snapshot, observed identity, ran or errored, per-requirement text digest and result, output digest, exit code or signal (2, 4) | 3 |
| "A fail receipt ... has `ran` and result `fail`; `error` never counts" (2, 7) | 3, 5 |
| "Only Agreed blocks are digested and checked" (2) | 1, 3 |
| Current: input tree, definition digest, text digest, observed identity, readable schema (2, 8) | 4, one test per identity |
| "A receipt remains current when its ignored output file is absent on a clone; the output digest lets Cairn report the absence" (8) | 4 |
| "A kernel release does not itself stale evidence" (8) | 4 (no kernel version is an identity) |
| "review metadata may name a fail receipt written before the start record" (2, Range) | 5 |
| "The mechanism counts only after review metadata names a fail receipt from the violating example" (7) | 5 |
| Attempt: "A failing receipt at an input snapshot not seen among failures since that requirement's last pass" (2) | 6 |
| "A rerun at a seen input snapshot and a change only to documents or outside paths are not new attempts" (8) | 6 |
| "Changes only to documents cost a check, not a mechanism review" (8) | 3 (product digest), 5 (review binds by definition digest, not by tree) |
| `--touch`: "`cairn end` writes the addition into the definition, which unbinds its review metadata ... or drops it when the path is unchanged" (2) | 7 |
| Check lock "held only for the run, so a check can nest inside an implementation action" (2) | 3 (`withCheckLock` around the run only) |
| Q1 and Q2 cite "which fail receipt records it, and what the check printed" (9) | 3, 5 (the receipt and its output digest are what the review cites) |

Left to other plans, deliberately:

- `declare REQ` predicate "no pre-existing undeclared delta was legalized" and "`cairn declare` performs this preflight before it can add an input" (5): plan 07 adds the `preflight` call at the top of `declare`.
- The `run`, `implement`, `review mechanism` and `escalate REQ` predicates as wake verdicts (5): plan 08 computes them from `evidence`, `reviewBinds` and `attempts` exported here; plan 09 writes the escalation.
- "no declared product input changed" in `review mechanism REQ` (5): plan 08 compares `product_digest` of the fail receipt's snapshot with the current one.
- "A mechanism reused for a revised requirement in a later commitment needs `review mechanism`" (8): follows from the text-digest binding here; plan 08 names the action.
- The lease's effect on `record` and `commit` findings (2): plan 08.
- `cairn show` rendering of receipts (4): plan 08's `lib/cli.mjs`.
- The settings-side refusal of an `outside` path overlapping a mechanism input at settings load (2): plan 02.
