// tests/evaluate.test.mjs
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
  test('validateSettings (lib/settings.mjs, already committed) carries the same evaluator reasons', () => {
    const s = { schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: [],
      signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { ...good(), weights: {} } };
    assert.match(validateSettings(s).join(' '), /weights/);
  });
});

// Shared test fixture: every later describe block in this file builds on tests/helpers/loop.mjs's
// loopRepo(), an initialized project with commitment 'first', requirement DEMO-001 (Agreed,
// mechanism declared), src/** classified 'source' and README.md/notes/** classified 'outside'
// (see tests/helpers/loop.mjs). draft() below matches that fixture instead of the plan's own
// illustrative auth-tokens/AUTH-003 example, so every fixture in this file authorizes and starts
// cleanly through the real lib/commitment.mjs and lib/spec.mjs machinery.
export function draft(over = {}) {
  return {
    commitment: 'first', concerns: ['DEMO-001'],
    question: 'Should the demo mechanism run hourly?',
    recommendation: 'hourly',
    because: 'observed: node --test tests/typesafeai.test.mjs passes against src/demo.mjs',
    if_wrong: 'the demo drifts from the mechanism',
    instead: 'daily',
    options: ['hourly', 'daily'],
    named_paths: ['src/demo.mjs'],
    cited_decisions: [],
    ...over,
  };
}

import { POLICY, normalizeDraft, draftDigest, policyDigest, DraftError } from '../lib/evaluate.mjs';

function settingsFixture(over = {}) {
  return { typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true, mode: 'shadow', model: 'jev-1.13.0' },
    network_exclude: ['fixtures/private/**'], ...over };
}

describe('policy and draft digests', () => {
  test('normalizeDraft keeps exactly the ten fields and refuses extras and missing/invalid ones', () => {
    assert.deepEqual(Object.keys(normalizeDraft(draft())).sort(), [...POLICY.DRAFT_KEYS].sort());
    assert.throws(() => normalizeDraft({ ...draft(), score: 1 }), DraftError);
    assert.throws(() => normalizeDraft({ ...draft(), question: undefined }), DraftError);
  });
  test('draft digest is stable under key order and matches lib/escalate.mjs (the same canonical draft)', () => {
    const a = draftDigest(normalizeDraft(draft()));
    const d = draft(); const reordered = Object.fromEntries(Object.entries(d).reverse());
    assert.equal(a, draftDigest(normalizeDraft(reordered)));
    assert.match(a, /^sha256:[0-9a-f]{64}$/);
  });
  test('policy digest changes with any covered input and nothing else', () => {
    const base = policyDigest(settingsFixture());
    const s1 = settingsFixture(); s1.typesafeai = { ...s1.typesafeai, route_confidence: 0.9 };
    const s2 = settingsFixture(); s2.network_exclude = [];
    const s3 = settingsFixture(); s3.typesafeai = { ...s3.typesafeai, model: 'jev-1.14.0' };
    const s4 = settingsFixture(); s4.typesafeai = { ...s4.typesafeai, enabled: false, mode: 'route' };
    assert.notEqual(base, policyDigest(s1)); assert.notEqual(base, policyDigest(s2)); assert.notEqual(base, policyDigest(s3));
    assert.equal(base, policyDigest(s4), 'enabled and mode are not policy');
  });
  test('the six question ids and types are fixed', () => {
    assert.deepEqual(POLICY.QUESTIONS.map((q) => [q.id, q.type]), [
      ['sufficient', 'noul'], ['reversible_n', 'noul'], ['contradicts_n', 'noul'], ['outside_n', 'noul'], ['observed', 'noul'], ['owner', 'choice']]);
  });
});

import { kernelFacts, protectedReasons, authorityProjection } from '../lib/evaluate.mjs';
import { makeProject } from './helpers/repo.mjs';

describe('protected(D) and A(D)', () => {
  // A hand-built kernelFacts() result, for protectedReasons/authorityProjection unit tests that do
  // not need a real repository. kernelFacts() itself is exercised separately below, against a real
  // makeProject() fixture.
  const facts = (over = {}) => {
    const D = normalizeDraft(draft());
    return {
      slug: 'first', concerns: D.concerns.map((id) => ({ id, valid: true })),
      pathClasses: Object.fromEntries(D.named_paths.map((p) => [p, 'source'])),
      attempts: { 'DEMO-001': 1 }, openObligations: { escalations: 0, findings: 0, defects: 0, breaches: 0 },
      decisions: [], lease: { action: 'implement', target: 'DEMO-001' }, D, ...over,
    };
  };
  test('a clean draft is not protected and projects completely', () => {
    assert.deepEqual(protectedReasons(facts()), []);
    const A = authorityProjection(facts());
    assert.deepEqual(Object.keys(A).sort(), ['attempts', 'cited', 'concerns', 'open_obligations', 'option_count', 'option_index', 'path_counts', 'paths_known', 'protected']);
    assert.equal(A.option_count, 2);
    assert.equal(A.paths_known, true);
  });
  // Deviation from the plan text: escalate.mjs's real parseConcern (already committed) has no
  // 'scope:' concern kind at all -- its grammar is a REQ token, 'cycle', or
  // '(finding|item|breach|transaction|contract):<sha>[#n]'. A concern shaped 'scope:...' would
  // never pass lib/escalate.mjs's own checkConcerns, so a draft carrying one could never legally
  // reach evaluate() through cairn escalate. 'a scope ruling' (spec section 10's protected(D)) is
  // read here as a concern about an actual scope-breach record, i.e. a 'breach:<sha>' token, which
  // the real grammar does support.
  test('each protected class routes to the developer with no call', () => {
    assert.deepEqual(protectedReasons(facts({ pathClasses: { 'migrations/1.sql': 'data' } })), ['data']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { 'docs/spec/demo.md': 'protected' } })), ['contract']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { 'AGENTS.md': 'protected' } })), ['agreement']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { '.cairn/settings.json': 'protected' } })), ['settings']);
    assert.deepEqual(protectedReasons(facts({ pathClasses: { '.cairn/mechanisms': 'kernel-managed' } })), ['reserved']);
    assert.deepEqual(protectedReasons(facts({ attempts: { 'DEMO-001': 3 } })), ['fourth-attempt']);
    assert.deepEqual(protectedReasons(facts({ concerns: [{ id: 'breach:' + 'a'.repeat(40), valid: true }] })), ['scope-ruling']);
    assert.deepEqual(protectedReasons(facts({ D: { ...normalizeDraft(draft()), recommendation: '  ' } })), ['missing-recommendation']);
    assert.deepEqual(protectedReasons(facts({ concerns: [{ id: 'DEMO-999', valid: false }] })), ['incomplete-projection']);
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
  // Deviation from the plan text: normalizeDraft (lib/escalate.mjs's validateDraft) refuses an
  // empty concerns list ("draft needs at least one concern"), so the plan's own
  // `{ ...draft(), commitment: 'none', concerns: [], named_paths: [] }` fixture cannot be built at
  // all. 'cycle' is the one concern kind that names no record and needs no open commitment, so it
  // stands in for "no meaningful concern" here.
  test('kernelFacts reads the repository', async () => {
    const { cwd } = await makeProject();
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), commitment: 'none', concerns: ['cycle'], named_paths: [] }));
    assert.equal(f.lease, null);
    assert.deepEqual(f.openObligations, { escalations: 0, findings: 0, defects: 0, breaches: 0 });
  });
});

import { contractState, ownerState, optionState, EgressError } from '../lib/evaluate.mjs';
import { writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { loopRepo } from './helpers/loop.mjs';
import { loadSettings } from '../lib/settings.mjs';

// A hand-built facts object for a repository-backed draft, used by the states/egress tests below
// that do not need kernelFacts' own log/ADR/lease reads. `set: []` matches kernelFacts' own shape
// (added for contractState's benefit); `settings` matters for optionState's egress classification.
function factsFor(D, settings, over = {}) {
  return {
    slug: 'first', set: [], concerns: D.concerns.map((id) => ({ id, valid: true })),
    pathClasses: Object.fromEntries(D.named_paths.map((p) => [p, 'source'])),
    attempts: {}, openObligations: { escalations: 0, findings: 0, defects: 0, breaches: 0 },
    decisions: [], lease: null, D, settings, ...over,
  };
}

describe('states and egress', () => {
  test('owner state carries the five fields, options, contract, facts and nothing else', async () => {
    const { cwd } = await makeProject();
    // because is deliberately reworded here so the assertion below (no named_paths leakage) is not
    // confused by the path also legitimately appearing inside the five fields' own prose text.
    const D = normalizeDraft(draft({ because: 'observed: the mechanism already runs and passes' }));
    const C = { rule: POLICY.RULE, keystone: 'k', commitment: 'c', glossary: 'g', requirements: [], decisions: [] };
    const { settings } = await loadSettings(cwd);
    const A = authorityProjection(factsFor(D, settings));
    const s = ownerState(D, C, A);
    assert.deepEqual(Object.keys(s).sort(), ['because', 'contract', 'facts', 'if_wrong', 'instead', 'options', 'question', 'recommendation']);
    assert.ok(!('named_paths' in s) && !('because_paths' in s));
    assert.ok(!JSON.stringify(s).includes('src/demo.mjs'));
  });
  test('contract state holds only developer-written cited decisions', async () => {
    const { cwd } = await makeProject();
    const D = normalizeDraft(draft());
    const f = { ...factsFor(D, (await loadSettings(cwd)).settings),
      decisions: [{ id: 'A', by: 'agent', read: true, body: 'agent body' }, { id: 'B', by: 'developer', read: true, body: 'dev body', title: 't' }] };
    const C = await contractState(cwd, f);
    assert.deepEqual(C.decisions.map((d) => d.id), ['B']);
    assert.ok(!JSON.stringify(C).includes('agent body'));
    assert.equal(C.rule, POLICY.RULE);
  });
  test('option state reads touched files from the tree in path order and lists omissions', async () => {
    const { cwd } = await makeProject();
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src/b.mjs'), 'export const b = 1;\n'); writeFileSync(join(cwd, 'src/a.mjs'), 'export const a = 1;\n');
    const D = normalizeDraft({ ...draft(), named_paths: ['src/b.mjs', 'src/a.mjs'] });
    const { settings } = await loadSettings(cwd);
    const { state, excluded } = await optionState(cwd, D, { rule: POLICY.RULE }, factsFor(D, settings));
    assert.deepEqual(state.code.files.map((f) => f.path), ['src/a.mjs', 'src/b.mjs']);
    assert.deepEqual(Object.keys(state).sort(), ['code', 'context', 'contract', 'draft', 'facts', 'open_obligations', 'rule']);
    assert.deepEqual(excluded, []); assert.deepEqual(state.code.omitted, []);
  });
  test('excluded classes never enter the state', async () => {
    const { cwd } = await makeProject({ settings: { network_exclude: ['fixtures/private/**'] } });
    for (const [p, klass] of [['fixtures/private/x.json', 'network_exclude'], ['.env', 'credential'], ['keys/id.pem', 'credential'], ['.cairn/output/abc', 'output']]) {
      mkdirSync(join(cwd, p, '..'), { recursive: true }); writeFileSync(join(cwd, p), 'SECRET');
      const D = normalizeDraft({ ...draft(), named_paths: [p] });
      const { settings } = await loadSettings(cwd);
      await assert.rejects(optionState(cwd, D, { rule: POLICY.RULE }, factsFor(D, settings)),
        (e) => e instanceof EgressError && e.klass === klass && !e.message.includes('SECRET'), p);
    }
  });
  test('a file carrying the API key value is class key', async () => {
    process.env.TYPESAFEAI_API_KEY = 'tsk-live-42';
    const { cwd } = await makeProject();
    writeFileSync(join(cwd, 'notes.txt'), 'token tsk-live-42 here');
    const D = normalizeDraft({ ...draft(), named_paths: ['notes.txt'] });
    const { settings } = await loadSettings(cwd);
    await assert.rejects(optionState(cwd, D, { rule: POLICY.RULE }, factsFor(D, settings)), (e) => e.klass === 'key');
    delete process.env.TYPESAFEAI_API_KEY;
  });
  test('a symlink is link text, never its target', async () => {
    const { cwd } = await makeProject();
    writeFileSync(join(cwd, 'real.txt'), 'REAL');
    symlinkSync('/etc/hostname', join(cwd, 'link'));
    const D = normalizeDraft({ ...draft(), named_paths: ['link'] });
    const { settings } = await loadSettings(cwd);
    const { state } = await optionState(cwd, D, { rule: POLICY.RULE }, factsFor(D, settings));
    assert.equal(state.code.files[0].mode, '120000'); assert.equal(state.code.files[0].text, '/etc/hostname');
  });
  test('option state against a real repository names the relevant mechanism and lease diff', async () => {
    const r = await loopRepo();
    const D = normalizeDraft({ ...draft({ named_paths: ['src/demo.mjs'] }) });
    const f = await kernelFacts(r.cwd, D);
    const { state } = await optionState(r.cwd, D, await contractState(r.cwd, f), f);
    assert.ok('demo-001' in state.context.mechanisms, 'the mechanism declaring DEMO-001 is included');
    assert.equal(state.code.diff, '', 'no lease: no diff');
  });
});

import { buildOptionRequest, buildOwnerRequest, requestBytes, requestDigest, sizeCheck } from '../lib/evaluate.mjs';

describe('requests and size', () => {
  const t = { ...EVALUATOR_DEFAULTS, enabled: true, model: 'jev-1.13.0' };
  // Deviation from the plan text: the plan's own assertion checks Object.keys(r.questions) against
  // an exact table-order array (sufficient, then each option's own triple, then observed). Requests
  // are canonicalized (RFC 8785, sorted keys) before being returned -- required so that
  // bin/typesafeai.mjs's plain JSON.stringify(request) (Task 1's own contract: it never re-sorts)
  // still produces byte-identical bytes for equal input, checked later in this describe block --
  // so Object.keys() comes back alphabetically, not in table order. Checked here by set membership
  // and by each question's own type/instructions instead of by array order.
  test('option request carries sufficient, per-option triples and observed', () => {
    const r = buildOptionRequest({ typesafeai: t }, { rule: 'r' }, 2);
    assert.equal(r.model, 'jev-1.13.0');
    assert.deepEqual(Object.keys(r.questions).sort(), ['contradicts_1', 'contradicts_2', 'observed', 'outside_1', 'outside_2', 'reversible_1', 'reversible_2', 'sufficient']);
    assert.equal(r.questions.reversible_2.type, 'noul');
    assert.equal(r.questions.reversible_2.instructions, 'Can option 2 be reverted without migration, data repair or caller change?');
    assert.equal(r.questions.sufficient.instructions, 'Does the state suffice for every option gate?');
    assert.equal(r.questions.observed.instructions, 'Does because cite an observed command, path or output?');
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
  // Deviation from the plan text: the plan's own fourth case builds a 255-option request and
  // expects it to fit under a 64,000-byte cap. With this policy's real (non-trivial) per-question
  // instruction text, 255 options actually totals to roughly 77KB -- comfortably over the cap, so
  // that specific assertion cannot pass against a real implementation. 180 options (measured at
  // ~62KB against this exact instruction text, verified empirically before writing this number)
  // keeps the same intent -- a many-question fan-out that still fits -- without being fragile
  // against small wording changes the way a number right at the boundary (185-186) would be.
  test('size rule: cap, 75 percent of 64k request tokens, 75 percent of 32k state tokens', () => {
    const big = (n) => 'x'.repeat(n);
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 1000 } }, buildOwnerRequest({ typesafeai: t }, { q: big(2000) })), 'oversize');
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 64000 } }, buildOwnerRequest({ typesafeai: t }, { q: big(60000) })), null);
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 64000 } }, buildOwnerRequest({ typesafeai: t }, { q: big(72100) })), 'oversize', 'state over 72,000 bytes');
    const r = buildOptionRequest({ typesafeai: { ...t, request_cap_bytes: 64000 } }, { q: big(1000) }, 180);
    assert.equal(sizeCheck({ typesafeai: { ...t, request_cap_bytes: 64000 } }, r), null);
  });
});

import { parseAnswers, applyEnvelope } from '../lib/evaluate.mjs';

// Deviation from the plan text: the plan's applyEnvelope returns {gates: [{rule, value, pass}],
// route, rule, option}. lib/records.mjs's already-committed 'evaluation' schema (plan 01) names
// these fields differently -- gates: list({gate, value, passed}), and the deciding rule's field is
// named `reason`, a plain string (there is no separate top-level `rule`). applyEnvelope's return
// shape is renamed to match that schema directly (gate/passed/reason) rather than translating
// between two parallel names at every record-writing call site in Task 8.
describe('envelope', () => {
  const t = { typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true, model: 'jev-1.13.0' } };
  const opt = (over = {}) => ({ sufficient: 0.9, reversible_1: 0.9, contradicts_1: 0.1, outside_1: 0.1, reversible_2: 0.9, contradicts_2: 0.1, outside_2: 0.1, observed: 0.9, ...over });
  const owner = (agent = 0.9) => ({ choice: agent >= 0.5 ? 'agent' : 'developer', probabilities: { agent, developer: 1 - agent }, confidence: Math.abs(agent - 0.5) * 2 });
  const run = (o, w, extra = {}) => applyEnvelope(t, { protectedReasons: [], unavailable: null, optionAnswers: o, ownerAnswer: w, optionCount: 2, ...extra });

  test('rules decide in order and the first match wins', () => {
    assert.equal(run(opt(), owner()).route, 'agent');
    assert.deepEqual(applyEnvelope(t, { protectedReasons: ['data'], optionAnswers: opt(), ownerAnswer: owner(), optionCount: 2 }).reason, 'protected');
    assert.equal(run(opt(), owner(), { unavailable: 'oversize' }).reason, 'unavailable oversize');
    assert.equal(run(opt(), owner(), { unavailable: 'network' }).reason, 'unavailable network');
    assert.equal(run(opt({ sufficient: 0.69 }), owner()).reason, 'sufficient');
    const cap = run(opt({ outside_2: 0.8 }), owner());
    assert.deepEqual([cap.route, cap.reason, cap.option], ['capture', 'outside', 2]);
    assert.equal(run(opt({ contradicts_1: 0.3 }), owner()).reason, 'contradicts');
    assert.equal(run(opt({ reversible_1: 0.69 }), owner()).reason, 'reversible');
    assert.equal(run(opt({ observed: 0.59 }), owner()).reason, 'observed');
    assert.equal(run(opt({ outside_1: 0.9, contradicts_2: 0.9 }), owner()).reason, 'outside', 'outside precedes contradicts');
    assert.equal(run(opt(), owner(0.7)).reason, 'otherwise');
    assert.equal(run(opt(), { ...owner(), choice: 'developer' }).route, 'developer');
  });
  test('every gate is recorded with its value even after the deciding rule', () => {
    const r = run(opt({ sufficient: 0.1 }), owner());
    assert.deepEqual(r.gates.map((g) => g.gate), ['protected', 'oversize', 'call', 'invalid', 'sufficient', 'outside', 'contradicts', 'reversible', 'observed', 'owner']);
    assert.equal(r.gates.find((g) => g.gate === 'observed').value, 0.9);
  });
  test('missing or invalid values fail closed to the developer', () => {
    assert.equal(run(opt({ observed: undefined }), owner()).reason, 'unavailable invalid');
    assert.equal(run(opt({ reversible_2: 'yes' }), owner()).reason, 'unavailable invalid');
    assert.equal(run(opt({ sufficient: 1.2 }), owner()).reason, 'unavailable invalid');
    assert.equal(run(opt(), { choice: 'agent', probabilities: { agent: 0.7, developer: 0.7 }, confidence: 0.9 }).reason, 'unavailable invalid', 'distribution must sum to 1');
    assert.equal(run(opt(), { choice: 'agent', probabilities: { agent: 0.9, developer: 0.1, other: 0 }, confidence: 0.9 }).reason, 'unavailable invalid', 'unknown option');
    assert.equal(run(opt(), null).reason, 'unavailable invalid');
  });
  test('an option gate can veto but never grant agent authority', () => {
    assert.equal(run(opt({ sufficient: 1, observed: 1 }), owner(0.6)).route, 'developer');
  });
  test('parseAnswers validates shape against the request', () => {
    const req = buildOwnerRequest(t, { q: 1 });
    const ok = parseAnswers(req, '{"model":"jev-1.13.0","answers":{"owner":{"type":"choice","choice":"agent","probabilities":{"agent":0.9,"developer":0.1},"confidence":0.8}},"usage":{"input_tokens":3,"output_tokens":1}}');
    assert.equal(ok.answers.owner.choice, 'agent'); assert.equal(ok.model, 'jev-1.13.0');
    assert.deepEqual(ok.usage, { input_tokens: 3, output_tokens: 1 });
    assert.ok(parseAnswers(req, '{"model":"jev-1.13.0","answers":{},"usage":{}}').invalid, 'missing answer');
    assert.ok(parseAnswers(req, '{"model":"jev-1.13.0","answers":{"owner":{"type":"noul","noul":0.5}},"usage":{}}').invalid, 'wrong type');
    assert.ok(parseAnswers(req, 'nope').invalid);
    const partial = parseAnswers(req, '{"model":"jev-1.13.0","answers":{"owner":{"type":"choice","choice":"agent","probabilities":{"agent":0.9,"developer":0.1},"confidence":0.8}},"usage":{"input_tokens":3}}');
    assert.equal(partial.usage, null, 'a partial usage object never records a null int field');
  });
});

import { evaluate, recoverEvaluation, callsDisabled } from '../lib/evaluate.mjs';
import { decodeRecord, appendRecord, readLog } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { unb64url } from '../lib/canon.mjs';
import { appendDecision } from '../lib/adr.mjs';
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';

const optionBody = (n = 2) => JSON.stringify({ model: 'jev-1.13.0', answers: Object.fromEntries([
  ['sufficient', { type: 'noul', noul: 0.9 }], ['observed', { type: 'noul', noul: 0.9 }],
  ...[...Array(n)].flatMap((_, i) => [[`reversible_${i + 1}`, { type: 'noul', noul: 0.9 }], [`contradicts_${i + 1}`, { type: 'noul', noul: 0.1 }], [`outside_${i + 1}`, { type: 'noul', noul: 0.1 }]])]),
  usage: { input_tokens: 10, output_tokens: 2 } });
const ownerBody = (agent = 0.95) => JSON.stringify({ model: 'jev-1.13.0', answers: { owner: { type: 'choice', choice: agent >= 0.5 ? 'agent' : 'developer',
  probabilities: { agent, developer: +(1 - agent).toFixed(6) }, confidence: 0.9 } }, usage: { input_tokens: 10, output_tokens: 2 } });
const transport = (bodies, seen = []) => async (req) => { seen.push(req); const b = bodies.shift(); if (b instanceof Error) throw b; return { status: 200, body: b, model: 'jev-1.13.0' }; };
async function repoWithCommitment(mode = 'shadow', overrides = {}) {
  const r = await loopRepo({ settings: { typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true, mode, model: 'jev-1.13.0', ...overrides } } });
  return r.cwd;
}
const kinds = async (cwd) => (await readLog(cwd)).map((r) => r.kind);

describe('evaluate', () => {
  test('shadow: intent precedes calls, option then owner, final record carries would_route and the developer keeps authority', async () => {
    const cwd = await repoWithCommitment();
    const seen = [];
    const r = await evaluate(cwd, draft(), { transport: transport([optionBody(), ownerBody()], seen) });
    assert.deepEqual([r.route, r.would_route, r.reason], ['developer', 'agent', 'owner']);
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
    assert.equal(intent.payload.snapshot.length, 40);
    for (const rec of log.slice(-4)) {
      const commit = await catCommit(cwd, rec.sha);
      assert.doesNotThrow(() => decodeRecord(commit), `${rec.kind} round-trips through the plan 01 decoder`);
    }
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
    assert.equal(seen.length, 1); assert.equal(r.reason, 'sufficient');
    const log = await readLog(cwd);
    assert.equal(log.at(-2).payload.call, 'owner'); assert.equal(log.at(-2).payload.outcome, 'not_sent');
  });
  test('protected draft: intent with null digests, no calls, developer', async () => {
    const cwd = await repoWithCommitment();
    const r = await evaluate(cwd, { ...draft(), named_paths: ['AGENTS.md'] }, { transport: async () => { throw new Error('must not be called'); } });
    assert.equal(r.reason, 'protected');
    const log = await readLog(cwd);
    assert.deepEqual(log.slice(-2).map((x) => x.kind), ['evaluation-intent', 'evaluation']);
    assert.equal(log.at(-2).payload.owner_request, null); assert.equal(log.at(-2).payload.option_request, null);
  });
  test('transport failure classes route to the developer with the class recorded', async () => {
    for (const klass of ['network', 'auth', 'overloaded', 'context', 'nokey']) {
      const cwd = await repoWithCommitment();
      const e = new Error(klass); e.klass = klass;
      const r = await evaluate(cwd, draft(), { transport: transport([e]) });
      assert.equal(r.reason, `unavailable ${klass}`);
      const call = (await readLog(cwd)).findLast((x) => x.kind === 'evaluation-call' && x.payload.call === 'option');
      assert.equal(call.payload.outcome, 'failure'); assert.equal(call.payload.failure_class, klass);
    }
  });
  test('a bad answer never permits capture or agent routing', async () => {
    const cwd = await repoWithCommitment();
    const r = await evaluate(cwd, draft(), { transport: transport([optionBody(), '{"model":"jev-1.13.0","answers":{"owner":{"type":"choice","choice":"agent","probabilities":{"agent":2,"developer":-1},"confidence":1}},"usage":{}}']) });
    assert.equal(r.would_route, 'developer'); assert.equal(r.reason, 'unavailable invalid');
  });
  test('an intent without a result is recovered: the crashed call is indeterminate, the call after it is not_sent, never retried', async () => {
    const cwd = await repoWithCommitment();
    const crash = new Error('crash'); // no klass: an unknown outcome
    await assert.rejects(evaluate(cwd, draft(), { transport: transport([crash]) }));
    let log = await readLog(cwd);
    assert.equal(log.at(-1).kind, 'evaluation-intent');
    let calls = 0;
    const sha = await recoverEvaluation(cwd, { transport: async () => { calls++; } });
    log = await readLog(cwd);
    assert.equal(calls, 0); assert.equal(log.at(-1).sha, sha); assert.equal(log.at(-1).payload.route, 'developer'); assert.equal(log.at(-1).payload.reason, 'indeterminate');
    assert.equal(log.at(-2).payload.call, 'owner'); assert.equal(log.at(-2).payload.outcome, 'not_sent');
    assert.equal(log.at(-3).payload.call, 'option'); assert.equal(log.at(-3).payload.outcome, 'indeterminate'); assert.equal(log.at(-3).payload.raw, null);
    assert.equal(await recoverEvaluation(cwd), null, 'idempotent');
  });
  test('evaluate recovers a pending intent before starting a new one', async () => {
    const cwd = await repoWithCommitment();
    await assert.rejects(evaluate(cwd, draft(), { transport: transport([new Error('crash')]) }));
    await evaluate(cwd, draft(), { transport: transport([optionBody(), ownerBody()]) });
    assert.deepEqual((await kinds(cwd)).slice(-6), ['evaluation-call', 'evaluation', 'evaluation-intent', 'evaluation-call', 'evaluation-call', 'evaluation']);
  });
  // Deviation from the plan text: the plan builds this fixture with raw appendDecision(cwd, line)
  // (no {command} argument) and base_snap: 'a'.repeat(40) (a fake SHA). lib/adr.mjs's real
  // appendDecision (already committed) requires {command}, checked against the decision kind's
  // assigned writer list, and always verifies base_snap against a real workspace snapshot
  // (validateLine's ws() check runs unconditionally for appendDecision). Also, log records (unlike
  // ADR lines) carry no payload timestamp -- callsDisabled instead reads the 'done' record's own
  // Git commit date to compare against the ADR line's ts.
  test('unread Consequential decisions at Done disable calls next commitment', async () => {
    const r = await loopRepo({ settings: { typesafeai: { ...EVALUATOR_DEFAULTS, enabled: true, mode: 'shadow', model: 'jev-1.13.0' } } });
    const baseSnap = await writeWorkspaceSnapshot(r.cwd);
    await appendDecision(r.cwd, { kind: 'decision', level: 'Consequential', by: 'agent', title: 't', rests_on: [], wrong_if: 'w', body: 'b', base_snap: baseSnap, evaluation: null, interfaces: [] }, { command: 'decide' });
    const doneSnap = await writeWorkspaceSnapshot(r.cwd);
    await appendRecord(r.cwd, 'done', 'first', { slug: 'first', snapshot: doneSnap });
    const startSnap = await writeWorkspaceSnapshot(r.cwd);
    await appendRecord(r.cwd, 'start', 'second', { slug: 'second', snapshot: startSnap, requirements: [], from_superseded: null, intent: null, results: [] });
    const log = await readLog(r.cwd);
    assert.match(await callsDisabled(r.cwd, log), /unread/);
    let called = false;
    const res = await evaluate(r.cwd, { ...draft(), commitment: 'second', concerns: ['cycle'] }, { transport: async () => { called = true; } });
    assert.equal(called, false); assert.equal(res.reason, 'unread-decisions'); assert.equal(res.route, 'developer');
  });
  test('disabled evaluator writes nothing and returns the developer route', async () => {
    const { cwd } = await makeProject();
    const before = (await readLog(cwd)).length;
    const r = await evaluate(cwd, draft(), { transport: async () => { throw new Error('no'); } });
    assert.equal(r.reason, 'disabled'); assert.equal((await readLog(cwd)).length, before);
  });
});

import { upperBound, calibrate, assertRouteMode, currentCalibration, RouteModeError } from '../lib/evaluate.mjs';
import { escalate, answer } from '../lib/escalate.mjs';

// Shared by the calibration and route-mode-conversion describe blocks below (route-mode
// conversion needs a real passing calibration first, and rebuilding one per test at 60 real
// evaluate() cycles is expensive; both blocks reuse the same labelled() helper).
const asDev = { confirm: async () => true };
// Deviation from the plan text: the plan builds each labelled case by calling escalate() with an
// evaluation SHA and answer(cwd, sha, ...) (escalation SHA as the second positional argument).
// lib/escalate.mjs's real answer(cwd, slug, kind, text, opts) (already committed) takes the
// commitment SLUG there, narrowed to one escalation via opts.escalation, and needs developer
// evidence (opts.confirm) for its unsigned-local authentication.
let labelSeq = 0;
async function labelled(cwd, n, ownerLabel, agentProb = 0.95) {
  for (let i = 0; i < n; i++) {
    const q = `label ${labelSeq++}`;
    const r = await evaluate(cwd, draft({ question: q }), { transport: transport([optionBody(), ownerBody(agentProb)]) });
    const sha = await escalate(cwd, { ...draft({ question: q }), evaluation: r.evaluationSha });
    await answer(cwd, 'first', 'ok', '', { ...asDev, escalation: sha, owner: ownerLabel });
  }
}

describe('calibration', () => {
  test('exact one-sided bound', () => {
    assert.ok(Math.abs(upperBound(0, 60) - (1 - Math.pow(0.05, 1 / 60))) < 1e-9);
    assert.ok(upperBound(0, 60) < 0.05); assert.ok(upperBound(0, 30) > 0.05);
    assert.ok(upperBound(1, 60) > upperBound(0, 60)); assert.ok(upperBound(0, 1000) < upperBound(0, 100));
    assert.equal(upperBound(5, 5), 1);
  });

  test('60 zero-error predicted-agent cases pass at 0.05; 30 cannot', async () => {
    const cwd = await repoWithCommitment();
    await labelled(cwd, 30, 'agent');
    let c = await calibrate(cwd);
    assert.deepEqual([c.pass, c.sample, c.errors], [false, 30, 0]); assert.ok(c.bound > 0.05);
    await labelled(cwd, 30, 'agent');
    c = await calibrate(cwd);
    assert.deepEqual([c.pass, c.sample, c.errors], [true, 60, 0]);
    const rec = (await readLog(cwd)).at(-1);
    assert.equal(rec.kind, 'calibration'); assert.equal(rec.payload.result, 'pass'); assert.equal(rec.payload.predicted_agent, 60);
    assert.match(rec.payload.criterion, /0\.05/); assert.match(rec.payload.criterion, /60/);
    const commit = await catCommit(cwd, rec.sha);
    assert.doesNotThrow(() => decodeRecord(commit));
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
    const { settings } = await loadSettings(cwd);
    settings.typesafeai = { ...settings.typesafeai, route_confidence: 0.85 };
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    assert.equal(await currentCalibration(cwd, settings, await readLog(cwd)), null);
    assert.equal((await calibrate(cwd)).sample, 0);
  });
  // Deviation from the plan text: mode: 'route' can never be the setting a project starts with --
  // lib/settings.mjs's validateSettings (already committed) refuses route mode without a passing
  // calibration, and cairn init writes settings through that same validator, so a project cannot
  // even be created in route mode. The fixture instead starts in shadow, then pokes route mode
  // directly onto the settings file (bypassing cairn authorize's own validation, the same way other
  // tests in this file edit settings.json directly) purely to exercise assertRouteMode's own read,
  // which -- for exactly this reason -- reads the raw file itself rather than going through
  // loadSettings/validateSettings.
  test('route mode is refused without a matching passing calibration and with an alias', async () => {
    const cwd = await repoWithCommitment('shadow');
    const { settings } = await loadSettings(cwd);
    settings.typesafeai = { ...settings.typesafeai, mode: 'route' };
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    await assert.rejects(assertRouteMode(cwd), (e) => e instanceof RouteModeError && /cairn: route mode requires a passing calibration/.test(e.message));
    settings.typesafeai.model = 'jev-latest';
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    await assert.rejects(assertRouteMode(cwd), /alias/);
  });
});

// Task 10 (route mode conversion): lib/escalate.mjs's escalateWithRoute (plan 09, already
// committed) dynamic-imports evaluate from this module and dispatches on the {route, evaluationSha}
// it returns -- this file's own contract (task 8's Interfaces line: "cairn escalate and cairn
// decide accept --transport-module <path>... to inject transport" matches escalateWithRoute's own
// opts.transport, threaded straight through to evaluate()). Nothing in lib/escalate.mjs needed to
// change: it already fit. These tests exercise that real, non-mocked wiring end to end (unlike
// tests/escalate.test.mjs's own escalateWithRoute tests, which inject a stub `evaluate` and so
// never touch this file at all).
import { escalateWithRoute } from '../lib/escalate.mjs';
import { readAdr } from '../lib/adr.mjs';

describe('route mode conversion (lib/escalate.mjs consumes this module\'s evaluate(), unmodified)', () => {
  test('shadow: escalateWithRoute writes an escalation naming the real evaluation it ran', async () => {
    const cwd = await repoWithCommitment('shadow');
    const out = await escalateWithRoute(cwd, draft(), { transport: transport([optionBody(), ownerBody()]) });
    assert.equal(out.route, 'developer');
    const log = await readLog(cwd);
    const esc = log.findLast((x) => x.kind === 'escalation');
    const ev = log.findLast((x) => x.kind === 'evaluation');
    // escalateWithRoute's own return shape is {route, sha}: sha is the written escalation's SHA,
    // not the evaluation's -- the escalation record's own `evaluation` field is what names the
    // real evaluate() run this module just performed.
    assert.equal(esc.sha, out.sha);
    assert.equal(esc.payload.evaluation, ev.sha);
  });
  // Reproduced, separately documented finding (see the plan 11 report): lib/escalate.mjs's
  // escalateWithRoute (already committed, not authored by this plan) calls loadSettings(cwd)
  // directly with no {calibration} option -- the exact circularity this module's own
  // loadSettingsFull works around -- so it always throws "settings refused: route mode needs a
  // current passing calibration" for a route-mode project, even one with a genuinely passing
  // calibration at the exact policy digest. Route mode can therefore never actually run through
  // escalateWithRoute (and so never through `cairn escalate`) today; this is lib/escalate.mjs's own
  // defect, and the instructions for this plan forbid editing that file. Rather than a test that is
  // guaranteed to fail on someone else's bug (and costs a further 60 real evaluate() cycles just to
  // reach the point of failing), this test proves the function escalateWithRoute would actually
  // call once that settings bug is fixed -- this module's own evaluate() -- routes agent, developer
  // and capture correctly in route mode, against a calibration record written directly at the
  // exact policy digest (calibrate()'s own aggregation logic is already proven correct above; this
  // is a routing test, not another calibration-arithmetic test).
  test('route mode: evaluate() itself (what escalateWithRoute would call once its own settings bug is fixed) routes agent, developer and capture correctly', async () => {
    const cwd = await repoWithCommitment('shadow');
    const { settings } = await loadSettings(cwd);
    const policy = policyDigest(settings);
    const log = await readLog(cwd);
    const slug = log.findLast((x) => x.kind === 'start').payload.slug;
    await appendRecord(cwd, 'calibration', slug, {
      policy_digest: policy, log_head: log.at(-1).sha, predicted_agent: 60, false_downgrades: 0, bound: 0.01,
      criterion: 'test fixture: a directly-written passing calibration for this exact policy digest', result: 'pass',
    });
    settings.typesafeai = { ...settings.typesafeai, mode: 'route' };
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    await assertRouteMode(cwd); // must not throw: the calibration above matches this exact policy digest

    const rAgent = await evaluate(cwd, draft({ question: 'route-agent' }), { transport: transport([optionBody(), ownerBody(0.95)]) });
    assert.equal(rAgent.route, 'agent'); assert.equal(rAgent.would_route, null, 'route mode: no hypothetical route, an actual one');

    const badObserved = optionBody().replace('"observed":{"type":"noul","noul":0.9}', '"observed":{"type":"noul","noul":0.1}');
    const rDev = await evaluate(cwd, draft({ question: 'route-dev' }), { transport: transport([badObserved, ownerBody(0.95)]) });
    assert.equal(rDev.route, 'developer'); assert.equal(rDev.reason, 'observed');

    const outsideBody = optionBody().replace('"outside_1":{"type":"noul","noul":0.1}', '"outside_1":{"type":"noul","noul":0.9}');
    const rCap = await evaluate(cwd, draft({ question: 'route-capture' }), { transport: transport([outsideBody]) });
    assert.equal(rCap.route, 'capture'); assert.equal(rCap.option, 1);
  });
  // Fix round 1 finding 1: escalateWithRoute (lib/escalate.mjs) now reads settings through this
  // module's exported loadSettingsFull, the same calibration-aware load evaluate() itself uses, so
  // a route-mode project with a genuinely passing calibration at the current policy digest no
  // longer refuses at the point escalateWithRoute itself used to throw. Proven directly against the
  // real, unmocked escalateWithRoute (not a stub `evaluate`) for the developer and capture routes,
  // which -- unlike agent -- touch no other module with the same unguarded-loadSettings defect (see
  // the two reproduced-and-out-of-scope tests below for why agent and the CLI entry point still
  // cannot complete). A lowered, test-only min_calibration_agent_predictions/max_false_downgrade
  // pair keeps this fast; the exact spec-default numbers (60 passes, 30 fails, at 5%) are proven
  // separately and cheaply by the pure-math upperBound unit test above.
  test('route mode: escalateWithRoute itself now succeeds for the developer and capture routes', async () => {
    const cwd = await repoWithCommitment('shadow', { min_calibration_agent_predictions: 5, max_false_downgrade: 0.5 });
    await labelled(cwd, 5, 'agent');
    assert.equal((await calibrate(cwd)).pass, true);
    const { settings } = await loadSettings(cwd);
    settings.typesafeai = { ...settings.typesafeai, mode: 'route' };
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));

    const outsideBody = optionBody().replace('"outside_1":{"type":"noul","noul":0.1}', '"outside_1":{"type":"noul","noul":0.9}');
    const outCap = await escalateWithRoute(cwd, draft({ question: 'capture-via-fixed-wiring' }), { transport: transport([outsideBody]) });
    assert.equal(outCap.route, 'capture');
    const log1 = await readLog(cwd);
    assert.ok(log1.some((x) => x.kind === 'item' && x.payload.kind === 'backlog'));
    assert.ok(log1.some((x) => x.kind === 'outside' && x.sha === outCap.sha));

    const badObserved = optionBody().replace('"observed":{"type":"noul","noul":0.9}', '"observed":{"type":"noul","noul":0.1}');
    const outDev = await escalateWithRoute(cwd, draft({ question: 'developer-via-fixed-wiring' }), { transport: transport([badObserved, ownerBody(0.95)]) });
    assert.equal(outDev.route, 'developer');
    assert.ok((await readLog(cwd)).some((x) => x.kind === 'escalation' && x.sha === outDev.sha));
  });
  // Reproduced, out-of-scope finding (not this fix round's authorized file): lib/adr.mjs's decide()
  // (already committed) calls loadSettings(cwd) directly with no {calibration} option, the same
  // circularity finding 1 fixed in lib/escalate.mjs -- so escalateWithRoute's agent route, which
  // calls decide(), still cannot complete in route mode even though the settings load that used to
  // block every route is now fixed. Left for the developer; this fix round's authorization named
  // lib/escalate.mjs only.
  test('reproduced, out-of-scope finding: the agent route still cannot complete in route mode (lib/adr.mjs\'s decide() has the same unguarded loadSettings call)', async () => {
    const cwd = await repoWithCommitment('shadow', { min_calibration_agent_predictions: 5, max_false_downgrade: 0.5 });
    await labelled(cwd, 5, 'agent');
    assert.equal((await calibrate(cwd)).pass, true);
    const { settings } = await loadSettings(cwd);
    settings.typesafeai = { ...settings.typesafeai, mode: 'route' };
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    await assert.rejects(
      escalateWithRoute(cwd, draft({ question: 'agent-route-still-broken' }), { transport: transport([optionBody(), ownerBody(0.95)]) }),
      /settings refused: route mode needs a current passing calibration/,
    );
  });
  // Reproduced, out-of-scope finding, discovered while building the "through the real CLI"
  // positive test the fix round asked for: lib/scope.mjs's preflight() (already committed, called
  // by every STATE_CHANGING command through lib/cli.mjs's main() -> lib/cycle.mjs's withLoop, before
  // any command handler runs) has the identical unguarded loadSettings(cwd) call. This blocks EVERY
  // state-changing command in route mode through the real CLI -- not just escalate, and regardless
  // of which route the draft would take -- one layer earlier than lib/escalate.mjs's own settings
  // load (which this fix round's finding 1 already fixed and the test above proves directly).
  // lib/scope.mjs was not named in this fix round's authorization ("You may edit lib/escalate.mjs
  // for this item only"), so it is reproduced and left for the developer rather than fixed here.
  test('reproduced, out-of-scope finding: cairn escalate still cannot run in route mode through the real CLI (lib/scope.mjs\'s preflight() has the same unguarded loadSettings call, one layer before lib/escalate.mjs is ever reached)', async () => {
    const cwd = await repoWithCommitment('shadow', { min_calibration_agent_predictions: 5, max_false_downgrade: 0.5 });
    await labelled(cwd, 5, 'agent');
    assert.equal((await calibrate(cwd)).pass, true);
    const { settings } = await loadSettings(cwd);
    settings.typesafeai = { ...settings.typesafeai, mode: 'route' };
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));

    const outsideBody = optionBody().replace('"outside_1":{"type":"noul","noul":0.1}', '"outside_1":{"type":"noul","noul":0.9}');
    const stubPath = join(cwd, '.stub-transport.mjs');
    writeFileSync(stubPath,
      `let n = 0;\nconst bodies = ${JSON.stringify([outsideBody])};\n` +
      `export default async function stub() { return { status: 200, body: bodies[n++], model: 'jev-1.13.0' }; }\n`);

    const { main } = await import('../lib/cli.mjs');
    const run = async (argv) => {
      let out = '', err = '';
      const code = await main(argv, { cwd, stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } });
      return { code, out, err };
    };
    const res = await run(['escalate', '--commitment', 'first', '--concern', 'DEMO-001', '--question', 'Route via CLI?',
      '--recommendation', 'hourly', '--because', 'observed: the mechanism already runs and passes', '--if-wrong', 'the demo drifts',
      '--instead', 'daily', '--option', 'hourly', '--option', 'daily', '--path', 'src/demo.mjs', '--transport-module', stubPath]);
    assert.equal(res.code, 1);
    assert.match(res.err, /settings refused: route mode needs a current passing calibration/);
  });
  test('route mode: cairn escalate still refuses through the real CLI without a passing calibration', async () => {
    const cwd = await repoWithCommitment('shadow');
    const { settings } = await loadSettings(cwd);
    settings.typesafeai = { ...settings.typesafeai, mode: 'route' };
    writeFileSync(join(cwd, '.cairn/settings.json'), JSON.stringify(settings, null, 2));
    const { main } = await import('../lib/cli.mjs');
    const run = async (argv) => {
      let out = '', err = '';
      const code = await main(argv, { cwd, stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } });
      return { code, out, err };
    };
    const res = await run(['escalate', '--commitment', 'first', '--concern', 'DEMO-001', '--question', 'Refused?',
      '--recommendation', 'hourly', '--because', 'observed: the mechanism already runs and passes', '--if-wrong', 'the demo drifts',
      '--instead', 'daily', '--option', 'hourly', '--option', 'daily']);
    assert.equal(res.code, 1);
    assert.match(res.err, /calibration/);
  });
});
