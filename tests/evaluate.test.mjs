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
