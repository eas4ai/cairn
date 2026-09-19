# Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the optional TypeSafe evaluator: one network file, a code envelope that owns every authority boundary, the three recoverable evaluation records, shadow mode, and policy-bound calibration for route mode.

**Architecture:** `bin/typesafeai.mjs` is the only file that opens a socket; it takes an injected `fetchImpl` so tests never touch the network. `lib/evaluate.mjs` builds the two request states from kernel facts, applies the section 10 rule table first-match-wins with every gate failing closed, writes `evaluation-intent` before I/O, one `evaluation-call` per attempted call and one final `evaluation`, and computes the calibration bound. The command layer (`lib/cli.mjs`) asks the evaluator for a route and then calls plan 06, 09 or 06's writers; the evaluator never writes a decision, item or escalation itself.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`, `node:crypto`, global `fetch` (injected). No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 (Evaluation intent, call and result; Calibration; the `typesafeai` settings block and its refusals), section 4 (the four evaluation kinds; the evaluator-intent paragraph under Commands and crash recovery), section 8 (Escalation), section 10 (all), section 13 decisions 18, 19, 26, 27, 42, 45, 51. The map is `docs/plans/overview.md`.

**Depends on:** plans 01 (canon, gitx, records, snapshots), 06 (commitment, adr), 09 (escalate). Also consumes plan 02 (settings, paths, spec), plan 04 (lease), plan 05 (check.attempts).

**TypeSafe docs:** fetched 2026-09-19 from `https://docs.typesafe.ai/api.md`, `models.md`, `primitives/noul.md`, `primitives/choice.md`; all four returned HTTP 200. Shapes used: `POST https://api.typesafe.ai/v1/systemone`, header `Authorization: Bearer <key>`, body `{state, model, questions}`; a noul question `{type:"noul", instructions, criteria?:{true,false}}` answers `{type:"noul", noul:<0..1>}`; a choice question `{type:"choice", instructions, criteria:{<option>:<string|null>}}` answers `{type:"choice", choice, probabilities:{<option>:<number>}, confidence}`; response `{model, answers, usage:{input_tokens, output_tokens}}`; errors are HTTP 401, 422, 429, 529 "with a JSON body describing what went wrong". Jev 1.13 is `jev-1.13.0`; `jev-latest` and `jev-preview` are aliases; the response `model` field reports the versioned ID. The API page documents no distinct context-length error code: this plan treats a 422 whose body text contains `context` or `token` as class `context`. **Verify that one shape against the API page before implementing Task 1.**

## Global constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Only `bin/typesafeai.mjs` sends requests; it reads `TYPESAFEAI_API_KEY` from the environment and never stores it."
- "The first matching rule wins. Missing or invalid facts fail closed. Nouls are gates, not weights."
- "Option gates may veto but never grant agent authority."
- "Equal identity and policy digest must yield byte-identical requests; answers may differ."
- "The kernel enforces `request_cap_bytes`, estimates three bytes per token and refuses above 75% of either limit."
- "Requests omit `network_exclude`, credential and host bytes, keys and command output."
- "An unknown crash outcome becomes `indeterminate`, is not retried and routes to the developer."
- "Shadow is the default: actual authority stays with the developer and `would_route` stores the hypothetical route."
- "Route mode requires matching passing calibration. Unread Consequential decisions at Done disable calls next commitment until read."
- Tests inject `fetchImpl`; no test opens a socket.

**Test helper:** plan 03 ships `makeProject({settings, files}) -> { cwd, ... }` in `tests/helpers/repo.mjs`, an initialized project (settings merged over the defaults, `init` record, durable ref roots) under `os.tmpdir()`. Every fixture here uses it.

---

## File structure

```
bin/typesafeai.mjs         post(request, {key, fetchImpl}); failure classes; key never leaves the call
lib/evaluate.mjs           POLICY constants, draft/policy digests, protected(D), A(D), C(c), states,
                           requests, size rule, egress, envelope, evaluate(), recoverEvaluation(),
                           calibrate(), upperBound(), assertRouteMode(), validateEvaluatorSettings()
lib/settings.mjs           (modify) validateSettings appends validateEvaluatorSettings reasons
lib/cli.mjs                (modify) escalate and decide --consequential consult evaluate; cairn calibrate
tests/typesafeai.test.mjs  transport tests with a fake fetch
tests/evaluate.test.mjs    everything else, one describe per task
```

Fixed record targets: every evaluation-family record's target is the commitment slug, so `cairn: evaluation-intent <slug>` is a valid subject token.

---

### Task 1: Transport `bin/typesafeai.mjs`

**Files:**
- Create: `bin/typesafeai.mjs`
- Test: `tests/typesafeai.test.mjs`

**Interfaces:**
- Consumes: nothing from `lib/`.
- Produces: `post(request, {key, fetchImpl}) -> Promise<{status, body, model}>` on an HTTP response of any status, or `throw` a `TransportError` with `.klass` in `'nokey'|'network'|'auth'|'overloaded'|'context'|'http'|'malformed'` and `.status` when known. `ENDPOINT = 'https://api.typesafe.ai/v1/systemone'`. `body` is the raw response text (a string), never parsed here; the caller stores its bytes.

- [ ] **Step 1: Write the failing tests**

```js
// tests/typesafeai.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { post, ENDPOINT, TransportError } from '../bin/typesafeai.mjs';

const req = { state: 's', model: 'jev-1.13.0', questions: { q: { type: 'noul', instructions: 'x?' } } };
const fake = (status, text, capture = {}) => async (url, init) => {
  capture.url = url; capture.init = init;
  return { status, text: async () => text };
};

test('posts bearer header and JSON body to the endpoint', async () => {
  const cap = {};
  const r = await post(req, { key: 'k-123', fetchImpl: fake(200, '{"model":"jev-1.13.0","answers":{},"usage":{"input_tokens":1,"output_tokens":1}}', cap) });
  assert.equal(cap.url, ENDPOINT);
  assert.equal(cap.init.method, 'POST');
  assert.equal(cap.init.headers.Authorization, 'Bearer k-123');
  assert.equal(cap.init.headers['Content-Type'], 'application/json');
  assert.equal(cap.init.body, JSON.stringify(req));
  assert.equal(r.status, 200);
  assert.equal(r.model, 'jev-1.13.0');
  assert.equal(typeof r.body, 'string');
  assert.ok(!JSON.stringify(r).includes('k-123'));
});

test('reads TYPESAFEAI_API_KEY when key is absent and never stores it', async () => {
  process.env.TYPESAFEAI_API_KEY = 'env-key';
  const cap = {};
  const r = await post(req, { fetchImpl: fake(200, '{"model":"jev-1.13.0","answers":{},"usage":{}}', cap) });
  assert.equal(cap.init.headers.Authorization, 'Bearer env-key');
  assert.ok(!Object.values(r).some((v) => String(v).includes('env-key')));
  delete process.env.TYPESAFEAI_API_KEY;
});

test('missing key is class nokey and nothing is fetched', async () => {
  delete process.env.TYPESAFEAI_API_KEY;
  let called = false;
  await assert.rejects(post(req, { fetchImpl: async () => { called = true; } }),
    (e) => e instanceof TransportError && e.klass === 'nokey');
  assert.equal(called, false);
});

test('classifies failures', async () => {
  const cases = [
    [401, '{"error":"bad key"}', 'auth'], [429, '{}', 'overloaded'], [529, '{}', 'overloaded'],
    [422, '{"error":"state exceeds context length"}', 'context'], [422, '{"error":"missing field"}', 'http'],
    [500, 'oops', 'http'],
  ];
  for (const [status, text, klass] of cases) {
    await assert.rejects(post(req, { key: 'k', fetchImpl: fake(status, text) }),
      (e) => e.klass === klass && e.status === status, `${status} ${text}`);
  }
  await assert.rejects(post(req, { key: 'k', fetchImpl: async () => { throw new Error('ECONNRESET'); } }),
    (e) => e.klass === 'network');
  await assert.rejects(post(req, { key: 'k', fetchImpl: fake(200, 'not json') }),
    (e) => e.klass === 'malformed' && e.body === 'not json');
});

test('error text never carries the key', async () => {
  await assert.rejects(post(req, { key: 'secret-xyz', fetchImpl: fake(401, 'denied') }),
    (e) => !e.message.includes('secret-xyz') && !String(e.stack).includes('secret-xyz'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/typesafeai.test.mjs`
Expected: FAIL, `Cannot find module '../bin/typesafeai.mjs'`.

- [ ] **Step 3: Implement**

```js
// bin/typesafeai.mjs
// The only file in Cairn that performs network I/O. It never stores or logs the key.
export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export class TransportError extends Error {
  constructor(klass, status, body) {
    super(`typesafeai: ${klass}${status ? ' ' + status : ''}`);
    this.klass = klass; this.status = status ?? null; this.body = body ?? null;
  }
}

function classify(status, text) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429 || status === 529) return 'overloaded';
  if (status === 422 && /context|token/i.test(text)) return 'context';
  return 'http';
}

export async function post(request, { key, fetchImpl = globalThis.fetch } = {}) {
  const k = key ?? process.env.TYPESAFEAI_API_KEY;
  if (!k) throw new TransportError('nokey');
  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new TransportError('network');
  }
  const text = await res.text();
  if (res.status !== 200) throw new TransportError(classify(res.status, text), res.status, text);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new TransportError('malformed', 200, text); }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.model !== 'string') throw new TransportError('malformed', 200, text);
  return { status: 200, body: text, model: parsed.model };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/typesafeai.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add bin/typesafeai.mjs tests/typesafeai.test.mjs
git commit -m "Add the TypeSafe transport with injected fetch and failure classes"
```

---

### Task 2: The `typesafeai` settings block and its refusals

**Files:**
- Create: `lib/evaluate.mjs` (first exports)
- Modify: `lib/settings.mjs` (`validateSettings` appends the evaluator reasons)
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `validateSettings(obj) -> [] | [reasons]` from `lib/settings.mjs` (plan 02).
- Produces: `validateEvaluatorSettings(block) -> [reasons]`, `EVALUATOR_DEFAULTS`, `THRESHOLD_KEYS`, `isVersionedModel(id) -> boolean`.

Note on the module cycle: `lib/settings.mjs` imports this function and `lib/evaluate.mjs` imports `loadSettings`. Both are used only inside function bodies, so the ES module cycle is safe.

- [ ] **Step 1: Write the failing tests**

```js
// tests/evaluate.test.mjs (top of file; later tasks append describe blocks)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvaluatorSettings, isVersionedModel, EVALUATOR_DEFAULTS } from '../lib/evaluate.mjs';
import { validateSettings } from '../lib/settings.mjs';

const good = () => ({ ...EVALUATOR_DEFAULTS, enabled: true, mode: 'shadow', model: 'jev-1.13.0' });

describe('settings block', () => {
  test('defaults validate', () => assert.deepEqual(validateEvaluatorSettings({ ...EVALUATOR_DEFAULTS }), []));
  test('threshold outside [0,1] is refused', () => {
    for (const k of ['route_confidence', 'sufficient_threshold', 'outside_threshold', 'contradicts_ceiling', 'reversible_floor', 'observed_floor', 'max_false_downgrade']) {
      assert.match(validateEvaluatorSettings({ ...good(), [k]: 1.5 }).join(' '), new RegExp(k));
      assert.match(validateEvaluatorSettings({ ...good(), [k]: -0.1 }).join(' '), new RegExp(k));
    }
  });
  test('enabled without a model is refused', () =>
    assert.match(validateEvaluatorSettings({ ...good(), model: null }).join(' '), /model/));
  test('request_cap_bytes above 64000 is refused', () =>
    assert.match(validateEvaluatorSettings({ ...good(), request_cap_bytes: 64001 }).join(' '), /request_cap_bytes/));
  test('weights and code_tiers are refused, not ignored', () => {
    assert.match(validateEvaluatorSettings({ ...good(), weights: {} }).join(' '), /weights/);
    assert.match(validateEvaluatorSettings({ ...good(), code_tiers: [] }).join(' '), /code_tiers/);
  });
  test('unknown field, unknown mode, unknown value fail closed', () => {
    assert.match(validateEvaluatorSettings({ ...good(), extra: 1 }).join(' '), /extra/);
    assert.match(validateEvaluatorSettings({ ...good(), mode: 'auto' }).join(' '), /mode/);
    assert.match(validateEvaluatorSettings({ ...good(), enabled: 'yes' }).join(' '), /enabled/);
  });
  test('route mode requires a versioned model id, not an alias', () => {
    assert.equal(isVersionedModel('jev-1.13.0'), true);
    assert.equal(isVersionedModel('jev-latest'), false);
    assert.match(validateEvaluatorSettings({ ...good(), mode: 'route', model: 'jev-latest' }).join(' '), /alias/);
  });
  test('validateSettings carries the evaluator reasons', () => {
    const s = { schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: [],
      signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { ...good(), weights: {} } };
    assert.match(validateSettings(s).join(' '), /weights/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `Cannot find module '../lib/evaluate.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/evaluate.mjs (beginning)
export const THRESHOLD_KEYS = ['route_confidence', 'sufficient_threshold', 'outside_threshold',
  'contradicts_ceiling', 'reversible_floor', 'observed_floor', 'max_false_downgrade'];
export const EVALUATOR_DEFAULTS = Object.freeze({
  enabled: false, mode: 'shadow', model: 'jev-1.13.0', route_confidence: 0.8, sufficient_threshold: 0.7,
  outside_threshold: 0.8, contradicts_ceiling: 0.3, reversible_floor: 0.7, observed_floor: 0.6,
  max_false_downgrade: 0.05, min_calibration_agent_predictions: 60, request_cap_bytes: 48000,
});
const KNOWN = new Set(Object.keys(EVALUATOR_DEFAULTS));
const REMOVED = ['weights', 'code_tiers'];

export function isVersionedModel(id) { return typeof id === 'string' && /^jev-\d+\.\d+\.\d+$/.test(id); }

export function validateEvaluatorSettings(block) {
  if (block === undefined) return [];
  const r = [];
  if (block === null || typeof block !== 'object' || Array.isArray(block)) return ['typesafeai must be an object'];
  for (const k of Object.keys(block)) {
    if (REMOVED.includes(k)) r.push(`typesafeai.${k} was removed and is refused`);
    else if (!KNOWN.has(k)) r.push(`typesafeai.${k} is unknown`);
  }
  if (typeof block.enabled !== 'boolean') r.push('typesafeai.enabled must be true or false');
  if (!['shadow', 'route'].includes(block.mode)) r.push('typesafeai.mode must be shadow or route');
  if (block.model !== null && typeof block.model !== 'string') r.push('typesafeai.model must be a string or null');
  if (block.enabled === true && !block.model) r.push('typesafeai.enabled needs a model');
  if (block.mode === 'route' && !isVersionedModel(block.model)) r.push('typesafeai.mode route needs a versioned model id, not an alias');
  for (const k of THRESHOLD_KEYS) {
    const v = block[k];
    if (typeof v !== 'number' || !(v >= 0 && v <= 1)) r.push(`typesafeai.${k} must be a number in [0,1]`);
  }
  if (!Number.isInteger(block.min_calibration_agent_predictions) || block.min_calibration_agent_predictions < 1)
    r.push('typesafeai.min_calibration_agent_predictions must be a positive integer');
  if (!Number.isInteger(block.request_cap_bytes) || block.request_cap_bytes < 1 || block.request_cap_bytes > 64000)
    r.push('typesafeai.request_cap_bytes must be an integer from 1 to 64000');
  return r;
}
```

In `lib/settings.mjs`, inside `validateSettings(obj)` where reasons are collected, add:

```js
import { validateEvaluatorSettings } from './evaluate.mjs';
// ... after the existing field checks:
reasons.push(...validateEvaluatorSettings(obj.typesafeai));
```

Route mode also needs a current passing calibration; that check reads the log, so it lives in `assertRouteMode` (Task 9) and is called by every command that would evaluate.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs tests/settings.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs lib/settings.mjs tests/evaluate.test.mjs
git commit -m "Validate the typesafeai settings block and refuse removed fields"
```

---

### Task 3: Policy constants, draft digest and policy digest

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `canonicalize`, `sha256` from `lib/canon.mjs`; `CREDENTIAL_PATTERNS` from `lib/paths.mjs`.
- Produces: `POLICY` (frozen: `RULE`, `ENVELOPE`, `QUESTIONS`, `LIMITS`, `CONSTRUCTION`, `ROUTER`), `DRAFT_KEYS`, `FIVE_FIELDS`, `normalizeDraft(draft) -> D` (throws `DraftError`), `draftDigest(D)`, `policyDigest(settings)`.

The policy digest covers exactly: model, question schemas and texts, request construction version, code rule text, envelope text, router version, the seven thresholds, caps (`request_cap_bytes`, the two token limits and the 75 percent factor), egress (`network_exclude` list and the credential patterns).

- [ ] **Step 1: Write the failing tests**

```js
import { POLICY, normalizeDraft, draftDigest, policyDigest, DraftError } from '../lib/evaluate.mjs';

const draft = () => ({ commitment: 'auth-tokens', concerns: ['AUTH-003'], question: 'Rotate tokens hourly?',
  recommendation: 'Yes', because: 'observed: node scripts/rotate.mjs prints ok', if_wrong: 'sessions drop',
  instead: 'daily', options: ['hourly', 'daily'], named_paths: ['src/auth/rotate.mjs'], cited_decisions: [] });
const settings = () => ({ typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true }, network_exclude: ['fixtures/private/**'] });

describe('policy and draft digests', () => {
  test('normalizeDraft keeps exactly the ten fields and refuses extras and missing ones', () => {
    assert.deepEqual(Object.keys(normalizeDraft(draft())).sort(), [...POLICY.DRAFT_KEYS].sort());
    assert.throws(() => normalizeDraft({ ...draft(), score: 1 }), DraftError);
    assert.throws(() => normalizeDraft({ ...draft(), question: undefined }), DraftError);
  });
  test('draft digest is stable under key order', () => {
    const a = draftDigest(normalizeDraft(draft()));
    const d = draft(); const reordered = Object.fromEntries(Object.entries(d).reverse());
    assert.equal(a, draftDigest(normalizeDraft(reordered)));
    assert.match(a, /^sha256:[0-9a-f]{64}$/);
  });
  test('policy digest changes with any covered input and nothing else', () => {
    const base = policyDigest(settings());
    const s1 = settings(); s1.typesafeai.route_confidence = 0.9;
    const s2 = settings(); s2.network_exclude = [];
    const s3 = settings(); s3.typesafeai.model = 'jev-1.14.0';
    const s4 = settings(); s4.typesafeai.enabled = false; s4.typesafeai.mode = 'route';
    assert.notEqual(base, policyDigest(s1)); assert.notEqual(base, policyDigest(s2)); assert.notEqual(base, policyDigest(s3));
    assert.equal(base, policyDigest(s4), 'enabled and mode are not policy');
  });
  test('the six question ids and types are fixed', () => {
    assert.deepEqual(POLICY.QUESTIONS.map((q) => [q.id, q.type]), [
      ['sufficient', 'noul'], ['reversible_n', 'noul'], ['contradicts_n', 'noul'], ['outside_n', 'noul'], ['observed', 'noul'], ['owner', 'choice']]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `POLICY` is not exported.

- [ ] **Step 3: Implement**

```js
import { canonicalize, sha256, b64url } from './canon.mjs';
import { CREDENTIAL_PATTERNS } from './paths.mjs';

export class DraftError extends Error {}
export const FIVE_FIELDS = ['question', 'recommendation', 'because', 'if_wrong', 'instead'];
export const DRAFT_KEYS = ['commitment', 'concerns', ...FIVE_FIELDS, 'options', 'named_paths', 'cited_decisions'];

export const POLICY = Object.freeze({
  DRAFT_KEYS,
  RULE: 'Cairn code rule: a Consequential draft stays the agent\'s decision only when every option gate passes and the owner answer is agent at or above route_confidence. Data, contract, agreement, reserved or settings writes, a fourth attempt, a scope ruling, a missing recommendation and an incomplete authority projection are the developer\'s without a call.',
  ENVELOPE: 'protected->developer; oversize->developer; call fails->developer; invalid answer->developer; sufficient<t->developer; outside_n>=t->capture n; contradicts_n>=c->developer; reversible_n<f->developer; observed<f->developer; owner=agent and confidence>=r->agent; otherwise developer',
  CONSTRUCTION: 1, ROUTER: 1,
  LIMITS: Object.freeze({ requestTokens: 64000, stateTokens: 32000, bytesPerToken: 3, factor: 0.75 }),
  QUESTIONS: Object.freeze([
    { id: 'sufficient', type: 'noul', call: 'option', text: 'Does the state suffice for every option gate?' },
    { id: 'reversible_n', type: 'noul', call: 'option', text: 'Can option n be reverted without migration, data repair or caller change?' },
    { id: 'contradicts_n', type: 'noul', call: 'option', text: 'Does option n contradict the frozen contract or a cited decision?' },
    { id: 'outside_n', type: 'noul', call: 'option', text: 'Is option n outside the frozen requirement set?' },
    { id: 'observed', type: 'noul', call: 'option', text: 'Does because cite an observed command, path or output?' },
    { id: 'owner', type: 'choice', call: 'owner', text: 'Do closed facts assign this to agent or developer?',
      criteria: { agent: 'The closed facts and contract let the agent decide and queue this for later review', developer: 'The decision is the developer\'s' } },
  ]),
});

export function normalizeDraft(draft) {
  if (!draft || typeof draft !== 'object') throw new DraftError('draft must be an object');
  for (const k of Object.keys(draft)) if (!DRAFT_KEYS.includes(k)) throw new DraftError(`draft.${k} is unknown`);
  const D = {};
  for (const k of DRAFT_KEYS) {
    const v = draft[k];
    const isList = ['concerns', 'options', 'named_paths', 'cited_decisions'].includes(k);
    if (isList ? !Array.isArray(v) || v.some((x) => typeof x !== 'string') : typeof v !== 'string')
      throw new DraftError(`draft.${k} is missing or has the wrong type`);
    D[k] = isList ? [...v] : v;
  }
  return D;
}
export function draftDigest(D) { return sha256(canonicalize(D)); }

export function policyDigest(settings) {
  const t = settings.typesafeai;
  return sha256(canonicalize({
    model: t.model, questions: POLICY.QUESTIONS, construction: POLICY.CONSTRUCTION, rule: POLICY.RULE,
    envelope: POLICY.ENVELOPE, router: POLICY.ROUTER,
    thresholds: Object.fromEntries(THRESHOLD_KEYS.map((k) => [k, t[k]])),
    caps: { request_cap_bytes: t.request_cap_bytes, ...POLICY.LIMITS },
    egress: { network_exclude: [...settings.network_exclude], credential: [...CREDENTIAL_PATTERNS] },
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Fix the evaluator policy constants, draft shape and policy digest"
```

---

### Task 4: `protected(D)` and the authority projection `A(D)`

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `classify(p, settings)` from `lib/paths.mjs`; `readLog`, `range` from `lib/records.mjs`; `attempts(log, REQ)` from `lib/check.mjs`; `readAdr`, `queue` from `lib/adr.mjs`; `requirementSet(cwd, slug)` from `lib/spec.mjs`; `readLease` from `lib/lease.mjs`.
- Produces: `kernelFacts(cwd, D) -> facts` (everything below, computed from the repository), `protectedReasons(facts) -> [reason]` (empty means not protected), `authorityProjection(facts) -> A | null` (`null` means incomplete).

`facts` is a plain object: `{ slug, set: [{id, textDigest}], concerns: [{id, valid}], pathClasses: {[path]: class}, attempts: {[REQ]: n}, openObligations: {escalations, findings, defects, breaches}, decisions: [{id, by, read, body}], lease: {action,target}|null }`.

- [ ] **Step 1: Write the failing tests**

```js
import { kernelFacts, protectedReasons, authorityProjection } from '../lib/evaluate.mjs';
import { makeProject } from './helpers/repo.mjs';

describe('protected(D) and A(D)', () => {
  const facts = (over = {}) => ({ slug: 'auth-tokens', set: [{ id: 'AUTH-003', textDigest: 'sha256:' + 'a'.repeat(64) }],
    concerns: [{ id: 'AUTH-003', valid: true }], pathClasses: { 'src/auth/rotate.mjs': 'source' }, attempts: { 'AUTH-003': 1 },
    openObligations: { escalations: 0, findings: 0, defects: 0, breaches: 0 }, decisions: [], lease: { action: 'implement', target: 'AUTH-003' },
    D: normalizeDraft(draft()), ...over });
  test('a clean draft is not protected and projects completely', () => {
    assert.deepEqual(protectedReasons(facts()), []);
    const A = authorityProjection(facts());
    assert.deepEqual(Object.keys(A).sort(), ['attempts', 'cited', 'concerns', 'option_count', 'option_index', 'open_obligations', 'path_counts', 'paths_known', 'protected']);
    assert.equal(A.option_count, 2);
    assert.equal(A.paths_known, true);
  });
  test('each protected class routes to the developer with no call', () => {
    assert.deepEqual(protectedReasons(facts({ pathClasses: { 'migrations/1.sql': 'data' } })), ['data']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { 'docs/spec/auth.md': 'protected' } })), ['contract']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { 'AGENTS.md': 'protected' } })), ['agreement']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { '.cairn/settings.json': 'protected' } })), ['settings']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { '.cairn/mechanisms': 'kernel-managed' } })), ['reserved']);
    assert.deepEqual(protectedReasons(facts({ attempts: { 'AUTH-003': 3 } })), ['fourth-attempt']);
    assert.deepEqual(protectedReasons(facts({ concerns: [{ id: 'scope:src/x.mjs', valid: true }] })), ['scope-ruling']);
    assert.deepEqual(protectedReasons(facts({ D: { ...normalizeDraft(draft()), recommendation: '  ' } })), ['missing-recommendation']);
    assert.deepEqual(protectedReasons(facts({ concerns: [{ id: 'AUTH-999', valid: false }] })), ['incomplete-projection']);
  });
  test('an agent-written cited decision reaches A(D) only as id and read flag', () => {
    const A = authorityProjection(facts({ decisions: [{ id: '01J', by: 'agent', read: false, body: 'long agent prose' }] }));
    assert.deepEqual(A.cited, [{ id: '01J', read: false }]);
    assert.ok(!JSON.stringify(A).includes('long agent prose'));
  });
  test('no named path means unknown', () => {
    const A = authorityProjection(facts({ pathClasses: {}, D: { ...normalizeDraft(draft()), named_paths: [] } }));
    assert.equal(A.paths_known, false);
  });
  test('kernelFacts reads the repository', async () => {
    const { cwd } = await makeProject();
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), commitment: 'none', concerns: [], named_paths: [] }));
    assert.equal(f.lease, null);
    assert.deepEqual(f.openObligations, { escalations: 0, findings: 0, defects: 0, breaches: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `kernelFacts` is not exported.

- [ ] **Step 3: Implement**

```js
import { classify } from './paths.mjs';
import { readLog, range, appendRecord } from './records.mjs';
import { attempts } from './check.mjs';
import { readAdr, queue, adrDigest } from './adr.mjs';
import { requirementSet } from './spec.mjs';
import { readLease } from './lease.mjs';
import { loadSettings } from './settings.mjs';

export async function kernelFacts(cwd, D) {
  const { settings } = loadSettings(cwd);
  const log = await readLog(cwd);
  const r = range(log);
  const slug = r.start ? r.start.payload.slug : null;
  const set = slug ? await requirementSet(cwd, slug) : [];
  const ids = new Set(set.map((x) => x.id));
  const concerns = D.concerns.map((id) => ({ id, valid: id.startsWith('scope:') || ids.has(id) }));
  const pathClasses = Object.fromEntries(D.named_paths.map((p) => [p, classify(p, settings)]));
  const att = Object.fromEntries(D.concerns.filter((id) => ids.has(id)).map((id) => [id, attempts(log, id)]));
  const recs = r.records;
  const answered = new Set(recs.filter((x) => x.kind === 'answer').map((x) => x.payload.escalation));
  const resolved = new Set(recs.filter((x) => x.kind === 'resolution').map((x) => `${x.payload.source}#${x.payload.finding}`));
  const findings = recs.filter((x) => ['review', 'report', 'acceptance'].includes(x.kind))
    .flatMap((x) => (x.payload.findings || []).map((_, i) => `${x.sha}#${i + 1}`)).filter((k) => !resolved.has(k)).length;
  const fixed = new Set(recs.filter((x) => x.kind === 'fix').map((x) => x.payload.item));
  const disposed = new Set(recs.filter((x) => x.kind === 'scope').map((x) => x.payload.breach));
  const openObligations = {
    escalations: recs.filter((x) => x.kind === 'escalation' && !answered.has(x.sha)).length,
    findings,
    defects: recs.filter((x) => x.kind === 'item' && x.payload.kind === 'defect' && !fixed.has(x.sha)).length,
    breaches: recs.filter((x) => x.kind === 'scope-breach' && !disposed.has(x.sha)).length,
  };
  const adr = readAdr(cwd); const unread = new Set(queue(cwd));
  const decisions = D.cited_decisions.map((id) => {
    const line = adr.find((l) => l.kind === 'decision' && l.id === id);
    return line ? { id, by: line.by, read: !unread.has(id), body: line.body, title: line.title } : { id, by: null, read: false, body: null, missing: true };
  });
  return { slug, set, concerns, pathClasses, attempts: att, openObligations, decisions, lease: await readLease(cwd), D, settings };
}

export function protectedReasons(f) {
  const out = [];
  const classes = Object.entries(f.pathClasses);
  if (classes.some(([, c]) => c === 'data')) out.push('data');
  if (classes.some(([p, c]) => c === 'protected' && p.startsWith('docs/spec/'))) out.push('contract');
  if (classes.some(([p, c]) => c === 'protected' && p === 'AGENTS.md')) out.push('agreement');
  if (classes.some(([p, c]) => c === 'protected' && p === '.cairn/settings.json')) out.push('settings');
  if (classes.some(([, c]) => c === 'reserved' || c === 'kernel-managed')) out.push('reserved');
  if (Object.values(f.attempts).some((n) => n >= 3)) out.push('fourth-attempt');
  if (f.concerns.some((c) => c.id.startsWith('scope:'))) out.push('scope-ruling');
  if (!f.D.recommendation.trim()) out.push('missing-recommendation');
  if (authorityProjection(f) === null) out.push('incomplete-projection');
  return out;
}

export function authorityProjection(f) {
  if (f.concerns.some((c) => !c.valid) || f.decisions.some((d) => d.missing)) return null;
  const counts = {};
  for (const c of Object.values(f.pathClasses)) counts[c] = (counts[c] || 0) + 1;
  return {
    concerns: f.concerns.map((c) => c.id),
    option_index: f.D.options.indexOf(f.D.recommendation), option_count: f.D.options.length,
    path_counts: counts, paths_known: f.D.named_paths.length > 0,
    protected: { data: !!counts.data, contract: Object.keys(f.pathClasses).some((p) => p.startsWith('docs/spec/')),
      agreement: 'AGENTS.md' in f.pathClasses, reserved: !!(counts.reserved || counts['kernel-managed']) },
    attempts: f.attempts, open_obligations: f.openObligations,
    cited: f.decisions.filter((d) => d.by !== 'developer').map((d) => ({ id: d.id, read: d.read })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Compute the protected facts and closed authority projection for a draft"
```

---

### Task 5: Contract state, owner state, option state and egress

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `readSnapshot`, `writeWorkspaceSnapshot` from `lib/snapshots.mjs`; `listTree`, `git` from `lib/gitx.mjs`; `matchGlob`, `CREDENTIAL_PATTERNS` from `lib/paths.mjs`; `parseDomainFile` from `lib/spec.mjs`; `readMechanisms` from `lib/mechanisms.mjs`.
- Produces: `contractState(cwd, facts) -> C`, `ownerState(D, C, A) -> object`, `optionState(cwd, D, C, facts) -> {state, excluded: [{path, klass}]}`, `EgressError` (`.klass` in `'network_exclude'|'credential'|'host'|'key'|'output'`).

Owner state carries exactly: the five fields, `options`, `contract` (C), `facts` (A). Nothing else. Option state carries: `rule`, `draft` (D), `contract`, `context`, `facts`, `open_obligations`, `code`.

Code is the lease diff plus every touched file whole, in path order, read from the workspace snapshot tree with `git cat-file` (never the filesystem, so symlinks are link text and never followed). A touched path that matches `network_exclude`, a credential pattern, `.cairn/output/**`, or whose bytes contain the API key value, is never read into the state: the evaluation stops with `EgressError` and its class. A host path (`Host paths:` in a domain header) is never read at all.

- [ ] **Step 1: Write the failing tests**

```js
import { contractState, ownerState, optionState, EgressError, FIVE_FIELDS } from '../lib/evaluate.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('states and egress', () => {
  test('owner state carries the five fields, options, contract, facts and nothing else', () => {
    const D = normalizeDraft(draft()); const C = { rule: POLICY.RULE, keystone: 'k', commitment: 'c', glossary: 'g', requirements: [], decisions: [] };
    const A = authorityProjection({ ...factsFor(D) });
    const s = ownerState(D, C, A);
    assert.deepEqual(Object.keys(s).sort(), [...FIVE_FIELDS, 'options', 'contract', 'facts'].sort());
    assert.ok(!('named_paths' in s) && !('because_paths' in s));
    assert.ok(!JSON.stringify(s).includes('src/auth/rotate.mjs'));
  });
  test('contract state holds only developer-written cited decisions', async () => {
    const { cwd } = await makeProject();
    const f = { ...factsFor(normalizeDraft(draft())), decisions: [
      { id: 'A', by: 'agent', read: true, body: 'agent body' }, { id: 'B', by: 'developer', read: true, body: 'dev body', title: 't' }] };
    const C = await contractState(cwd, f);
    assert.deepEqual(C.decisions.map((d) => d.id), ['B']);
    assert.ok(!JSON.stringify(C).includes('agent body'));
    assert.equal(C.rule, POLICY.RULE);
  });
  test('option state reads touched files from the snapshot in path order and lists omissions', async () => {
    const { cwd } = await makeProject();
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src/b.mjs'), 'export const b = 1;\n'); writeFileSync(join(cwd, 'src/a.mjs'), 'export const a = 1;\n');
    const D = normalizeDraft({ ...draft(), named_paths: ['src/b.mjs', 'src/a.mjs'] });
    const { state, excluded } = await optionState(cwd, D, { rule: POLICY.RULE }, { ...factsFor(D), touched: ['src/b.mjs', 'src/a.mjs'] });
    assert.deepEqual(state.code.files.map((f) => f.path), ['src/a.mjs', 'src/b.mjs']);
    assert.deepEqual(Object.keys(state).sort(), ['code', 'context', 'contract', 'draft', 'facts', 'open_obligations', 'rule']);
    assert.deepEqual(excluded, []); assert.deepEqual(state.code.omitted, []);
  });
  test('excluded classes never enter the state', async () => {
    const { cwd } = await makeProject({ settings: { network_exclude: ['fixtures/private/**'] } });
    for (const [p, klass] of [['fixtures/private/x.json', 'network_exclude'], ['.env', 'credential'], ['keys/id.pem', 'credential'], ['.cairn/output/abc', 'output']]) {
      mkdirSync(join(cwd, p, '..'), { recursive: true }); writeFileSync(join(cwd, p), 'SECRET');
      const D = normalizeDraft({ ...draft(), named_paths: [p] });
      await assert.rejects(optionState(cwd, D, { rule: POLICY.RULE }, { ...factsFor(D), touched: [p] }),
        (e) => e instanceof EgressError && e.klass === klass && !e.message.includes('SECRET'), p);
    }
  });
  test('a file carrying the API key value is class key', async () => {
    process.env.TYPESAFEAI_API_KEY = 'tsk-live-42';
    const { cwd } = await makeProject();
    writeFileSync(join(cwd, 'notes.txt'), 'token tsk-live-42 here');
    const D = normalizeDraft({ ...draft(), named_paths: ['notes.txt'] });
    await assert.rejects(optionState(cwd, D, { rule: POLICY.RULE }, { ...factsFor(D), touched: ['notes.txt'] }), (e) => e.klass === 'key');
    delete process.env.TYPESAFEAI_API_KEY;
  });
  test('a symlink is link text, never its target', async () => {
    const { cwd } = await makeProject();
    writeFileSync(join(cwd, 'real.txt'), 'REAL');
    (await import('node:fs')).symlinkSync('/etc/hostname', join(cwd, 'link'));
    const D = normalizeDraft({ ...draft(), named_paths: ['link'] });
    const { state } = await optionState(cwd, D, { rule: POLICY.RULE }, { ...factsFor(D), touched: ['link'] });
    assert.equal(state.code.files[0].mode, '120000'); assert.equal(state.code.files[0].text, '/etc/hostname');
  });
});
// helper used above and below: facts for a draft with no repository
function factsFor(D) { return { slug: 'auth-tokens', set: [], concerns: D.concerns.map((id) => ({ id, valid: true })), pathClasses: Object.fromEntries(D.named_paths.map((p) => [p, 'source'])),
  attempts: {}, openObligations: { escalations: 0, findings: 0, defects: 0, breaches: 0 }, decisions: [], lease: null, D }; }
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `contractState` is not exported.

- [ ] **Step 3: Implement**

```js
import { readSnapshot, writeWorkspaceSnapshot } from './snapshots.mjs';
import { git, listTree, readRef } from './gitx.mjs';
import { matchGlob } from './paths.mjs';
import { parseDomainFile, parseRoadmap } from './spec.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class EgressError extends Error { constructor(klass, path) { super(`unavailable excluded: ${klass}`); this.klass = klass; this.path = path; } }

function specText(cwd, name) { try { return readFileSync(join(cwd, 'docs/spec', name), 'utf8'); } catch { return ''; } }

export async function contractState(cwd, f) {
  const roadmap = parseRoadmap(specText(cwd, 'roadmap.md'));
  const blocks = readdirSync(join(cwd, 'docs/spec')).filter((n) => n.endsWith('.md') && !['overview.md', 'glossary.md', 'roadmap.md'].includes(n))
    .flatMap((n) => parseDomainFile(specText(cwd, n)).blocks);
  const frozen = new Map(f.set.map((x) => [x.id, x.textDigest]));
  return {
    rule: POLICY.RULE,
    keystone: specText(cwd, 'overview.md'), glossary: specText(cwd, 'glossary.md'),
    commitment: f.slug && roadmap.sections[f.slug] ? { slug: f.slug, requirements: roadmap.sections[f.slug].requirements } : null,
    requirements: blocks.filter((b) => frozen.has(b.id)).map((b) => ({ id: b.id, obligation: b.obligation, falsifier: b.falsifier, text_digest: frozen.get(b.id) })),
    decisions: f.decisions.filter((d) => d.by === 'developer').map((d) => ({ id: d.id, title: d.title, body: d.body })),
  };
}

export function ownerState(D, C, A) {
  const s = {};
  for (const k of FIVE_FIELDS) s[k] = D[k];
  s.options = [...D.options]; s.contract = C; s.facts = A;
  return s;
}

function hostPaths(cwd) {
  try { return readdirSync(join(cwd, 'docs/spec')).flatMap((n) => parseDomainFile(specText(cwd, n)).header.hostPaths || []); } catch { return []; }
}

function egressClass(path, settings, key, bytes) {
  if (settings.network_exclude.some((g) => matchGlob(g, path))) return 'network_exclude';
  if (CREDENTIAL_PATTERNS.some((g) => matchGlob(g, path))) return 'credential';
  if (path.startsWith('.cairn/output/')) return 'output';
  if (key && bytes && bytes.includes(key)) return 'key';
  return null;
}

export async function optionState(cwd, D, C, f) {
  const settings = f.settings ?? loadSettings(cwd).settings;
  const key = process.env.TYPESAFEAI_API_KEY || null;
  for (const h of hostPaths(cwd)) if (D.named_paths.includes(h) || (f.touched || []).includes(h)) throw new EgressError('host', h);
  const ws = f.ws ?? await writeWorkspaceSnapshot(cwd);
  const snap = await readSnapshot(cwd, ws, 'workspace');
  const entries = new Map((await listTree(cwd, snap.tree)).map((e) => [e.path, e]));
  const touched = [...new Set([...(f.touched || []), ...(f.lease ? f.lease.touch || [] : [])])].sort();
  const files = []; const omitted = [];
  for (const p of touched) {
    const klass = egressClass(p, settings, key, null);
    if (klass) throw new EgressError(klass, p);
    const e = entries.get(p);
    if (!e) { omitted.push({ path: p, reason: 'absent' }); continue; }
    const text = (await git(['cat-file', 'blob', e.sha], { cwd })).stdout;
    const late = egressClass(p, settings, key, text);
    if (late) throw new EgressError(late, p);
    files.push({ path: p, mode: e.mode, text });
  }
  const diff = f.lease && f.lease.snapshot ? (await git(['diff', `${(await readSnapshot(cwd, f.lease.snapshot, 'workspace')).tree}`, snap.tree, '--', ...touched], { cwd })).stdout : '';
  if (key && diff.includes(key)) throw new EgressError('key', 'diff');
  const mech = await readMechanisms(cwd);
  const context = {
    mechanisms: Object.fromEntries(Object.entries(mech).filter(([, m]) => (m.definition.requirements || []).some((r) => D.concerns.includes(r)))
      .map(([n, m]) => [n, { command: m.definition.command, inputs: m.definition.inputs, requirements: m.definition.requirements }])),
    decisions: f.decisions.map((d) => ({ id: d.id, by: d.by, read: d.read, title: d.title })),
  };
  return { state: { rule: POLICY.RULE, draft: D, contract: C, context, facts: authorityProjection(f), open_obligations: f.openObligations, code: { diff, files, omitted } }, excluded: [] };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Build the owner and option states and refuse excluded bytes before they are read"
```

---

### Task 6: Requests, size rule and deterministic bytes

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Produces: `buildOptionRequest(settings, state, optionCount) -> request`, `buildOwnerRequest(settings, state) -> request`, `requestBytes(request) -> string` (canonical JSON, the exact bytes sent), `requestDigest(request)`, `sizeCheck(settings, request) -> null | 'oversize'`, `OversizeError`.

Byte-identical requests come from canonical JSON of the request object; `bin/typesafeai.mjs` receives the parsed object and `JSON.stringify`s it, which is canonical for an already-canonical object (sorted keys, no undefined). `sizeCheck` refuses when the request bytes exceed `min(request_cap_bytes, 0.75 * 64000 * 3)` or the state bytes plus the longest question bytes exceed `0.75 * 32000 * 3`.

- [ ] **Step 1: Write the failing tests**

```js
import { buildOptionRequest, buildOwnerRequest, requestBytes, requestDigest, sizeCheck } from '../lib/evaluate.mjs';

describe('requests and size', () => {
  const t = { ...EVALUATOR_DEFAULTS, enabled: true };
  test('option request carries sufficient, per-option triples and observed', () => {
    const r = buildOptionRequest({ typesafeai: t }, { rule: 'r' }, 2);
    assert.equal(r.model, 'jev-1.13.0');
    assert.deepEqual(Object.keys(r.questions), ['sufficient', 'reversible_1', 'contradicts_1', 'outside_1', 'reversible_2', 'contradicts_2', 'outside_2', 'observed']);
    assert.equal(r.questions.reversible_2.type, 'noul');
    assert.equal(r.questions.reversible_2.instructions, 'Can option 2 be reverted without migration, data repair or caller change?');
  });
  test('owner request is one choice with agent and developer', () => {
    const r = buildOwnerRequest({ typesafeai: t }, { question: 'q' });
    assert.deepEqual(Object.keys(r.questions), ['owner']);
    assert.deepEqual(Object.keys(r.questions.owner.criteria), ['agent', 'developer']);
  });
  test('equal input yields byte-identical requests whatever the key order', () => {
    const a = buildOwnerRequest({ typesafeai: t }, { b: 1, a: { d: 2, c: 3 } });
    const b = buildOwnerRequest({ typesafeai: t }, { a: { c: 3, d: 2 }, b: 1 });
    assert.equal(requestBytes(a), requestBytes(b)); assert.equal(requestDigest(a), requestDigest(b));
    assert.equal(JSON.stringify(a), requestBytes(a), 'transport stringify equals canonical bytes');
  });
  test('size rule: cap, 75 percent of 64k request tokens, 75 percent of 32k state tokens', () => {
    const big = (n) => 'x'.repeat(n);
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 1000 } }, buildOwnerRequest({ typesafeai: t }, { q: big(2000) })), 'oversize');
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 64000 } }, buildOwnerRequest({ typesafeai: t }, { q: big(60000) })), null);
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 64000 } }, buildOwnerRequest({ typesafeai: t }, { q: big(72100) })), 'oversize', 'state over 72,000 bytes');
    const r = buildOptionRequest({ typesafeai: { ...t, request_cap_bytes: 64000 } }, { q: big(1000) }, 255);
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 64000 } }, r), null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `buildOptionRequest` is not exported.

- [ ] **Step 3: Implement**

```js
export class OversizeError extends Error { constructor() { super('unavailable oversize'); this.klass = 'oversize'; } }
const Q = Object.fromEntries(POLICY.QUESTIONS.map((q) => [q.id, q]));
const noul = (text) => ({ type: 'noul', instructions: text });

export function buildOptionRequest(settings, state, optionCount) {
  const questions = { sufficient: noul(Q.sufficient.text) };
  for (let n = 1; n <= optionCount; n++) for (const id of ['reversible_n', 'contradicts_n', 'outside_n'])
    questions[id.replace('_n', `_${n}`)] = noul(Q[id].text.replace('option n', `option ${n}`));
  questions.observed = noul(Q.observed.text);
  return JSON.parse(canonicalize({ state, model: settings.typesafeai.model, questions }));
}
export function buildOwnerRequest(settings, state) {
  return JSON.parse(canonicalize({ state, model: settings.typesafeai.model,
    questions: { owner: { type: 'choice', instructions: Q.owner.text, criteria: Q.owner.criteria } } }));
}
export const requestBytes = (r) => canonicalize(r);
export const requestDigest = (r) => sha256(requestBytes(r));

export function sizeCheck(settings, request) {
  const { requestTokens, stateTokens, bytesPerToken, factor } = POLICY.LIMITS;
  const len = (v) => Buffer.byteLength(canonicalize(v));
  const total = len(request);
  const longest = Math.max(...Object.values(request.questions).map(len));
  if (total > Math.min(settings.typesafeai.request_cap_bytes, requestTokens * bytesPerToken * factor)) return 'oversize';
  if (len(request.state) + longest > stateTokens * bytesPerToken * factor) return 'oversize';
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Construct canonical evaluator requests and enforce the size rule"
```

---

### Task 7: The envelope: answer validation and first-match routing

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Produces: `parseAnswers(request, bodyText) -> {answers, usage, model} | {invalid: reason}`, `applyEnvelope(settings, {protectedReasons, unavailable, optionAnswers, ownerAnswer, optionCount}) -> {gates: [{rule, value, pass}], route, rule, option}`.

`route` is `'developer'|'capture'|'agent'`; `rule` is the deciding rule name from the section 10 block; `option` is the captured option index for `capture`. Every gate is evaluated in the block's order and recorded whether or not it decided; a missing or non-numeric value fails closed.

- [ ] **Step 1: Write the failing tests**

```js
import { parseAnswers, applyEnvelope } from '../lib/evaluate.mjs';

describe('envelope', () => {
  const t = { typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true } };
  const opt = (over = {}) => ({ sufficient: 0.9, reversible_1: 0.9, contradicts_1: 0.1, outside_1: 0.1, reversible_2: 0.9, contradicts_2: 0.1, outside_2: 0.1, observed: 0.9, ...over });
  const owner = (agent = 0.9) => ({ choice: agent >= 0.5 ? 'agent' : 'developer', probabilities: { agent, developer: 1 - agent }, confidence: Math.abs(agent - 0.5) * 2 });
  const run = (o, w, extra = {}) => applyEnvelope(t, { protectedReasons: [], unavailable: null, optionAnswers: o, ownerAnswer: w, optionCount: 2, ...extra });

  test('rules decide in order and the first match wins', () => {
    assert.equal(run(opt(), owner()).route, 'agent');
    assert.deepEqual(applyEnvelope(t, { protectedReasons: ['data'], optionAnswers: opt(), ownerAnswer: owner(), optionCount: 2 }).rule, 'protected');
    assert.equal(run(opt(), owner(), { unavailable: 'oversize' }).rule, 'unavailable oversize');
    assert.equal(run(opt(), owner(), { unavailable: 'network' }).rule, 'unavailable network');
    assert.equal(run(opt({ sufficient: 0.69 }), owner()).rule, 'sufficient');
    const cap = run(opt({ outside_2: 0.8 }), owner());
    assert.deepEqual([cap.route, cap.rule, cap.option], ['capture', 'outside', 2]);
    assert.equal(run(opt({ contradicts_1: 0.3 }), owner()).rule, 'contradicts');
    assert.equal(run(opt({ reversible_1: 0.69 }), owner()).rule, 'reversible');
    assert.equal(run(opt({ observed: 0.59 }), owner()).rule, 'observed');
    assert.equal(run(opt({ outside_1: 0.9, contradicts_2: 0.9 }), owner()).rule, 'outside', 'outside precedes contradicts');
    assert.equal(run(opt(), owner(0.7)).rule, 'otherwise');
    assert.equal(run(opt(), { ...owner(), choice: 'developer' }).route, 'developer');
  });
  test('every gate is recorded with its value even after the deciding rule', () => {
    const r = run(opt({ sufficient: 0.1 }), owner());
    assert.deepEqual(r.gates.map((g) => g.rule), ['protected', 'oversize', 'call', 'invalid', 'sufficient', 'outside', 'contradicts', 'reversible', 'observed', 'owner']);
    assert.equal(r.gates.find((g) => g.rule === 'observed').value, 0.9);
  });
  test('missing or invalid values fail closed to the developer', () => {
    assert.equal(run(opt({ observed: undefined }), owner()).rule, 'unavailable invalid');
    assert.equal(run(opt({ reversible_2: 'yes' }), owner()).rule, 'unavailable invalid');
    assert.equal(run(opt({ sufficient: 1.2 }), owner()).rule, 'unavailable invalid');
    assert.equal(run(opt(), { choice: 'agent', probabilities: { agent: 0.7, developer: 0.7 }, confidence: 0.9 }).rule, 'unavailable invalid', 'distribution must sum to 1');
    assert.equal(run(opt(), { choice: 'agent', probabilities: { agent: 0.9, developer: 0.1, other: 0 }, confidence: 0.9 }).rule, 'unavailable invalid', 'unknown option');
    assert.equal(run(opt(), null).rule, 'unavailable invalid');
  });
  test('an option gate can veto but never grant agent authority', () => {
    assert.equal(run(opt({ sufficient: 1, observed: 1 }), owner(0.6)).route, 'developer');
  });
  test('parseAnswers validates shape against the request', () => {
    const req = buildOwnerRequest(t, { q: 1 });
    const ok = parseAnswers(req, '{"model":"jev-1.13.0","answers":{"owner":{"type":"choice","choice":"agent","probabilities":{"agent":0.9,"developer":0.1},"confidence":0.8}},"usage":{"input_tokens":3,"output_tokens":1}}');
    assert.equal(ok.answers.owner.choice, 'agent'); assert.equal(ok.model, 'jev-1.13.0');
    assert.ok(parseAnswers(req, '{"model":"jev-1.13.0","answers":{},"usage":{}}').invalid, 'missing answer');
    assert.ok(parseAnswers(req, '{"model":"jev-1.13.0","answers":{"owner":{"type":"noul","noul":0.5}},"usage":{}}').invalid, 'wrong type');
    assert.ok(parseAnswers(req, 'nope').invalid);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `parseAnswers` is not exported.

- [ ] **Step 3: Implement**

```js
const unit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function parseAnswers(request, bodyText) {
  let body;
  try { body = JSON.parse(bodyText); } catch { return { invalid: 'not json' }; }
  if (!body || typeof body !== 'object' || typeof body.model !== 'string' || !body.answers || typeof body.answers !== 'object') return { invalid: 'shape' };
  const answers = {};
  for (const [id, q] of Object.entries(request.questions)) {
    const a = body.answers[id];
    if (!a || a.type !== q.type) return { invalid: `answer ${id}` };
    if (q.type === 'noul') { if (!unit(a.noul)) return { invalid: `answer ${id} range` }; answers[id] = a.noul; }
    else {
      const opts = Object.keys(q.criteria);
      const p = a.probabilities;
      if (!p || typeof p !== 'object' || Object.keys(p).some((k) => !opts.includes(k)) || opts.some((k) => !unit(p[k]))) return { invalid: `answer ${id} distribution` };
      if (Math.abs(Object.values(p).reduce((s, x) => s + x, 0) - 1) > 1e-6) return { invalid: `answer ${id} sum` };
      if (!opts.includes(a.choice) || !unit(a.confidence)) return { invalid: `answer ${id} choice` };
      answers[id] = { choice: a.choice, probabilities: p, confidence: a.confidence };
    }
  }
  const u = body.usage && typeof body.usage === 'object' ? body.usage : {};
  return { answers, usage: { input_tokens: u.input_tokens ?? null, output_tokens: u.output_tokens ?? null }, model: body.model };
}

function validOwner(w) {
  if (!w || typeof w !== 'object' || !w.probabilities) return false;
  const keys = Object.keys(w.probabilities);
  return keys.length === 2 && keys.includes('agent') && keys.includes('developer') && keys.every((k) => unit(w.probabilities[k]))
    && Math.abs(w.probabilities.agent + w.probabilities.developer - 1) <= 1e-6 && ['agent', 'developer'].includes(w.choice) && unit(w.confidence);
}

export function applyEnvelope(settings, { protectedReasons: prot = [], unavailable = null, optionAnswers: o = {}, ownerAnswer: w = null, optionCount = 0 }) {
  const t = settings.typesafeai; const gates = []; let decided = null;
  const decide = (route, rule, option) => { if (!decided) decided = { route, rule, option: option ?? null }; };
  const g = (rule, value, pass) => gates.push({ rule, value: value === undefined ? null : value, pass });
  g('protected', prot, prot.length === 0); if (prot.length) decide('developer', 'protected');
  g('oversize', unavailable, unavailable !== 'oversize'); if (unavailable === 'oversize') decide('developer', 'unavailable oversize');
  const callFail = unavailable && !['oversize', 'invalid'].includes(unavailable);
  g('call', unavailable, !callFail); if (callFail) decide('developer', `unavailable ${unavailable}`);
  const ids = ['sufficient', 'observed']; for (let n = 1; n <= optionCount; n++) ids.push(`reversible_${n}`, `contradicts_${n}`, `outside_${n}`);
  const invalid = unavailable === 'invalid' || !unavailable && (ids.some((id) => !unit(o[id])) || !validOwner(w));
  g('invalid', invalid ? 'invalid' : null, !invalid); if (invalid) decide('developer', 'unavailable invalid');
  const num = (id) => (unit(o[id]) ? o[id] : NaN);
  g('sufficient', num('sufficient'), num('sufficient') >= t.sufficient_threshold); if (!(num('sufficient') >= t.sufficient_threshold)) decide('developer', 'sufficient');
  const outsideN = [...Array(optionCount)].map((_, i) => i + 1).find((n) => num(`outside_${n}`) >= t.outside_threshold) ?? null;
  g('outside', [...Array(optionCount)].map((_, i) => num(`outside_${i + 1}`)), outsideN === null); if (outsideN !== null) decide('capture', 'outside', outsideN);
  const anyBad = (id, test) => [...Array(optionCount)].map((_, i) => num(`${id}_${i + 1}`)).some((v) => !(test(v)));
  const contradicts = anyBad('contradicts', (v) => v < t.contradicts_ceiling);
  g('contradicts', [...Array(optionCount)].map((_, i) => num(`contradicts_${i + 1}`)), !contradicts); if (contradicts) decide('developer', 'contradicts');
  const reversible = anyBad('reversible', (v) => v >= t.reversible_floor);
  g('reversible', [...Array(optionCount)].map((_, i) => num(`reversible_${i + 1}`)), !reversible); if (reversible) decide('developer', 'reversible');
  g('observed', num('observed'), num('observed') >= t.observed_floor); if (!(num('observed') >= t.observed_floor)) decide('developer', 'observed');
  const agent = validOwner(w) && w.choice === 'agent' && w.confidence >= t.route_confidence;
  g('owner', validOwner(w) ? { choice: w.choice, probabilities: w.probabilities, confidence: w.confidence } : null, agent);
  if (agent) decide('agent', 'owner'); else decide('developer', 'otherwise');
  return { gates, ...decided };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Apply the evaluator envelope in rule order with every gate failing closed"
```

---

### Task 8: `evaluate()`: identity, intent, calls, result, shadow, recovery

**Files:**
- Modify: `lib/evaluate.mjs`
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `appendRecord`, `readLog`, `decodeRecord` from `lib/records.mjs`; `writeWorkspaceSnapshot` from `lib/snapshots.mjs`; `writeTreeFromPaths`, `readRef`, `git`, `catCommit` from `lib/gitx.mjs`; `adrDigest`, `queue`, `readAdr` from `lib/adr.mjs`; `loadSettings`; `b64url` from `lib/canon.mjs`; `post` from `bin/typesafeai.mjs`.
- Produces: `evaluate(cwd, draft, {transport}) -> {route, evaluationSha, would_route, rule, intentSha}`; `recoverEvaluation(cwd) -> evaluationSha | null`; `callsDisabled(cwd, log) -> reason | null`. `transport` defaults to `post`; tests pass `(request) => Promise<{status, body, model}>` or a thrower with `.klass`.

Order inside `evaluate`:

1. `recoverEvaluation` first: an intent in the open range with no final evaluation is finalized (indeterminate calls, developer route) before anything else.
2. Normalize the draft; read settings. Disabled, or `callsDisabled`, or route mode without calibration: no records, `{route: 'developer', rule: 'disabled'|'unread-decisions'|'uncalibrated', evaluationSha: null}`.
3. Capture identity **before any write**: `tree = writeTreeFromPaths` of the workspace (`exclude: ['.git', '.cairn/output']`), `logHead = readRef(refs/cairn/log)`, `adr = adrDigest`, `draft = draftDigest`, `settings = digest`. Then write the workspace snapshot and check its tree equals `tree` (refuse otherwise).
4. Facts, protected reasons, states, requests, size check, egress. A protected draft, oversize or egress writes the intent with the affected digests null, no call records, and a final evaluation.
5. Append `evaluation-intent`. Option call: append `evaluation-call` (`response`, `failure` or `indeterminate`) with the raw body bytes as base64url. Owner call only when every option gate passes; otherwise the owner call record is `not_sent`.
6. `applyEnvelope`; append `evaluation` with `mode`, `route` (actual: in shadow always `developer`), `would_route` (shadow only), `rule`, gates, call SHAs.

- [ ] **Step 1: Write the failing tests**

```js
import { evaluate, recoverEvaluation, callsDisabled } from '../lib/evaluate.mjs';
import { readLog, decodeRecord } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { unb64url } from '../lib/canon.mjs';
import { appendDecision } from '../lib/adr.mjs';
import { start, done } from '../lib/commitment.mjs';

const optionBody = (n = 2) => JSON.stringify({ model: 'jev-1.13.0', answers: Object.fromEntries([
  ['sufficient', { type: 'noul', noul: 0.9 }], ['observed', { type: 'noul', noul: 0.9 }],
  ...[...Array(n)].flatMap((_, i) => [[`reversible_${i + 1}`, { type: 'noul', noul: 0.9 }], [`contradicts_${i + 1}`, { type: 'noul', noul: 0.1 }], [`outside_${i + 1}`, { type: 'noul', noul: 0.1 }]])]),
  usage: { input_tokens: 10, output_tokens: 2 } });
const ownerBody = (agent = 0.95) => JSON.stringify({ model: 'jev-1.13.0', answers: { owner: { type: 'choice', choice: agent >= 0.5 ? 'agent' : 'developer',
  probabilities: { agent, developer: +(1 - agent).toFixed(6) }, confidence: 0.9 } }, usage: { input_tokens: 10, output_tokens: 2 } });
const transport = (bodies, seen = []) => async (req) => { seen.push(req); const b = bodies.shift(); if (b instanceof Error) throw b; return { status: 200, body: b, model: 'jev-1.13.0' }; };
async function repoWithCommitment(mode = 'shadow') {
  const { cwd } = await makeProject({ settings: { typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true, mode } }, files: { 'docs/spec/roadmap.md': 'Current: auth-tokens\n\n## auth-tokens\n\nRequirements: AUTH-003\n' } });
  await start(cwd, 'auth-tokens');
  return cwd;
}
const kinds = async (cwd) => (await readLog(cwd)).map((r) => r.kind);

describe('evaluate', () => {
  test('shadow: intent precedes calls, option then owner, final record carries would_route and the developer keeps authority', async () => {
    const cwd = await repoWithCommitment();
    const seen = [];
    const r = await evaluate(cwd, draft(), { transport: transport([optionBody(), ownerBody()], seen) });
    assert.deepEqual([r.route, r.would_route, r.rule], ['developer', 'agent', 'owner']);
    const log = await readLog(cwd);
    assert.deepEqual(log.slice(-4).map((x) => x.kind), ['evaluation-intent', 'evaluation-call', 'evaluation-call', 'evaluation']);
    const [intent, c1, c2, ev] = log.slice(-4);
    assert.equal(seen.length, 2); assert.ok('sufficient' in seen[0].questions); assert.ok('owner' in seen[1].questions);
    assert.equal(intent.payload.option_request, requestDigest(seen[0])); assert.equal(intent.payload.owner_request, requestDigest(seen[1]));
    assert.equal(c1.payload.call, 'option'); assert.equal(c1.payload.outcome, 'response');
    assert.equal(Buffer.from(unb64url(c1.payload.raw)).toString(), optionBody(), 'raw bytes kept verbatim');
    assert.equal(c2.payload.model, 'jev-1.13.0');
    assert.equal(ev.payload.intent, intent.sha); assert.deepEqual([ev.payload.option_call, ev.payload.owner_call], [c1.sha, c2.sha]);
    assert.equal(ev.payload.gates.length, 10);
    for (const rec of log.slice(-4)) assert.doesNotThrow(() => decodeRecord(rec), 'round-trips through the plan 01 decoder');
    assert.equal(ev.payload.ws.length, 40);
  });
  test('identity is captured before any write and equal identity yields byte-identical requests', async () => {
    const cwd = await repoWithCommitment();
    const a = []; await evaluate(cwd, draft(), { transport: transport([optionBody(), ownerBody()], a) });
    const b = []; await evaluate(cwd, draft(), { transport: transport([optionBody(), ownerBody()], b) });
    assert.equal(requestBytes(a[0]), requestBytes(b[0])); assert.equal(requestBytes(a[1]), requestBytes(b[1]));
    const log = await readLog(cwd); const intents = log.filter((x) => x.kind === 'evaluation-intent');
    assert.equal(intents[0].payload.draft_digest, intents[1].payload.draft_digest);
    assert.equal(intents[0].payload.log_head, log[log.indexOf(intents[0]) - 1].sha, 'log head is the record before the intent');
  });
  test('the owner call never happens after a failed option gate', async () => {
    const cwd = await repoWithCommitment();
    const seen = [];
    const r = await evaluate(cwd, draft(), { transport: transport([optionBody().replace('"sufficient":{"type":"noul","noul":0.9}', '"sufficient":{"type":"noul","noul":0.2}'), ownerBody()], seen) });
    assert.equal(seen.length, 1); assert.equal(r.rule, 'sufficient');
    const log = await readLog(cwd);
    assert.equal(log.at(-2).payload.call, 'owner'); assert.equal(log.at(-2).payload.outcome, 'not_sent');
  });
  test('protected draft: intent with null digests, no calls, developer', async () => {
    const cwd = await repoWithCommitment();
    const r = await evaluate(cwd, { ...draft(), named_paths: ['migrations/1.sql'] }, { transport: async () => { throw new Error('must not be called'); } });
    assert.equal(r.rule, 'protected');
    const log = await readLog(cwd);
    assert.deepEqual(log.slice(-2).map((x) => x.kind), ['evaluation-intent', 'evaluation']);
    assert.equal(log.at(-2).payload.owner_request, null); assert.equal(log.at(-2).payload.option_request, null);
  });
  test('transport failure classes route to the developer with the class recorded', async () => {
    for (const klass of ['network', 'auth', 'overloaded', 'context', 'nokey']) {
      const cwd = await repoWithCommitment();
      const e = new Error(klass); e.klass = klass;
      const r = await evaluate(cwd, draft(), { transport: transport([e]) });
      assert.equal(r.rule, `unavailable ${klass}`);
      const call = (await readLog(cwd)).findLast((x) => x.kind === 'evaluation-call' && x.payload.call === 'option');
      assert.equal(call.payload.outcome, 'failure'); assert.equal(call.payload.failure_class, klass);
    }
  });
  test('a bad answer never permits capture or agent routing', async () => {
    const cwd = await repoWithCommitment();
    const r = await evaluate(cwd, draft(), { transport: transport([optionBody(), '{"model":"jev-1.13.0","answers":{"owner":{"type":"choice","choice":"agent","probabilities":{"agent":2,"developer":-1},"confidence":1}},"usage":{}}']) });
    assert.equal(r.would_route, 'developer'); assert.equal(r.rule, 'unavailable invalid');
  });
  test('an intent without a result is recovered as indeterminate, never retried', async () => {
    const cwd = await repoWithCommitment();
    const crash = new Error('crash'); // no klass: an unknown outcome
    await assert.rejects(evaluate(cwd, draft(), { transport: transport([crash]) }));
    let log = await readLog(cwd);
    assert.equal(log.at(-1).kind, 'evaluation-intent');
    let calls = 0;
    const sha = await recoverEvaluation(cwd, { transport: async () => { calls++; } });
    log = await readLog(cwd);
    assert.equal(calls, 0); assert.equal(log.at(-1).sha, sha); assert.equal(log.at(-1).payload.route, 'developer'); assert.equal(log.at(-1).payload.rule, 'indeterminate');
    assert.equal(log.at(-2).payload.outcome, 'indeterminate'); assert.equal(log.at(-2).payload.raw, null);
    assert.equal(await recoverEvaluation(cwd), null, 'idempotent');
  });
  test('evaluate recovers a pending intent before starting a new one', async () => {
    const cwd = await repoWithCommitment();
    await assert.rejects(evaluate(cwd, draft(), { transport: transport([new Error('crash')]) }));
    await evaluate(cwd, draft(), { transport: transport([optionBody(), ownerBody()]) });
    assert.deepEqual((await kinds(cwd)).slice(-6), ['evaluation-call', 'evaluation', 'evaluation-intent', 'evaluation-call', 'evaluation-call', 'evaluation']);
  });
  test('unread Consequential decisions at Done disable calls next commitment', async () => {
    const cwd = await repoWithCommitment();
    await appendDecision(cwd, { kind: 'decision', level: 'Consequential', by: 'agent', title: 't', rests_on: [], wrong_if: 'w', body: 'b', base_snap: 'a'.repeat(40), evaluation: null });
    await done(cwd, 'auth-tokens');
    await start(cwd, 'auth-tokens-2');
    assert.match(callsDisabled(cwd, await readLog(cwd)), /unread/);
    let called = false;
    const r = await evaluate(cwd, { ...draft(), commitment: 'auth-tokens-2' }, { transport: async () => { called = true; } });
    assert.equal(called, false); assert.equal(r.rule, 'unread-decisions'); assert.equal(r.route, 'developer');
  });
  test('disabled evaluator writes nothing and returns the developer route', async () => {
    const { cwd } = await makeProject();
    const before = (await readLog(cwd)).length;
    const r = await evaluate(cwd, draft(), { transport: async () => { throw new Error('no'); } });
    assert.equal(r.rule, 'disabled'); assert.equal((await readLog(cwd)).length, before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `evaluate` is not exported.

- [ ] **Step 3: Implement**

```js
import { writeTreeFromPaths, catCommit } from './gitx.mjs';
import { post } from '../bin/typesafeai.mjs';

const REF_LOG = 'refs/cairn/log';
const nullSha = null;

async function recordDate(cwd, sha) { return (await git(['show', '-s', '--format=%cI', sha], { cwd })).stdout.trim(); }

export function callsDisabled(cwd, log) {
  const lastDone = log.findLast((r) => r.kind === 'done');
  if (!lastDone) return null;
  const adr = readAdr(cwd); const unread = new Set(queue(cwd));
  const before = adr.filter((l) => l.kind === 'decision' && unread.has(l.id) && l.ts <= lastDone.payload.ts);
  return before.length ? `unread Consequential decisions at Done: ${before.map((l) => l.id).join(', ')}` : null;
}

async function captureIdentity(cwd, D, settingsDigest) {
  const tree = await writeTreeFromPaths(cwd, { paths: ['.'], exclude: ['.git', '.cairn/output'] });
  const logHead = await readRef(cwd, REF_LOG);
  return { tree, log_head: logHead, adr_digest: adrDigest(cwd), draft_digest: draftDigest(D), settings_digest: settingsDigest };
}

async function appendCall(cwd, slug, intentSha, call, requestDigestValue, outcome, extra) {
  return appendRecord(cwd, 'evaluation-call', slug, { intent: intentSha, call, request_digest: requestDigestValue, outcome,
    model: null, raw: null, failure_class: null, answers: null, usage: null, ...extra });
}

async function attemptCall(cwd, slug, intentSha, call, request, transport) {
  const digest = requestDigest(request);
  let res;
  try { res = await transport(request); } catch (e) {
    if (!e || typeof e.klass !== 'string') throw e;           // unknown outcome: leave the intent open for recovery
    await appendCall(cwd, slug, intentSha, call, digest, 'failure', { failure_class: e.klass });
    return { unavailable: e.klass };
  }
  const raw = b64url(Buffer.from(res.body, 'utf8'));
  const parsed = parseAnswers(request, res.body);
  if (parsed.invalid) { await appendCall(cwd, slug, intentSha, call, digest, 'response', { model: res.model, raw }); return { unavailable: 'invalid' }; }
  const sha = await appendCall(cwd, slug, intentSha, call, digest, 'response', { model: parsed.model, raw, answers: parsed.answers, usage: parsed.usage });
  return { sha, answers: parsed.answers };
}

async function finalize(cwd, slug, intentSha, ws, settings, env, calls, extra = {}) {
  const shadow = settings.typesafeai.mode === 'shadow';
  const payload = { intent: intentSha, ws, mode: settings.typesafeai.mode, gates: env.gates, rule: env.rule, option: env.option ?? null,
    route: shadow ? 'developer' : env.route, would_route: shadow ? env.route : null, option_call: calls.option ?? null, owner_call: calls.owner ?? null, ...extra };
  const sha = await appendRecord(cwd, 'evaluation', slug, payload);
  return { route: payload.route, would_route: payload.would_route, rule: payload.rule, option: payload.option, evaluationSha: sha, intentSha };
}

export async function recoverEvaluation(cwd) {
  const log = await readLog(cwd); const r = range(log);
  const recs = r.start ? r.records : log;
  const intent = recs.findLast((x) => x.kind === 'evaluation-intent');
  if (!intent || recs.some((x) => x.kind === 'evaluation' && x.payload.intent === intent.sha)) return null;
  const { settings } = loadSettings(cwd);
  const slug = intent.target; const calls = {};
  for (const call of ['option', 'owner']) {
    const existing = recs.find((x) => x.kind === 'evaluation-call' && x.payload.intent === intent.sha && x.payload.call === call);
    const planned = intent.payload[`${call}_request`];
    if (existing) { calls[call] = existing.sha; continue; }
    calls[call] = await appendCall(cwd, slug, intent.sha, call, planned, planned ? 'indeterminate' : 'not_sent', {});
  }
  const env = { gates: [{ rule: 'call', value: 'indeterminate', pass: false }], route: 'developer', rule: 'indeterminate', option: null };
  return (await finalize(cwd, slug, intent.sha, intent.payload.ws, settings, env, calls)).evaluationSha;
}

export async function evaluate(cwd, draft, { transport = post } = {}) {
  await recoverEvaluation(cwd);
  const D = normalizeDraft(draft);
  const { settings, digest: settingsDigest } = loadSettings(cwd);
  const t = settings.typesafeai;
  const none = (rule) => ({ route: 'developer', would_route: null, rule, option: null, evaluationSha: null, intentSha: null });
  if (!t || !t.enabled) return none('disabled');
  const log = await readLog(cwd);
  const disabled = callsDisabled(cwd, log); if (disabled) return none('unread-decisions');
  if (t.mode === 'route' && !(await currentCalibration(cwd, settings, log))) return none('uncalibrated');

  const id = await captureIdentity(cwd, D, settingsDigest);
  const ws = await writeWorkspaceSnapshot(cwd);
  if ((await readSnapshot(cwd, ws, 'workspace')).tree !== id.tree) throw new Error('cairn: workspace changed during evaluation');
  const f = await kernelFacts(cwd, D); f.ws = ws; f.touched = [...new Set([...D.named_paths, ...(f.lease ? f.lease.touch || [] : [])])];
  const slug = f.slug ?? D.commitment;
  const prot = protectedReasons(f);
  const intentBase = { ...id, ws, policy_digest: policyDigest(settings), owner_request: null, option_request: null };
  const A = authorityProjection(f);

  if (prot.length) {
    const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, intentBase);
    return finalize(cwd, slug, intentSha, ws, settings, applyEnvelope(settings, { protectedReasons: prot, optionCount: D.options.length }), {});
  }
  const C = await contractState(cwd, f);
  let optionReq, ownerReq, unavailable = null, excludedClass = null;
  try {
    const { state } = await optionState(cwd, D, C, f);
    optionReq = buildOptionRequest(settings, state, D.options.length);
    ownerReq = buildOwnerRequest(settings, ownerState(D, C, A));
    unavailable = sizeCheck(settings, optionReq) || sizeCheck(settings, ownerReq);
  } catch (e) { if (!(e instanceof EgressError)) throw e; unavailable = 'excluded'; excludedClass = e.klass; }
  const intentSha = await appendRecord(cwd, 'evaluation-intent', slug, { ...intentBase,
    option_request: unavailable ? null : requestDigest(optionReq), owner_request: unavailable ? null : requestDigest(ownerReq) });
  if (unavailable) {
    const env = applyEnvelope(settings, { unavailable, optionCount: D.options.length });
    if (unavailable === 'excluded') env.rule = 'unavailable excluded';
    return finalize(cwd, slug, intentSha, ws, settings, env, {}, { excluded_class: excludedClass });
  }
  const calls = {};
  const opt = await attemptCall(cwd, slug, intentSha, 'option', optionReq, transport);
  calls.option = opt.sha ?? (await readLog(cwd)).at(-1).sha;
  let env = applyEnvelope(settings, { unavailable: opt.unavailable ?? null, optionAnswers: opt.answers ?? {}, ownerAnswer: null, optionCount: D.options.length });
  const optionGatesPass = !opt.unavailable && env.gates.filter((g) => g.rule !== 'owner' && g.rule !== 'invalid').every((g) => g.pass)
    && !env.gates.find((g) => g.rule === 'invalid' && g.value === 'invalid');
  if (!optionGatesPass) {
    calls.owner = await appendCall(cwd, slug, intentSha, 'owner', requestDigest(ownerReq), 'not_sent', {});
    return finalize(cwd, slug, intentSha, ws, settings, env, calls);
  }
  const own = await attemptCall(cwd, slug, intentSha, 'owner', ownerReq, transport);
  calls.owner = own.sha ?? (await readLog(cwd)).at(-1).sha;
  env = applyEnvelope(settings, { unavailable: own.unavailable ?? null, optionAnswers: opt.answers, ownerAnswer: own.answers ? own.answers.owner : null, optionCount: D.options.length });
  return finalize(cwd, slug, intentSha, ws, settings, env, calls);
}
```

`currentCalibration` is defined in Task 9; until then export a stub `export async function currentCalibration() { return null; }` so route-mode tests in this task return `uncalibrated`. The `invalid` gate in `applyEnvelope` treats a null owner answer as invalid, so the option-only pass check above ignores that gate and reads the option answers directly.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs tests/evaluate.test.mjs
git commit -m "Evaluate a draft with intent, per-call and result records, shadow mode and crash recovery"
```

---

### Task 9: Calibration: exact bound, `cairn calibrate`, route-mode refusal

**Files:**
- Modify: `lib/evaluate.mjs`, `lib/cli.mjs` (add the `calibrate` command)
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: answer records from plan 09 (`payload.owner` is the optional owner label, `payload.escalation` the escalation SHA); escalation records (`payload.evaluation` the evaluation SHA or null).
- Produces: `upperBound(errors, n, alpha = 0.05) -> number` (one-sided exact binomial, Clopper-Pearson upper limit), `calibrate(cwd) -> {pass, sample, errors, bound, calibrationSha}`, `currentCalibration(cwd, settings, log) -> record | null`, `assertRouteMode(cwd) -> void` (throws `RouteModeError` with a `cairn: ` message).

Definition of the bound: the smallest `p` such that `P(X <= errors | n, p) <= alpha`, found by bisection on the exact binomial CDF. For zero errors it is `1 - alpha^(1/n)`: 60 cases give 0.0487 (passes 0.05), 30 give 0.0950 (fails).

Denominator: shadow evaluations whose `policy_digest` equals the current policy digest, whose `would_route` is `agent`, whose escalation (the one naming that evaluation) has an answer carrying `owner` in `agent|developer`. An error is `owner: developer`. `unknown` is skipped. Superseded ADR lines are never read as labels.

- [ ] **Step 1: Write the failing tests**

```js
import { upperBound, calibrate, assertRouteMode, currentCalibration } from '../lib/evaluate.mjs';
import { escalate, answer } from '../lib/escalate.mjs';

describe('calibration', () => {
  test('exact one-sided bound', () => {
    assert.ok(Math.abs(upperBound(0, 60) - (1 - Math.pow(0.05, 1 / 60))) < 1e-9);
    assert.ok(upperBound(0, 60) < 0.05); assert.ok(upperBound(0, 30) > 0.05);
    assert.ok(upperBound(1, 60) > upperBound(0, 60)); assert.ok(upperBound(0, 1000) < upperBound(0, 100));
    assert.equal(upperBound(5, 5), 1);
  });
  async function labelled(cwd, n, ownerLabel, agentProb = 0.95) {
    for (let i = 0; i < n; i++) {
      const r = await evaluate(cwd, { ...draft(), question: `q${i}` }, { transport: transport([optionBody(), ownerBody(agentProb)]) });
      const sha = await escalate(cwd, { ...draft(), question: `q${i}`, evaluation: r.evaluationSha });
      await answer(cwd, sha, 'ok', '', { owner: ownerLabel });
    }
  }
  test('60 zero-error predicted-agent cases pass at 0.05; 30 cannot', async () => {
    let cwd = await repoWithCommitment();
    await labelled(cwd, 30, 'agent');
    let c = await calibrate(cwd);
    assert.deepEqual([c.pass, c.sample, c.errors], [false, 30, 0]); assert.ok(c.bound > 0.05);
    await labelled(cwd, 30, 'agent');
    c = await calibrate(cwd);
    assert.deepEqual([c.pass, c.sample, c.errors], [true, 60, 0]);
    const rec = (await readLog(cwd)).at(-1);
    assert.equal(rec.kind, 'calibration'); assert.equal(rec.payload.result, 'pass'); assert.equal(rec.payload.predicted_agent, 60);
    assert.deepEqual(rec.payload.criterion, { max_false_downgrade: 0.05, min_calibration_agent_predictions: 60 });
    assert.doesNotThrow(() => decodeRecord(rec));
  });
  test('denominator is predicted-agent labelled cases only; unknown and predicted-developer are excluded', async () => {
    const cwd = await repoWithCommitment();
    await labelled(cwd, 3, 'agent'); await labelled(cwd, 2, 'unknown'); await labelled(cwd, 4, 'agent', 0.2);
    await labelled(cwd, 1, 'developer');
    const c = await calibrate(cwd);
    assert.deepEqual([c.sample, c.errors], [4, 1]);
  });
  test('a policy change resets calibration', async () => {
    const cwd = await repoWithCommitment();
    await labelled(cwd, 60, 'agent');
    assert.equal((await calibrate(cwd)).pass, true);
    const { settings } = loadSettings(cwd);
    settings.typesafeai.route_confidence = 0.85;
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    assert.equal(await currentCalibration(cwd, settings, await readLog(cwd)), null);
    assert.equal((await calibrate(cwd)).sample, 0);
  });
  test('route mode is refused without a matching passing calibration and with an alias', async () => {
    const cwd = await repoWithCommitment('route');
    await assert.rejects(assertRouteMode(cwd), /cairn: route mode requires a passing calibration/);
    const { settings } = loadSettings(cwd);
    settings.typesafeai.model = 'jev-latest';
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    await assert.rejects(assertRouteMode(cwd), /alias/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `upperBound` is not exported.

- [ ] **Step 3: Implement**

```js
export class RouteModeError extends Error {}

function binomCdf(k, n, p) {
  let term = Math.pow(1 - p, n), sum = term;          // P(X=0)
  for (let i = 1; i <= k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term; }
  return sum;
}
export function upperBound(errors, n, alpha = 0.05) {
  if (n <= 0 || errors >= n) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (binomCdf(errors, n, mid) > alpha) lo = mid; else hi = mid; }
  return hi;
}

function labelledShadow(log, policy) {
  const answers = new Map(log.filter((r) => r.kind === 'answer' && r.payload.owner).map((r) => [r.payload.escalation, r.payload.owner]));
  const byEval = new Map(log.filter((r) => r.kind === 'escalation' && r.payload.evaluation).map((r) => [r.payload.evaluation, r.sha]));
  const intents = new Map(log.filter((r) => r.kind === 'evaluation-intent').map((r) => [r.sha, r.payload]));
  return log.filter((r) => r.kind === 'evaluation' && r.payload.mode === 'shadow' && r.payload.would_route === 'agent'
    && intents.get(r.payload.intent)?.policy_digest === policy)
    .map((r) => answers.get(byEval.get(r.sha))).filter((l) => l === 'agent' || l === 'developer');
}

export async function calibrate(cwd) {
  const { settings } = loadSettings(cwd); const t = settings.typesafeai;
  const log = await readLog(cwd); const policy = policyDigest(settings);
  const labels = labelledShadow(log, policy);
  const sample = labels.length, errors = labels.filter((l) => l === 'developer').length;
  const bound = upperBound(errors, sample);
  const pass = sample >= t.min_calibration_agent_predictions && bound <= t.max_false_downgrade;
  const head = await readRef(cwd, REF_LOG);
  const slug = range(log).start?.payload.slug ?? 'none';
  const calibrationSha = await appendRecord(cwd, 'calibration', slug, { policy_digest: policy, through: head, predicted_agent: sample,
    false_downgrades: errors, bound, criterion: { max_false_downgrade: t.max_false_downgrade, min_calibration_agent_predictions: t.min_calibration_agent_predictions },
    result: pass ? 'pass' : 'fail' });
  return { pass, sample, errors, bound, calibrationSha };
}

export async function currentCalibration(cwd, settings, log) {
  const policy = policyDigest(settings);
  return log.findLast((r) => r.kind === 'calibration' && r.payload.policy_digest === policy && r.payload.result === 'pass') ?? null;
}

export async function assertRouteMode(cwd) {
  const { settings } = loadSettings(cwd); const t = settings.typesafeai;
  if (!t || t.mode !== 'route') return;
  if (!isVersionedModel(t.model)) throw new RouteModeError(`cairn: route mode needs a versioned model id, not an alias (${t.model})`);
  if (!(await currentCalibration(cwd, settings, await readLog(cwd))))
    throw new RouteModeError(`cairn: route mode requires a passing calibration for policy ${policyDigest(settings)}`);
}
```

Remove the Task 8 stub of `currentCalibration`. In `lib/cli.mjs` add to the command table:

```js
calibrate: {
  help: 'cairn calibrate            record a calibration over labelled shadow evaluations',
  async run(cwd) {
    const { calibrate } = await import('./evaluate.mjs');
    const c = await calibrate(cwd);
    process.stdout.write(`calibration ${c.pass ? 'pass' : 'fail'}: ${c.sample} predicted-agent cases, ${c.errors} false downgrades, bound ${c.bound.toFixed(4)}\n`);
    return c.pass ? 0 : 1;
  },
},
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/evaluate.test.mjs tests/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs lib/cli.mjs tests/evaluate.test.mjs
git commit -m "Record calibration with the exact one-sided bound and refuse uncalibrated route mode"
```

---

### Task 10: Route mode conversion in `cairn escalate` and `cairn decide --consequential`

**Files:**
- Modify: `lib/cli.mjs` (the `escalate` and `decide` commands)
- Test: `tests/evaluate.test.mjs`

**Interfaces:**
- Consumes: `escalate(cwd, draft)` from `lib/escalate.mjs`; `appendDecision(cwd, line)` from `lib/adr.mjs`; `item(cwd, {kind, slug, source, body})`, `outside(cwd, itemSha, reason)` from `lib/commitment.mjs`; `evaluate`, `assertRouteMode` from this plan.
- Produces: `routeDraft(cwd, draft, {level, transport}) -> {route, evaluationSha, written: {kind, sha}}` exported from `lib/evaluate.mjs` and used by both commands. It is the only place a route becomes a record; the evaluator itself never writes decisions, items or escalations.

Behavior, from section 8 Escalation: evaluation disabled or outside the envelope: the requested command uses the kernel level (`escalate` writes an escalation; `decide --consequential` appends and queues a decision). Shadow: the same, with the evaluation SHA carried on the record (escalation `payload.evaluation`, decision line `evaluation`). Route mode with a passing calibration: `agent` writes and queues the Consequential decision with `evaluation`; `capture` writes a backlog item for the recommended option and an outside record naming the evaluation; `developer` writes and holds the escalation. Only Consequential is evaluated; a Blocking request is never evaluated.

- [ ] **Step 1: Write the failing tests**

```js
import { routeDraft } from '../lib/evaluate.mjs';
import { readAdr } from '../lib/adr.mjs';

describe('route mode conversion', () => {
  async function calibrated() {
    const cwd = await repoWithCommitment('shadow');
    await labelled(cwd, 60, 'agent'); await calibrate(cwd);
    const { settings } = loadSettings(cwd); settings.typesafeai.mode = 'route';
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    return cwd;
  }
  test('shadow: escalation is written and holds; the evaluation is referenced', async () => {
    const cwd = await repoWithCommitment('shadow');
    const r = await routeDraft(cwd, draft(), { level: 'Consequential', transport: transport([optionBody(), ownerBody()]) });
    assert.equal(r.written.kind, 'escalation');
    const esc = (await readLog(cwd)).findLast((x) => x.kind === 'escalation');
    assert.equal(esc.payload.evaluation, r.evaluationSha);
  });
  test('route: agent queues a Consequential decision naming the evaluation', async () => {
    const cwd = await calibrated();
    const r = await routeDraft(cwd, draft(), { level: 'Consequential', transport: transport([optionBody(), ownerBody()]) });
    assert.equal(r.written.kind, 'decision');
    const line = readAdr(cwd).findLast((l) => l.kind === 'decision');
    assert.equal(line.evaluation, r.evaluationSha); assert.equal(line.by, 'agent');
  });
  test('route: outside captures the recommended option with an outside record', async () => {
    const cwd = await calibrated();
    const body = optionBody().replace('"outside_1":{"type":"noul","noul":0.1}', '"outside_1":{"type":"noul","noul":0.9}');
    const r = await routeDraft(cwd, draft(), { level: 'Consequential', transport: transport([body]) });
    assert.equal(r.written.kind, 'outside');
    const log = await readLog(cwd);
    assert.equal(log.at(-2).kind, 'item'); assert.equal(log.at(-2).payload.kind, 'backlog'); assert.equal(log.at(-1).payload.evaluation, r.evaluationSha);
  });
  test('route: a failed gate holds the escalation; no agent route past a failed gate', async () => {
    const cwd = await calibrated();
    const body = optionBody().replace('"observed":{"type":"noul","noul":0.9}', '"observed":{"type":"noul","noul":0.1}');
    const r = await routeDraft(cwd, draft(), { level: 'Consequential', transport: transport([body, ownerBody()]) });
    assert.equal(r.written.kind, 'escalation'); assert.equal(r.route, 'developer');
    assert.equal(readAdr(cwd).filter((l) => l.kind === 'decision' && l.evaluation === r.evaluationSha).length, 0);
  });
  test('Blocking is never evaluated', async () => {
    const cwd = await calibrated();
    let called = false;
    const r = await routeDraft(cwd, draft(), { level: 'Blocking', transport: async () => { called = true; } });
    assert.equal(called, false); assert.equal(r.evaluationSha, null); assert.equal(r.written.kind, 'escalation');
  });
  test('route mode with a stale calibration refuses the command', async () => {
    const cwd = await calibrated();
    const { settings } = loadSettings(cwd); settings.typesafeai.outside_threshold = 0.9;
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    await assert.rejects(routeDraft(cwd, draft(), { level: 'Consequential', transport: transport([]) }), /cairn: route mode requires a passing calibration/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/evaluate.test.mjs`
Expected: FAIL, `routeDraft` is not exported.

- [ ] **Step 3: Implement**

```js
import { escalate as writeEscalation } from './escalate.mjs';
import { appendDecision } from './adr.mjs';
import { item, outside } from './commitment.mjs';

export async function routeDraft(cwd, draft, { level, transport = post } = {}) {
  const D = normalizeDraft(draft);
  await assertRouteMode(cwd);
  const hold = async (evaluationSha) => ({ route: 'developer', evaluationSha, written: { kind: 'escalation', sha: await writeEscalation(cwd, { ...D, evaluation: evaluationSha }) } });
  if (level !== 'Consequential') return hold(null);
  const r = await evaluate(cwd, D, { transport });
  const ws = r.evaluationSha ? (await readLog(cwd)).findLast((x) => x.sha === r.evaluationSha).payload.ws : await writeWorkspaceSnapshot(cwd);
  if (r.route === 'agent') {
    const id = await appendDecision(cwd, { kind: 'decision', level: 'Consequential', by: 'agent', title: D.question, rests_on: D.cited_decisions,
      wrong_if: D.if_wrong, body: `${D.recommendation}\n\n${D.because}`, base_snap: ws, evaluation: r.evaluationSha });
    return { route: 'agent', evaluationSha: r.evaluationSha, written: { kind: 'decision', sha: id } };
  }
  if (r.route === 'capture') {
    const itemSha = await item(cwd, { kind: 'backlog', slug: D.commitment, source: D.concerns[0] ?? null, body: `${D.question}\n\nOption ${r.option}: ${D.options[r.option - 1]}` });
    const sha = await outside(cwd, itemSha, `evaluator: option ${r.option} outside the frozen set`, { evaluation: r.evaluationSha });
    return { route: 'capture', evaluationSha: r.evaluationSha, written: { kind: 'outside', sha } };
  }
  return hold(r.evaluationSha);
}
```

`outside(cwd, itemSha, reason)` from plan 06 gains an optional fourth argument `{evaluation}` written into the outside record's optional evaluation SHA (the section 4 table already lists that field). In `lib/cli.mjs`, the `escalate` command body becomes `routeDraft(cwd, draft, {level: flags.level ?? 'Blocking', transport})` and `decide --consequential` becomes `routeDraft(cwd, draft, {level: 'Consequential', transport})`; both print the written record kind and SHA. `transport` is `post` from `bin/typesafeai.mjs` unless the command carries `--transport-module <path>`, in which case it is that module's default export: `const transport = flags['transport-module'] ? (await import(pathToFileURL(resolve(flags['transport-module'])).href)).default : post;`. The flag exists for plan 14's fixtures; `--help` lists it as test-only, and a test asserts that with the flag no socket is opened.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS, every suite.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluate.mjs lib/cli.mjs lib/commitment.mjs tests/evaluate.test.mjs
git commit -m "Route Consequential drafts through the evaluator in shadow and calibrated route mode"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| Only `bin/typesafeai.mjs` sends requests; reads `TYPESAFEAI_API_KEY`, never stores it (10, 13.19) | 1 |
| Settings block refusals: threshold outside [0,1], enabled without model, cap above 64,000, weights and code_tiers refused, unknown values fail closed (2) | 2 |
| Route mode requires a versioned model ID, not an alias (2) | 2, 9 |
| `mode: route` without a current passing calibration is refused (2, 10) | 9, 10 |
| The policy digest covers model, schemas, questions, request construction, code rule, envelope, router, thresholds, caps and egress; a change resets calibration (10) | 3, 9 |
| The canonical draft D and its ten fields (10) | 3 |
| protected(D): data, contract, agreement, reserved/settings write, fourth attempt, scope ruling, missing recommendation, incomplete authority projection -> developer, no call (10, 13.26) | 4, 8 |
| A(D) is a closed projection of validated IDs, enums, booleans and counts; an agent-written cited decision reaches the owner call only as id and read flag (10) | 4, 5 |
| C(c): rule, keystone, commitment, glossary, frozen requirements, developer-written cited decisions (10) | 5 |
| Owner state carries the five fields and options, C(c), A(D) and nothing else; option state may carry untrusted content (10) | 5 |
| Option code is the lease diff and complete touched files in path order; reads do not follow symlinks; omissions listed; no tier (10, 13.51) | 5 |
| Requests omit network_exclude, credential and host bytes, keys and command output; a would-be inclusion is recorded as unavailable excluded with its path class (10, 13.39) | 5, 8 |
| The six question ids and types (10) | 3, 6 |
| The option fan-out runs first; the owner call only after every option gate passes (10, 13.18) | 8 |
| Input identity `(workspace tree, log head, ADR digest, draft digest, settings digest)`, anchored by a workspace snapshot; equal identity and policy yield byte-identical requests (10) | 6, 8 |
| request_cap_bytes, three bytes per token, refuse above 75 percent of 64k and of 32k state plus longest question (10) | 6 |
| API context error routes to the developer (10) | 1, 8 |
| First matching rule wins; missing or invalid facts fail closed; nouls are gates; option gates veto but never grant (10) | 7 |
| Invalid answer: bad schema, type, range or Choice distribution -> unavailable invalid (10) | 7 |
| Intent before I/O with every constructible request digest; a no-call digest is null (2, 4, 10, 13.45) | 8 |
| Each attempted call records digest, resolved model, raw bytes as base64url, parsed answer, usage (4, 10) | 8 |
| Final evaluation names intent, calls, gates in order, route, deciding rule; would_route in shadow (10) | 8 |
| Unknown crash outcome becomes indeterminate, not retried, routed to the developer; recovery never calls again (4, 10, 13.45) | 8 |
| Shadow is the default; actual authority stays with the developer (10, 13.27) | 8, 10 |
| Unread Consequential decisions at Done disable calls next commitment (10) | 8 |
| The developer labels agent, developer or unknown; only the first two calibrate; supersessions are not labels (10) | 9 |
| Denominator is labelled cases predicted agent; a false downgrade is one labelled developer; one-sided 95 percent exact binomial upper bound meets both limits; 60 zero-error cases pass, 30 cannot (2, 10, 13.42) | 9 |
| Calibration record fields (4) | 9 |
| Section 8 Escalation: disabled or outside the envelope uses the kernel level; shadow still the developer's; route mode may convert a Consequential escalation into a queued decision or a capture; no other level evaluated (8, 13.23) | 10 |
| Falsifiers: missing final evaluation, prior intent or call record (8); untrusted owner state (5); nondeterministic requests (6, 8); bad answer permitting capture or agent routing (7, 8); agent route past a failed gate (7, 10); route mode without calibration or wrong denominator (9, 10); retried or invented ambiguous result (8); egress of excluded bytes (5); weights, scores or code tiers affecting routing or settings (2, 3) | as listed |

Left to other plans:

- "An accepted protected realization" falsifier and the realization check (section 8, Decisions and realization): plan 06 (`build DECISION`) compares the base and realized snapshots; this plan only carries the evaluation SHA on the decision line.
- The section 4 record schema table entries for the four evaluation kinds are defined in plan 01's schema table; this plan's tests round-trip its records through `decodeRecord`.
- `cairn answer --owner <label>` writing `payload.owner`: plan 09 writes the answer record; this plan reads the field.
- Wake naming `recover` for a pending evaluator intent: plan 08 reads the log; `evaluate()` and `cairn escalate` also recover before new work, so the loop never depends on wake for it.
- The adversary projection's exclusion manifest (section 9) shares the credential patterns but is plan 10's.
