# Escalation and answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build `lib/escalate.mjs`: the canonical draft, the escalation record, the developer's answer, the agent's reply, the finding dispute, and the proof that Waiting prints the five fields byte for byte.

**Architecture:** one module writes the three decision-chain kinds (`escalation`, `answer`, `reply`) on `refs/cairn/log` through plan 01's `appendRecord`, and appends the `answered` ADR line through plan 06's `appendDecision`. Every draft passes one validator; `cairn decide --consequential` maps the same draft onto plan 06's `decide`. Plan 11's `evaluate` is reached by name through a dynamic import only when settings enable it; disabled, the kernel level applies and the escalation is written and held. Readers (`unanswered`, `escalationState`, `disputes`, `concerns`) are pure functions over the decoded log, so plan 10 consumes state without re-parsing. Wake (plan 08) already renders Waiting; this plan tests its bytes and changes nothing in it.

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
- Plan 01's schemas are authoritative: `escalation = {slug, question, recommendation, because, if_wrong, instead, concerns: str, evaluation: ref|null}`, `answer = {escalation, kind, text, owner, evidence: {mode, author, signature}}`, `reply = {escalation, text}`. The record target of all three is the commitment slug, as plan 08's wake expects (`cairn answer <slug>`).
- Concern tokens, one string each, joined by one space in the record: a requirement identifier (`DEMO-001`), `finding:<sha>#<n>`, `item:<sha>`, `breach:<sha>`, `transaction:<sha>`, `cycle`, or `contract:<path or identifier>`. Plan 08 matches `concerns === 'DEMO-001'`, `concerns === 'finding:<sha>#<n>'` and `concerns === 'cycle'` exactly, so a requirement, dispute or cycle escalation carries exactly one token.

---

### Task 1: The canonical draft

**Files:**
- Create: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `canonicalize(value)`, `sha256(bytes|string)` from `lib/canon.mjs` (plan 01).
- Produces: `validateDraft(draft) -> draft` (throws `DraftError`), `draftDigest(draft) -> 'sha256:<hex>'`, `parseConcern(token) -> {kind, ref, n}`, `FIELDS`, `DRAFT_KEYS`, `DraftError`. The draft is section 10's `D`, the ten keys plan 11's `normalizeDraft` keeps: `{commitment, concerns, question, recommendation, because, if_wrong, instead, options, named_paths, cited_decisions}`, plus an optional `evaluation` (a log SHA) that plan 11 adds after an evaluation. `concerns` is a non-empty list of concern tokens.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, draftDigest, parseConcern, DraftError } from '../lib/escalate.mjs';

export const draft = (over = {}) => ({
  commitment: 'first', concerns: ['DEMO-001'],
  question: 'Should the greeter keep sessions for 30 days?',
  recommendation: 'Yes, 30 days, refreshed on use.',
  because: 'The spec names no length and tests/session.test.mjs assumes 30.',
  if_wrong: 'Users stay logged in on shared machines longer than intended.',
  instead: 'Seven days with no refresh.',
  options: [], named_paths: ['src/demo.mjs'], cited_decisions: [], ...over,
});

test('a complete draft validates, keeps an optional evaluation, and digests deterministically', () => {
  const d = draft();
  assert.equal(validateDraft(d), d);
  assert.equal(validateDraft(draft({ evaluation: 'e'.repeat(40) })).evaluation, 'e'.repeat(40));
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

test('unknown keys, missing keys, an empty concern list and malformed tokens are refused', () => {
  assert.throws(() => validateDraft({ ...draft(), score: 1 }), /unknown field score/);
  const d = draft(); delete d.options;
  assert.throws(() => validateDraft(d), /missing options/);
  assert.throws(() => validateDraft(draft({ concerns: [] })), /at least one concern/);
  assert.throws(() => validateDraft(draft({ concerns: ['finding:abc#1'] })), /concern token/);
  assert.throws(() => validateDraft(draft({ concerns: ['finding:' + 'a'.repeat(40) + '#0'] })), /concern token/);
  assert.throws(() => validateDraft(draft({ concerns: ['DEMO-001 extra'] })), /concern token/);
  assert.throws(() => validateDraft(draft({ evaluation: 'nope' })), /evaluation must be a log SHA/);
  assert.deepEqual(parseConcern('finding:' + 'a'.repeat(40) + '#3'), { kind: 'finding', ref: 'a'.repeat(40), n: 3 });
  assert.deepEqual(parseConcern('DEMO-001'), { kind: 'requirement', ref: 'DEMO-001', n: null });
  assert.deepEqual(parseConcern('cycle'), { kind: 'cycle', ref: null, n: null });
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
export const DRAFT_KEYS = ['commitment', 'concerns', ...FIELDS, 'options', 'named_paths', 'cited_decisions'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA = /^[0-9a-f]{40}$/;
const REQ = /^[A-Z][A-Z0-9]*-[0-9]{3,}$/;
const BAD_CHARS = /[\x00-\x1f\x7f]/;

function oneLine(name, v) {
  if (typeof v !== 'string' || v.trim() === '' || BAD_CHARS.test(v)) throw new DraftError(`cairn: draft field ${name} must be one non-empty line`);
  return v;
}

export function parseConcern(token) {
  if (typeof token !== 'string' || token === '' || /\s/.test(token)) throw new DraftError(`cairn: concern token ${JSON.stringify(token)} is malformed`);
  if (token === 'cycle') return { kind: 'cycle', ref: null, n: null };
  if (REQ.test(token)) return { kind: 'requirement', ref: token, n: null };
  const m = /^(finding|item|breach|transaction|contract):(.+?)(?:#([1-9][0-9]*))?$/.exec(token);
  if (!m) throw new DraftError(`cairn: concern token ${token} is malformed`);
  const [, kind, ref, n] = m;
  if (kind !== 'contract' && !SHA.test(ref)) throw new DraftError(`cairn: concern token ${token} needs a log SHA`);
  if ((kind === 'finding') !== (n !== undefined)) throw new DraftError(`cairn: concern token ${token}: only finding takes #n`);
  return { kind, ref, n: n === undefined ? null : Number(n) };
}

export function validateDraft(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new DraftError('cairn: draft must be an object');
  for (const k of Object.keys(d)) if (!DRAFT_KEYS.includes(k) && k !== 'evaluation') throw new DraftError(`cairn: draft has unknown field ${k}`);
  for (const k of DRAFT_KEYS) if (!(k in d)) throw new DraftError(`cairn: draft is missing ${k}`);
  if (typeof d.commitment !== 'string' || !SLUG.test(d.commitment)) throw new DraftError('cairn: draft commitment must be a slug');
  for (const f of FIELDS) oneLine(f, d[f]);
  if (!Array.isArray(d.concerns) || d.concerns.length === 0) throw new DraftError('cairn: draft needs at least one concern');
  d.concerns.forEach(parseConcern);
  for (const k of ['options', 'named_paths', 'cited_decisions']) {
    if (!Array.isArray(d[k]) || !d[k].every((s) => typeof s === 'string')) throw new DraftError(`cairn: draft ${k} must be a list of strings`);
  }
  if ('evaluation' in d && d.evaluation !== null && !SHA.test(d.evaluation)) throw new DraftError('cairn: draft evaluation must be a log SHA');
  return d;
}

export function draftDigest(d) {
  const { evaluation, ...ten } = validateDraft(d);
  return sha256(canonicalize(ten));
}
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
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `loopRepo({settings, reqs})` from `tests/helpers/loop.mjs` (plan 08: an initialized project with an open commitment `first`, requirements including `DEMO-001`, `cwd`, `write`, `commit`, `log()`, `add(kind, target, payload)`); `appendRecord`, `readLog`, `range`, `decodeRecord`, `KINDS` from `lib/records.mjs`; `catCommit` from `lib/gitx.mjs`; `loadSettings` (plan 02).
- Produces: `escalate(cwd, draft, opts) -> sha` (the escalation record; `draft.evaluation` is carried into the payload), `escalationsFor(log, slug) -> [record]`, `checkConcerns(draft, log, range)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { loopRepo } from './helpers/loop.mjs';
import { readLog, decodeRecord, KINDS } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { escalate, escalationsFor } from '../lib/escalate.mjs';

test('escalate writes an escalation record targeted at the commitment with the five fields, joined concerns and evaluation', async () => {
  for (const k of ['escalation', 'answer', 'reply']) assert.ok(KINDS.has(k), `${k} is a log kind`);
  const r = await loopRepo();
  const sha = await escalate(r.cwd, draft());
  const commit = await catCommit(r.cwd, sha);
  assert.equal(commit.subject, 'cairn: escalation first');
  assert.deepEqual(commit.trailers.map(([k]) => k), ['Cairn-Schema', 'Cairn-Digest']);
  const rec = decodeRecord(commit);
  assert.deepEqual(rec.payload, {
    slug: 'first', question: draft().question, recommendation: draft().recommendation, because: draft().because,
    if_wrong: draft().if_wrong, instead: draft().instead, concerns: 'DEMO-001', evaluation: null,
  });
  const two = await escalate(r.cwd, draft({ concerns: ['DEMO-001', 'contract:AGENTS.md'], evaluation: 'e'.repeat(40) }));
  const p = decodeRecord(await catCommit(r.cwd, two)).payload;
  assert.deepEqual([p.concerns, p.evaluation], ['DEMO-001 contract:AGENTS.md', 'e'.repeat(40)]);
  assert.deepEqual(escalationsFor(await r.log(), 'first').map((e) => e.sha), [sha, two]);
});

test('escalate refuses a closed or foreign commitment and a concern that names nothing in the range', async () => {
  const r = await loopRepo();
  await assert.rejects(escalate(r.cwd, draft({ commitment: 'other' })), /no open commitment other/);
  await assert.rejects(escalate(r.cwd, draft({ concerns: ['ZZZ-999'] })), /ZZZ-999 is not in the frozen set/);
  await assert.rejects(escalate(r.cwd, draft({ concerns: ['finding:' + 'f'.repeat(40) + '#1'] })), /no record f{40} in the open range/);
  const rev = await r.review([{ n: 1, text: 'no empty-input test' }]);
  await assert.rejects(escalate(r.cwd, draft({ concerns: [`finding:${rev}#2`] })), /has no finding 2/);
  await assert.rejects(escalate(r.cwd, draft({ concerns: ['item:' + rev] })), /no item record/);
  assert.match(await escalate(r.cwd, draft({ concerns: [`finding:${rev}#1`] })), /^[0-9a-f]{40}$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `escalate is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
import { appendRecord, readLog, range } from './records.mjs';

const FINDING_KINDS = new Set(['review', 'report', 'acceptance']);
const RECORD_KIND = { item: 'item', breach: 'scope-breach', transaction: 'command-intent' };

export function escalationsFor(log, slug) { return log.filter((r) => r.kind === 'escalation' && r.payload.slug === slug); }

export function openRange(log, slug) {
  const r = range(log);
  if (!r.start || r.closed || r.start.payload.slug !== slug) throw new DraftError(`cairn: no open commitment ${slug}`);
  return r;
}

export function checkConcerns(d, log, r) {
  for (const token of d.concerns) {
    const c = parseConcern(token);
    if (c.kind === 'requirement' && !r.start.payload.requirements.some((q) => q.requirement === c.ref)) throw new DraftError(`cairn: ${c.ref} is not in the frozen set`);
    if (c.kind === 'finding') {
      const src = r.records.find((x) => x.sha === c.ref);
      if (!src) throw new DraftError(`cairn: no record ${c.ref} in the open range`);
      if (!FINDING_KINDS.has(src.kind) || !src.payload.findings.some((f) => f.n === c.n)) throw new DraftError(`cairn: ${c.ref} has no finding ${c.n}`);
    }
    if (RECORD_KIND[c.kind] && !log.some((x) => x.sha === c.ref && x.kind === RECORD_KIND[c.kind])) throw new DraftError(`cairn: no ${RECORD_KIND[c.kind]} record ${c.ref}`);
  }
}

export async function escalate(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  const payload = { slug: d.commitment, concerns: d.concerns.join(' '), evaluation: d.evaluation ?? null };
  for (const f of FIELDS) payload[f] = d[f];
  return appendRecord(cwd, 'escalation', d.commitment, payload);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Write escalation records with validated concern tokens"
```

---

### Task 3: The evaluator gate and the shared draft of `cairn decide --consequential`

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `decide(cwd, {title, rests_on, wrong_if, body, by, evaluation, named_paths}, command) -> id` and `readAdr(cwd)` from `lib/adr.mjs` (plan 06; `command` is the ADR-assigned writer, `decide` or `escalate`); `item(cwd, {kind, slug, source, body})` and `outside(cwd, itemSha, reason, {evaluation})` from `lib/commitment.mjs` (plan 06; the evaluation SHA fills the outside record's optional field); plan 11's `evaluate(cwd, draft, {transport}) -> {route, evaluationSha}` by name, `route` in `developer | agent | capture`.
- Produces: `decisionFields(draft) -> {title, rests_on, wrong_if, body, named_paths}` (`title = question`, `rests_on = [because]`, `wrong_if = if_wrong`, `body = recommendation + ' Instead: ' + instead`), `decideConsequential(cwd, draft) -> id`, `escalateWithRoute(cwd, draft, {evaluate, transport}) -> {route, sha}`: with the evaluator disabled the route is `developer` and `sha` is the escalation; `agent` writes the ADR decision through `decide(..., 'escalate')` and returns the evaluation SHA; `capture` writes a backlog item and its outside record and returns the outside SHA. Plan 11 Task 10 wires the CLI's `escalate` and `decide --consequential` to these.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { readAdr } from '../lib/adr.mjs';
import { escalateWithRoute, decideConsequential } from '../lib/escalate.mjs';

const enabled = { typesafeai: { enabled: true, mode: 'shadow', model: 'jev-1.13.0' } };
const EV = 'e'.repeat(40);

test('with the evaluator disabled the route is developer and the evaluator is never loaded', async () => {
  const r = await loopRepo();
  const out = await escalateWithRoute(r.cwd, draft(), { evaluate: async () => { throw new Error('must not be called'); } });
  assert.equal(out.route, 'developer');
  assert.equal(decodeRecord(await catCommit(r.cwd, out.sha)).kind, 'escalation');
});

test('an evaluation that downgrades writes an ADR decision line naming the evaluation and no escalation record', async () => {
  const r = await loopRepo({ settings: enabled });
  const out = await escalateWithRoute(r.cwd, draft(), { evaluate: async () => ({ route: 'agent', evaluationSha: EV }) });
  assert.deepEqual(out, { route: 'agent', sha: EV });
  const line = (await readAdr(r.cwd)).find((l) => l.kind === 'decision');
  assert.deepEqual([line.level, line.by, line.title, line.evaluation], ['Consequential', 'agent', draft().question, EV]);
  assert.equal(escalationsFor(await r.log(), 'first').length, 0);
});

test('an evaluation that routes to the developer writes the escalation with its evaluation SHA', async () => {
  const r = await loopRepo({ settings: enabled });
  const out = await escalateWithRoute(r.cwd, draft(), { evaluate: async () => ({ route: 'developer', evaluationSha: EV }) });
  assert.equal(decodeRecord(await catCommit(r.cwd, out.sha)).payload.evaluation, EV);
});

test('cairn decide --consequential accepts the same canonical draft and writes the same line without an evaluation', async () => {
  const r = await loopRepo();
  await assert.rejects(decideConsequential(r.cwd, draft({ because: '' })), DraftError);
  await assert.rejects(decideConsequential(r.cwd, draft({ concerns: ['ZZZ-999'] })), /not in the frozen set/);
  const id = await decideConsequential(r.cwd, draft());
  const line = (await readAdr(r.cwd)).find((l) => l.id === id);
  assert.deepEqual([line.kind, line.evaluation, line.body, line.wrong_if], ['decision', null, `${draft().recommendation} Instead: ${draft().instead}`, draft().if_wrong]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `escalateWithRoute is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
import { loadSettings } from './settings.mjs';
import { decide } from './adr.mjs';
import { item, outside } from './commitment.mjs';

export function decisionFields(d) {
  return { title: d.question, rests_on: [d.because], wrong_if: d.if_wrong, body: `${d.recommendation} Instead: ${d.instead}`, named_paths: d.named_paths };
}

export async function decideConsequential(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  return decide(cwd, { ...decisionFields(d), by: 'agent', evaluation: d.evaluation ?? null }, 'decide');
}

export async function escalateWithRoute(cwd, draft, opts = {}) {
  const d = validateDraft(draft);
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  if (!(settings.typesafeai && settings.typesafeai.enabled === true)) return { route: 'developer', sha: await escalate(cwd, d) };
  const evaluate = opts.evaluate ?? (await import('./evaluate.mjs')).evaluate;
  const { route, evaluationSha } = await evaluate(cwd, d, { transport: opts.transport });
  if (route === 'developer') return { route, sha: await escalate(cwd, { ...d, evaluation: evaluationSha }) };
  if (route === 'agent') {
    await decide(cwd, { ...decisionFields(d), by: 'agent', evaluation: evaluationSha }, 'escalate');
    return { route, sha: evaluationSha };
  }
  if (route === 'capture') {
    const itemSha = await item(cwd, { kind: 'backlog', slug: d.commitment, source: d.concerns[0], body: d.recommendation });
    return { route, sha: await outside(cwd, itemSha, 'the evaluator recommended capture', { evaluation: evaluationSha }) };
  }
  throw new DraftError(`cairn: evaluation ${evaluationSha} named an unknown route ${route}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (9 tests).

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
- Consumes: `authenticateDeveloper(cwd, settings, {purpose, subject, sign, confirm}) -> evidence` from `lib/auth.mjs` (plan 03; `confirm` is the terminal seam, `async () => true|false`, default opens `/dev/tty` and refuses without one; signed mode needs `sign`); `appendDecision(cwd, line, {command})`, `readAdr` (plan 06).
- Produces: `answer(cwd, slug, kind, text, {confirm, sign, owner, escalation}) -> sha` (answers the oldest unanswered escalation of the commitment, or the one `escalation` names), `escalationState(log, escalationSha) -> {status:'open'|'asked'|'answered', answers, final, lastAsk}`, `unanswered(log) -> [{sha, target, payload, awaiting:'answer'|'reply'}]`, `describeEvidence(evidence) -> string`. The stored evidence is plan 01's shape `{mode, author, signature}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { answer, escalationState, unanswered, describeEvidence } from '../lib/escalate.mjs';

const asDev = { confirm: async () => true };

test('answer refuses without developer evidence: no terminal, or a declined confirmation', async () => {
  const r = await loopRepo();
  const sha = await escalate(r.cwd, draft());
  await assert.rejects(answer(r.cwd, 'first', 'ok', ''), /cairn: /);
  await assert.rejects(answer(r.cwd, 'first', 'ok', '', { confirm: async () => false }), /cairn: /);
  assert.equal(escalationState(await r.log(), sha).status, 'open');
});

test('ok writes the answer record with the evidence and the answered ADR line', async () => {
  const r = await loopRepo();
  const esc = await escalate(r.cwd, draft());
  const sha = await answer(r.cwd, 'first', 'ok', '', asDev);
  const rec = decodeRecord(await catCommit(r.cwd, sha));
  assert.equal(rec.target, 'first');
  assert.deepEqual([rec.payload.escalation, rec.payload.kind, rec.payload.text, rec.payload.owner], [esc, 'ok', '', null]);
  assert.equal(rec.payload.evidence.mode, 'unsigned-local');
  assert.equal(rec.payload.evidence.signature, null);
  assert.ok(rec.payload.evidence.author.length > 0);
  const line = (await readAdr(r.cwd)).find((l) => l.kind === 'answered');
  assert.deepEqual([line.escalation, line.answer], [esc, sha]);
  assert.equal(escalationState(await r.log(), esc).status, 'answered');
  assert.deepEqual(unanswered(await r.log()), []);
  await assert.rejects(answer(r.cwd, 'first', 'instead', 'no', asDev), /no unanswered escalation for first/);
});

test('ask stays open until a reply and writes no answered line; instead needs text; kinds are closed', async () => {
  const r = await loopRepo();
  const esc = await escalate(r.cwd, draft());
  await assert.rejects(answer(r.cwd, 'first', 'instead', '', asDev), /needs text/);
  await assert.rejects(answer(r.cwd, 'first', 'maybe', 'x', asDev), /must be ok, instead or ask/);
  await answer(r.cwd, 'first', 'ask', 'Why 30 and not 14?', asDev);
  const log = await r.log();
  assert.equal(escalationState(log, esc).status, 'asked');
  assert.deepEqual(unanswered(log).map((u) => [u.target, u.awaiting]), [['first', 'reply']]);
  assert.equal((await readAdr(r.cwd)).some((l) => l.kind === 'answered'), false);
  await assert.rejects(answer(r.cwd, 'first', 'ok', '', asDev), /awaits the agent's reply/);
});

test('two open escalations: the oldest is answered first unless --escalation names the other', async () => {
  const r = await loopRepo();
  const a = await escalate(r.cwd, draft());
  const b = await escalate(r.cwd, draft({ question: 'Second?' }));
  const s2 = await answer(r.cwd, 'first', 'ok', '', { ...asDev, escalation: b });
  assert.equal(decodeRecord(await catCommit(r.cwd, s2)).payload.escalation, b);
  const s1 = await answer(r.cwd, 'first', 'ok', '', asDev);
  assert.equal(decodeRecord(await catCommit(r.cwd, s1)).payload.escalation, a);
});

test('describeEvidence says unsigned-local is evidence, not authentication', () => {
  assert.equal(describeEvidence({ mode: 'unsigned-local', author: 'Dev <dev@example.test>', signature: null }), 'unsigned-local, author Dev <dev@example.test>: evidence, not authentication');
  assert.equal(describeEvidence({ mode: 'signed', author: 'Dev', signature: 'AQID' }), 'signed by Dev, verified against signing_key');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `answer is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
import { authenticateDeveloper } from './auth.mjs';
import { appendDecision } from './adr.mjs';

const ANSWER_KINDS = ['ok', 'instead', 'ask'];

export function escalationState(log, escalationSha) {
  const i = log.findIndex((r) => r.sha === escalationSha);
  const after = log.slice(i + 1).filter((r) => (r.kind === 'answer' || r.kind === 'reply') && r.payload.escalation === escalationSha);
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
    return st.status === 'answered' ? [] : [{ sha: e.sha, target: e.target, payload: e.payload, awaiting: st.status === 'asked' ? 'reply' : 'answer' }];
  });
}

export function describeEvidence(ev) {
  return ev.mode === 'signed' ? `signed by ${ev.author}, verified against signing_key` : `unsigned-local, author ${ev.author}: evidence, not authentication`;
}

function pickOpen(log, slug, wanted) {
  const open = unanswered(log).filter((u) => u.payload.slug === slug && (!wanted || u.sha === wanted));
  if (open.length === 0) throw new DraftError(`cairn: no unanswered escalation for ${slug}${wanted ? ` at ${wanted}` : ''}`);
  return open[0];
}

export async function answer(cwd, slug, kind, text = '', opts = {}) {
  if (!ANSWER_KINDS.includes(kind)) throw new DraftError('cairn: answer kind must be ok, instead or ask');
  if (typeof text !== 'string') throw new DraftError('cairn: answer text must be a string');
  if (kind !== 'ok' && text.trim() === '') throw new DraftError(`cairn: answer ${kind} needs text`);
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const esc = pickOpen(log, slug, opts.escalation);
  if (esc.awaiting === 'reply') throw new DraftError(`cairn: ${slug} awaits the agent's reply to your question`);
  const ev = await authenticateDeveloper(cwd, settings, { purpose: 'answer', subject: esc.sha, confirm: opts.confirm, sign: opts.sign });
  const evidence = { mode: ev.mode, author: ev.author ?? '', signature: ev.signature ?? null };
  const sha = await appendRecord(cwd, 'answer', slug, { escalation: esc.sha, kind, text, owner: opts.owner ?? null, evidence });
  if (kind !== 'ask') await appendDecision(cwd, { kind: 'answered', escalation: esc.sha, answer: sha }, { command: 'answer' });
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
- Produces: `reply(cwd, slug, text, {escalation}) -> sha`. Section 5: `reply SLUG` is complete when "a reply record names the open `ask` escalation".

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { reply } from '../lib/escalate.mjs';

test('reply names the open ask; after it the escalation awaits the developer again', async () => {
  const r = await loopRepo();
  const esc = await escalate(r.cwd, draft());
  await assert.rejects(reply(r.cwd, 'first', 'Because the fixture says so.'), /no open ask/);
  await answer(r.cwd, 'first', 'ask', 'Why 30?', asDev);
  await assert.rejects(reply(r.cwd, 'first', ''), /reply needs text/);
  const sha = await reply(r.cwd, 'first', 'Because the fixture says so.');
  assert.deepEqual(decodeRecord(await catCommit(r.cwd, sha)).payload, { escalation: esc, text: 'Because the fixture says so.' });
  const log = await r.log();
  assert.equal(escalationState(log, esc).status, 'open');
  assert.deepEqual(unanswered(log).map((u) => u.awaiting), ['answer']);
  await assert.rejects(reply(r.cwd, 'first', 'Again.'), /no open ask/);
  await answer(r.cwd, 'first', 'instead', 'Fourteen days.', asDev);
  assert.equal(escalationState(await r.log(), esc).final.payload.text, 'Fourteen days.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `reply is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
export async function reply(cwd, slug, text, opts = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new DraftError('cairn: reply needs text');
  const log = await readLog(cwd);
  const asked = unanswered(log).filter((u) => u.payload.slug === slug && u.awaiting === 'reply' && (!opts.escalation || u.sha === opts.escalation));
  if (asked.length === 0) throw new DraftError(`cairn: ${slug} has no open ask to reply to`);
  return appendRecord(cwd, 'reply', slug, { escalation: asked[0].sha, text });
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
- Produces: `dispute(cwd, {commitment, record, n, question, recommendation, because, if_wrong, instead}) -> sha` (an escalation whose only concern is `finding:<record>#<n>`) and `disputes(log, record, n) -> escalationSha|null`: the escalation with exactly that concern and a final answer (`ok` or `instead`), which is "resolved by the developer". Plan 08's `openFindings` closes a finding on the escalation's existence and blocks Done while it is unanswered; plan 10's ledger calls `disputes` for the settled state.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { dispute, disputes } from '../lib/escalate.mjs';

const disputeFields = (record, n) => ({
  commitment: 'first', record, n,
  question: `Is finding ${n} a defect?`, recommendation: 'No: the check reads the declared fixture.',
  because: 'hello.txt is in the mechanism inputs.', if_wrong: 'A hidden input goes undeclared.', instead: 'Declare it and re-run.',
});

test('a dispute names finding N on its exact source record and is settled by the developer\'s final answer', async () => {
  const r = await loopRepo();
  const rev = await r.review([{ n: 1, text: 'reads an undeclared fixture' }, { n: 2, text: 'no test for empty input' }]);
  await assert.rejects(dispute(r.cwd, disputeFields(rev, 3)), /has no finding 3/);
  const sha = await dispute(r.cwd, disputeFields(rev, 1));
  assert.equal(decodeRecord(await catCommit(r.cwd, sha)).payload.concerns, `finding:${rev}#1`);
  assert.equal(disputes(await r.log(), rev, 1), null);
  await answer(r.cwd, 'first', 'ask', 'Which fixture?', asDev);
  assert.equal(disputes(await r.log(), rev, 1), null);
  await reply(r.cwd, 'first', 'hello.txt');
  await answer(r.cwd, 'first', 'ok', '', asDev);
  const log = await r.log();
  assert.equal(disputes(log, rev, 1), sha);
  assert.equal(disputes(log, rev, 2), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `dispute is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
export async function dispute(cwd, { commitment, record, n, question, recommendation, because, if_wrong, instead }) {
  return escalate(cwd, { commitment, concerns: [`finding:${record}#${n}`], question, recommendation, because, if_wrong, instead, options: [], named_paths: [], cited_decisions: [] });
}

export function disputes(log, record, n) {
  const e = log.find((x) => x.kind === 'escalation' && x.payload.concerns === `finding:${record}#${n}` && escalationState(log, x.sha).status === 'answered');
  return e ? e.sha : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Dispute a finding by escalation; the developer's final answer settles it"
```

---

### Task 7: `escalate REQ` and the concern readers

**Files:**
- Modify: `lib/escalate.mjs`
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Produces: `concerns(log, token) -> [escalation records]` whose `concerns` string contains the token as a whole word, and `escalatedRequirement(log, REQ) -> boolean`. Plan 08's `run` predicate tests `payload.concerns === req` after the last pass; a requirement escalation therefore carries the identifier as its only token.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { concerns, escalatedRequirement } from '../lib/escalate.mjs';

test('an escalation concerning a requirement is found by identifier, answered or not', async () => {
  const r = await loopRepo({ reqs: ['DEMO-001', 'DEMO-002'] });
  assert.equal(escalatedRequirement(await r.log(), 'DEMO-001'), false);
  const sha = await escalate(r.cwd, draft({ question: 'Three attempts failed; change the falsifier?' }));
  let log = await r.log();
  assert.equal(escalatedRequirement(log, 'DEMO-001'), true);
  assert.equal(escalatedRequirement(log, 'DEMO-002'), false);
  assert.deepEqual(concerns(log, 'DEMO-001').map((e) => e.sha), [sha]);
  assert.deepEqual(concerns(log, 'DEMO-00'), []);
  await answer(r.cwd, 'first', 'ok', '', asDev);
  log = await r.log();
  assert.equal(escalatedRequirement(log, 'DEMO-001'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `concerns is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
export function concerns(log, token) {
  return log.filter((e) => e.kind === 'escalation' && e.payload.concerns.split(' ').includes(token));
}
export function escalatedRequirement(log, req) { return concerns(log, req).length > 0; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/escalate.mjs tests/escalate.test.mjs
git commit -m "Find escalations by concern token so wake can see a requirement was escalated"
```

---

### Task 8: Waiting prints the five fields verbatim

**Files:**
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `wake(cwd)` and `render(verdict)` from `lib/wake.mjs` (plan 08: for `Waiting`, `render` prints `verdict: Waiting`, `party: developer`, `reason: ...`, then `question:`, `recommendation:`, `because:`, `if wrong:`, `instead:`, then `predicate:` and `answer: cairn answer <slug> ok | instead <text> | ask <text>`); `bin/cairn.mjs wake` prints `render(await wake(cwd))`. This task changes no code: it is the byte-level check the spec sentence requires, against an escalation this module wrote with fields that would betray any normalization.

- [ ] **Step 1: Write the test**

```js
// tests/escalate.test.mjs (append)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { wake, render } from '../lib/wake.mjs';
const run = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/cairn.mjs', import.meta.url));

test('the five fields reach the terminal byte for byte: double spaces, trailing space, quotes and a tab survive', async () => {
  const r = await loopRepo();
  const fields = {
    question: 'Keep  "sessions" for 30 days?', recommendation: 'Yes, 30 days, refreshed on use. ',
    because: 'tests/session.test.mjs\tassumes 30.', if_wrong: 'Shared machines stay logged in.', instead: 'Seven days.',
  };
  await escalate(r.cwd, draft(fields));
  const expected = Buffer.from(
    `question: ${fields.question}\nrecommendation: ${fields.recommendation}\nbecause: ${fields.because}\nif wrong: ${fields.if_wrong}\ninstead: ${fields.instead}\n`, 'utf8');
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.ok(Buffer.from(render(v), 'utf8').indexOf(expected) >= 0, 'render carries the exact bytes');
  const { stdout } = await run(process.execPath, [BIN, 'wake'], { cwd: r.cwd, encoding: 'buffer' });
  assert.ok(stdout.indexOf(expected) >= 0, 'stdout carries the exact bytes');
  assert.ok(stdout.indexOf(Buffer.from('answer: cairn answer first ok | instead <text> | ask <text>\n')) >= 0);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/escalate.test.mjs`
Expected: PASS (18 tests). A failure here means plan 08's `render` or the CLI rewrote a field; fix it there, never by trimming the draft.

- [ ] **Step 3: Commit**

```bash
git add tests/escalate.test.mjs
git commit -m "Check that Waiting prints an escalation's five fields byte for byte"
```

---

### Task 9: Command-line entry points

**Files:**
- Modify: `lib/escalate.mjs`
- Modify: `lib/cli.mjs` (the `COMMANDS` table, plan 01)
- Test: `tests/escalate.test.mjs`

**Interfaces:**
- Consumes: `lib/cli.mjs` `COMMANDS` entries of the form `name: async (cwd, argv) => {code, out}`; the CLI prints `out` to stdout on code 0 and to stderr on code 1.
- Produces: `parseEscalateArgs(argv) -> draft`, `cliEscalate`, `cliAnswer`, `cliReply`, `cliDispute`, each `(cwd, argv, opts) -> {code, out}`. Commands: `cairn escalate --commitment S --concern TOKEN [--concern TOKEN ...] --question Q --recommendation R --because B --if-wrong W --instead I [--option TEXT ...] [--path P ...] [--decision ID ...]`; `cairn answer SLUG ok|instead|ask [TEXT] [--escalation SHA]`; `cairn reply SLUG TEXT [--escalation SHA]`; `cairn dispute --commitment S --record SHA --n N --question ... --instead ...`. Plan 11 Task 10 re-points the `escalate` and `decide --consequential` entries at `escalateWithRoute` and `decideConsequential` with the transport it builds.

- [ ] **Step 1: Write the failing test**

```js
// tests/escalate.test.mjs (append)
import { parseEscalateArgs, cliEscalate, cliAnswer, cliReply, cliDispute } from '../lib/escalate.mjs';

const argv = ['--commitment', 'first', '--concern', 'DEMO-001', '--question', draft().question, '--recommendation', draft().recommendation,
  '--because', draft().because, '--if-wrong', draft().if_wrong, '--instead', draft().instead, '--path', 'src/demo.mjs'];

test('the escalate command parses the five fields and concern tokens into the canonical draft', () => {
  assert.deepEqual(parseEscalateArgs(argv), draft());
  assert.throws(() => parseEscalateArgs(argv.slice(0, -4)), /missing --instead/);
  assert.throws(() => parseEscalateArgs([...argv, '--bogus', 'x']), /unknown flag --bogus/);
  assert.deepEqual(parseEscalateArgs([...argv, '--concern', 'cycle']).concerns, ['DEMO-001', 'cycle']);
});

test('escalate, answer, reply and dispute commands print one line and use exit codes 0 and 1', async () => {
  const r = await loopRepo();
  const e = await cliEscalate(r.cwd, argv);
  assert.equal(e.code, 0);
  assert.match(e.out, /^cairn: escalation first [0-9a-f]{40}\n$/);
  const bad = await cliAnswer(r.cwd, ['first', 'ok'], { confirm: async () => false });
  assert.equal(bad.code, 1);
  assert.match(bad.out, /^cairn: .*\n$/);
  const ask = await cliAnswer(r.cwd, ['first', 'ask', 'Why?'], asDev);
  assert.match(ask.out, /^cairn: answer first [0-9a-f]{40}\n$/);
  const rp = await cliReply(r.cwd, ['first', 'Because.']);
  assert.match(rp.out, /^cairn: reply first [0-9a-f]{40}\n$/);
  await cliAnswer(r.cwd, ['first', 'ok'], asDev);
  const rev = await r.review([{ n: 1, text: 'x' }]);
  const d = await cliDispute(r.cwd, ['--commitment', 'first', '--record', rev, '--n', '1', '--question', 'Defect?', '--recommendation', 'No.', '--because', 'declared', '--if-wrong', 'hidden input', '--instead', 'declare it']);
  assert.match(d.out, /^cairn: escalation first [0-9a-f]{40}\n$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/escalate.test.mjs`
Expected: FAIL, `parseEscalateArgs is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/escalate.mjs (append)
const FLAG_TO_FIELD = { '--commitment': 'commitment', '--question': 'question', '--recommendation': 'recommendation', '--because': 'because', '--if-wrong': 'if_wrong', '--instead': 'instead' };
const LIST_FLAGS = { '--concern': 'concerns', '--option': 'options', '--path': 'named_paths', '--decision': 'cited_decisions' };

export function parseEscalateArgs(argv) {
  const d = { concerns: [], options: [], named_paths: [], cited_decisions: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], val = argv[i + 1];
    if (val === undefined) throw new DraftError(`cairn: ${flag} needs a value`);
    if (FLAG_TO_FIELD[flag]) d[FLAG_TO_FIELD[flag]] = val;
    else if (LIST_FLAGS[flag]) d[LIST_FLAGS[flag]].push(val);
    else throw new DraftError(`cairn: unknown flag ${flag}`);
  }
  for (const [flag, f] of Object.entries(FLAG_TO_FIELD)) if (!(f in d)) throw new DraftError(`cairn: missing ${flag}`);
  return validateDraft(d);
}

function splitFlags(argv) {
  const pos = [], named = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { named[argv[i].slice(2).replace(/-/g, '_')] = argv[i + 1]; i++; } else pos.push(argv[i]);
  }
  return { pos, named };
}

const asCli = (fn) => async (cwd, argv, opts = {}) => {
  try { return { code: 0, out: await fn(cwd, argv, opts) }; }
  catch (e) { return { code: 1, out: (e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`) + '\n' }; }
};

export const cliEscalate = asCli(async (cwd, argv) => `cairn: escalation ${parseEscalateArgs(argv).commitment} ${await escalate(cwd, parseEscalateArgs(argv))}\n`);
export const cliAnswer = asCli(async (cwd, argv, opts) => {
  const { pos: [slug, kind, ...text], named } = splitFlags(argv);
  return `cairn: answer ${slug} ${await answer(cwd, slug, kind, text.join(' '), { ...opts, escalation: named.escalation })}\n`;
});
export const cliReply = asCli(async (cwd, argv) => {
  const { pos: [slug, ...text], named } = splitFlags(argv);
  return `cairn: reply ${slug} ${await reply(cwd, slug, text.join(' '), { escalation: named.escalation })}\n`;
});
export const cliDispute = asCli(async (cwd, argv) => {
  const { named } = splitFlags(argv);
  return `cairn: escalation ${named.commitment} ${await dispute(cwd, { ...named, n: Number(named.n) })}\n`;
});
```

In `lib/cli.mjs` add to `COMMANDS`: `escalate: cliEscalate, answer: cliAnswer, reply: cliReply, dispute: cliDispute`, imported from `./escalate.mjs`, and add the four usage lines to `--help` in the table's format.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/escalate.test.mjs tests/cli.test.mjs`
Expected: PASS (20 tests in escalate; cli unchanged).

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
| "Wake prints them verbatim." (2); "Wake prints the five fields verbatim; the agent adds nothing." (5) | 8 |
| "The developer writes ok, instead <text> or ask <text> with cairn answer; ask stays open until an agent reply." (2) | 4, 5 |
| "Developer-only commands use the authentication rule in Settings." (2); "the agent never does" (8); "unsigned local authorship is evidence, not authentication" (decision 11) | 4 |
| "A finding is answered by ... a dispute, which is an escalation naming the finding and resolved by the developer." (2); `resolve SLUG N` "or an escalation disputes it" (5) | 6 |
| "A Consequential decision is appended to the ADR and queued while the agent continues. A Blocking decision is an escalation; its answered line names the answer record." (2) | 3, 4 |
| escalation kind: "slug, five fields, concern reference, optional evaluation SHA" (4); subject, trailers and decoder round-trip | 2 |
| answer kind: "escalation SHA, ok/instead/ask, text, optional owner label, developer-auth evidence" (4) | 4 |
| reply kind: "escalation SHA, text" (4); `reply SLUG` predicate (5) | 5 |
| `answered` ADR line `{escalation, answer}` written by `cairn answer` (4) | 4 |
| "cairn escalate and cairn decide --consequential accept the same canonical draft." (8) | 1, 3 |
| "With evaluation disabled or outside its envelope, the requested command uses the kernel level." (8); "cairn escalate writes the evaluation route it selected" (decision 23) | 3 |
| `escalate REQ`: "an escalation concerns the requirement before a fourth" (5) | 7 |
| "Waiting alone is the developer's turn" (decision 10) | 8 |
| Commands `cairn escalate`, `answer` and `reply` "write the decision chain" (4) | 9 |

Left to other plans:

- The attempt count behind `escalate REQ` ("after three distinct attempts", 5 and 8) and the predicate itself: plan 05's `attempts` and plan 08's `run` predicate, which already matches `concerns === REQ`.
- Waiting's place in precedence, the `reply` action, and the rendering of the Waiting block: plan 08; Task 8 only proves the bytes.
- The evaluator envelope, its records, shadow and route modes, and the CLI wiring of `escalate` and `decide --consequential` to the transport (2, 8, 10): plan 11, whose Task 10 calls `escalateWithRoute` and `decideConsequential`.
- The `outside` record's evaluation SHA on the `capture` route (4): plan 11 Task 10 gives plan 06's `outside` its optional `{evaluation}` argument; Task 3 passes the SHA in the reason until then.
- Signature verification of a stored answer on read (2 "With a key, developer-only records must verify"): plan 03's `verifyEvidence`, applied by plan 08 when it reads answers.
- The cycle escalation and its `concerns: 'cycle'` record (5): plan 08's `writeCycleEscalation`.
- Carrying unanswered escalations across a supersession (2 Superseded): plan 06.
