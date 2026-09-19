# Escalation and answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build `lib/escalate.mjs`: the canonical draft, the escalation record, the developer's answer, the agent's reply, the finding dispute, and the exact Waiting text wake prints.

**Architecture:** one module writes the three decision-chain kinds (`escalation`, `answer`, `reply`) on `refs/cairn/log` through plan 01's `appendRecord`, and appends the `answered` ADR line through plan 06's `appendDecision`. Every draft passes one validator shared with `cairn decide --consequential`. The evaluator (plan 11) is reached by name through a dynamic import only when settings enable it; with it disabled the kernel level applies and the escalation is written and held. Readers (`unanswered`, `escalationState`, `disputes`, `renderWaiting`) are pure functions over the decoded log so plan 10 and wake consume state without re-parsing.

**Tech Stack:** Node 24, ES modules, no dependencies, `node --test` with `node:assert/strict`, Git plumbing through plan 01's `lib/gitx.mjs`.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 (Escalation, answer and reply; Finding; the two decision levels under ADR), section 4 (escalation, answer, reply kinds; the `answered` ADR line), section 5 (Waiting; `reply SLUG`; `resolve SLUG N` "or an escalation disputes it"; `escalate REQ`), section 8 (Escalation), section 13 decisions 10, 11, 23.

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "An escalation has five one-line fields: question, recommendation, because, if wrong, and instead. Wake prints them verbatim."
- "The developer writes `ok`, `instead <text>` or `ask <text>` with `cairn answer`; `ask` stays open until an agent reply."
- "The developer runs `cairn answer` and `cairn decisions --read`; the agent never does."
- "`cairn escalate` and `cairn decide --consequential` accept the same canonical draft. With evaluation disabled or outside its envelope, the requested command uses the kernel level."
- "A Blocking decision is an escalation; its answered line names the answer record."
- "A finding is answered by a resolution ... or by a dispute, which is an escalation naming the finding and resolved by the developer."
- Record subjects are `cairn: <kind> <target>`; the escalation target token is `<commitment-slug>-e<n>` with n counting escalations of that commitment from 1. `answer` and `reply` use the escalation's target.

---

### Task 1: The canonical draft

**Files:**
- Create: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `canonicalize(value)`, `sha256(bytes|string)` from `lib/canon.mjs` (plan 01).
- Produces: `validateDraft(draft) -> draft` (throws `DraftError`), `draftDigest(draft) -> 'sha256:<hex>'`, `validateConcern(c) -> c`, `FIELDS`, `CONCERN_KINDS`. The draft is section 10's `D`: `{commitment, concerns, question, recommendation, because, if_wrong, instead, options, named_paths, cited_decisions}`. A concern is `{kind, ref, n}` with `kind` in `requirement | finding | rejection | item | breach | cycle | transaction | contract`, `ref` a string (identifier, log SHA, action class or path) and `n` a positive integer or `null`. Plans 10 and 11 build drafts in this shape.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, draftDigest, DraftError } from '../lib/escalate.mjs';

export const draft = (over = {}) => ({
  commitment: 'auth', concerns: [{ kind: 'requirement', ref: 'LOOP-001', n: null }],
  question: 'Should the login keep sessions for 30 days?',
  recommendation: 'Yes, 30 days, refreshed on use.',
  because: 'The spec names no length and the fixture in tests/session.test.mjs assumes 30.',
  if_wrong: 'Users stay logged in on shared machines longer than intended.',
  instead: 'Seven days with no refresh.',
  options: [], named_paths: ['src/session.mjs'], cited_decisions: [], ...over,
});

test('a complete draft validates and digests deterministically', () => {
  const d = draft();
  assert.equal(validateDraft(d), d);
  assert.equal(draftDigest(draft()), draftDigest(draft()));
  assert.match(draftDigest(draft()), /^sha256:[0-9a-f]{64}$/);
});

test('each of the five fields must be one non-empty line', () => {
  for (const f of ['question', 'recommendation', 'because', 'if_wrong', 'instead']) {
    assert.throws(() => validateDraft(draft({ [f]: '' })), DraftError);
    assert.throws(() => validateDraft(draft({ [f]: 'two\nlines' })), DraftError);
    assert.throws(() => validateDraft(draft({ [f]: 7 })), DraftError);
  }
});

test('a draft with an unknown key, a missing key or no concern is refused', () => {
  assert.throws(() => validateDraft({ ...draft(), extra: 1 }), /unknown field extra/);
  const d = draft(); delete d.options;
  assert.throws(() => validateDraft(d), /missing options/);
  assert.throws(() => validateDraft(draft({ concerns: [] })), /at least one concern/);
  assert.throws(() => validateDraft(draft({ concerns: [{ kind: 'mood', ref: 'x', n: null }] })), /concern kind/);
  assert.throws(() => validateDraft(draft({ concerns: [{ kind: 'finding', ref: 'a'.repeat(40), n: 0 }] })), /concern n/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `Cannot find module '.../lib/escalate.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs
import { canonicalize, sha256 } from './canon.mjs';

export class DraftError extends Error {}
export const FIELDS = ['question', 'recommendation', 'because', 'if_wrong', 'instead'];
export const CONCERN_KINDS = new Set(['requirement', 'finding', 'rejection', 'item', 'breach', 'cycle', 'transaction', 'contract']);
const DRAFT_KEYS = ['commitment', 'concerns', ...FIELDS, 'options', 'named_paths', 'cited_decisions'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BAD_CHARS = /[\x00-\x1f\x7f]/;

function oneLine(name, v) {
  if (typeof v !== 'string' || v.trim() === '' || BAD_CHARS.test(v)) {
    throw new DraftError(`cairn: draft field ${name} must be one non-empty line`);
  }
  return v;
}

export function validateConcern(c) {
  if (!c || typeof c !== 'object' || Object.keys(c).sort().join(',') !== 'kind,n,ref') {
    throw new DraftError('cairn: a concern is {kind, ref, n}');
  }
  if (!CONCERN_KINDS.has(c.kind)) throw new DraftError(`cairn: concern kind ${c.kind} is not one of ${[...CONCERN_KINDS].join(', ')}`);
  if (typeof c.ref !== 'string' || c.ref === '' || BAD_CHARS.test(c.ref)) throw new DraftError('cairn: concern ref must be a non-empty string');
  if (c.n !== null && !(Number.isInteger(c.n) && c.n >= 1)) throw new DraftError('cairn: concern n must be a positive integer or null');
  return c;
}

export function validateDraft(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new DraftError('cairn: draft must be an object');
  for (const k of Object.keys(d)) if (!DRAFT_KEYS.includes(k)) throw new DraftError(`cairn: draft has unknown field ${k}`);
  for (const k of DRAFT_KEYS) if (!(k in d)) throw new DraftError(`cairn: draft is missing ${k}`);
  if (typeof d.commitment !== 'string' || !SLUG.test(d.commitment)) throw new DraftError('cairn: draft commitment must be a slug');
  for (const f of FIELDS) oneLine(f, d[f]);
  if (!Array.isArray(d.concerns) || d.concerns.length === 0) throw new DraftError('cairn: draft needs at least one concern');
  d.concerns.forEach(validateConcern);
  for (const k of ['options', 'named_paths', 'cited_decisions']) {
    if (!Array.isArray(d[k]) || !d[k].every((s) => typeof s === 'string')) throw new DraftError(`cairn: draft ${k} must be a list of strings`);
  }
  return d;
}

export function draftDigest(d) { return sha256(canonicalize(validateDraft(d))); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Validate and digest the canonical escalation draft"
```

---

### Task 2: The escalation record

**Files:**
- Create: `tests/helpers/commitment.mjs`
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `makeProject({settings, files}) -> {cwd}` from `tests/helpers/repo.mjs` (plan 03: a temp repository under `os.tmpdir()`, initialized with valid settings merged over `settings` and the given files committed, durable refs created). `appendRecord(cwd, kind, target, payload)`, `readLog(cwd)`, `range(log)`, `decodeRecord(commit)` from `lib/records.mjs`; `writeWorkspaceSnapshot(cwd)` from `lib/snapshots.mjs`; `catCommit(cwd, sha)` from `lib/gitx.mjs`; `loadSettings(cwd)` from `lib/settings.mjs` (plan 02). Plan 01's start payload keys used by the fixture: `{slug, snapshot, requirements: [{requirement, text_digest}], from_superseded}`.
- Produces: `escalate(cwd, draft, opts) -> sha`, `escalateWithRoute(cwd, draft, opts) -> {route, sha}`, `findEscalation(log, target) -> record`, `escalationsFor(log, slug) -> [record]`. Escalation payload keys (plan 01's schema for kind `escalation`): `{slug, question, recommendation, because, if_wrong, instead, concerns, evaluation}`; `evaluation` is a log SHA or `null`. Fixture `openCommitment({slug, requirements, files, settings}) -> {cwd, slug, startSha, snapshot}` writes the start record directly so these tests need no authorization or transaction machinery.

- [ ] **Step 1: Write the fixture and the failing test**

```js
// tests/helpers/commitment.mjs
import { makeProject } from './repo.mjs';
import { appendRecord } from '../../lib/records.mjs';
import { writeWorkspaceSnapshot } from '../../lib/snapshots.mjs';
import { sha256 } from '../../lib/canon.mjs';

export async function openCommitment({ slug = 'auth', requirements = ['LOOP-001'], files = {}, settings = {} } = {}) {
  const { cwd } = await makeProject({ settings, files: { 'src/a.mjs': 'export const a = 1;\n', ...files } });
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const startSha = await appendRecord(cwd, 'start', slug, {
    slug, snapshot, from_superseded: null,
    requirements: requirements.map((r) => ({ requirement: r, text_digest: sha256(`[${r}] frozen text`) })),
  });
  return { cwd, slug, startSha, snapshot };
}

// A finding-bearing record for dispute tests. The kernel writer of the review kind is plan 10.
export async function reviewWithFindings(cwd, slug, texts) {
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'review', slug, {
    slug, snapshot, session: null, examined: ['src/a.mjs'],
    answers: { mechanisms: {}, requirements: {}, commitment: { q5: { status: 'not-checked', text: 'nothing' }, q6: { status: 'not-checked', text: 'nothing' } } },
    findings: texts.map((text, i) => ({ n: i + 1, text })),
  });
}
```

```js
// tests/escalate.test.mjs (append)
import { openCommitment } from './helpers/commitment.mjs';
import { readLog, decodeRecord, KINDS } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { escalate, escalateWithRoute, findEscalation } from '../lib/escalate.mjs';

test('escalate writes an escalation record with the five fields and concern, target <slug>-e<n>', async () => {
  for (const k of ['escalation', 'answer', 'reply']) assert.ok(KINDS.has(k), `${k} is a log kind`);
  const { cwd } = await openCommitment();
  const sha = await escalate(cwd, draft());
  const commit = await catCommit(cwd, sha);
  assert.deepEqual(commit.trailers.map(([k]) => k), ['Cairn-Schema', 'Cairn-Digest']);
  assert.equal(commit.subject, 'cairn: escalation auth-e1');
  const rec = decodeRecord(commit);
  assert.equal(rec.kind, 'escalation');
  assert.equal(rec.target, 'auth-e1');
  assert.deepEqual(rec.payload, {
    slug: 'auth', question: draft().question, recommendation: draft().recommendation, because: draft().because,
    if_wrong: draft().if_wrong, instead: draft().instead, concerns: draft().concerns, evaluation: null,
  });
  const second = await escalate(cwd, draft({ question: 'Another?' }));
  assert.equal(decodeRecord(await catCommit(cwd, second)).target, 'auth-e2');
  assert.equal(findEscalation(await readLog(cwd), 'auth-e2').sha, second);
});

test('escalate refuses a draft for a commitment that is not open', async () => {
  const { cwd } = await openCommitment({ slug: 'auth' });
  await assert.rejects(escalate(cwd, draft({ commitment: 'other' })), /no open commitment other/);
});

test('escalate refuses a requirement concern outside the frozen set and a finding concern with no such finding', async () => {
  const { cwd } = await openCommitment({ requirements: ['LOOP-001'] });
  await assert.rejects(escalate(cwd, draft({ concerns: [{ kind: 'requirement', ref: 'LOOP-999', n: null }] })), /LOOP-999 is not in the frozen set/);
  await assert.rejects(escalate(cwd, draft({ concerns: [{ kind: 'finding', ref: 'f'.repeat(40), n: 1 }] })), /no record f{40} in the open range/);
});

test('with the evaluator disabled the route is developer and the kernel never imports the evaluator', async () => {
  const { cwd } = await openCommitment();
  const r = await escalateWithRoute(cwd, draft(), { evaluate: async () => { throw new Error('must not be called'); } });
  assert.equal(r.route, 'developer');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `escalate is not a function` (module exports only Task 1 names).

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
import { appendRecord, readLog, range } from './records.mjs';
import { loadSettings } from './settings.mjs';

const SHA = /^[0-9a-f]{40}$/;
const FINDING_KINDS = new Set(['review', 'report', 'acceptance']);

export function escalationsFor(log, slug) {
  return log.filter((r) => r.kind === 'escalation' && r.payload.slug === slug);
}
export function findEscalation(log, target) {
  const rec = log.find((r) => r.kind === 'escalation' && r.target === target);
  if (!rec) throw new DraftError(`cairn: no escalation ${target}`);
  return rec;
}

function openRange(log, slug) {
  const r = range(log);
  if (!r.start || r.closed || r.start.payload.slug !== slug) throw new DraftError(`cairn: no open commitment ${slug}`);
  return r;
}

function checkConcern(c, log, r) {
  const inRange = (sha) => r.records.find((x) => x.sha === sha);
  switch (c.kind) {
    case 'requirement':
      if (!r.start.payload.requirements.some((q) => q.requirement === c.ref)) throw new DraftError(`cairn: ${c.ref} is not in the frozen set`);
      return;
    case 'finding': case 'rejection': {
      const src = SHA.test(c.ref) && inRange(c.ref);
      if (!src) throw new DraftError(`cairn: no record ${c.ref} in the open range`);
      if (!FINDING_KINDS.has(src.kind) || !src.payload.findings.some((f) => f.n === c.n)) throw new DraftError(`cairn: ${c.ref} has no finding ${c.n}`);
      return;
    }
    case 'item': case 'breach': case 'transaction': {
      const want = { item: 'item', breach: 'scope-breach', transaction: 'command-intent' }[c.kind];
      if (!log.some((x) => x.sha === c.ref && x.kind === want)) throw new DraftError(`cairn: no ${want} record ${c.ref}`);
      return;
    }
    default: return; // cycle and contract carry a class name or path; nothing on the log to check
  }
}

export async function escalateWithRoute(cwd, draft, opts = {}) {
  const d = validateDraft(draft);
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const r = openRange(log, d.commitment);
  for (const c of d.concerns) checkConcern(c, log, r);
  let route = 'developer', evaluation = null;
  if (settings.typesafeai && settings.typesafeai.enabled === true) {
    const evaluate = opts.evaluate ?? (await import('./evaluate.mjs')).evaluate;
    ({ route, evaluationSha: evaluation } = await evaluate(cwd, d, { transport: opts.transport }));
  }
  if (route === 'developer') {
    const target = `${d.commitment}-e${escalationsFor(log, d.commitment).length + 1}`;
    const payload = { slug: d.commitment, concerns: d.concerns, evaluation };
    for (const f of FIELDS) payload[f] = d[f];
    return { route, sha: await appendRecord(cwd, 'escalation', target, payload) };
  }
  return routeElsewhere(cwd, d, route, evaluation); // Task 3
}

export async function escalate(cwd, draft, opts) { return (await escalateWithRoute(cwd, draft, opts)).sha; }
```

Add a stub so the module loads before Task 3: `async function routeElsewhere() { throw new DraftError('cairn: evaluator routes arrive in Task 3'); }` and replace it in Task 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs tests/helpers/commitment.mjs
git commit -m "Write escalation records with validated concerns and per-commitment targets"
```

---

### Task 3: The evaluator gate and the shared draft of `cairn decide --consequential`

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `appendDecision(cwd, line) -> id` and `readAdr(cwd) -> [lines]` from `lib/adr.mjs` (plan 06; `appendDecision` fills `id` and `ts` when the line lacks them); `item(cwd, {kind, slug, source, body})` and `outside(cwd, itemSha, reason, {evaluation})` from `lib/commitment.mjs` (plan 06); `writeWorkspaceSnapshot(cwd)`; plan 11's `evaluate(cwd, draft, {transport}) -> {route, evaluationSha}` by name only, with `route` in `developer | agent | capture`.
- Produces: `decisionLine(draft, evaluation, baseSnap) -> line`, `decideConsequential(cwd, draft) -> id`. The ADR decision line shape is section 4's: `{kind:'decision', level:'Consequential', by:'agent', title, rests_on, wrong_if, body, base_snap, evaluation}` with `title = question`, `rests_on = [because]`, `wrong_if = if_wrong`, `body = recommendation + ' Instead: ' + instead`.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { readAdr } from '../lib/adr.mjs';
import { decideConsequential, decisionLine } from '../lib/escalate.mjs';

const enabled = { typesafeai: { enabled: true, mode: 'shadow', model: 'jev-1.13.0' } };
const EV = 'e'.repeat(40);

test('an evaluation that downgrades writes an ADR decision line naming the evaluation and no escalation record', async () => {
  const { cwd } = await openCommitment({ settings: enabled });
  const r = await escalateWithRoute(cwd, draft(), { evaluate: async () => ({ route: 'agent', evaluationSha: EV }) });
  assert.equal(r.route, 'agent');
  const lines = await readAdr(cwd);
  const line = lines.find((l) => l.kind === 'decision');
  assert.equal(line.level, 'Consequential');
  assert.equal(line.by, 'agent');
  assert.equal(line.title, draft().question);
  assert.equal(line.evaluation, EV);
  assert.equal(r.sha, EV);
  assert.equal((await readLog(cwd)).filter((x) => x.kind === 'escalation').length, 0);
});

test('an evaluation that routes to the developer writes the escalation with its evaluation SHA', async () => {
  const { cwd } = await openCommitment({ settings: enabled });
  const sha = await escalate(cwd, draft(), { evaluate: async () => ({ route: 'developer', evaluationSha: EV }) });
  assert.equal(decodeRecord(await catCommit(cwd, sha)).payload.evaluation, EV);
});

test('cairn decide --consequential accepts the same canonical draft and writes the same line shape without an evaluation', async () => {
  const { cwd } = await openCommitment();
  await assert.rejects(decideConsequential(cwd, draft({ because: '' })), DraftError);
  const id = await decideConsequential(cwd, draft());
  const line = (await readAdr(cwd)).find((l) => l.id === id);
  assert.equal(line.kind, 'decision');
  assert.equal(line.evaluation, null);
  assert.equal(line.body, `${draft().recommendation} Instead: ${draft().instead}`);
  assert.match(line.base_snap, /^[0-9a-f]{40}$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `cairn: evaluator routes arrive in Task 3` and `decideConsequential is not a function`.

- [ ] **Step 3: Write minimal implementation**

Replace the stub with the following and add the imports at the top of the module.

```js
// lib/escalate.mjs (imports)
import { appendDecision } from './adr.mjs';
import { item, outside } from './commitment.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';

// lib/escalate.mjs (replace routeElsewhere; add decisionLine, decideConsequential)
export function decisionLine(d, evaluation, baseSnap) {
  return {
    kind: 'decision', level: 'Consequential', by: 'agent', title: d.question, rests_on: [d.because],
    wrong_if: d.if_wrong, body: `${d.recommendation} Instead: ${d.instead}`, base_snap: baseSnap, evaluation,
  };
}

async function routeElsewhere(cwd, d, route, evaluation) {
  if (route === 'agent') {
    await appendDecision(cwd, decisionLine(d, evaluation, await writeWorkspaceSnapshot(cwd)));
    return { route, sha: evaluation };
  }
  if (route === 'capture') {
    const source = d.concerns[0].ref;
    const itemSha = await item(cwd, { kind: 'backlog', slug: d.commitment, source, body: d.recommendation });
    const sha = await outside(cwd, itemSha, 'the evaluator recommended capture', { evaluation });
    return { route, sha };
  }
  throw new DraftError(`cairn: evaluation ${evaluation} named an unknown route ${route}`);
}

export async function decideConsequential(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  const r = openRange(log, d.commitment);
  for (const c of d.concerns) checkConcern(c, log, r);
  return appendDecision(cwd, decisionLine(d, null, await writeWorkspaceSnapshot(cwd)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Route an escalation by the evaluator only when settings enable it; share the draft with decide"
```

---

### Task 4: The developer's answer

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `authenticateDeveloper(cwd, settings, {purpose}) -> evidence` from `lib/auth.mjs` (plan 03; with `signing_key: null` and no controlling terminal it throws, with a key it returns `{mode:'signature', ...}`, in confirmed unsigned-local mode `{mode:'unsigned-local', author, ...}`); `appendDecision`, `readAdr`.
- Produces: `answer(cwd, target, kind, text, {authenticate, owner}) -> sha`, `escalationState(log, escalationSha) -> {status:'open'|'asked'|'answered', answers, final, lastAsk}`, `unanswered(log) -> [{sha, target, payload, awaiting:'answer'|'reply'}]`, `describeEvidence(evidence) -> string`. Answer payload keys: `{escalation, kind, text, owner, evidence}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { answer, escalationState, unanswered, describeEvidence } from '../lib/escalate.mjs';

const dev = { mode: 'unsigned-local', author: 'Dev <dev@example.com>', confirmed: true };
const asDev = { authenticate: async () => dev };

test('answer refuses without developer evidence: the default authenticator has no terminal, a null evidence is refused', async () => {
  const { cwd } = await openCommitment();
  const sha = await escalate(cwd, draft());
  await assert.rejects(answer(cwd, 'auth-e1', 'ok', ''), /cairn: /);
  await assert.rejects(answer(cwd, 'auth-e1', 'ok', '', { authenticate: async () => null }), /no developer evidence/);
  assert.equal(escalationState(await readLog(cwd), sha).status, 'open');
});

test('ok writes the answer record with the evidence and the answered ADR line', async () => {
  const { cwd } = await openCommitment();
  const esc = await escalate(cwd, draft());
  const sha = await answer(cwd, 'auth-e1', 'ok', '', asDev);
  const rec = decodeRecord(await catCommit(cwd, sha));
  assert.deepEqual(rec.payload, { escalation: esc, kind: 'ok', text: '', owner: null, evidence: dev });
  const line = (await readAdr(cwd)).find((l) => l.kind === 'answered');
  assert.deepEqual([line.escalation, line.answer], [esc, sha]);
  assert.equal(escalationState(await readLog(cwd), esc).status, 'answered');
  assert.deepEqual(unanswered(await readLog(cwd)), []);
  await assert.rejects(answer(cwd, 'auth-e1', 'instead', 'no', asDev), /already answered/);
});

test('ask stays open until a reply and writes no answered line; instead needs text', async () => {
  const { cwd } = await openCommitment();
  const esc = await escalate(cwd, draft());
  await assert.rejects(answer(cwd, 'auth-e1', 'instead', '', asDev), /needs text/);
  await assert.rejects(answer(cwd, 'auth-e1', 'maybe', 'x', asDev), /must be ok, instead or ask/);
  await answer(cwd, 'auth-e1', 'ask', 'Why 30 and not 14?', asDev);
  const log = await readLog(cwd);
  assert.equal(escalationState(log, esc).status, 'asked');
  assert.deepEqual(unanswered(log).map((u) => [u.target, u.awaiting]), [['auth-e1', 'reply']]);
  assert.equal((await readAdr(cwd)).some((l) => l.kind === 'answered'), false);
  await assert.rejects(answer(cwd, 'auth-e1', 'ok', '', asDev), /awaits the agent's reply/);
});

test('describeEvidence says unsigned-local is evidence, not authentication', () => {
  assert.equal(describeEvidence(dev), 'unsigned-local, author Dev <dev@example.com>: evidence, not authentication');
  assert.equal(describeEvidence({ mode: 'signature', key: 'k1' }), 'signed with key k1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `answer is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (imports)
import { authenticateDeveloper } from './auth.mjs';
import { readAdr } from './adr.mjs';

// lib/escalate.mjs (append)
const ANSWER_KINDS = ['ok', 'instead', 'ask'];

export function escalationState(log, escalationSha) {
  const after = log.filter((r) => (r.kind === 'answer' || r.kind === 'reply') && r.payload.escalation === escalationSha);
  const answers = after.filter((r) => r.kind === 'answer');
  const final = answers.find((a) => a.payload.kind !== 'ask') ?? null;
  if (final) return { status: 'answered', answers, final, lastAsk: null };
  const last = after.at(-1) ?? null;
  const lastAsk = last && last.kind === 'answer' ? last : null;
  return { status: lastAsk ? 'asked' : 'open', answers, final: null, lastAsk };
}

export function unanswered(log) {
  return log.filter((r) => r.kind === 'escalation').flatMap((e) => {
    const st = escalationState(log, e.sha);
    if (st.status === 'answered') return [];
    return [{ sha: e.sha, target: e.target, payload: e.payload, awaiting: st.status === 'asked' ? 'reply' : 'answer' }];
  });
}

export function describeEvidence(ev) {
  if (ev && ev.mode === 'signature') return `signed with key ${ev.key}`;
  return `unsigned-local, author ${ev && ev.author}: evidence, not authentication`;
}

export async function answer(cwd, target, kind, text = '', opts = {}) {
  if (!ANSWER_KINDS.includes(kind)) throw new DraftError('cairn: answer kind must be ok, instead or ask');
  if (typeof text !== 'string') throw new DraftError('cairn: answer text must be a string');
  if (kind !== 'ok' && text.trim() === '') throw new DraftError(`cairn: answer ${kind} needs text`);
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const esc = findEscalation(log, target);
  const st = escalationState(log, esc.sha);
  if (st.status === 'answered') {
    const lines = await readAdr(cwd);
    if (!lines.some((l) => l.kind === 'answered' && l.answer === st.final.sha)) {
      await appendDecision(cwd, { kind: 'answered', escalation: esc.sha, answer: st.final.sha });
      return st.final.sha; // the record existed; only its ADR line was missing
    }
    throw new DraftError(`cairn: ${target} is already answered by ${st.final.sha}`);
  }
  if (st.status === 'asked') throw new DraftError(`cairn: ${target} awaits the agent's reply to your question`);
  const authenticate = opts.authenticate ?? authenticateDeveloper;
  const evidence = await authenticate(cwd, settings, { purpose: `answer ${target} ${kind}` });
  if (!evidence || typeof evidence !== 'object') throw new DraftError('cairn: answer refused: no developer evidence');
  const sha = await appendRecord(cwd, 'answer', target, { escalation: esc.sha, kind, text, owner: opts.owner ?? null, evidence });
  if (kind !== 'ask') await appendDecision(cwd, { kind: 'answered', escalation: esc.sha, answer: sha });
  return sha;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Record the developer's answer with its evidence and the answered ADR line"
```

---

### Task 5: The agent's reply

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Produces: `reply(cwd, target, text) -> sha`. Reply payload keys: `{escalation, text}`. Section 5: `reply SLUG` is complete when "a reply record names the open `ask` escalation".

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { reply } from '../lib/escalate.mjs';

test('reply names the open ask; after it the escalation awaits the developer again', async () => {
  const { cwd } = await openCommitment();
  const esc = await escalate(cwd, draft());
  await assert.rejects(reply(cwd, 'auth-e1', 'Because the fixture says so.'), /no open ask/);
  await answer(cwd, 'auth-e1', 'ask', 'Why 30?', asDev);
  await assert.rejects(reply(cwd, 'auth-e1', ''), /reply needs text/);
  const sha = await reply(cwd, 'auth-e1', 'Because the fixture says so.');
  assert.deepEqual(decodeRecord(await catCommit(cwd, sha)).payload, { escalation: esc, text: 'Because the fixture says so.' });
  const log = await readLog(cwd);
  assert.equal(escalationState(log, esc).status, 'open');
  assert.deepEqual(unanswered(log).map((u) => u.awaiting), ['answer']);
  await assert.rejects(reply(cwd, 'auth-e1', 'Again.'), /no open ask/);
  await answer(cwd, 'auth-e1', 'instead', 'Fourteen days.', asDev);
  assert.equal(escalationState(await readLog(cwd), esc).final.payload.text, 'Fourteen days.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `reply is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
export async function reply(cwd, target, text) {
  if (typeof text !== 'string' || text.trim() === '') throw new DraftError('cairn: reply needs text');
  const log = await readLog(cwd);
  const esc = findEscalation(log, target);
  if (escalationState(log, esc.sha).status !== 'asked') throw new DraftError(`cairn: ${target} has no open ask to reply to`);
  return appendRecord(cwd, 'reply', target, { escalation: esc.sha, text });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Let the agent reply to an open ask so the decision returns to the developer"
```

---

### Task 6: The dispute

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Produces: `dispute(cwd, {commitment, record, n, question, recommendation, because, if_wrong, instead}) -> sha` and `disputes(log, record, n) -> escalationSha|null`. A finding is developer-disputed when an escalation whose concern is `{kind:'finding', ref: record, n}` has a final answer of kind `ok`. Plan 10's ledger calls `disputes` by name; an `instead` answer leaves the finding open and carries the developer's direction.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { reviewWithFindings } from './helpers/commitment.mjs';
import { dispute, disputes } from '../lib/escalate.mjs';

const disputeFields = (record, n) => ({
  commitment: 'auth', record, n,
  question: `Is finding ${n} a defect?`, recommendation: 'No: the check reads the declared fixture.',
  because: 'tests/fixtures/a.json is in the mechanism inputs.', if_wrong: 'A hidden input goes undeclared.', instead: 'Declare it and re-run.',
});

test('a dispute names finding N on its exact source record and is resolved only by ok', async () => {
  const { cwd } = await openCommitment();
  const rev = await reviewWithFindings(cwd, 'auth', ['reads an undeclared fixture', 'no test for empty input']);
  await assert.rejects(dispute(cwd, disputeFields(rev, 3)), /has no finding 3/);
  const sha = await dispute(cwd, disputeFields(rev, 1));
  const rec = decodeRecord(await catCommit(cwd, sha));
  assert.deepEqual(rec.payload.concerns, [{ kind: 'finding', ref: rev, n: 1 }]);
  assert.equal(disputes(await readLog(cwd), rev, 1), null);
  await answer(cwd, 'auth-e1', 'ok', '', asDev);
  const log = await readLog(cwd);
  assert.equal(disputes(log, rev, 1), sha);
  assert.equal(disputes(log, rev, 2), null);
});

test('an instead answer does not dispute the finding', async () => {
  const { cwd } = await openCommitment();
  const rev = await reviewWithFindings(cwd, 'auth', ['x']);
  await dispute(cwd, disputeFields(rev, 1));
  await answer(cwd, 'auth-e1', 'instead', 'Fix it.', asDev);
  assert.equal(disputes(await readLog(cwd), rev, 1), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `dispute is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
export async function dispute(cwd, { commitment, record, n, ...fields }) {
  return escalate(cwd, {
    commitment, concerns: [{ kind: 'finding', ref: record, n }],
    question: fields.question, recommendation: fields.recommendation, because: fields.because,
    if_wrong: fields.if_wrong, instead: fields.instead, options: [], named_paths: [], cited_decisions: [],
  });
}

export function disputes(log, record, n) {
  for (const e of log) {
    if (e.kind !== 'escalation') continue;
    if (!e.payload.concerns.some((c) => c.kind === 'finding' && c.ref === record && c.n === n)) continue;
    const st = escalationState(log, e.sha);
    if (st.status === 'answered' && st.final.payload.kind === 'ok') return e.sha;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Dispute a finding by escalation; only the developer's ok settles it"
```

---

### Task 7: `escalate REQ` and the concern readers

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Produces: `concerns(log, kind, ref, n = null) -> [escalation records]` and `escalatedRequirement(log, REQ) -> boolean` (true when an escalation concerning the requirement exists, answered or not). Section 5: `escalate REQ` is complete when "after three distinct attempts without a pass, an escalation concerns the requirement before a fourth"; plan 08's predicate tests `escalatedRequirement` once plan 14 wires it, and `attempts(log, REQ)` from plan 05 supplies the count.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { concerns, escalatedRequirement } from '../lib/escalate.mjs';

test('an escalation concerning a requirement is found by identifier, answered or not', async () => {
  const { cwd } = await openCommitment({ requirements: ['LOOP-001', 'LOOP-002'] });
  assert.equal(escalatedRequirement(await readLog(cwd), 'LOOP-001'), false);
  const sha = await escalate(cwd, draft({ question: 'Three attempts failed; change the falsifier?' }));
  let log = await readLog(cwd);
  assert.equal(escalatedRequirement(log, 'LOOP-001'), true);
  assert.equal(escalatedRequirement(log, 'LOOP-002'), false);
  assert.deepEqual(concerns(log, 'requirement', 'LOOP-001').map((e) => e.sha), [sha]);
  await answer(cwd, 'auth-e1', 'ok', '', asDev);
  log = await readLog(cwd);
  assert.equal(escalatedRequirement(log, 'LOOP-001'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `concerns is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
export function concerns(log, kind, ref, n = null) {
  return log.filter((e) => e.kind === 'escalation' && e.payload.concerns.some((c) => c.kind === kind && c.ref === ref && c.n === n));
}
export function escalatedRequirement(log, req) { return concerns(log, 'requirement', req).length > 0; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Find escalations by concern so wake can see a requirement was escalated"
```

---

### Task 8: Waiting prints the five fields verbatim

**Files:**
- Modify: `lib/escalate.mjs`
- Modify: `lib/wake.mjs` (the branch that builds the `Waiting` verdict, plan 08)
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `wake(cwd) -> {verdict, action, target, reason, predicate}` from `lib/wake.mjs` (plan 08); `bin/cairn.mjs wake` prints `reason` unchanged for the `Waiting` verdict.
- Produces: `renderWaiting({target, payload}) -> string`, exactly these bytes, LF-terminated:

```
Waiting: <target>
question: <question>
recommendation: <recommendation>
because: <because>
if wrong: <if_wrong>
instead: <instead>
Reply: cairn answer <target> ok | instead <text> | ask <text>
```

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { renderWaiting } from '../lib/escalate.mjs';
import { wake } from '../lib/wake.mjs';
const run = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/cairn.mjs', import.meta.url));

test('renderWaiting produces the exact bytes and wake carries them unchanged', async () => {
  const { cwd } = await openCommitment();
  await escalate(cwd, draft({ because: 'a  double  space and a trailing space ' }));
  const esc = findEscalation(await readLog(cwd), 'auth-e1');
  const expected = Buffer.from(
    'Waiting: auth-e1\n' +
    `question: ${draft().question}\n` +
    `recommendation: ${draft().recommendation}\n` +
    'because: a  double  space and a trailing space \n' +
    `if wrong: ${draft().if_wrong}\n` +
    `instead: ${draft().instead}\n` +
    'Reply: cairn answer auth-e1 ok | instead <text> | ask <text>\n', 'utf8');
  assert.equal(Buffer.compare(Buffer.from(renderWaiting(esc), 'utf8'), expected), 0);
  const v = await wake(cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.reason, renderWaiting(esc));
  const { stdout } = await run(process.execPath, [BIN, 'wake'], { cwd, encoding: 'buffer' });
  assert.ok(stdout.indexOf(expected) >= 0, 'stdout carries the exact Waiting bytes');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `renderWaiting is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
export function renderWaiting({ target, payload }) {
  return [
    `Waiting: ${target}`, `question: ${payload.question}`, `recommendation: ${payload.recommendation}`,
    `because: ${payload.because}`, `if wrong: ${payload.if_wrong}`, `instead: ${payload.instead}`,
    `Reply: cairn answer ${target} ok | instead <text> | ask <text>`,
  ].join('\n') + '\n';
}
```

In `lib/wake.mjs`, where plan 08's precedence list reaches "unanswered escalation (`Waiting`, or `reply` after `ask`)", replace the locally built reason with the shared reader and renderer:

```js
// lib/wake.mjs (the Waiting predicate)
import { unanswered, renderWaiting } from './escalate.mjs';
// inside the predicate test:
const open = unanswered(state.log);
if (open.length === 0) return null;
const first = open[0];
if (first.awaiting === 'reply') return { verdict: 'Resolvable', action: 'reply', target: first.target, reason: `the developer asked: ${state.log.find((r) => r.kind === 'answer' && r.payload.escalation === first.sha && r.payload.kind === 'ask').payload.text}`, predicate: 'a reply record names the open ask escalation' };
return { verdict: 'Waiting', action: null, target: first.target, reason: renderWaiting(first), predicate: 'an answer record of kind ok or instead names the escalation' };
```

`lib/cli.mjs` prints `reason` for `Waiting` with no prefix and no wrapping, so the bytes are exactly `renderWaiting`'s.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs tests/wake.test.mjs`
Expected: PASS for both files.

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs lib/wake.mjs tests/escalate.test.mjs
git commit -m "Print an unanswered escalation's five fields verbatim in the Waiting verdict"
```

---

### Task 9: Command-line entry points

**Files:**
- Modify: `lib/escalate.mjs`
- Modify: `lib/cli.mjs` (command table, plan 01)
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `lib/cli.mjs` command table entries of the form `name: async (cwd, argv) => {code, out}`; the CLI prints `out` to stdout on code 0 and to stderr on code 1.
- Produces: `parseEscalateArgs(argv) -> draft`, `cliEscalate`, `cliAnswer`, `cliReply`, `cliDispute`, each `(cwd, argv) -> {code, out}`. Commands: `cairn escalate --commitment S --concern KIND:REF[:N] --question Q --recommendation R --because B --if-wrong W --instead I [--option TEXT ...] [--path P ...] [--decision ID ...]`; `cairn answer TARGET ok|instead|ask [TEXT]`; `cairn reply TARGET TEXT`; `cairn dispute --commitment S --record SHA --n N --question ... --instead ...`.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { parseEscalateArgs, cliEscalate, cliAnswer, cliReply } from '../lib/escalate.mjs';

const argv = ['--commitment', 'auth', '--concern', 'requirement:LOOP-001', '--question', draft().question,
  '--recommendation', draft().recommendation, '--because', draft().because, '--if-wrong', draft().if_wrong,
  '--instead', draft().instead, '--path', 'src/session.mjs'];

test('the escalate command parses the five fields and concern into the canonical draft', () => {
  assert.deepEqual(parseEscalateArgs(argv), draft());
  assert.throws(() => parseEscalateArgs(argv.slice(0, -4)), /missing --instead/);
  assert.deepEqual(parseEscalateArgs([...argv.slice(0, 2), '--concern', 'finding:' + 'a'.repeat(40) + ':2', ...argv.slice(4)]).concerns,
    [{ kind: 'finding', ref: 'a'.repeat(40), n: 2 }]);
});

test('escalate, answer and reply commands print one line and use exit codes 0 and 1', async () => {
  const { cwd } = await openCommitment();
  const e = await cliEscalate(cwd, argv);
  assert.equal(e.code, 0);
  assert.match(e.out, /^cairn: escalation auth-e1 [0-9a-f]{40}\n$/);
  const bad = await cliAnswer(cwd, ['auth-e1', 'ok'], { authenticate: async () => null });
  assert.equal(bad.code, 1);
  assert.match(bad.out, /^cairn: answer refused: no developer evidence\n$/);
  const ask = await cliAnswer(cwd, ['auth-e1', 'ask', 'Why?'], asDev);
  assert.equal(ask.code, 0);
  const r = await cliReply(cwd, ['auth-e1', 'Because.']);
  assert.match(r.out, /^cairn: reply auth-e1 [0-9a-f]{40}\n$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `parseEscalateArgs is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
const FLAG_TO_FIELD = { '--commitment': 'commitment', '--question': 'question', '--recommendation': 'recommendation', '--because': 'because', '--if-wrong': 'if_wrong', '--instead': 'instead' };
const LIST_FLAGS = { '--option': 'options', '--path': 'named_paths', '--decision': 'cited_decisions', '--concern': 'concerns' };

function parseConcern(s) {
  const [kind, ref, n] = s.split(':');
  return validateConcern({ kind, ref, n: n === undefined ? null : Number(n) });
}

export function parseEscalateArgs(argv) {
  const d = { concerns: [], options: [], named_paths: [], cited_decisions: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], val = argv[i + 1];
    if (val === undefined) throw new DraftError(`cairn: ${flag} needs a value`);
    if (FLAG_TO_FIELD[flag]) d[FLAG_TO_FIELD[flag]] = val;
    else if (LIST_FLAGS[flag]) d[LIST_FLAGS[flag]].push(flag === '--concern' ? parseConcern(val) : val);
    else throw new DraftError(`cairn: unknown flag ${flag}`);
  }
  for (const [flag, f] of Object.entries(FLAG_TO_FIELD)) if (!(f in d)) throw new DraftError(`cairn: missing ${flag}`);
  return validateDraft(d);
}

const asCli = (fn) => async (cwd, argv, opts) => {
  try { return { code: 0, out: await fn(cwd, argv, opts) }; }
  catch (e) { return { code: 1, out: (e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`) + '\n' }; }
};

const lastTarget = (log) => log.filter((r) => r.kind === 'escalation').at(-1).target;
export const cliEscalate = asCli(async (cwd, argv) => {
  const r = await escalateWithRoute(cwd, parseEscalateArgs(argv));
  if (r.route !== 'developer') return `cairn: ${r.route} ${r.sha}\n`;
  return `cairn: escalation ${lastTarget(await readLog(cwd))} ${r.sha}\n`;
});
export const cliAnswer = asCli(async (cwd, [target, kind, ...text], opts) => `cairn: answer ${target} ${await answer(cwd, target, kind, text.join(' '), opts)}\n`);
export const cliReply = asCli(async (cwd, [target, ...text]) => `cairn: reply ${target} ${await reply(cwd, target, text.join(' '))}\n`);
export const cliDispute = asCli(async (cwd, argv) => {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].slice(2).replace('-', '_')] = argv[i + 1];
  o.n = Number(o.n);
  return `cairn: escalation ${o.commitment} ${await dispute(cwd, o)}\n`;
});
```

In `lib/cli.mjs` add to the command table: `escalate: cliEscalate, answer: cliAnswer, reply: cliReply, dispute: cliDispute` imported from `./escalate.mjs`, and add the four lines to `--help` in the table's format.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs tests/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs lib/cli.mjs tests/escalate.test.mjs
git commit -m "Add the escalate, answer, reply and dispute commands"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| "An escalation has five one-line fields: question, recommendation, because, if wrong, and instead." (2) | 1 |
| "Wake prints them verbatim." (2, 5 Waiting) | 8 |
| "The developer writes ok, instead <text> or ask <text> with cairn answer; ask stays open until an agent reply." (2) | 4, 5 |
| "Developer-only commands use the authentication rule in Settings." (2); "the agent never does" (8); decision 11 | 4 (refusal without evidence; `describeEvidence` says unsigned-local is evidence, not authentication) |
| "A finding is answered by ... a dispute, which is an escalation naming the finding and resolved by the developer." (2); `resolve SLUG N` "or an escalation disputes it" (5) | 6 |
| "A Consequential decision is appended to the ADR and queued while the agent continues. A Blocking decision is an escalation; its answered line names the answer record." (2 ADR) | 3, 4 |
| escalation kind: "slug, five fields, concern reference, optional evaluation SHA" (4); subject, trailers and decoder round-trip | 2, 3 |
| answer kind: "escalation SHA, ok/instead/ask, text, optional owner label, developer-auth evidence" (4) | 4 |
| reply kind: "escalation SHA, text" (4); `reply SLUG` predicate (5) | 5 |
| `answered` ADR line `{escalation, answer}` (4) | 4 |
| "cairn escalate and cairn decide --consequential accept the same canonical draft." (8) | 1, 3 |
| "With evaluation disabled or outside its envelope, the requested command uses the kernel level." (8); decision 23 | 2, 3 |
| `escalate REQ`: "an escalation concerns the requirement before a fourth" (5) | 7 |
| "Waiting alone is the developer's turn" (decision 10) | 8 (Waiting carries no action) |
| Commands `cairn escalate`, `answer` and `reply` "write the decision chain" (4) | 9 |

Left to other plans:

- The attempt count that triggers `escalate REQ` ("after three distinct attempts", 5 and 8): plan 05's `attempts` and plan 08's predicate; this plan supplies `escalatedRequirement`.
- The Waiting precedence position and the `reply` action's place in the order (5): plan 08; Task 8 only replaces the text of that branch.
- The evaluator's envelope, `evaluation-intent`, `evaluation-call` and `evaluation` records, shadow and route modes (2, 10): plan 11; this plan calls `evaluate` by name.
- The `capture` route's `outside` record (4, 10): plan 06 writes `outside`; Task 3 passes the evaluation SHA in its `evaluation` field.
- Signature verification of a stored answer on read ("With a key, developer-only records must verify", 2): plan 03's `verifyEvidence`, applied by plan 08 when it reads answers.
- The cycle escalation the counter produces (5): plan 08's `cycle.mjs` builds the draft with concern kind `cycle` and calls `escalate`.
- Carrying unanswered escalations across a supersession (2 Superseded): plan 06.
