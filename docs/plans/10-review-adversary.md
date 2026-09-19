# Review and the adversary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build `lib/review.mjs`: the builder's review, the brief and adversary projection, the adversary's one report, resolutions, cumulative acceptances, and the finding ledger the Done rule reads.

**Architecture:** one module writes the five review-chain kinds (`review`, `brief`, `report`, `resolution`, `acceptance`) through plan 01's `appendRecord`, at workspace snapshots from plan 01's `writeWorkspaceSnapshot`. The kernel checks coverage and shape, never truth: every fixed question for every target, every interface obligation, every submitted resolution. `cairn brief` materializes the reviewed snapshot from Git object bytes into a temp directory with excluded paths omitted, records digests, and prints exactly what the agent needs to start the adversary through the harness; the kernel spawns no model. A pure `ledger` over the decoded log gives every finding one status, using plan 09's `disputes`; a second rejection of the same finding and the third acceptance round escalate through plan 09's `escalate`, the round count coming from plan 08's `bump` and `BOUNDS`.

**Tech Stack:** Node 24, ES modules, no dependencies, `node --test` with `node:assert/strict`, Git plumbing through plan 01's `lib/gitx.mjs` plus `git cat-file` for blob bytes.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 (Review, Report, Finding, Acceptance), section 5 (`review SLUG`, `report SLUG`, `resolve SLUG N`, `accept SLUG`; the Done paragraph "The report is written once ..."), section 8 (Review and evidence), section 9 (all subsections), section 13 decisions 8, 16, 20, 33, 43.

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Each question is answered `observed` with a command, path or output, or `not-checked`. The kernel checks coverage and shape, not truth."
- "One report is written per commitment." "The report is written once at the candidate snapshot. Every later fix is a resolution."
- "`cairn report` refuses a report whose snapshot differs from the review, whose brief or projection is stale, whose model or transport does not match the launch instruction, or which leaves a required question or interface unattempted." "Where a harness reports session identity, the report refuses the session that wrote the review." "A matching model is recorded, not refused."
- "a materialized export of the reviewed workspace snapshot with every `network_exclude` path and built-in credential path omitted. It contains no `.git` directory, Git object store, host path, evaluator key, built-in credential path, or command-output body." "The exclusion manifest names omitted path classes and paths but never their contents." "Projection reads Git object bytes, never live filesystem targets: it preserves safe relative symlinks as link text without following them, and refuses absolute or out-of-tree symlinks, special files and unresolved gitlinks."
- "Where it cannot, the brief names the projection as the only path the adversary may read and the report records `boundary: unenforced`; Cairn does not refuse the report."
- "`cairn brief` passes the model string through; it never maps aliases. A null or unknown entry means any model."
- "A resolution rejected twice for the same finding escalates, and the three-round liveness bound in section 5 prevents an unbounded stream of newly numbered findings."
- The adversary is started by the agent through the harness. The kernel never spawns a model process.

---

### Task 1: The builder's review

**Files:**
- Create: `lib/review.mjs`
- Modify: `tests/helpers/commitment.mjs` (plan 09)
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `openCommitment` from `tests/helpers/commitment.mjs` (plan 09; extended here with a `mechanisms` option that calls plan 05's `declare(cwd, name, definition)` before the start record, `definition = {command, cwd, inputs, documents, requirements, results, identity}`); `appendRecord`, `readLog`, `range`, `decodeRecord` (plan 01); `writeWorkspaceSnapshot` (plan 01); `readMechanisms(cwd) -> {name: {definition, ...}}` (plan 05); `catCommit` (plan 01); `resetOnProgress(cwd)` (plan 08).
- Produces: `review(cwd, slug, submission) -> sha`, `targets(cwd, log, slug) -> {slug, start, requirements, mechanisms}`, `checkAnswers`, `checkFindings`, `sessionIdentity(env) -> string|null` (reads `CAIRN_SESSION`, which plan 13's hooks export from the harness session id), `QUESTIONS`, `ReviewError`. The submission is `{examined: [string], mechanisms: {name: {q1, q2}}, requirements: {REQ: {q3, q4}}, commitment: {q5, q6}, findings: [{n, text}]}`; an answer is `{status:'observed', text, cite}` or `{status:'not-checked', text}`. Review payload keys (plan 01's `review` schema): `{slug, snapshot, session, examined, answers, findings}`; findings are numbered 1..k in order.

- [ ] **Step 1: Extend the fixture and write the failing test**

```js
// tests/helpers/commitment.mjs (replace openCommitment)
import { declare } from '../../lib/mechanisms.mjs';
export const MECH = { command: 'node check.mjs', cwd: null, inputs: ['src/**', 'check.mjs'], documents: [], requirements: ['LOOP-001'], results: 'per-requirement', identity: {} };
const SPEC = {
  'docs/spec/loop.md': 'Prefix: LOOP\n\n[LOOP-001] The guard rejects empty input.\nFalsifier: an empty input is accepted.\nMechanism: m1\nStatus: Agreed 2026-09-19\n',
  'docs/spec/roadmap.md': 'Current: auth\n\n## auth\n\nRequirements: LOOP-001\n\nDelivers the input guard.\n',
};
export async function openCommitment({ slug = 'auth', requirements = ['LOOP-001'], mechanisms = {}, files = {}, settings = {} } = {}) {
  const { cwd } = await makeProject({ settings, files: { ...SPEC, 'src/a.mjs': 'export const a = 1;\n', 'check.mjs': 'console.log("cairn: LOOP-001: pass")\n', ...files } });
  for (const [name, def] of Object.entries(mechanisms)) await declare(cwd, name, def);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const startSha = await appendRecord(cwd, 'start', slug, {
    slug, snapshot, from_superseded: null,
    requirements: requirements.map((r) => ({ requirement: r, text_digest: sha256(`[${r}] frozen text`) })),
  });
  return { cwd, slug, startSha, snapshot };
}
```

```js
// tests/review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLog, decodeRecord } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { openCommitment, MECH } from './helpers/commitment.mjs';
import { review, ReviewError } from '../lib/review.mjs';

const obs = (text, cite = 'node check.mjs') => ({ status: 'observed', text, cite });
const nc = (text) => ({ status: 'not-checked', text });
export const submission = (over = {}) => ({
  examined: ['src/a.mjs', 'check.mjs'],
  mechanisms: { m1: { q1: obs('removed the guard; LOOP-001 failed at receipt 3f2', 'cairn: LOOP-001: fail'), q2: obs('the printed line names the guard, not a setup error') } },
  requirements: { 'LOOP-001': { q3: obs('the guard rejects every empty input'), q4: nc('the logger changed too') } },
  commitment: { q5: nc('a race between two writers'), q6: nc('concurrent writers') },
  findings: [],
  ...over,
});
const fixture = () => openCommitment({ mechanisms: { m1: MECH } });

test('a review records the current snapshot, examined entries, every answer and numbered findings', async () => {
  const { cwd } = await fixture();
  const sha = await review(cwd, 'auth', submission({ findings: [{ n: 1, text: 'no empty-input test' }] }), { env: { CAIRN_SESSION: 's-builder' } });
  const rec = decodeRecord(await catCommit(cwd, sha));
  assert.equal(rec.kind, 'review');
  assert.equal(rec.payload.slug, 'auth');
  assert.match(rec.payload.snapshot, /^[0-9a-f]{40}$/);
  assert.equal(rec.payload.session, 's-builder');
  assert.deepEqual(rec.payload.examined, ['src/a.mjs', 'check.mjs']);
  assert.deepEqual(rec.payload.answers.mechanisms.m1.q1.status, 'observed');
  assert.deepEqual(rec.payload.findings, [{ n: 1, text: 'no empty-input test' }]);
});

test('coverage: a missing question, target or examined list is refused; an extra target is refused', async () => {
  const { cwd } = await fixture();
  const s = submission(); delete s.mechanisms.m1.q2;
  await assert.rejects(review(cwd, 'auth', s), /m1 q2 has no answer/);
  await assert.rejects(review(cwd, 'auth', submission({ requirements: {} })), /LOOP-001 q3 has no answer/);
  await assert.rejects(review(cwd, 'auth', submission({ examined: [] })), /examined needs at least one entry/);
  await assert.rejects(review(cwd, 'auth', submission({ mechanisms: { ...submission().mechanisms, ghost: submission().mechanisms.m1 } })), /ghost is not a mechanism of auth/);
});

test('shape: observed needs text and a cite; not-checked needs text; other statuses and keys are refused', async () => {
  const { cwd } = await fixture();
  const bad = (a) => submission({ commitment: { q5: a, q6: nc('x') } });
  await assert.rejects(review(cwd, 'auth', bad({ status: 'observed', text: 'y' })), /q5 observed needs text and cite/);
  await assert.rejects(review(cwd, 'auth', bad({ status: 'not-checked', text: '' })), /q5 not-checked needs text/);
  await assert.rejects(review(cwd, 'auth', bad({ status: 'true', text: 'y' })), /status must be observed or not-checked/);
  await assert.rejects(review(cwd, 'auth', bad({ status: 'not-checked', text: 'y', extra: 1 })), /q5 not-checked needs text/);
  await assert.rejects(review(cwd, 'auth', submission({ findings: [{ n: 2, text: 'x' }] })), /findings must be numbered 1, 2, /);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/review.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs
import { appendRecord, readLog, range } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { resetOnProgress } from './cycle.mjs';

export class ReviewError extends Error {}
export const QUESTIONS = { mechanisms: ['q1', 'q2'], requirements: ['q3', 'q4'], commitment: ['q5', 'q6'] };
export function sessionIdentity(env = process.env) { return env.CAIRN_SESSION ?? null; }
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

export function openRange(log, slug) {
  const r = range(log);
  if (!r.start || r.closed || r.start.payload.slug !== slug) throw new ReviewError(`cairn: no open commitment ${slug}`);
  return r;
}

export async function targets(cwd, log, slug) {
  const r = openRange(log, slug);
  const requirements = r.start.payload.requirements.map((q) => q.requirement);
  const all = await readMechanisms(cwd);
  const mechanisms = Object.keys(all).filter((m) => all[m].definition.requirements.some((q) => requirements.includes(q))).sort();
  return { slug, start: r.start, range: r, requirements, mechanisms };
}

function checkAnswer(where, a) {
  if (!a || typeof a !== 'object') throw new ReviewError(`cairn: review: ${where} has no answer`);
  const keys = Object.keys(a).sort().join(',');
  if (a.status === 'observed') {
    if (keys !== 'cite,status,text' || !nonEmpty(a.text) || !nonEmpty(a.cite)) throw new ReviewError(`cairn: review: ${where} observed needs text and cite (a command, path or output)`);
  } else if (a.status === 'not-checked') {
    if (keys !== 'status,text' || !nonEmpty(a.text)) throw new ReviewError(`cairn: review: ${where} not-checked needs text`);
  } else throw new ReviewError(`cairn: review: ${where} status must be observed or not-checked`);
}

export function checkAnswers(answers, t) {
  const groups = { mechanisms: t.mechanisms, requirements: t.requirements, commitment: ['commitment'] };
  for (const [group, names] of Object.entries(groups)) {
    const given = group === 'commitment' ? { commitment: answers.commitment } : (answers[group] ?? {});
    for (const extra of Object.keys(given)) if (!names.includes(extra)) throw new ReviewError(`cairn: review: ${extra} is not a ${group === 'requirements' ? 'requirement' : 'mechanism'} of ${t.slug}`);
    for (const name of names) for (const q of QUESTIONS[group]) checkAnswer(`${name} ${q}`, given[name] && given[name][q]);
  }
  return { mechanisms: answers.mechanisms ?? {}, requirements: answers.requirements ?? {}, commitment: answers.commitment };
}

export function checkFindings(findings) {
  if (!Array.isArray(findings)) throw new ReviewError('cairn: findings must be a list');
  findings.forEach((f, i) => {
    if (!f || Object.keys(f).sort().join(',') !== 'n,text' || f.n !== i + 1 || !nonEmpty(f.text)) throw new ReviewError('cairn: findings must be numbered 1, 2, ... each with text');
  });
  return findings;
}

function checkExamined(list) {
  if (!Array.isArray(list) || list.length === 0 || !list.every(nonEmpty)) throw new ReviewError('cairn: review: examined needs at least one entry');
  return list;
}

export async function review(cwd, slug, submission, opts = {}) {
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const examined = checkExamined(submission.examined);
  const answers = checkAnswers(submission, t);
  const findings = checkFindings(submission.findings ?? []);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const sha = await appendRecord(cwd, 'review', slug, { slug, snapshot, session: sessionIdentity(opts.env), examined, answers, findings });
  await resetOnProgress(cwd); // the loop advanced from implementation to review: semantic progress
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/review.test.mjs tests/helpers/commitment.mjs
git commit -m "Record the builder's review with every fixed question answered per target"
```

---

### Task 2: The adversary projection

**Files:**
- Modify: `lib/review.mjs`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `listTree(cwd, treeSha) -> [{path, mode, sha}]`, `git(args, {cwd})` (plan 01); `matchGlob(pattern, p)`, `CREDENTIAL_PATTERNS` (plan 02); `readSnapshot(cwd, sha, 'workspace') -> {tree}` (plan 01); `canonicalize`, `sha256` (plan 01).
- Produces: `project(cwd, settings, treeSha, dir) -> {projectionDigest, manifest, manifestDigest, included}`; `manifest = {classes: [string], paths: [{path, class}]}` with classes among `network_exclude | credential | git | output`; `projectionDigest = sha256(canonicalize(included))` where `included` is the sorted list of `[path, mode, blobSha]` written.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { git } from '../lib/gitx.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { project } from '../lib/review.mjs';

async function projected(files, settings = {}) {
  const { cwd } = await openCommitment({ files, settings });
  const log = await readLog(cwd);
  const start = log.find((r) => r.kind === 'start');
  const { tree } = await readSnapshot(cwd, start.payload.snapshot, 'workspace');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cairn-proj-test-'));
  const s = (await loadSettings(cwd)).settings;
  return { cwd, tree, dir, settings: s, result: project(cwd, s, tree, dir) };
}

test('the projection omits network_exclude and credential paths, names them in the manifest, and has no .git', async () => {
  const { dir, result } = await projected({ 'fixtures/private/k.json': '{"secret":1}', '.env': 'A=1\n', 'server.pem': 'x', 'src/b.mjs': 'export const b = 2;\n' }, { network_exclude: ['fixtures/private/**'] });
  const r = await result;
  assert.deepEqual(r.manifest.classes, ['credential', 'network_exclude']);
  assert.deepEqual(r.manifest.paths.map((p) => `${p.class} ${p.path}`), ['credential .env', 'network_exclude fixtures/private/k.json', 'credential server.pem']);
  assert.equal(JSON.stringify(r.manifest).includes('secret'), false);
  await assert.rejects(fs.stat(path.join(dir, 'fixtures/private/k.json')));
  await assert.rejects(fs.stat(path.join(dir, '.env')));
  await assert.rejects(fs.stat(path.join(dir, '.git')));
  assert.equal(await fs.readFile(path.join(dir, 'src/b.mjs'), 'utf8'), 'export const b = 2;\n');
  assert.equal(await fs.readFile(path.join(dir, '.cairn/settings.json'), 'utf8') !== '', true);
  assert.match(r.projectionDigest, /^sha256:[0-9a-f]{64}$/);
});

test('a safe relative symlink is preserved as link text; absolute and out-of-tree links, gitlinks are refused', async () => {
  const { cwd, tree, dir, settings } = await projected({ 'src/real.txt': 'r\n' });
  await fs.symlink('real.txt', path.join(cwd, 'src/link'));
  await fs.symlink('/etc/passwd', path.join(cwd, 'src/abs'));
  await git(['add', '-A'], { cwd });
  const { stdout: t2 } = await git(['write-tree'], { cwd });
  await assert.rejects(project(cwd, settings, t2.trim(), dir + '-2'), /absolute symlink at src\/abs/);
  await fs.unlink(path.join(cwd, 'src/abs'));
  await fs.symlink('../../outside', path.join(cwd, 'src/up'));
  await git(['add', '-A'], { cwd });
  const { stdout: t3 } = await git(['write-tree'], { cwd });
  await assert.rejects(project(cwd, settings, t3.trim(), dir + '-3'), /out-of-tree symlink at src\/up/);
  await fs.unlink(path.join(cwd, 'src/up'));
  await git(['add', '-A'], { cwd });
  const { stdout: t4 } = await git(['write-tree'], { cwd });
  const r = await project(cwd, settings, t4.trim(), dir + '-4');
  assert.equal(await fs.readlink(path.join(dir + '-4', 'src/link')), 'real.txt');
  assert.ok(r.included.some(([p, mode]) => p === 'src/link' && mode === '120000'));
  await git(['update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},sub`], { cwd });
  const { stdout: t5 } = await git(['write-tree'], { cwd });
  await assert.rejects(project(cwd, settings, t5.trim(), dir + '-5'), /unresolved gitlink at sub/);
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
async function catBlob(cwd, sha) {
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
    if (e.mode === '120000') {
      const target = bytes.toString('utf8');
      checkLink(e.path, target);
      await fs.symlink(target, out);
    } else {
      await fs.writeFile(out, bytes, { mode: e.mode === '100755' ? 0o755 : 0o644 });
    }
    included.push([e.path, e.mode, e.sha]);
  }
  manifest.classes = [...new Set(manifest.paths.map((p) => p.class))].sort();
  return { projectionDigest: sha256(canonicalize(included)), manifest, manifestDigest: sha256(canonicalize(manifest)), included };
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
- Consumes: `loadSettings(cwd)` (plan 02); `parseDomainFile(text)` (plan 02) for the frozen requirement texts read from the snapshot's `docs/spec/*.md` blobs; `readMechanisms` (plan 05); `git(['diff-tree', ...])` (plan 01).
- Produces: `detectHarness(settings, {harness, env}) -> {name, model, transport, boundary}`, `interfaceObligations(cwd, settings, fromWs, toWs) -> [path]`, `renderBrief(parts) -> string`, `brief(cwd, slug, {harness, env, dir}) -> {sha, projectionDir, briefPath, launch, text}`, `HARNESS_ENV`, `CONFINES`. Brief payload keys (plan 01's `brief` schema): `{slug, review, projection_digest, payload_digest, manifest_digest}`. The kernel constant `CONFINES = {claude_code: false, codex: false, muse: false}`: no supported harness confines a subagent, so `boundary` is `unenforced` for each. `cairn brief` prints exactly:

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
start: in <name>, start a fresh adversary with model <model or any> over <transport or any>, working directory <projectionDir>, with the file <briefPath> as its entire prompt; when it finishes, run: cairn report <slug> --body <file>
```

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { detectHarness, brief, interfaceObligations, CONFINES } from '../lib/review.mjs';

const harnessSettings = { harness: { claude_code: { adversary_model: 'claude-fable-5-1', adversary_transport: 'remote' }, codex: null }, interfaces: ['src/api/**'] };

test('the harness comes from --harness, then CAIRN_HARNESS, then the harness environment, and must name a settings entry; the model string passes through verbatim', () => {
  const s = harnessSettings;
  assert.deepEqual(detectHarness(s, { harness: 'claude_code', env: {} }), { name: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', boundary: 'unenforced' });
  assert.deepEqual(detectHarness(s, { env: { CAIRN_HARNESS: 'claude_code' } }).name, 'claude_code');
  assert.deepEqual(detectHarness(s, { env: { CLAUDECODE: '1' } }).name, 'claude_code');
  assert.deepEqual(detectHarness(s, { harness: 'codex', env: {} }), { name: 'codex', model: null, transport: null, boundary: 'unenforced' });
  assert.throws(() => detectHarness(s, { env: {} }), /no harness detected; pass --harness/);
  assert.throws(() => detectHarness(s, { harness: 'muse', env: {} }), /harness muse has no settings entry/);
  assert.deepEqual(CONFINES, { claude_code: false, codex: false, muse: false });
});

test('brief writes the record, the projection, the rendered file, and prints the launch block', async () => {
  const { cwd } = await openCommitment({ mechanisms: { m1: MECH }, settings: harnessSettings, files: { 'src/api/x.mjs': 'export const x = 1;\n' } });
  await fs.writeFile(path.join(cwd, 'src/api/x.mjs'), 'export const x = 2;\n');
  await fs.writeFile(path.join(cwd, 'src/a.mjs'), 'export const a = 2;\n');
  await assert.rejects(brief(cwd, 'auth', { harness: 'claude_code' }), /no review for auth/);
  const rev = await review(cwd, 'auth', submission({ findings: [{ n: 1, text: 'no test' }] }));
  const b = await brief(cwd, 'auth', { harness: 'claude_code' });
  const rec = decodeRecord(await catCommit(cwd, b.sha));
  assert.equal(rec.kind, 'brief');
  assert.equal(rec.payload.review, rev);
  assert.equal(rec.payload.payload_digest, (await import('../lib/canon.mjs')).sha256(b.text));
  assert.ok(b.briefPath.startsWith(path.join(cwd, '.cairn/output/brief-')));
  assert.equal(await fs.readFile(b.briefPath, 'utf8'), b.text);
  assert.ok(b.text.includes('## Interface obligations\nsrc/api/x.mjs\n'));
  assert.ok(b.text.includes('## Builder findings\n1. no test\n'));
  assert.ok(b.text.includes('[LOOP-001]'));
  assert.ok(b.text.includes('cannot detect a secret a person or primary coding agent copied into ordinary prose'));
  assert.ok(b.text.includes(`You may read only the projection directory. Boundary: unenforced.`));
  const lines = b.launch.split('\n');
  assert.equal(lines[0], `cairn: brief auth ${b.sha}`);
  assert.equal(lines[5], 'harness: claude_code');
  assert.equal(lines[6], 'model: claude-fable-5-1');
  assert.equal(lines[7], 'transport: remote');
  assert.equal(lines[8], 'boundary: unenforced');
  assert.equal(lines[9], `start: in claude_code, start a fresh adversary with model claude-fable-5-1 over remote, working directory ${b.projectionDir}, with the file ${b.briefPath} as its entire prompt; when it finishes, run: cairn report auth --body <file>`);
  assert.equal(lines[10], '');
  await assert.rejects(fs.stat(path.join(b.projectionDir, '.git')));
  const startWs = (await readLog(cwd)).find((r) => r.kind === 'start').payload.snapshot;
  const reviewWs = decodeRecord(await catCommit(cwd, rev)).payload.snapshot;
  assert.deepEqual(await interfaceObligations(cwd, harnessSettings, startWs, reviewWs), ['src/api/x.mjs']);
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

async function specBlocks(cwd, tree, ids) {
  const out = [];
  for (const e of await listTree(cwd, tree)) {
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

const answerLine = (a) => a.status === 'observed' ? `observed: ${a.text} (cite: ${a.cite})` : `not-checked: ${a.text}`;

export function renderBrief({ slug, roadmap, blocks, mechanisms, rev, obligations, manifest, launch }) {
  const L = [`# Adversary brief: ${slug}`, '', '## Roadmap section', roadmap, '', '## Frozen requirements and falsifiers'];
  for (const b of blocks) L.push(`[${b.id}] ${b.obligation}`, `Falsifier: ${b.falsifier}`, '');
  L.push('## Mechanism definitions');
  for (const [name, m] of Object.entries(mechanisms)) L.push(`${name}: ${JSON.stringify(m.definition)}`);
  L.push('', '## Builder claims');
  for (const [m, qs] of Object.entries(rev.answers.mechanisms)) for (const q of QUESTIONS.mechanisms) L.push(`mechanism ${m} ${q} ${answerLine(qs[q])}`);
  for (const [r, qs] of Object.entries(rev.answers.requirements)) for (const q of QUESTIONS.requirements) L.push(`requirement ${r} ${q} ${answerLine(qs[q])}`);
  for (const q of QUESTIONS.commitment) L.push(`commitment ${q} ${answerLine(rev.answers.commitment[q])}`);
  L.push('', '## Builder findings');
  for (const f of rev.findings) L.push(`${f.n}. ${f.text}`);
  L.push('', '## Interface obligations', ...obligations, '', '## Exclusion manifest (classes and paths, never contents)');
  for (const p of manifest.paths) L.push(`${p.class} ${p.path}`);
  L.push('', '## Boundary', `Harness ${launch.name}, model ${launch.model ?? 'any'}, transport ${launch.transport ?? 'any'}.`,
    `You may read only the projection directory. Boundary: ${launch.boundary}.`,
    'This projection omits network_exclude and credential paths. It is an egress boundary, not an information-flow proof: it cannot detect a secret a person or primary coding agent copied into ordinary prose, and it does not govern Git pushes.',
    '', '## Your work', 'For each mechanism (Q1, Q2): try to make it pass without the behavior, make it fail for a setup reason, and find an input it reads but does not declare. For each Q3: try to reach the falsifier with an input. For each Q4: find touched paths the claim omitted. For Q5 and Q6: look where the builder said not to. Every interface obligation gets a caller-level attempt.', '');
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
  const all = await readMechanisms(cwd);
  const roadmapEntry = (await listTree(cwd, snap.tree)).find((e) => e.path === 'docs/spec/roadmap.md');
  const text = renderBrief({
    slug, roadmap: roadmapEntry ? roadmapSection((await catBlob(cwd, roadmapEntry.sha)).toString('utf8'), slug) : '',
    blocks: await specBlocks(cwd, snap.tree, t.requirements), mechanisms: Object.fromEntries(t.mechanisms.map((m) => [m, all[m]])),
    rev: rev.payload, obligations: await interfaceObligations(cwd, settings, t.start.payload.snapshot, rev.payload.snapshot), manifest: proj.manifest, launch,
  });
  const payloadDigest = sha256(text);
  const sha = await appendRecord(cwd, 'brief', slug, { slug, review: rev.sha, projection_digest: proj.projectionDigest, payload_digest: payloadDigest, manifest_digest: proj.manifestDigest });
  const briefPath = path.join(cwd, '.cairn/output', `brief-${payloadDigest.slice(7)}.md`);
  await fs.mkdir(path.dirname(briefPath), { recursive: true });
  await fs.writeFile(briefPath, text);
  const launchText = [`cairn: brief ${slug} ${sha}`, `brief: ${briefPath}`, `brief digest: ${payloadDigest}`, `projection: ${dir}`, `projection digest: ${proj.projectionDigest}`,
    `harness: ${launch.name}`, `model: ${launch.model ?? 'any'}`, `transport: ${launch.transport ?? 'any'}`, `boundary: ${launch.boundary}`,
    `start: in ${launch.name}, start a fresh adversary with model ${launch.model ?? 'any'} over ${launch.transport ?? 'any'}, working directory ${dir}, with the file ${briefPath} as its entire prompt; when it finishes, run: cairn report ${slug} --body <file>`, ''].join('\n');
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
- Modify: `lib/records.mjs` (the `report` and `acceptance` schema entries, plan 01)
- Test: `tests/review.test.mjs`

**Interfaces:**
- Produces: `report(cwd, slug, body, {env}) -> sha`, `checkAttempts(attempts, t)`, `checkInterfaceAttempts(list, obligations)`. Body: `{harness, model, transport, session, builder_model, projection_digest, attempts, findings, interface_attempts}`; an attempt is `{tried, outcome, evidence}` with `outcome` in `held | broken`; `attempts` has the same three groups as answers; `interface_attempts` is `[{path, tried, outcome}]`. Report payload keys: `{slug, snapshot, brief, model, transport, boundary, builder_model, session, projection_digest, attempts, findings, interface_attempts}`; plan 01's `report` schema is extended with `transport`, `boundary`, `builder_model` and `session` (section 9 names them), and its `acceptance` schema with `session` and `model` (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { report } from '../lib/review.mjs';

const att = (tried, outcome = 'held') => ({ tried, outcome, evidence: 'node check.mjs printed pass' });
export const reportBody = (b, over = {}) => ({
  harness: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', session: 's-adversary', builder_model: null,
  projection_digest: decodeRecord(b).payload.projection_digest,
  attempts: { mechanisms: { m1: { q1: att('deleted the guard'), q2: att('broke the fixture path') } }, requirements: { 'LOOP-001': { q3: att('empty string input'), q4: att('grep for logger') } }, commitment: { q5: att('two writers'), q6: att('race') } },
  findings: [{ n: 1, text: 'guard accepts whitespace-only input' }],
  interface_attempts: [{ path: 'src/api/x.mjs', tried: 'called x() from a fresh module', outcome: 'held' }],
  ...over,
});

async function reviewed() {
  const { cwd } = await openCommitment({ mechanisms: { m1: MECH }, settings: harnessSettings, files: { 'src/api/x.mjs': 'export const x = 1;\n' } });
  await fs.writeFile(path.join(cwd, 'src/api/x.mjs'), 'export const x = 2;\n');
  const rev = await review(cwd, 'auth', submission(), { env: { CAIRN_SESSION: 's-builder' } });
  const b = await brief(cwd, 'auth', { harness: 'claude_code' });
  return { cwd, rev, b, bc: await catCommit(cwd, b.sha) };
}

test('report records the adversary attempts, model, transport and boundary at the reviewed snapshot; a second report is refused', async () => {
  const { cwd, b, bc, rev } = await reviewed();
  const sha = await report(cwd, 'auth', reportBody(bc));
  const p = decodeRecord(await catCommit(cwd, sha)).payload;
  assert.equal(p.brief, b.sha);
  assert.equal(p.snapshot, decodeRecord(await catCommit(cwd, rev)).payload.snapshot);
  assert.deepEqual([p.model, p.transport, p.boundary, p.session, p.builder_model], ['claude-fable-5-1', 'remote', 'unenforced', 's-adversary', null]);
  await assert.rejects(report(cwd, 'auth', reportBody(bc)), /one report per commitment; auth has/);
});

test('report refuses a snapshot differing from the review', async () => {
  const { cwd, bc } = await reviewed();
  await fs.writeFile(path.join(cwd, 'src/a.mjs'), 'export const a = 3;\n');
  await assert.rejects(report(cwd, 'auth', reportBody(bc)), /workspace differs from the reviewed snapshot/);
});

test('report refuses a stale brief and a stale projection', async () => {
  const { cwd, bc } = await reviewed();
  await assert.rejects(report(cwd, 'auth', reportBody(bc, { projection_digest: 'sha256:' + '0'.repeat(64) })), /projection digest does not match the brief/);
  await review(cwd, 'auth', submission());
  await assert.rejects(report(cwd, 'auth', reportBody(bc)), /brief .* is stale: the review is/);
});

test('report refuses a model or transport that does not match the launch instruction; a matching builder model is recorded', async () => {
  const { cwd, bc } = await reviewed();
  await assert.rejects(report(cwd, 'auth', reportBody(bc, { model: 'other-model' })), /model other-model does not match the launch instruction claude-fable-5-1/);
  await assert.rejects(report(cwd, 'auth', reportBody(bc, { transport: 'local' })), /transport local does not match the launch instruction remote/);
  const sha = await report(cwd, 'auth', reportBody(bc, { builder_model: 'claude-fable-5-1' }));
  assert.equal(decodeRecord(await catCommit(cwd, sha)).payload.builder_model, 'claude-fable-5-1');
});

test('report refuses a missing question or interface attempt, and the session that wrote the review', async () => {
  const { cwd, bc } = await reviewed();
  const noQ = reportBody(bc); delete noQ.attempts.requirements['LOOP-001'].q4;
  await assert.rejects(report(cwd, 'auth', noQ), /LOOP-001 q4 has no attempt/);
  await assert.rejects(report(cwd, 'auth', reportBody(bc, { interface_attempts: [] })), /interface src\/api\/x.mjs has no attempt/);
  await assert.rejects(report(cwd, 'auth', reportBody(bc, { session: 's-builder' })), /session s-builder wrote the review/);
  const anon = await report(cwd, 'auth', reportBody(bc, { session: null }));
  assert.equal(decodeRecord(await catCommit(cwd, anon)).payload.session, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `report is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/records.mjs`, in the schema table entry for `report`, add the keys `transport` (string or null), `boundary` (`enforced|unenforced`), `builder_model` (string or null), `session` (string or null); in the entry for `acceptance` add `session` (string or null) and `model` (string or null). Then:

```js
// lib/review.mjs (append)
function checkAttempt(where, a) {
  if (!a || typeof a !== 'object' || Object.keys(a).sort().join(',') !== 'evidence,outcome,tried' || !nonEmpty(a.tried) || !['held', 'broken'].includes(a.outcome) || !nonEmpty(a.evidence)) {
    throw new ReviewError(`cairn: report: ${where} has no attempt (tried, outcome held|broken, evidence)`);
  }
}
export function checkAttempts(attempts, t) {
  const groups = { mechanisms: t.mechanisms, requirements: t.requirements, commitment: ['commitment'] };
  for (const [group, names] of Object.entries(groups)) {
    const given = group === 'commitment' ? { commitment: attempts.commitment } : (attempts[group] ?? {});
    for (const name of names) for (const q of QUESTIONS[group]) checkAttempt(`${name} ${q}`, given[name] && given[name][q]);
  }
  return { mechanisms: attempts.mechanisms ?? {}, requirements: attempts.requirements ?? {}, commitment: attempts.commitment };
}
export function checkInterfaceAttempts(list, obligations) {
  if (!Array.isArray(list)) throw new ReviewError('cairn: report: interface_attempts must be a list');
  for (const p of obligations) {
    const a = list.find((x) => x && x.path === p);
    if (!a || !nonEmpty(a.tried) || !['held', 'broken'].includes(a.outcome)) throw new ReviewError(`cairn: report: interface ${p} has no attempt`);
  }
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
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const now = await readSnapshot(cwd, snapshot, 'workspace'), then = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  if (now.tree !== then.tree) throw new ReviewError('cairn: report: the workspace differs from the reviewed snapshot');
  const launch = detectHarness(settings, { harness: body.harness, env: opts.env ?? {} });
  if (launch.model !== null && body.model !== launch.model) throw new ReviewError(`cairn: report: model ${body.model} does not match the launch instruction ${launch.model}`);
  if (launch.transport !== null && body.transport !== launch.transport) throw new ReviewError(`cairn: report: transport ${body.transport} does not match the launch instruction ${launch.transport}`);
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`cairn: report: session ${session} wrote the review`);
  const attempts = checkAttempts(body.attempts ?? {}, t);
  const obligations = await interfaceObligations(cwd, settings, t.start.payload.snapshot, rev.payload.snapshot);
  const interface_attempts = checkInterfaceAttempts(body.interface_attempts ?? [], obligations);
  const findings = checkFindings(body.findings ?? []);
  const sha = await appendRecord(cwd, 'report', slug, {
    slug, snapshot: rev.payload.snapshot, brief: br.sha, model: body.model ?? null, transport: body.transport ?? null, boundary: launch.boundary,
    builder_model: body.builder_model ?? null, session, projection_digest: body.projection_digest, attempts, findings, interface_attempts,
  });
  await resetOnProgress(cwd);
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs tests/records.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs lib/records.mjs tests/review.test.mjs
git commit -m "Record the adversary's report once, at the reviewed snapshot, with every refusal section 9 names"
```

---

### Task 5: Resolutions and the finding ledger

**Files:**
- Modify: `lib/review.mjs`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `disputes(log, record, n)`, `unanswered(log)` from `lib/escalate.mjs` (plan 09).
- Produces: `ledger(log, slug) -> [{source, kind, n, text, status, resolutions, rejections}]` with `status` in `open | submitted | rejected | resolved | disputed`; `resolve(cwd, slug, n, explanation, {source}) -> sha`. Resolution payload keys: `{source, n, snapshot, explanation}`; the target token is `<slug>-f<n>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { resolve, ledger } from '../lib/review.mjs';
import { answer, disputes } from '../lib/escalate.mjs';

const asDev = { authenticate: async () => ({ mode: 'unsigned-local', author: 'Dev', confirmed: true }) };
async function reported(over = {}) {
  const r = await reviewed();
  r.rep = await report(r.cwd, 'auth', reportBody(r.bc, over));
  return r;
}

test('resolve names finding N on its exact source record and the snapshot after the fix', async () => {
  const { cwd, rep } = await reported();
  await assert.rejects(resolve(cwd, 'auth', 2, 'x'), /no unresolved finding 2/);
  await assert.rejects(resolve(cwd, 'auth', 1, ''), /explanation needs text/);
  await fs.writeFile(path.join(cwd, 'src/a.mjs'), 'export const a = "trimmed";\n');
  const sha = await resolve(cwd, 'auth', 1, 'trim before the guard');
  const p = decodeRecord(await catCommit(cwd, sha)).payload;
  assert.deepEqual([p.source, p.n, p.explanation], [rep, 1, 'trim before the guard']);
  assert.notEqual(p.snapshot, decodeRecord(await catCommit(cwd, rep)).payload.snapshot);
  const l = ledger(await readLog(cwd), 'auth');
  assert.deepEqual(l.map((f) => [f.source, f.n, f.status]), [[rep, 1, 'submitted']]);
  await assert.rejects(resolve(cwd, 'auth', 1, 'again'), /finding 1 on .* awaits acceptance/);
});

test('the same number on two records is ambiguous until --source names one; a disputed finding is closed', async () => {
  const { cwd } = await reviewed(); // a review and brief without a report yet
  const rev2 = await review(cwd, 'auth', submission({ findings: [{ n: 1, text: 'builder finding' }] }), { env: { CAIRN_SESSION: 's-builder' } });
  const b2 = await brief(cwd, 'auth', { harness: 'claude_code' });
  const rep2 = await report(cwd, 'auth', reportBody(await catCommit(cwd, b2.sha)));
  await assert.rejects(resolve(cwd, 'auth', 1, 'x'), new RegExp(`finding 1 is on ${rev2} and ${rep2}; pass --source`));
  const sha = await resolve(cwd, 'auth', 1, 'x', { source: rev2 });
  assert.equal(decodeRecord(await catCommit(cwd, sha)).payload.source, rev2);
  const { dispute } = await import('../lib/escalate.mjs');
  await dispute(cwd, { commitment: 'auth', record: rep2, n: 1, question: 'Defect?', recommendation: 'No.', because: 'whitespace is valid here', if_wrong: 'bad input passes', instead: 'trim' });
  await answer(cwd, 'auth-e1', 'ok', '', asDev);
  const log = await readLog(cwd);
  assert.equal(disputes(log, rep2, 1), log.find((r) => r.kind === 'escalation').sha);
  assert.deepEqual(ledger(log, 'auth').map((f) => [f.source, f.status]), [[rev2, 'submitted'], [rep2, 'disputed']]);
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
  const out = [];
  for (const src of r.records.filter((x) => FINDING_KINDS.includes(x.kind))) {
    for (const f of src.payload.findings) {
      const resolutions = r.records.filter((x) => x.kind === 'resolution' && x.payload.source === src.sha && x.payload.n === f.n);
      const verdictOf = (res) => {
        const acc = r.records.find((x) => x.kind === 'acceptance' && (x.payload.accepted.some((a) => a.resolution === res.sha) || x.payload.rejected.some((a) => a.resolution === res.sha)));
        return acc ? (acc.payload.accepted.some((a) => a.resolution === res.sha) ? 'accepted' : 'rejected') : 'submitted';
      };
      const verdicts = resolutions.map(verdictOf);
      let status = 'open';
      if (disputes(log, src.sha, f.n)) status = 'disputed';
      else if (verdicts.includes('accepted')) status = 'resolved';
      else if (verdicts.at(-1) === 'submitted') status = 'submitted';
      else if (verdicts.at(-1) === 'rejected') status = 'rejected';
      out.push({ source: src.sha, kind: src.kind, n: f.n, text: f.text, status, resolutions, rejections: verdicts.filter((v) => v === 'rejected').length });
    }
  }
  return out;
}

export async function resolve(cwd, slug, n, explanation, opts = {}) {
  if (!nonEmpty(explanation)) throw new ReviewError('cairn: resolve: explanation needs text');
  const log = await readLog(cwd);
  const all = ledger(log, slug).filter((f) => f.n === n && (opts.source ? f.source === opts.source : true));
  const submitted = all.find((f) => f.status === 'submitted');
  if (submitted) throw new ReviewError(`cairn: resolve: finding ${n} on ${submitted.source} awaits acceptance`);
  const open = all.filter((f) => f.status === 'open' || f.status === 'rejected');
  if (open.length === 0) throw new ReviewError(`cairn: resolve: no unresolved finding ${n}${opts.source ? ` on ${opts.source}` : ''}`);
  if (open.length > 1) throw new ReviewError(`cairn: resolve: finding ${n} is on ${open.map((f) => f.source).join(' and ')}; pass --source <sha>`);
  const f = open[0];
  const blocked = unanswered(log).find((e) => e.payload.concerns.some((c) => ['finding', 'rejection'].includes(c.kind) && c.ref === f.source && c.n === n));
  if (blocked) throw new ReviewError(`cairn: resolve: finding ${n} on ${f.source} is under escalation ${blocked.target}`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'resolution', `${slug}-f${n}`, { source: f.source, n, snapshot, explanation });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (14 tests).

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
- Consumes: `bump(cwd, actionClass, target) -> {sameTarget, total}`, `BOUNDS.acceptanceRounds` (plan 08); `escalate(cwd, draft)` (plan 09).
- Produces: `accept(cwd, slug, body, {env}) -> sha`, `reviewState(cwd, slug) -> {review, report, acceptance, ledger, ready, reasons}`. Body: `{resolutions: [{sha, verdict:'accepted'|'rejected', reason}], findings, session, model}`. Acceptance payload keys: `{slug, report, snapshot, delta_digest, accepted: [{resolution, reason}], rejected: [{resolution, reason}], findings, session, model}`; `delta_digest = sha256(canonicalize(diffTree(reportTree, currentTree)))`. Acceptances number their own findings from 1.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { accept, reviewState } from '../lib/review.mjs';
import { unanswered } from '../lib/escalate.mjs';

async function fixed(cwd, n, text) {
  await fs.writeFile(path.join(cwd, 'src/a.mjs'), `export const a = ${JSON.stringify(text)};\n`);
  return resolve(cwd, 'auth', n, text);
}
const verdict = (sha, v, reason = '') => ({ sha, verdict: v, reason });

test('accept examines the cumulative delta and gives a verdict on every submitted resolution', async () => {
  const { cwd, rep } = await reported();
  await assert.rejects(accept(cwd, 'auth', { resolutions: [], findings: [] }), /nothing submitted since the report/);
  const r1 = await fixed(cwd, 1, 'first');
  await assert.rejects(accept(cwd, 'auth', { resolutions: [], findings: [] }), new RegExp(`resolution ${r1} has no verdict`));
  await assert.rejects(accept(cwd, 'auth', { resolutions: [verdict(r1, 'rejected')], findings: [] }), /rejected .* needs a reason/);
  await assert.rejects(accept(cwd, 'auth', { resolutions: [verdict('a'.repeat(40), 'accepted')], findings: [] }), /is not a submitted resolution/);
  await assert.rejects(accept(cwd, 'auth', { resolutions: [verdict(r1, 'accepted')], findings: [], session: 's-builder' }), /session s-builder wrote the review/);
  const sha = await accept(cwd, 'auth', { resolutions: [verdict(r1, 'accepted')], findings: [{ n: 1, text: 'the new trim drops tabs' }] });
  const p = decodeRecord(await catCommit(cwd, sha)).payload;
  assert.equal(p.report, rep);
  assert.deepEqual(p.accepted, [{ resolution: r1, reason: '' }]);
  const { sha256, canonicalize } = await import('../lib/canon.mjs');
  assert.equal(p.delta_digest, sha256(canonicalize([{ path: 'src/a.mjs', status: 'M' }])));
  const st = await reviewState(cwd, 'auth');
  assert.equal(st.ready, false);
  assert.deepEqual(st.ledger.map((f) => [f.kind, f.status]), [['report', 'resolved'], ['acceptance', 'open']]);
  const r2 = await fixed(cwd, 1, 'second');
  assert.equal(decodeRecord(await catCommit(cwd, r2)).payload.source, sha);
  await accept(cwd, 'auth', { resolutions: [verdict(r2, 'accepted')], findings: [] });
  const done = await reviewState(cwd, 'auth');
  assert.deepEqual([done.ready, done.reasons], [true, []]);
});

test('a resolution rejected twice for the same finding escalates and resolve is blocked until answered', async () => {
  const { cwd, rep } = await reported();
  const r1 = await fixed(cwd, 1, 'one');
  await accept(cwd, 'auth', { resolutions: [verdict(r1, 'rejected', 'still accepts tabs')], findings: [] });
  assert.deepEqual(unanswered(await readLog(cwd)), []);
  const r2 = await fixed(cwd, 1, 'two');
  await accept(cwd, 'auth', { resolutions: [verdict(r2, 'rejected', 'still accepts form feeds')], findings: [] });
  const open = unanswered(await readLog(cwd));
  assert.equal(open.length, 1);
  assert.deepEqual(open[0].payload.concerns, [{ kind: 'rejection', ref: rep, n: 1 }]);
  assert.equal(open[0].payload.question, 'Finding 1 on the report was rejected twice; should the developer rule on it?');
  await assert.rejects(fixed(cwd, 1, 'three'), /is under escalation auth-e1/);
});

test('three acceptance rounds without Done create the cycle escalation even with newly numbered findings', async () => {
  const { cwd } = await reported();
  let n = 1, source = null;
  for (let round = 1; round <= 3; round++) {
    const r = await (source ? resolve(cwd, 'auth', n, `round ${round}`, { source }) : fixed(cwd, n, `round ${round}`));
    await fs.writeFile(path.join(cwd, 'src/a.mjs'), `export const a = ${round};\n`);
    source = await accept(cwd, 'auth', { resolutions: [verdict(r, 'accepted')], findings: [{ n: 1, text: `new finding ${round}` }] });
    n = 1;
  }
  const open = unanswered(await readLog(cwd));
  assert.deepEqual(open.map((e) => e.payload.concerns), [[{ kind: 'cycle', ref: 'acceptance', n: 3 }]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `accept is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (imports)
import { bump, BOUNDS } from './cycle.mjs';

// lib/review.mjs (append)
const SHA = /^[0-9a-f]{40}$/;

function cycleDraft(slug, concern, question, because) {
  return {
    commitment: slug, concerns: [concern], question, because,
    recommendation: 'Stop this round and rule: keep the finding open, close it, or change the approach.',
    if_wrong: 'The loop keeps spending acceptance rounds without reaching Done.',
    instead: 'Answer instead <direction> with the fix you want.', options: [], named_paths: [], cited_decisions: [],
  };
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
    const since = r.records.filter((x) => x.kind === 'resolution');
    if (acc) {
      const at = await readSnapshot(cwd, acc.payload.snapshot, 'workspace');
      if (at.tree !== current.tree) reasons.push('the latest acceptance is not at the final workspace snapshot');
    } else if (since.length > 0 || (await readSnapshot(cwd, rep.payload.snapshot, 'workspace')).tree !== current.tree) reasons.push('no acceptance examines the post-report delta');
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
  const current = await readSnapshot(cwd, snapshot, 'workspace'), reported = await readSnapshot(cwd, rep.payload.snapshot, 'workspace');
  if (submitted.length === 0 && current.tree === reported.tree) throw new ReviewError('cairn: accept: nothing submitted since the report and no delta to examine');
  const verdicts = Array.isArray(body.resolutions) ? body.resolutions : [];
  for (const s of submitted) if (!verdicts.some((v) => v.sha === s.sha)) throw new ReviewError(`cairn: accept: resolution ${s.sha} has no verdict`);
  const accepted = [], rejected = [];
  for (const v of verdicts) {
    if (!SHA.test(v.sha ?? '') || !submitted.some((s) => s.sha === v.sha)) throw new ReviewError(`cairn: accept: ${v.sha} is not a submitted resolution`);
    if (v.verdict === 'accepted') accepted.push({ resolution: v.sha, reason: v.reason ?? '' });
    else if (v.verdict === 'rejected' && nonEmpty(v.reason)) rejected.push({ resolution: v.sha, reason: v.reason });
    else throw new ReviewError(`cairn: accept: rejected ${v.sha} needs a reason; verdict is accepted or rejected`);
  }
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`cairn: accept: session ${session} wrote the review`);
  const findings = checkFindings(body.findings ?? []);
  const delta = await diffTree(cwd, reported.tree, current.tree);
  const sha = await appendRecord(cwd, 'acceptance', slug, {
    slug, report: rep.sha, snapshot, delta_digest: sha256(canonicalize(delta)), accepted, rejected, findings, session, model: body.model ?? null,
  });
  const after = await readLog(cwd);
  for (const f of ledger(after, slug)) {
    if (f.status === 'rejected' && f.rejections === 2) {
      await escalate(cwd, cycleDraft(slug, { kind: 'rejection', ref: f.source, n: f.n },
        `Finding ${f.n} on the ${f.kind} was rejected twice; should the developer rule on it?`, `Rejected: ${rejected.map((x) => x.reason).join('; ') || 'see the acceptance record'}.`));
    }
  }
  const state = await reviewState(cwd, slug);
  const { sameTarget } = await bump(cwd, 'acceptance', slug);
  if (state.ready) await resetOnProgress(cwd);
  else if (sameTarget >= BOUNDS.acceptanceRounds && unanswered(after).every((e) => !e.payload.concerns.some((c) => c.kind === 'cycle'))) {
    await escalate(cwd, cycleDraft(slug, { kind: 'cycle', ref: 'acceptance', n: sameTarget },
      `${sameTarget} acceptance rounds after the report have not reached Done; how should the loop proceed?`, `Open: ${state.reasons.join('; ')}.`));
  }
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/review.test.mjs
git commit -m "Accept resolutions over the cumulative delta; escalate a second rejection and the third round"
```

---

### Task 7: Command-line entry points and the decoder round-trip

**Files:**
- Modify: `lib/review.mjs`
- Modify: `lib/cli.mjs` (command table, plan 01)
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `lib/cli.mjs` command table entries `name: async (cwd, argv) => {code, out}`; `KINDS` (plan 01).
- Produces: `cliReview`, `cliBrief`, `cliReport`, `cliResolve`, `cliAccept`, each `(cwd, argv, opts) -> {code, out}`. Commands: `cairn review SLUG --body FILE`, `cairn brief SLUG [--harness NAME]`, `cairn report SLUG --body FILE`, `cairn resolve SLUG N --explanation TEXT [--source SHA]`, `cairn accept SLUG --body FILE`. A body file is JSON the agent or adversary wrote; it is parsed with `JSON.parse` and re-encoded canonically by `appendRecord`, so the file is never authority.

- [ ] **Step 1: Write the failing test**

```js
// tests/review.test.mjs (append)
import { KINDS } from '../lib/records.mjs';
import { cliReview, cliBrief, cliReport, cliResolve, cliAccept } from '../lib/review.mjs';

test('the five commands print one line each and exit 1 with a cairn: line on refusal; all five kinds decode', async () => {
  const { cwd } = await openCommitment({ mechanisms: { m1: MECH }, settings: harnessSettings });
  const bodyFile = async (name, obj) => { const p = path.join(cwd, '.cairn/output', name); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj)); return p; };
  const rv = await cliReview(cwd, ['auth', '--body', await bodyFile('rv.json', submission({ findings: [{ n: 1, text: 'x' }] }))], { env: { CAIRN_SESSION: 'b' } });
  assert.match(rv.out, /^cairn: review auth [0-9a-f]{40}\n$/);
  const br = await cliBrief(cwd, ['auth', '--harness', 'claude_code']);
  assert.equal(br.code, 0);
  assert.match(br.out, /^cairn: brief auth [0-9a-f]{40}\nbrief: .*\nbrief digest: sha256:[0-9a-f]{64}\nprojection: .*\nprojection digest: sha256:[0-9a-f]{64}\nharness: claude_code\nmodel: claude-fable-5-1\ntransport: remote\nboundary: unenforced\nstart: in claude_code, .*\n$/);
  const bsha = br.out.split('\n')[0].split(' ')[3];
  const bad = await cliReport(cwd, ['auth', '--body', await bodyFile('bad.json', reportBody(await catCommit(cwd, bsha), { model: 'x' }))]);
  assert.deepEqual([bad.code, bad.out.startsWith('cairn: report: model x does not match')], [1, true]);
  const rp = await cliReport(cwd, ['auth', '--body', await bodyFile('rp.json', reportBody(await catCommit(cwd, bsha)))]);
  assert.match(rp.out, /^cairn: report auth [0-9a-f]{40}\n$/);
  await fs.writeFile(path.join(cwd, 'src/a.mjs'), 'export const a = 9;\n');
  const rs = await cliResolve(cwd, ['auth', '1', '--explanation', 'fixed', '--source', rp.out.trim().split(' ')[3]]);
  assert.match(rs.out, /^cairn: resolution auth-f1 [0-9a-f]{40}\n$/);
  const ac = await cliAccept(cwd, ['auth', '--body', await bodyFile('ac.json', { resolutions: [{ sha: rs.out.trim().split(' ')[3], verdict: 'accepted', reason: '' }], findings: [] })]);
  assert.match(ac.out, /^cairn: acceptance auth [0-9a-f]{40}\n$/);
  for (const k of ['review', 'brief', 'report', 'resolution', 'acceptance']) assert.ok(KINDS.has(k));
  for (const r of (await readLog(cwd)).filter((x) => ['review', 'brief', 'report', 'resolution', 'acceptance'].includes(x.kind))) decodeRecord(await catCommit(cwd, r.sha));
  assert.equal((await reviewState(cwd, 'auth')).ready, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review.test.mjs`
Expected: FAIL, `cliReview is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/review.mjs (append)
function flags(argv) {
  const pos = [], named = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { named[argv[i].slice(2)] = argv[i + 1]; i++; } else pos.push(argv[i]);
  }
  return { pos, named };
}
async function bodyOf(named) {
  if (!named.body) throw new ReviewError('cairn: --body <file> is required');
  return JSON.parse(await fs.readFile(named.body, 'utf8'));
}
const asCli = (fn) => async (cwd, argv, opts = {}) => {
  try { return { code: 0, out: await fn(cwd, flags(argv), opts) }; }
  catch (e) { return { code: 1, out: (e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`) + '\n' }; }
};
export const cliReview = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: review ${slug} ${await review(cwd, slug, await bodyOf(named), opts)}\n`);
export const cliBrief = asCli(async (cwd, { pos: [slug], named }, opts) => (await brief(cwd, slug, { harness: named.harness, env: opts.env })).launch);
export const cliReport = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: report ${slug} ${await report(cwd, slug, await bodyOf(named), opts)}\n`);
export const cliResolve = asCli(async (cwd, { pos: [slug, n], named }) => `cairn: resolution ${slug}-f${n} ${await resolve(cwd, slug, Number(n), named.explanation ?? '', { source: named.source })}\n`);
export const cliAccept = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: acceptance ${slug} ${await accept(cwd, slug, await bodyOf(named), opts)}\n`);
```

In `lib/cli.mjs` add to the command table `review: cliReview, brief: cliBrief, report: cliReport, resolve: cliResolve, accept: cliAccept` imported from `./review.mjs`, passing `{env: process.env}` as `opts`, and add the five usage lines to `--help`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review.test.mjs tests/cli.test.mjs`
Expected: PASS (18 tests in review; cli unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs lib/cli.mjs tests/review.test.mjs
git commit -m "Add the review, brief, report, resolve and accept commands"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| "Review. The builder's claims at a workspace snapshot: what was examined, answers to the fixed questions in section 9, and findings." (2); Q1 to Q6 per mechanism, requirement, commitment; "answered observed with a command, path or output, or not-checked. The kernel checks coverage and shape, not truth." (9) | 1 |
| `review SLUG`: "a review names the current workspace snapshot and answers every fixed question for every target" (5) | 1 |
| "cairn brief <slug> writes a brief record and renders the roadmap section, frozen requirements and falsifiers, mechanism definitions, builder claims and findings, interface obligations, exclusion manifest and brief digest." (9) | 3 |
| Projection: excluded paths omitted, no .git or object store, host path, evaluator key, credential path or command-output body; manifest names classes and paths never contents; reads Git object bytes; safe relative symlinks preserved; absolute, out-of-tree, special files, gitlinks refused (9); decision 43 | 2 |
| "the brief names the projection as the only path the adversary may read and the report records boundary: unenforced; Cairn does not refuse the report" (9) | 3, 4 |
| "The brief warns about that limitation." (9) | 3 |
| Harness "from its environment or --harness"; "passes the model string through; it never maps aliases. A null or unknown entry means any model." (6, 9); decision 20 | 3, 4 |
| "Report. The adversary's attempts against those claims at the same workspace snapshot. One report is written per commitment." (2); "The report is written once at the candidate snapshot." (5); decisions 8, 16 | 4 |
| `cairn report` refuses: snapshot differs from the review; stale brief or projection; model or transport mismatch; unattempted question or interface (9); `report SLUG` predicate (5) | 4 |
| "Where the harness reports the builder's model, the report records it beside the adversary model. A matching model is recorded, not refused." (9) | 4 |
| "Where a harness reports session identity, the report refuses the session that wrote the review." (9) | 4 (and 6 for acceptance) |
| "The report records the projection digest, transport and whether the boundary was enforced." (9) | 4 |
| "Every changed interface gets a caller-level attempt whether or not the builder raised it." (9); interface hit "the adversary must attempt the changed interface explicitly in the report or next acceptance" (8) | 3, 4 |
| "Finding. A numbered entry on a review, report or acceptance. A finding is answered by a resolution, which names the snapshot after a fix and explains it, or by a dispute" (2); `resolve SLUG N` (5); "A resolution references the exact source record and finding number." (12) | 5 |
| "Acceptance ... examines the cumulative post-report delta, accepts or rejects each submitted resolution with a reason, and may raise new findings anywhere in that delta." (2, 9); `accept SLUG` (5); decision 33 | 6 |
| "Each acceptance examines the whole delta from that reported snapshot to the current one, not only the named fix" (5); "Done requires the last acceptance at the final snapshot." (9) | 6 (`reviewState`) |
| "A second rejection of a resolution for the same finding escalates." (5, 9) | 6 |
| "Three acceptance rounds after the report without reaching Done create the same kind of escalation, even when each round raises a newly numbered finding." (5, 9) | 6 (count from plan 08's `bump` and `BOUNDS`) |
| "Each finding is resolved or developer-disputed" (8); Done bullet on findings and resolutions (5) | 5, 6 (`ledger`, `reviewState`) |
| "the loop advances from implementation to review, report or Done" is semantic progress (2) | 1, 4, 6 (`resetOnProgress`) |
| Commands `cairn review`, `brief`, `report`, `resolve` and `accept` "write the review chain" (4) | 7 |
| Kinds review, brief, report, resolution, acceptance (4) decode through the shared decoder | 7 |

Left to other plans:

- The Done rule as a whole and the precedence positions of `review`, `report`, `resolve` and `accept` (5): plan 08 and plan 14's cutover, which switch wake's finding checks to `reviewState` and `ledger`.
- The receipt and mechanism-review bullets of Done ("current passing receipt whose review metadata binds ...", 5): plan 05.
- The acceptance-round counter's storage, reset on semantic progress and the twenty-eight-transition bound (5): plan 08's `cycle.mjs`; this plan calls `bump`, `BOUNDS` and `resetOnProgress`.
- Starting the adversary (9 "The agent starts an adversary ... and waits"): the agent through the harness, following the `start:` line Task 3 prints; the working agreement template in plan 13 quotes that line. The kernel spawns nothing.
- Restricting a harness's filesystem tools to the projection where a harness can (9): plan 13's adapters; `CONFINES` is the kernel's record of which can, all `false` today.
- Local-adversary broader access "the developer may explicitly authorize" (9): plan 03's authorization record; no supported harness is configured local, so this plan records transport and refuses nothing on it.
- Carrying unresolved findings across a supersession (2 Superseded): plan 06.
- Export of the harness session id into `CAIRN_SESSION` (9 "Where a harness reports session identity"): plan 13's hooks.
