# Review and the adversary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build `lib/review.mjs`: the builder's review, the brief and adversary projection, the adversary's one report, resolutions, cumulative acceptances, and the finding ledger the Done rule reads.

**Architecture:** one module writes the five review-chain kinds (`review`, `brief`, `report`, `resolution`, `acceptance`) through plan 01's `appendRecord` at workspace snapshots from plan 01's `writeWorkspaceSnapshot`. The kernel checks coverage and shape, never truth: every fixed question for every target, every interface obligation, every submitted resolution. `cairn brief` materializes the reviewed snapshot from Git object bytes into a temp directory with excluded paths omitted, records digests, and prints exactly what the agent needs to start the adversary through the harness; the kernel spawns no model. A pure `ledger` over the decoded log gives every finding one status, using plan 09's `disputes`; a second rejection of the same finding escalates through plan 09's `escalate`, and the third acceptance round calls plan 08's `writeCycleEscalation` with its `BOUNDS`.

**Tech Stack:** Node 24, ES modules, no dependencies, `node --test` with `node:assert/strict`, Git plumbing through plan 01's `lib/gitx.mjs` plus `git cat-file` for blob bytes.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 (Review, Report, Finding, Acceptance), section 5 (`review SLUG`, `report SLUG`, `resolve SLUG N`, `accept SLUG`; the Done paragraph "The report is written once ..."), section 8 (Review and evidence), section 9 (all subsections), section 13 decisions 8, 16, 20, 33, 43.

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Each question is answered `observed` with a command, path or output, or `not-checked`. The kernel checks coverage and shape, not truth."
- "One report is written per commitment." "The report is written once at the candidate snapshot. Every later fix is a resolution."
- "`cairn report` refuses a report whose snapshot differs from the review, whose brief or projection is stale, whose model or transport does not match the launch instruction, or which leaves a required question or interface unattempted." "Where a harness reports session identity, the report refuses the session that wrote the review." "A matching model is recorded, not refused."
- "a materialized export of the reviewed workspace snapshot with every `network_exclude` path and built-in credential path omitted. It contains no `.git` directory, Git object store, host path, evaluator key, built-in credential path, or command-output body." "The exclusion manifest names omitted path classes and paths but never their contents." "Projection reads Git object bytes, never live filesystem targets: it preserves safe relative symlinks as link text without following them, and refuses absolute or out-of-tree symlinks, special files and unresolved gitlinks."
- "Where it cannot, the brief names the projection as the only path the adversary may read and the report records `boundary: unenforced`; Cairn does not refuse the report." "`cairn brief` passes the model string through; it never maps aliases. A null or unknown entry means any model."
- "A resolution rejected twice for the same finding escalates, and the three-round liveness bound in section 5 prevents an unbounded stream of newly numbered findings."
- Plan 01's schemas are authoritative: `review = {slug, snapshot, examined, answers: [{question: Q1..Q6, target, status, text}], findings: [{n, text}]}`, `brief = {slug, review, projection_digest, payload_digest, exclusions_digest}`, `report = {slug, snapshot, brief, model, transport: local|remote, boundary, builder_model, projection_digest, attempts: [{question, target, text}], findings, interface_attempts: [{path, text}]}`, `resolution = {source, finding, snapshot, explanation}`, `acceptance = {slug, report, snapshot, delta_digest, accepted: [{resolution, reason}], rejected, findings}`. This plan adds `session: nullable(str)` to `review`, `report` and `acceptance` (section 9 needs it) and patches plan 08's fixture to match. Record targets are the commitment slug.
- The adversary is started by the agent through the harness. The kernel never spawns a model process.

---

### Task 1: The builder's review

**Files:**
- Create: `lib/review.mjs`
- Modify: `lib/records.mjs` (the `SCHEMAS.review`, `SCHEMAS.report`, `SCHEMAS.acceptance` entries, plan 01)
- Modify: `tests/helpers/loop.mjs` (the `review`, `report` and `accept` steps, plan 08)
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `loopRepo({settings, reqs})` from `tests/helpers/loop.mjs` (plan 08: initialized project, open commitment `first`, one declared mechanism per requirement named by the lowercase identifier, `cwd`, `slug`, `reqs`, `startSnapshot`, `write`, `link`, `commit`, `log()`, `add`, `snap`); `appendRecord`, `readLog`, `range`, `decodeRecord`, `KINDS` (plan 01); `writeWorkspaceSnapshot` (plan 01); `readMechanisms(cwd) -> {name: {definition, ...}}` (plan 05); `catCommit` (plan 01); `resetOnProgress(cwd)` (plan 08); `openRange(log, slug)` from `lib/escalate.mjs` (plan 09).
- Produces: `review(cwd, slug, submission, {env}) -> sha`, `targets(cwd, log, slug) -> {slug, start, range, requirements, mechanisms}`, `requiredPairs(t) -> [[question, target]]`, `checkAnswers(answers, t) -> answers`, `checkFindings(findings) -> findings`, `sessionIdentity(env) -> string|null` (`CAIRN_SESSION`, then `CLAUDE_SESSION_ID`, as plan 04's lease reads it), `QUESTIONS`, `ReviewError`. A submission is `{examined: [string], answers: [{question, target, status, text}], findings: [{n, text}]}`. Required pairs: Q1 and Q2 per mechanism of the commitment, Q3 and Q4 per frozen requirement, Q5 and Q6 with the slug as target. `observed` needs non-empty text (the command, path or output); `not-checked` text may be empty.

- [ ] **Step 1: Patch the schemas and the fixture, then write the failing test**

In `lib/records.mjs` add `session: nullable(str)` to the `review`, `report` and `acceptance` entries of `SCHEMAS`, after `slug`. In `tests/helpers/loop.mjs` add `session: null` to the payloads written by the `review`, `report` and `accept` steps. Run `node --test tests/wake.test.mjs tests/records.test.mjs` and expect PASS before continuing.

```js
// tests/review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLog, decodeRecord, KINDS } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { loopRepo } from './helpers/loop.mjs';
import { review, targets, ReviewError } from '../lib/review.mjs';

export const SETTINGS = {
  harness: { claude_code: { adversary_model: 'claude-fable-5-1', adversary_transport: 'remote' }, codex: null },
  interfaces: ['src/api/**'], network_exclude: ['fixtures/private/**'],
};
export async function claims(r, over = {}) {
  const t = await targets(r.cwd, await r.log(), r.slug);
  const answers = [
    ...t.mechanisms.flatMap((m) => [{ question: 'Q1', target: m, status: 'observed', text: `flag fail: cairn: ${m.toUpperCase()}: fail at receipt 3f2` }, { question: 'Q2', target: m, status: 'observed', text: 'the printed line names the flag, not a setup error' }]),
    ...t.requirements.flatMap((q) => [{ question: 'Q3', target: q, status: 'observed', text: 'node check.mjs with an empty flag exits 1' }, { question: 'Q4', target: q, status: 'not-checked', text: 'the logger changed too' }]),
    { question: 'Q5', target: r.slug, status: 'not-checked', text: 'a race between two writers' }, { question: 'Q6', target: r.slug, status: 'not-checked', text: '' },
  ];
  return { examined: ['src/demo.mjs'], answers, findings: [], ...over };
}

test('a review records the current snapshot, session, examined entries, every answer and numbered findings', async () => {
  for (const k of ['review', 'brief', 'report', 'resolution', 'acceptance']) assert.ok(KINDS.has(k));
  const r = await loopRepo();
  const sha = await review(r.cwd, 'first', await claims(r, { findings: [{ n: 1, text: 'no empty-input test' }] }), { env: { CAIRN_SESSION: 's-builder' } });
  const c = await catCommit(r.cwd, sha);
  assert.equal(c.subject, 'cairn: review first');
  const p = decodeRecord(c).payload;
  assert.deepEqual([p.slug, p.session, p.examined, p.findings], ['first', 's-builder', ['src/demo.mjs'], [{ n: 1, text: 'no empty-input test' }]]);
  assert.match(p.snapshot, /^[0-9a-f]{40}$/);
  assert.equal(p.answers.length, (await claims(r)).answers.length);
});

test('coverage: a missing pair, an unknown target, a duplicate, an empty examined list and a bad finding number are refused', async () => {
  const r = await loopRepo();
  const s = await claims(r);
  await assert.rejects(review(r.cwd, 'first', { ...s, answers: s.answers.filter((a) => a.question !== 'Q2') }), new RegExp(`${s.answers[0].target} Q2 has no answer`));
  await assert.rejects(review(r.cwd, 'first', { ...s, answers: [...s.answers, { question: 'Q3', target: 'ZZZ-999', status: 'observed', text: 'x' }] }), /ZZZ-999 is not a target of first/);
  await assert.rejects(review(r.cwd, 'first', { ...s, answers: [...s.answers, s.answers[0]] }), /answered twice/);
  await assert.rejects(review(r.cwd, 'first', { ...s, examined: [] }), /examined needs at least one entry/);
  await assert.rejects(review(r.cwd, 'first', { ...s, findings: [{ n: 2, text: 'x' }] }), /findings must be numbered 1, 2/);
  await assert.rejects(review(r.cwd, 'other', s), /no open commitment other/);
});

test('shape: observed needs text; the status is closed; keys are closed', async () => {
  const r = await loopRepo();
  const s = await claims(r);
  const swap = (a) => ({ ...s, answers: s.answers.map((x) => (x.question === 'Q5' ? a : x)) });
  await assert.rejects(review(r.cwd, 'first', swap({ question: 'Q5', target: 'first', status: 'observed', text: '' })), /Q5 observed needs text/);
  await assert.rejects(review(r.cwd, 'first', swap({ question: 'Q5', target: 'first', status: 'true', text: 'y' })), /status must be observed or not-checked/);
  await assert.rejects(review(r.cwd, 'first', swap({ question: 'Q5', target: 'first', status: 'not-checked', text: 'y', cite: 1 })), /answer keys are question, target, status, text/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/review.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { resetOnProgress } from './cycle.mjs';
import { openRange } from './escalate.mjs';

export class ReviewError extends Error {}
export const QUESTIONS = { mechanism: ['Q1', 'Q2'], requirement: ['Q3', 'Q4'], commitment: ['Q5', 'Q6'] };
export function sessionIdentity(env = process.env) { return env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID ?? null; }
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

export async function targets(cwd, log, slug) {
  const r = openRange(log, slug);
  const requirements = r.start.payload.requirements.map((q) => q.requirement);
  const all = await readMechanisms(cwd);
  const mechanisms = Object.keys(all).filter((m) => all[m].definition.requirements.some((q) => requirements.includes(q))).sort();
  return { slug, start: r.start, range: r, requirements, mechanisms };
}

export function requiredPairs(t) {
  return [
    ...t.mechanisms.flatMap((m) => QUESTIONS.mechanism.map((q) => [q, m])),
    ...t.requirements.flatMap((x) => QUESTIONS.requirement.map((q) => [q, x])),
    ...QUESTIONS.commitment.map((q) => [q, t.slug]),
  ];
}

export function checkAnswers(answers, t) {
  if (!Array.isArray(answers)) throw new ReviewError('cairn: review: answers must be a list');
  const seen = new Set();
  for (const a of answers) {
    if (!a || Object.keys(a).sort().join(',') !== 'question,status,target,text') throw new ReviewError('cairn: review: answer keys are question, target, status, text');
    if (!requiredPairs(t).some(([q, x]) => q === a.question && x === a.target)) throw new ReviewError(`cairn: review: ${a.target} is not a target of ${t.slug} for ${a.question}`);
    if (a.status !== 'observed' && a.status !== 'not-checked') throw new ReviewError(`cairn: review: ${a.target} ${a.question} status must be observed or not-checked`);
    if (typeof a.text !== 'string') throw new ReviewError(`cairn: review: ${a.target} ${a.question} text must be a string`);
    if (a.status === 'observed' && !nonEmpty(a.text)) throw new ReviewError(`cairn: review: ${a.target} ${a.question} observed needs text: a command, path or output`);
    const key = `${a.question} ${a.target}`;
    if (seen.has(key)) throw new ReviewError(`cairn: review: ${key} answered twice`);
    seen.add(key);
  }
  for (const [q, x] of requiredPairs(t)) if (!seen.has(`${q} ${x}`)) throw new ReviewError(`cairn: review: ${x} ${q} has no answer`);
  return answers;
}

export function checkFindings(findings) {
  if (!Array.isArray(findings)) throw new ReviewError('cairn: findings must be a list');
  findings.forEach((f, i) => {
    if (!f || Object.keys(f).sort().join(',') !== 'n,text' || f.n !== i + 1 || !nonEmpty(f.text)) throw new ReviewError('cairn: findings must be numbered 1, 2, ... each with text');
  });
  return findings;
}

export async function review(cwd, slug, submission, opts = {}) {
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const { examined } = submission;
  if (!Array.isArray(examined) || examined.length === 0 || !examined.every(nonEmpty)) throw new ReviewError('cairn: review: examined needs at least one entry');
  const answers = checkAnswers(submission.answers, t);
  const findings = checkFindings(submission.findings ?? []);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const sha = await appendRecord(cwd, 'review', slug, { slug, session: sessionIdentity(opts.env), snapshot, examined, answers, findings });
  await resetOnProgress(cwd); // the loop advanced from implementation to review: semantic progress
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs tests/wake.test.mjs`
Expected: PASS (3 new tests; wake unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs lib/records.mjs tests/helpers/loop.mjs tests/review.test.mjs
git commit -m "Record the builder's review with every fixed question answered per target"
```

---

### Task 2: The adversary projection

**Files:**
- Modify: `lib/review.mjs`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `listTree(cwd, treeSha) -> [{path, mode, sha}]`, `git(args, {cwd, input})` (plan 01); `matchGlob(pattern, p)`, `CREDENTIAL_PATTERNS` (plan 02); `canonicalize`, `sha256` (plan 01).
- Produces: `project(cwd, settings, treeSha, dir) -> {projectionDigest, manifest, exclusionsDigest, included}`, `exclusionClass(path, settings) -> 'git'|'output'|'network_exclude'|'credential'|null`, `catBlob(cwd, sha) -> Buffer`. `manifest = {classes: [string], paths: [{path, class}]}` sorted by path; `projectionDigest = sha256(canonicalize(included))` over the sorted `[path, mode, blobSha]` triples written; `exclusionsDigest = sha256(canonicalize(manifest))`.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { git } from '../lib/gitx.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { project } from '../lib/review.mjs';

async function tree(r) { await git(['add', '-A'], { cwd: r.cwd }); return (await git(['write-tree'], { cwd: r.cwd })).stdout.trim(); }
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'cairn-proj-'));

test('the projection omits network_exclude and credential paths, names them in the manifest without contents, and has no .git', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  for (const [p, c] of [['fixtures/private/k.json', '{"secret":1}'], ['.env', 'A=1\n'], ['server.pem', 'x'], ['src/b.mjs', 'export const b = 2;\n']]) await r.write(p, c);
  await r.commit('add fixtures');
  const { settings } = await loadSettings(r.cwd);
  const dir = await tmp();
  const out = await project(r.cwd, settings, await tree(r), dir);
  assert.deepEqual(out.manifest.classes, ['credential', 'network_exclude']);
  assert.deepEqual(out.manifest.paths.map((p) => `${p.class} ${p.path}`), ['credential .env', 'network_exclude fixtures/private/k.json', 'credential server.pem']);
  assert.equal(JSON.stringify(out.manifest).includes('secret'), false);
  for (const gone of ['fixtures/private/k.json', '.env', 'server.pem', '.git']) await assert.rejects(fs.stat(path.join(dir, gone)));
  assert.equal(await fs.readFile(path.join(dir, 'src/b.mjs'), 'utf8'), 'export const b = 2;\n');
  assert.ok((await fs.stat(path.join(dir, '.cairn/settings.json'))).isFile());
  assert.match(out.projectionDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(out.exclusionsDigest, /^sha256:[0-9a-f]{64}$/);
});

test('a safe relative symlink is preserved as link text; absolute and out-of-tree links and gitlinks are refused', async () => {
  const r = await loopRepo();
  const { settings } = await loadSettings(r.cwd);
  await r.write('src/real.txt', 'r\n');
  await r.link('src/abs', '/etc/passwd');
  await assert.rejects(project(r.cwd, settings, await tree(r), await tmp()), /absolute symlink at src\/abs/);
  await fs.unlink(path.join(r.cwd, 'src/abs'));
  await r.link('src/up', '../../outside');
  await assert.rejects(project(r.cwd, settings, await tree(r), await tmp()), /out-of-tree symlink at src\/up/);
  await fs.unlink(path.join(r.cwd, 'src/up'));
  await r.link('src/link', 'real.txt');
  const dir = await tmp();
  const out = await project(r.cwd, settings, await tree(r), dir);
  assert.equal(await fs.readlink(path.join(dir, 'src/link')), 'real.txt');
  assert.ok(out.included.some(([p, mode]) => p === 'src/link' && mode === '120000'));
  await git(['update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},sub`], { cwd: r.cwd });
  await assert.rejects(project(r.cwd, settings, (await git(['write-tree'], { cwd: r.cwd })).stdout.trim(), await tmp()), /unresolved gitlink at sub/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `project is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (imports)
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalize, sha256 } from './canon.mjs';
import { listTree } from './gitx.mjs';
import { matchGlob, CREDENTIAL_PATTERNS } from './paths.mjs';
const execFileP = promisify(execFile);

// lib/review.mjs (append)
export async function catBlob(cwd, sha) {
  const { stdout } = await execFileP('git', ['cat-file', 'blob', sha], { cwd, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

export function exclusionClass(p, settings) {
  if (p === '.git' || p.startsWith('.git/')) return 'git';
  if (p.startsWith('.cairn/output/')) return 'output';
  if ((settings.network_exclude ?? []).some((g) => matchGlob(g, p))) return 'network_exclude';
  if (CREDENTIAL_PATTERNS.some((g) => matchGlob(g, p))) return 'credential';
  return null;
}

function checkLink(p, target) {
  if (target.startsWith('/') || target.startsWith('~')) throw new ReviewError(`cairn: brief: absolute symlink at ${p}`);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(p), target));
  if (resolved === '..' || resolved.startsWith('../')) throw new ReviewError(`cairn: brief: out-of-tree symlink at ${p}`);
}

export async function project(cwd, settings, treeSha, dir) {
  await fs.mkdir(dir, { recursive: true });
  const manifest = { classes: [], paths: [] };
  const included = [];
  for (const e of (await listTree(cwd, treeSha)).sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const cls = exclusionClass(e.path, settings);
    if (cls) { manifest.paths.push({ path: e.path, class: cls }); continue; }
    if (e.mode === '160000') throw new ReviewError(`cairn: brief: unresolved gitlink at ${e.path}`);
    if (!['100644', '100755', '120000'].includes(e.mode)) throw new ReviewError(`cairn: brief: special file at ${e.path}`);
    const bytes = await catBlob(cwd, e.sha);
    const out = path.join(dir, ...e.path.split('/'));
    await fs.mkdir(path.dirname(out), { recursive: true });
    if (e.mode === '120000') { const target = bytes.toString('utf8'); checkLink(e.path, target); await fs.symlink(target, out); }
    else await fs.writeFile(out, bytes, { mode: e.mode === '100755' ? 0o755 : 0o644 });
    included.push([e.path, e.mode, e.sha]);
  }
  manifest.classes = [...new Set(manifest.paths.map((p) => p.class))].sort();
  return { projectionDigest: sha256(canonicalize(included)), manifest, exclusionsDigest: sha256(canonicalize(manifest)), included };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/review.test.mjs
git commit -m "Materialize the adversary projection from Git objects with excluded paths omitted"
```

---

### Task 3: Harness detection, the brief record and what `cairn brief` prints

**Files:**
- Modify: `lib/review.mjs`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `loadSettings(cwd)` (plan 02); `parseDomainFile(text) -> {blocks: [{id, obligation, falsifier}]}` (plan 02) for the frozen texts read from the snapshot's `docs/spec/*.md` blobs; `readSnapshot(cwd, sha, 'workspace') -> {tree}` (plan 01); `readMechanisms` (plan 05); `git(['diff-tree', ...])` (plan 01).
- Produces: `detectHarness(settings, {harness, env}) -> {name, model, transport, boundary}`, `diffTree(cwd, fromTree, toTree) -> [{path, status}]`, `interfaceObligations(cwd, settings, fromWs, toWs) -> [path]`, `renderBrief(parts) -> string`, `brief(cwd, slug, {harness, env, dir}) -> {sha, projectionDir, briefPath, launch, text}`, `HARNESS_ENV`, `CONFINES = {claude_code: false, codex: false, muse: false}` (no supported harness confines a subagent, so `boundary` is `unenforced`). `cairn brief` prints exactly:

```
cairn: brief <slug> <sha>
brief: <briefPath>
brief digest: <payload_digest>
projection: <projectionDir>
projection digest: <projection_digest>
harness: <name>
model: <model or any>
transport: <transport or any>
boundary: <enforced|unenforced>
start: in <name>, start a fresh adversary with model <model or any> over <transport or any>, working directory <projectionDir>, with the file <briefPath> as its entire prompt; when it finishes, run: cairn report <slug> --file <its report>
```

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { sha256 } from '../lib/canon.mjs';
import { detectHarness, brief, interfaceObligations, CONFINES } from '../lib/review.mjs';

test('the harness comes from --harness, then CAIRN_HARNESS, then the harness environment, and must name a settings entry; the model string passes through', () => {
  assert.deepEqual(detectHarness(SETTINGS, { harness: 'claude_code', env: {} }), { name: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', boundary: 'unenforced' });
  assert.equal(detectHarness(SETTINGS, { env: { CAIRN_HARNESS: 'claude_code' } }).name, 'claude_code');
  assert.equal(detectHarness(SETTINGS, { env: { CLAUDECODE: '1' } }).name, 'claude_code');
  assert.deepEqual(detectHarness(SETTINGS, { harness: 'codex', env: {} }), { name: 'codex', model: null, transport: null, boundary: 'unenforced' });
  assert.throws(() => detectHarness(SETTINGS, { env: {} }), /no harness detected; pass --harness/);
  assert.throws(() => detectHarness(SETTINGS, { harness: 'muse', env: {} }), /harness muse has no settings entry/);
  assert.deepEqual(CONFINES, { claude_code: false, codex: false, muse: false });
});

export async function reviewed(over = {}) {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('change an interface');
  r.rev = await review(r.cwd, 'first', await claims(r, over), { env: { CAIRN_SESSION: 's-builder' } });
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  return r;
}

test('brief writes the record, the projection and the rendered file, and prints the launch block', async () => {
  const bare = await loopRepo({ settings: SETTINGS });
  await assert.rejects(brief(bare.cwd, 'first', { harness: 'claude_code' }), /no review for first/);
  const r = await reviewed({ findings: [{ n: 1, text: 'no test' }] });
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  const p = decodeRecord(await catCommit(r.cwd, b.sha)).payload;
  assert.deepEqual([p.slug, p.review, p.payload_digest], ['first', r.rev, sha256(b.text)]);
  assert.match(p.projection_digest, /^sha256:/);
  assert.match(p.exclusions_digest, /^sha256:/);
  assert.ok(b.briefPath.startsWith(path.join(r.cwd, '.cairn/output/brief-')));
  assert.equal(await fs.readFile(b.briefPath, 'utf8'), b.text);
  for (const s of ['## Interface obligations\nsrc/api/x.mjs\n', '## Builder findings\n1. no test\n', '[DEMO-001]', 'Falsifier:', 'mechanism demo-001 Q1 observed:',
    'cannot detect a secret a person or primary coding agent copied into ordinary prose', 'You may read only the projection directory. Boundary: unenforced.']) assert.ok(b.text.includes(s), s);
  const lines = b.launch.split('\n');
  assert.equal(lines[0], `cairn: brief first ${b.sha}`);
  assert.deepEqual(lines.slice(5, 9), ['harness: claude_code', 'model: claude-fable-5-1', 'transport: remote', 'boundary: unenforced']);
  assert.equal(lines[9], `start: in claude_code, start a fresh adversary with model claude-fable-5-1 over remote, working directory ${b.projectionDir}, with the file ${b.briefPath} as its entire prompt; when it finishes, run: cairn report first --file <its report>`);
  assert.equal(lines[10], '');
  await assert.rejects(fs.stat(path.join(b.projectionDir, '.git')));
  assert.deepEqual(await interfaceObligations(r.cwd, SETTINGS, r.startSnapshot, r.revPayload.snapshot), ['src/api/x.mjs']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `detectHarness is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (imports)
import os from 'node:os';
import { git } from './gitx.mjs';
import { readSnapshot } from './snapshots.mjs';
import { loadSettings } from './settings.mjs';
import { parseDomainFile } from './spec.mjs';

// lib/review.mjs (append)
export const HARNESS_ENV = [['CLAUDECODE', 'claude_code'], ['CODEX_HOME', 'codex'], ['MUSE_SESSION', 'muse']];
export const CONFINES = { claude_code: false, codex: false, muse: false };

export function detectHarness(settings, { harness, env = process.env } = {}) {
  const name = harness ?? env.CAIRN_HARNESS ?? (HARNESS_ENV.find(([v]) => env[v]) ?? [])[1];
  if (!name) throw new ReviewError('cairn: brief: no harness detected; pass --harness <name>');
  if (!settings.harness || !(name in settings.harness)) throw new ReviewError(`cairn: brief: harness ${name} has no settings entry`);
  const entry = settings.harness[name] ?? {};
  return { name, model: entry.adversary_model ?? null, transport: entry.adversary_transport ?? null, boundary: CONFINES[name] ? 'enforced' : 'unenforced' };
}

export async function diffTree(cwd, fromTree, toTree) {
  const { stdout } = await git(['diff-tree', '-r', '--name-status', '--no-renames', fromTree, toTree], { cwd });
  return stdout.split('\n').filter(Boolean).map((l) => { const [status, p] = l.split('\t'); return { path: p, status }; }).sort((a, b) => (a.path < b.path ? -1 : 1));
}

export async function interfaceObligations(cwd, settings, fromWs, toWs) {
  const a = await readSnapshot(cwd, fromWs, 'workspace'), b = await readSnapshot(cwd, toWs, 'workspace');
  return (await diffTree(cwd, a.tree, b.tree)).map((d) => d.path).filter((p) => (settings.interfaces ?? []).some((g) => matchGlob(g, p)));
}

async function specBlocks(cwd, entries, ids) {
  const out = [];
  for (const e of entries) {
    if (!e.path.startsWith('docs/spec/') || !e.path.endsWith('.md')) continue;
    for (const b of parseDomainFile((await catBlob(cwd, e.sha)).toString('utf8')).blocks) if (ids.includes(b.id)) out.push(b);
  }
  return out.sort((x, y) => (x.id < y.id ? -1 : 1));
}

function roadmapSection(text, slug) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^#+\s/.test(l) && l.includes(slug));
  if (i < 0) return '';
  const j = lines.findIndex((l, k) => k > i && /^#+\s/.test(l));
  return lines.slice(i, j < 0 ? undefined : j).join('\n').trim();
}

const kindOf = (q) => (q < 'Q3' ? 'mechanism' : q < 'Q5' ? 'requirement' : 'commitment');

export function renderBrief({ slug, roadmap, blocks, mechanisms, rev, obligations, manifest, launch }) {
  const L = [`# Adversary brief: ${slug}`, '', '## Roadmap section', roadmap, '', '## Frozen requirements and falsifiers'];
  for (const b of blocks) L.push(`[${b.id}] ${b.obligation}`, `Falsifier: ${b.falsifier}`, '');
  L.push('## Mechanism definitions');
  for (const [name, m] of Object.entries(mechanisms)) L.push(`${name}: ${JSON.stringify(m.definition)}`);
  L.push('', '## Builder claims');
  for (const a of rev.answers) L.push(`${kindOf(a.question)} ${a.target} ${a.question} ${a.status}: ${a.text}`);
  L.push('', '## Builder findings');
  for (const f of rev.findings) L.push(`${f.n}. ${f.text}`);
  L.push('', '## Interface obligations', ...obligations, '', '## Exclusion manifest (classes and paths, never contents)');
  for (const p of manifest.paths) L.push(`${p.class} ${p.path}`);
  L.push('', '## Boundary', `Harness ${launch.name}, model ${launch.model ?? 'any'}, transport ${launch.transport ?? 'any'}.`,
    `You may read only the projection directory. Boundary: ${launch.boundary}.`,
    'This projection omits network_exclude and credential paths. It is an egress boundary, not an information-flow proof: it cannot detect a secret a person or primary coding agent copied into ordinary prose, and it does not govern Git pushes.',
    '', '## Your work', 'For each mechanism (Q1, Q2): try to make it pass without the behavior, make it fail for a setup reason, and find an input it reads but does not declare. For each Q3: try to reach the falsifier with an input. For each Q4: find touched paths the claim omitted. For Q5 and Q6: look where the builder said not to. Every interface obligation gets a caller-level attempt. Write one attempt per question and target, one per interface path, and number your findings from 1.', '');
  return L.join('\n');
}

export async function brief(cwd, slug, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  if (!rev) throw new ReviewError(`cairn: no review for ${slug}`);
  const launch = detectHarness(settings, opts);
  const snap = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  const dir = opts.dir ?? await fs.mkdtemp(path.join(os.tmpdir(), `cairn-projection-${slug}-`));
  const proj = await project(cwd, settings, snap.tree, dir);
  const entries = await listTree(cwd, snap.tree);
  const roadmapEntry = entries.find((e) => e.path === 'docs/spec/roadmap.md');
  const all = await readMechanisms(cwd);
  const text = renderBrief({
    slug, roadmap: roadmapEntry ? roadmapSection((await catBlob(cwd, roadmapEntry.sha)).toString('utf8'), slug) : '',
    blocks: await specBlocks(cwd, entries, t.requirements), mechanisms: Object.fromEntries(t.mechanisms.map((m) => [m, all[m]])),
    rev: rev.payload, obligations: await interfaceObligations(cwd, settings, t.start.payload.snapshot, rev.payload.snapshot), manifest: proj.manifest, launch,
  });
  const payloadDigest = sha256(text);
  const sha = await appendRecord(cwd, 'brief', slug, { slug, review: rev.sha, projection_digest: proj.projectionDigest, payload_digest: payloadDigest, exclusions_digest: proj.exclusionsDigest });
  const briefPath = path.join(cwd, '.cairn/output', `brief-${payloadDigest.slice(7)}.md`);
  await fs.mkdir(path.dirname(briefPath), { recursive: true });
  await fs.writeFile(briefPath, text);
  const any = (v) => v ?? 'any';
  const launchText = [`cairn: brief ${slug} ${sha}`, `brief: ${briefPath}`, `brief digest: ${payloadDigest}`, `projection: ${dir}`, `projection digest: ${proj.projectionDigest}`,
    `harness: ${launch.name}`, `model: ${any(launch.model)}`, `transport: ${any(launch.transport)}`, `boundary: ${launch.boundary}`,
    `start: in ${launch.name}, start a fresh adversary with model ${any(launch.model)} over ${any(launch.transport)}, working directory ${dir}, with the file ${briefPath} as its entire prompt; when it finishes, run: cairn report ${slug} --file <its report>`, ''].join('\n');
  return { sha, projectionDir: dir, briefPath, launch: launchText, text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/review.test.mjs
git commit -m "Write the brief record, render the brief, and print the adversary launch block"
```

---

### Task 4: The adversary's one report

**Files:**
- Modify: `lib/review.mjs`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Produces: `report(cwd, slug, body, {env}) -> sha`, `checkAttempts(attempts, t) -> attempts`, `checkInterfaceAttempts(list, obligations) -> list`. Body: `{harness, model, transport, session, builder_model, projection_digest, attempts: [{question, target, text}], findings, interface_attempts: [{path, text}]}`. Payload: plan 01's `report` keys plus `session`; `boundary` comes from `detectHarness`, never from the body.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { report } from '../lib/review.mjs';

export async function briefed(over = {}) {
  const r = await reviewed(over);
  r.b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  r.bp = decodeRecord(await catCommit(r.cwd, r.b.sha)).payload;
  return r;
}
export function adversary(r, over = {}) {
  return {
    harness: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', session: 's-adversary', builder_model: null, projection_digest: r.bp.projection_digest,
    attempts: r.revPayload.answers.map((a) => ({ question: a.question, target: a.target, text: `tried to break ${a.target} for ${a.question}: held` })),
    findings: [{ n: 1, text: 'the flag accepts whitespace-only input' }],
    interface_attempts: [{ path: 'src/api/x.mjs', text: 'called x() from a fresh module: held' }], ...over,
  };
}

test('report records attempts, model, transport, boundary and session at the reviewed snapshot; a second report is refused', async () => {
  const r = await briefed();
  const sha = await report(r.cwd, 'first', adversary(r));
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.brief, p.snapshot, p.model, p.transport, p.boundary, p.session, p.builder_model], [r.b.sha, r.revPayload.snapshot, 'claude-fable-5-1', 'remote', 'unenforced', 's-adversary', null]);
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /one report per commitment; first has/);
});

test('report refuses a snapshot differing from the review, a stale projection and a stale brief', async () => {
  const r = await briefed();
  await assert.rejects(report(r.cwd, 'first', adversary(r, { projection_digest: 'sha256:' + '0'.repeat(64) })), /projection digest does not match the brief/);
  await r.write('src/demo.mjs', 'export const changed = 1;\n');
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /workspace differs from the reviewed snapshot/);
  await review(r.cwd, 'first', await claims(r));
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /brief [0-9a-f]{40} is stale: the review is/);
});

test('report refuses a model or transport that does not match the launch instruction; a matching builder model is recorded', async () => {
  const r = await briefed();
  await assert.rejects(report(r.cwd, 'first', adversary(r, { model: 'other-model' })), /model other-model does not match the launch instruction claude-fable-5-1/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { transport: 'local' })), /transport local does not match the launch instruction remote/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { model: null })), /model must be a string/);
  const sha = await report(r.cwd, 'first', adversary(r, { builder_model: 'claude-fable-5-1' }));
  assert.equal(decodeRecord(await catCommit(r.cwd, sha)).payload.builder_model, 'claude-fable-5-1');
});

test('report refuses a missing question or interface attempt, and the session that wrote the review', async () => {
  const r = await briefed();
  const a = adversary(r);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: a.attempts.filter((x) => x.question !== 'Q4') }), /Q4 has no attempt/);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: [...a.attempts, { question: 'Q3', target: 'ZZZ-999', text: 'x' }] }), /ZZZ-999 is not a target/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { interface_attempts: [] })), /interface src\/api\/x.mjs has no attempt/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { session: 's-builder' })), /session s-builder wrote the review/);
  const anon = await report(r.cwd, 'first', adversary(r, { session: null }));
  assert.equal(decodeRecord(await catCommit(r.cwd, anon)).payload.session, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `report is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (append)
export function checkAttempts(attempts, t) {
  if (!Array.isArray(attempts)) throw new ReviewError('cairn: report: attempts must be a list');
  const seen = new Set();
  for (const a of attempts) {
    if (!a || Object.keys(a).sort().join(',') !== 'question,target,text' || !nonEmpty(a.text)) throw new ReviewError('cairn: report: an attempt is {question, target, text} with text');
    if (!requiredPairs(t).some(([q, x]) => q === a.question && x === a.target)) throw new ReviewError(`cairn: report: ${a.target} is not a target of ${t.slug} for ${a.question}`);
    seen.add(`${a.question} ${a.target}`);
  }
  for (const [q, x] of requiredPairs(t)) if (!seen.has(`${q} ${x}`)) throw new ReviewError(`cairn: report: ${x} ${q} has no attempt`);
  return attempts;
}

export function checkInterfaceAttempts(list, obligations) {
  if (!Array.isArray(list) || !list.every((x) => x && Object.keys(x).sort().join(',') === 'path,text' && nonEmpty(x.text))) throw new ReviewError('cairn: report: an interface attempt is {path, text} with text');
  for (const p of obligations) if (!list.some((x) => x.path === p)) throw new ReviewError(`cairn: report: interface ${p} has no attempt`);
  return list;
}

export async function report(cwd, slug, body, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const prior = t.range.records.find((r) => r.kind === 'report');
  if (prior) throw new ReviewError(`cairn: one report per commitment; ${slug} has ${prior.sha}`);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  const br = t.range.records.filter((r) => r.kind === 'brief').at(-1);
  if (!rev || !br) throw new ReviewError(`cairn: ${slug} needs a review and a brief before a report`);
  if (br.payload.review !== rev.sha) throw new ReviewError(`cairn: brief ${br.sha} is stale: the review is ${rev.sha}`);
  if (body.projection_digest !== br.payload.projection_digest) throw new ReviewError('cairn: report: projection digest does not match the brief');
  const now = await readSnapshot(cwd, await writeWorkspaceSnapshot(cwd), 'workspace'), then = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  if (now.tree !== then.tree) throw new ReviewError('cairn: report: the workspace differs from the reviewed snapshot');
  const launch = detectHarness(settings, { harness: body.harness, env: opts.env ?? {} });
  if (typeof body.model !== 'string' || body.model === '') throw new ReviewError('cairn: report: model must be a string');
  if (launch.model !== null && body.model !== launch.model) throw new ReviewError(`cairn: report: model ${body.model} does not match the launch instruction ${launch.model}`);
  if (launch.transport !== null && body.transport !== launch.transport) throw new ReviewError(`cairn: report: transport ${body.transport} does not match the launch instruction ${launch.transport}`);
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`cairn: report: session ${session} wrote the review`);
  const attempts = checkAttempts(body.attempts ?? [], t);
  const obligations = await interfaceObligations(cwd, settings, t.start.payload.snapshot, rev.payload.snapshot);
  const interface_attempts = checkInterfaceAttempts(body.interface_attempts ?? [], obligations);
  const findings = checkFindings(body.findings ?? []);
  const sha = await appendRecord(cwd, 'report', slug, {
    slug, session, snapshot: rev.payload.snapshot, brief: br.sha, model: body.model, transport: body.transport, boundary: launch.boundary,
    builder_model: body.builder_model ?? null, projection_digest: body.projection_digest, attempts, findings, interface_attempts,
  });
  await resetOnProgress(cwd);
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/review.test.mjs
git commit -m "Record the adversary's report once, at the reviewed snapshot, with every refusal section 9 names"
```

---

### Task 5: Resolutions and the finding ledger

**Files:**
- Modify: `lib/review.mjs`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `disputes(log, record, n)`, `unanswered(log)`, `dispute`, `answer` from `lib/escalate.mjs` (plan 09).
- Produces: `ledger(log, slug) -> [{source, kind, n, text, status, resolutions, rejections}]` with `status` in `open | submitted | rejected | resolved | disputed`; `resolve(cwd, slug, n, explanation, {source}) -> sha`. Resolution payload: `{source, finding, snapshot, explanation}`; target is the slug.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { resolve, ledger } from '../lib/review.mjs';
import { dispute, answer } from '../lib/escalate.mjs';

export async function reported(over = {}) {
  const r = await briefed();
  r.rep = await report(r.cwd, 'first', adversary(r, over));
  return r;
}
export async function fixed(r, n, text, opts) {
  await r.write('src/demo.mjs', `export const demo = ${JSON.stringify(text)};\n`);
  return resolve(r.cwd, 'first', n, text, opts);
}

test('resolve names finding N on its exact source record and the snapshot after the fix', async () => {
  const r = await reported();
  await assert.rejects(resolve(r.cwd, 'first', 2, 'x'), /no unresolved finding 2/);
  await assert.rejects(resolve(r.cwd, 'first', 1, ''), /explanation needs text/);
  const sha = await fixed(r, 1, 'trim before the guard');
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.source, p.finding, p.explanation], [r.rep, 1, 'trim before the guard']);
  assert.notEqual(p.snapshot, r.revPayload.snapshot);
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.source, f.n, f.status]), [[r.rep, 1, 'submitted']]);
  await assert.rejects(fixed(r, 1, 'again'), /finding 1 on .* awaits acceptance/);
});

test('the same number on two records is ambiguous until --source names one; a settled dispute closes a finding', async () => {
  const r = await briefed({ findings: [{ n: 1, text: 'builder finding' }] });
  r.rep = await report(r.cwd, 'first', adversary(r));
  await assert.rejects(resolve(r.cwd, 'first', 1, 'x'), new RegExp(`finding 1 is on ${r.rev} and ${r.rep}; pass --source`));
  const sha = await resolve(r.cwd, 'first', 1, 'x', { source: r.rev });
  assert.equal(decodeRecord(await catCommit(r.cwd, sha)).payload.source, r.rev);
  await dispute(r.cwd, { commitment: 'first', record: r.rep, n: 1, question: 'Defect?', recommendation: 'No.', because: 'whitespace is valid here', if_wrong: 'bad input passes', instead: 'trim' });
  await assert.rejects(resolve(r.cwd, 'first', 1, 'y', { source: r.rep }), /is under escalation/);
  await answer(r.cwd, 'first', 'ok', '', { confirm: async () => true });
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.source, f.status]), [[r.rev, 'submitted'], [r.rep, 'disputed']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `resolve is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (imports)
import { disputes, unanswered, escalate } from './escalate.mjs';

// lib/review.mjs (append)
const FINDING_KINDS = ['review', 'report', 'acceptance'];

export function ledger(log, slug) {
  const r = openRange(log, slug);
  const accs = r.records.filter((x) => x.kind === 'acceptance');
  const verdictOf = (res) => {
    const a = accs.find((x) => x.payload.accepted.some((v) => v.resolution === res.sha) || x.payload.rejected.some((v) => v.resolution === res.sha));
    return !a ? 'submitted' : a.payload.accepted.some((v) => v.resolution === res.sha) ? 'accepted' : 'rejected';
  };
  const out = [];
  for (const src of r.records.filter((x) => FINDING_KINDS.includes(x.kind))) {
    for (const f of src.payload.findings) {
      const resolutions = r.records.filter((x) => x.kind === 'resolution' && x.payload.source === src.sha && x.payload.finding === f.n);
      const verdicts = resolutions.map(verdictOf);
      const status = disputes(log, src.sha, f.n) ? 'disputed' : verdicts.includes('accepted') ? 'resolved' : verdicts.at(-1) === 'submitted' ? 'submitted' : verdicts.at(-1) === 'rejected' ? 'rejected' : 'open';
      out.push({ source: src.sha, kind: src.kind, n: f.n, text: f.text, status, resolutions, rejections: verdicts.filter((v) => v === 'rejected').length });
    }
  }
  return out;
}

export async function resolve(cwd, slug, n, explanation, opts = {}) {
  if (!nonEmpty(explanation)) throw new ReviewError('cairn: resolve: explanation needs text');
  const log = await readLog(cwd);
  const all = ledger(log, slug).filter((f) => f.n === n && (!opts.source || f.source === opts.source));
  const submitted = all.find((f) => f.status === 'submitted');
  if (submitted) throw new ReviewError(`cairn: resolve: finding ${n} on ${submitted.source} awaits acceptance`);
  const open = all.filter((f) => f.status === 'open' || f.status === 'rejected');
  if (open.length === 0) throw new ReviewError(`cairn: resolve: no unresolved finding ${n}${opts.source ? ` on ${opts.source}` : ''}`);
  if (open.length > 1) throw new ReviewError(`cairn: resolve: finding ${n} is on ${open.map((f) => f.source).join(' and ')}; pass --source <sha>`);
  const f = open[0];
  const blocked = unanswered(log).find((e) => e.payload.concerns === `finding:${f.source}#${n}`);
  if (blocked) throw new ReviewError(`cairn: resolve: finding ${n} on ${f.source} is under escalation ${blocked.sha}`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'resolution', slug, { source: f.source, finding: n, snapshot, explanation });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/review.test.mjs
git commit -m "Resolve a finding on its exact source record and keep a ledger of finding status"
```

---

### Task 6: Cumulative acceptance, the second rejection and the three-round bound

**Files:**
- Modify: `lib/review.mjs`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `BOUNDS.acceptanceRounds`, `writeCycleEscalation(cwd, slug, {kind:'acceptanceRounds', actionClass:'accept', target})` and `openCycleEscalation(log)` from `lib/cycle.mjs` (plan 08; one open cycle escalation at a time, `concerns: 'cycle'`); `escalate` (plan 09).
- Produces: `accept(cwd, slug, body, {env}) -> sha`, `reviewState(cwd, slug) -> {review, report, acceptance, ledger, ready, reasons}`, `acceptanceRounds(range) -> number`. Body: `{resolutions: [{sha, verdict:'accepted'|'rejected', reason}], findings, session}`. Payload: plan 01's `acceptance` keys plus `session`; `delta_digest = sha256(canonicalize(diffTree(reportTree, currentTree)))`. Each acceptance numbers its own findings from 1.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { accept, reviewState } from '../lib/review.mjs';
import { unanswered } from '../lib/escalate.mjs';
import { openCycleEscalation } from '../lib/cycle.mjs';

const verdict = (sha, v, reason = '') => ({ sha, verdict: v, reason });

test('accept examines the cumulative delta and gives a verdict on every submitted resolution', async () => {
  const r = await reported();
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [], findings: [] }), /nothing submitted since the report/);
  const r1 = await fixed(r, 1, 'first fix');
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [], findings: [] }), new RegExp(`resolution ${r1} has no verdict`));
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [verdict(r1, 'rejected')], findings: [] }), /rejected .* needs a reason/);
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [verdict('a'.repeat(40), 'accepted')], findings: [] }), /is not a submitted resolution/);
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [verdict(r1, 'accepted')], findings: [], session: 's-builder' }), /session s-builder wrote the review/);
  const sha = await accept(r.cwd, 'first', { resolutions: [verdict(r1, 'accepted')], findings: [{ n: 1, text: 'the new trim drops tabs' }] });
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.report, p.accepted, p.rejected], [r.rep, [{ resolution: r1, reason: '' }], []]);
  const { canonicalize } = await import('../lib/canon.mjs');
  assert.equal(p.delta_digest, sha256(canonicalize([{ path: 'src/demo.mjs', status: 'M' }])));
  const st = await reviewState(r.cwd, 'first');
  assert.equal(st.ready, false);
  assert.deepEqual(st.ledger.map((f) => [f.kind, f.status]), [['report', 'resolved'], ['acceptance', 'open']]);
  const r2 = await fixed(r, 1, 'second fix');
  assert.equal(decodeRecord(await catCommit(r.cwd, r2)).payload.source, sha);
  await accept(r.cwd, 'first', { resolutions: [verdict(r2, 'accepted')], findings: [] });
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, []);
  await r.write('src/demo.mjs', 'export const demo = "late";\n');
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, ['the latest acceptance is not at the final workspace snapshot']);
});

test('a resolution rejected twice for the same finding escalates as a dispute the developer settles', async () => {
  const r = await reported();
  const r1 = await fixed(r, 1, 'one');
  await accept(r.cwd, 'first', { resolutions: [verdict(r1, 'rejected', 'still accepts tabs')], findings: [] });
  assert.deepEqual(unanswered(await r.log()), []);
  const r2 = await fixed(r, 1, 'two');
  await accept(r.cwd, 'first', { resolutions: [verdict(r2, 'rejected', 'still accepts form feeds')], findings: [] });
  const open = unanswered(await r.log());
  assert.equal(open.length, 1);
  assert.equal(open[0].payload.concerns, `finding:${r.rep}#1`);
  assert.equal(open[0].payload.question, 'Finding 1 on the report was rejected twice; does the developer rule on it?');
  await assert.rejects(fixed(r, 1, 'three'), /is under escalation/);
});

test('three acceptance rounds without Done create the cycle escalation through plan 08, even with newly numbered findings', async () => {
  const r = await reported();
  let source = null;
  for (let round = 1; round <= 3; round++) {
    const res = await fixed(r, 1, `round ${round}`, source ? { source } : {});
    source = await accept(r.cwd, 'first', { resolutions: [verdict(res, 'accepted')], findings: [{ n: 1, text: `new finding ${round}` }] });
    assert.equal(openCycleEscalation(await r.log()) !== null, round === 3, `round ${round}`);
  }
  const cycle = openCycleEscalation(await r.log());
  assert.equal(cycle.payload.concerns, 'cycle');
  assert.match(cycle.payload.question, /3 acceptance rounds after the report have not reached Done/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `accept is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (imports)
import { BOUNDS, writeCycleEscalation } from './cycle.mjs';

// lib/review.mjs (append)
const SHA = /^[0-9a-f]{40}$/;

export function acceptanceRounds(r) {
  const rep = r.records.find((x) => x.kind === 'report');
  return rep ? r.records.slice(r.records.indexOf(rep) + 1).filter((x) => x.kind === 'acceptance').length : 0;
}

export async function reviewState(cwd, slug) {
  const log = await readLog(cwd);
  const r = openRange(log, slug);
  const rev = r.records.filter((x) => x.kind === 'review').at(-1) ?? null;
  const rep = r.records.find((x) => x.kind === 'report') ?? null;
  const acc = r.records.filter((x) => x.kind === 'acceptance').at(-1) ?? null;
  const l = ledger(log, slug);
  const reasons = [];
  if (!rev) reasons.push('no review');
  if (!rep) reasons.push('no report');
  if (rev && rep && rep.payload.snapshot !== rev.payload.snapshot) reasons.push('the report is not at the reviewed snapshot');
  for (const f of l) if (!['resolved', 'disputed'].includes(f.status)) reasons.push(`finding ${f.n} on ${f.source} is ${f.status}`);
  if (rep) {
    const current = await readSnapshot(cwd, await writeWorkspaceSnapshot(cwd), 'workspace');
    const treeOf = async (ws) => (await readSnapshot(cwd, ws, 'workspace')).tree;
    if (acc) { if ((await treeOf(acc.payload.snapshot)) !== current.tree) reasons.push('the latest acceptance is not at the final workspace snapshot'); }
    else if (r.records.some((x) => x.kind === 'resolution') || (await treeOf(rep.payload.snapshot)) !== current.tree) reasons.push('no acceptance examines the post-report delta');
  }
  return { review: rev, report: rep, acceptance: acc, ledger: l, ready: reasons.length === 0, reasons };
}

export async function accept(cwd, slug, body, opts = {}) {
  const log = await readLog(cwd);
  const r = openRange(log, slug);
  const rev = r.records.filter((x) => x.kind === 'review').at(-1);
  const rep = r.records.find((x) => x.kind === 'report');
  if (!rep) throw new ReviewError(`cairn: accept: ${slug} has no report`);
  const judged = new Set(r.records.filter((x) => x.kind === 'acceptance').flatMap((a) => [...a.payload.accepted, ...a.payload.rejected].map((v) => v.resolution)));
  const submitted = r.records.filter((x) => x.kind === 'resolution' && !judged.has(x.sha));
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const current = await readSnapshot(cwd, snapshot, 'workspace'), reportedAt = await readSnapshot(cwd, rep.payload.snapshot, 'workspace');
  if (submitted.length === 0 && current.tree === reportedAt.tree) throw new ReviewError('cairn: accept: nothing submitted since the report and no delta to examine');
  const verdicts = Array.isArray(body.resolutions) ? body.resolutions : [];
  for (const s of submitted) if (!verdicts.some((v) => v.sha === s.sha)) throw new ReviewError(`cairn: accept: resolution ${s.sha} has no verdict`);
  const accepted = [], rejected = [];
  for (const v of verdicts) {
    if (!SHA.test(v.sha ?? '') || !submitted.some((s) => s.sha === v.sha)) throw new ReviewError(`cairn: accept: ${v.sha} is not a submitted resolution`);
    if (v.verdict === 'accepted') accepted.push({ resolution: v.sha, reason: v.reason ?? '' });
    else if (v.verdict === 'rejected' && nonEmpty(v.reason)) rejected.push({ resolution: v.sha, reason: v.reason });
    else throw new ReviewError(`cairn: accept: rejected ${v.sha} needs a reason; a verdict is accepted or rejected`);
  }
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`cairn: accept: session ${session} wrote the review`);
  const findings = checkFindings(body.findings ?? []);
  const delta = await diffTree(cwd, reportedAt.tree, current.tree);
  const sha = await appendRecord(cwd, 'acceptance', slug, { slug, session, report: rep.sha, snapshot, delta_digest: sha256(canonicalize(delta)), accepted, rejected, findings });
  const after = await readLog(cwd);
  for (const f of ledger(after, slug)) {
    if (f.status === 'rejected' && f.rejections === 2) {
      await escalate(cwd, {
        commitment: slug, concerns: [`finding:${f.source}#${f.n}`],
        question: `Finding ${f.n} on the ${f.kind} was rejected twice; does the developer rule on it?`,
        recommendation: 'Rule: the finding stands and the fix changes approach, or the finding is closed as answered.',
        because: `The adversary rejected it twice: ${rejected.map((x) => x.reason).join('; ') || 'see the acceptance record'}.`,
        if_wrong: 'The loop keeps spending acceptance rounds on one finding.', instead: 'Answer instead <direction> naming the fix you want.',
        options: [], named_paths: [], cited_decisions: [],
      });
    }
  }
  const state = await reviewState(cwd, slug);
  if (state.ready) await resetOnProgress(cwd);
  else if (acceptanceRounds(openRange(after, slug)) >= BOUNDS.acceptanceRounds) await writeCycleEscalation(cwd, slug, { kind: 'acceptanceRounds', actionClass: 'accept', target: slug });
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/review.test.mjs
git commit -m "Accept resolutions over the cumulative delta; escalate a second rejection and the third round"
```

---

### Task 7: Command-line entry points

**Files:**
- Modify: `lib/review.mjs`
- Modify: `lib/cli.mjs` (the `COMMANDS` table, plan 01)
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `lib/cli.mjs` `COMMANDS` entries `name: async (cwd, argv) => {code, out}`.
- Produces: `cliReview`, `cliBrief`, `cliReport`, `cliResolve`, `cliAccept`, each `(cwd, argv, opts) -> {code, out}`. Commands, as plan 13's working agreement writes them: `cairn review SLUG --file FILE`, `cairn brief SLUG [--harness NAME]`, `cairn report SLUG --file FILE`, `cairn resolve SLUG N "<how>" [--source SHA]`, `cairn accept SLUG --file FILE`. A file is JSON the agent or adversary wrote, parsed with `JSON.parse` and re-encoded canonically by `appendRecord`; the file is never authority.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { cliReview, cliBrief, cliReport, cliResolve, cliAccept } from '../lib/review.mjs';

test('the five commands print one line each and exit 1 with a cairn: line on refusal', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('interface change');
  const file = async (name, obj) => { const p = path.join(r.cwd, '.cairn/output', name); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj)); return p; };
  const rv = await cliReview(r.cwd, ['first', '--file', await file('rv.json', await claims(r, { findings: [{ n: 1, text: 'x' }] }))], { env: { CAIRN_SESSION: 'b' } });
  assert.match(rv.out, /^cairn: review first [0-9a-f]{40}\n$/);
  r.rev = rv.out.trim().split(' ')[3];
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  const br = await cliBrief(r.cwd, ['first', '--harness', 'claude_code']);
  assert.equal(br.code, 0);
  assert.match(br.out, /^cairn: brief first [0-9a-f]{40}\nbrief: .*\nbrief digest: sha256:[0-9a-f]{64}\nprojection: .*\nprojection digest: sha256:[0-9a-f]{64}\nharness: claude_code\nmodel: claude-fable-5-1\ntransport: remote\nboundary: unenforced\nstart: in claude_code, .*\n$/);
  r.bp = decodeRecord(await catCommit(r.cwd, br.out.split('\n')[0].split(' ')[3])).payload;
  const bad = await cliReport(r.cwd, ['first', '--file', await file('bad.json', adversary(r, { model: 'x' }))]);
  assert.deepEqual([bad.code, bad.out.startsWith('cairn: report: model x does not match')], [1, true]);
  const rp = await cliReport(r.cwd, ['first', '--file', await file('rp.json', adversary(r))]);
  assert.match(rp.out, /^cairn: report first [0-9a-f]{40}\n$/);
  await r.write('src/demo.mjs', 'export const demo = 9;\n');
  const rs = await cliResolve(r.cwd, ['first', '1', 'fixed', '--source', rp.out.trim().split(' ')[3]]);
  assert.match(rs.out, /^cairn: resolution first [0-9a-f]{40}\n$/);
  const ac = await cliAccept(r.cwd, ['first', '--file', await file('ac.json', { resolutions: [{ sha: rs.out.trim().split(' ')[3], verdict: 'accepted', reason: '' }], findings: [] })]);
  assert.match(ac.out, /^cairn: acceptance first [0-9a-f]{40}\n$/);
  assert.equal((await reviewState(r.cwd, 'first')).ready, true);
  const nofile = await cliAccept(r.cwd, ['first']);
  assert.deepEqual([nofile.code, nofile.out], [1, 'cairn: --file <path> is required\n']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `cliReview is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (append)
function splitFlags(argv) {
  const pos = [], named = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { named[argv[i].slice(2)] = argv[i + 1]; i++; } else pos.push(argv[i]);
  }
  return { pos, named };
}
async function fileBody(named) {
  if (!named.file) throw new ReviewError('cairn: --file <path> is required');
  return JSON.parse(await fs.readFile(named.file, 'utf8'));
}
const asCli = (fn) => async (cwd, argv, opts = {}) => {
  try { return { code: 0, out: await fn(cwd, splitFlags(argv), opts) }; }
  catch (e) { return { code: 1, out: (e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`) + '\n' }; }
};
export const cliReview = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: review ${slug} ${await review(cwd, slug, await fileBody(named), opts)}\n`);
export const cliBrief = asCli(async (cwd, { pos: [slug], named }, opts) => (await brief(cwd, slug, { harness: named.harness, env: opts.env })).launch);
export const cliReport = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: report ${slug} ${await report(cwd, slug, await fileBody(named), opts)}\n`);
export const cliResolve = asCli(async (cwd, { pos: [slug, n, ...how], named }) => `cairn: resolution ${slug} ${await resolve(cwd, slug, Number(n), how.join(' '), { source: named.source })}\n`);
export const cliAccept = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: acceptance ${slug} ${await accept(cwd, slug, await fileBody(named), opts)}\n`);
```

In `lib/cli.mjs` add to `COMMANDS`: `review: cliReview, brief: cliBrief, report: cliReport, resolve: cliResolve, accept: cliAccept`, imported from `./review.mjs`, passing `{env: process.env}` as `opts`, and add the five usage lines to `--help`. The `review` entry dispatches `review mechanism REQ <receipt>` to plan 05's `reviewMechanism` when its first argument is `mechanism`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs tests/cli.test.mjs`
Expected: PASS (17 tests in review; cli unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs lib/cli.mjs tests/review.test.mjs
git commit -m "Add the review, brief, report, resolve and accept commands"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| "Review. The builder's claims at a workspace snapshot: what was examined, answers to the fixed questions in section 9, and findings." (2); Q1 to Q6 per mechanism, requirement, commitment; "answered observed with a command, path or output, or not-checked. The kernel checks coverage and shape, not truth." (9); `review SLUG` predicate (5) | 1 |
| "cairn brief <slug> writes a brief record and renders the roadmap section, frozen requirements and falsifiers, mechanism definitions, builder claims and findings, interface obligations, exclusion manifest and brief digest." (9) | 3 |
| Projection: excluded paths omitted; no .git, object store, host path, evaluator key, credential path or command-output body; manifest names classes and paths never contents; reads Git object bytes; safe relative symlinks preserved; absolute, out-of-tree, special files, gitlinks refused (9); decision 43 | 2 |
| "the brief names the projection as the only path the adversary may read and the report records boundary: unenforced; Cairn does not refuse the report" (9); "The brief warns about that limitation." (9) | 3, 4 |
| Harness "from its environment or --harness" (6, 9); "passes the model string through; it never maps aliases. A null or unknown entry means any model." (9); decision 20 | 3, 4 |
| "Report. The adversary's attempts against those claims at the same workspace snapshot. One report is written per commitment." (2); "The report is written once at the candidate snapshot." (5); decisions 8, 16 | 4 |
| `cairn report` refuses: snapshot differs from the review; stale brief or projection; model or transport mismatch; unattempted question or interface (9); `report SLUG` predicate (5) | 4 |
| "Where the harness reports the builder's model, the report records it beside the adversary model. A matching model is recorded, not refused." (9) | 4 |
| "Where a harness reports session identity, the report refuses the session that wrote the review." (9) | 1 (session on the review), 4, 6 |
| "The report records the projection digest, transport and whether the boundary was enforced." (9) | 4 |
| "Every changed interface gets a caller-level attempt whether or not the builder raised it." (9); the adversary "must attempt the changed interface explicitly" (8) | 3, 4 |
| "Finding. A numbered entry on a review, report or acceptance. A finding is answered by a resolution, which names the snapshot after a fix and explains it, or by a dispute" (2); `resolve SLUG N` (5); "A resolution references the exact source record and finding number." (12) | 5 |
| "Acceptance ... examines the cumulative post-report delta, accepts or rejects each submitted resolution with a reason, and may raise new findings anywhere in that delta." (2, 9); `accept SLUG` (5); decision 33 | 6 |
| "Each acceptance examines the whole delta from that reported snapshot to the current one, not only the named fix" (5); "Done requires the last acceptance at the final snapshot." (9) | 6 (`reviewState`) |
| "A second rejection of a resolution for the same finding escalates." (5, 9) | 6 |
| "Three acceptance rounds after the report without reaching Done create the same kind of escalation, even when each round raises a newly numbered finding." (5, 9) | 6 (plan 08's `writeCycleEscalation` and `BOUNDS`, called by name) |
| "Each finding is resolved or developer-disputed" (8); the Done bullet on findings and resolutions (5) | 5, 6 (`ledger`, `reviewState`) |
| "the loop advances from implementation to review, report or Done" is semantic progress (2) | 1, 4, 6 (`resetOnProgress`) |
| Commands `cairn review`, `brief`, `report`, `resolve` and `accept` "write the review chain" (4) | 7 |

Left to other plans:

- The Done rule as a whole and the precedence positions of `review`, `report`, `resolve` and `accept` (5): plan 08's `openFindings` and `doneRule`; plan 14's cutover may switch them to `ledger` and `reviewState`, which agree with them on every status.
- The receipt and mechanism-review bullets of Done (5): plan 05.
- The acceptance-round counter's reset, the twenty-eight-transition bound and the `settle` step after wake (5): plan 08's `cycle.mjs`; this plan calls `writeCycleEscalation`, `BOUNDS` and `resetOnProgress`.
- Starting the adversary (9 "The agent starts an adversary ... and waits"): the agent through the harness, following the `start:` line Task 3 prints; plan 13's working agreement quotes `cairn brief SLUG` and `cairn report SLUG --file`. The kernel spawns nothing.
- Restricting a harness's filesystem tools to the projection where a harness can (9): plan 13's adapters; `CONFINES` records that none can today.
- Local-adversary broader access "the developer may explicitly authorize" (9): plan 03's authorization record; every configured adversary is remote.
- Carrying unresolved findings across a supersession (2 Superseded): plan 06.
- Exporting the harness session id into `CAIRN_SESSION` (9): plan 13's hooks; plan 04's lease reads the same variable.
