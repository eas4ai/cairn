// tests/evaluate.test.mjs
// Plan 15 (measurement core), task 3: policy constants, the Score criteria text, the draft digest
// and the policy digest -- the first exports of lib/evaluate.mjs, rewritten from scratch on this
// plan. The old file's gate-cascade/route/shadow tests are not carried forward (they tested a
// design decisions 55 and 56 superseded); this file's structure is left open for the describe
// blocks tasks 4-10 add back (the floor, the state, the request, the parser, the composite,
// measure() and calibrate() -- ruling 5).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { POLICY, policyDigest } from '../lib/evaluate.mjs';
// Deviation from the brief text: the brief's Step 1 snippet imports normalizeDraft/draftDigest
// directly from '../lib/escalate.mjs'. lib/escalate.mjs exports validateDraft, not a function
// named normalizeDraft -- it never has, on any commit on this branch (git log -- lib/escalate.mjs
// shows no rename). lib/evaluate.mjs re-exports escalate.mjs's validateDraft under the name
// normalizeDraft (`export { validateDraft as normalizeDraft, ... } from './escalate.mjs'`, per
// the brief's own Step 3 code and the interfaces line "re-exported as FIVE_FIELDS" pattern for
// FIELDS) -- escalate.mjs itself is unchanged, exactly as the brief's interfaces line promises.
// Importing normalizeDraft from lib/evaluate.mjs, where that name actually exists, is what the
// test below ("normalizeDraft/draftDigest still come from lib/escalate.mjs, unchanged by this
// plan") is actually proving: that evaluate.mjs's re-export is the same underlying function
// escalate.mjs already had, not a new implementation.
import { normalizeDraft, draftDigest } from '../lib/evaluate.mjs';

const draft = () => ({ commitment: 'auth-tokens', concerns: ['AUTH-003'], question: 'Rotate tokens hourly?',
  recommendation: 'hourly', because: 'observed: node scripts/rotate.mjs prints ok', if_wrong: 'sessions drop',
  instead: 'daily', options: ['hourly', 'daily'], named_paths: ['src/auth/rotate.mjs'], cited_decisions: [] });
const dims = () => ({ evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 });
const settings = () => ({ typesafeai: { enabled: true, model: 'jev-1.13.0', weights: dims(), agent_ceiling: 0.35, confidence_floors: dims(),
  min_calibration_agent_predictions: 60, request_cap_bytes: 48000 }, network_exclude: ['fixtures/private/**'] });

describe('policy constants and digests', () => {
  test('the five dimensions and their level-0..4 criteria text are fixed', () => {
    assert.deepEqual(POLICY.DIMENSIONS, ['evidence', 'reach', 'contract', 'surface', 'ambiguity']);
    for (const d of POLICY.DIMENSIONS) assert.equal(POLICY.LEVELS[d].length, 5);
    assert.deepEqual(POLICY.LEVELS.evidence[0], 'none');
    assert.deepEqual(POLICY.LEVELS.evidence[4], 'quotes output and names the test that fails and the falsifier it maps to');
    assert.deepEqual(POLICY.LEVELS.surface[4], 'a network call, credential, or external service');
  });
  test('normalizeDraft/draftDigest still come from lib/escalate.mjs, unchanged by this plan', () => {
    const D = normalizeDraft(draft());
    assert.deepEqual(Object.keys(D).sort(), ['because', 'cited_decisions', 'commitment', 'concerns', 'if_wrong',
      'instead', 'named_paths', 'options', 'question', 'recommendation'].sort());
    assert.match(draftDigest(D), /^sha256:[0-9a-f]{64}$/);
  });
  test('policy digest changes with every covered input and nothing else', () => {
    const base = policyDigest(settings());
    const s1 = settings(); s1.typesafeai.agent_ceiling = 0.4;
    const s2 = settings(); s2.typesafeai.weights.evidence = 0.3;
    const s3 = settings(); s3.typesafeai.confidence_floors.ambiguity = 0.6;
    const s4 = settings(); s4.network_exclude = [];
    const s5 = settings(); s5.typesafeai.model = 'jev-1.14.0';
    const s6 = settings(); s6.typesafeai.enabled = false;
    assert.notEqual(base, policyDigest(s1)); assert.notEqual(base, policyDigest(s2)); assert.notEqual(base, policyDigest(s3));
    assert.notEqual(base, policyDigest(s4)); assert.notEqual(base, policyDigest(s5));
    assert.equal(base, policyDigest(s6), 'enabled is a source choice, not policy');
  });
});

import { kernelFacts, floorReasons, authorityProjection } from '../lib/evaluate.mjs';
import { makeProject } from './helpers/repo.mjs';
import { loopRepo } from './helpers/loop.mjs';
import { appendDecision } from '../lib/adr.mjs';

// A hand-built kernelFacts() result, for floorReasons/authorityProjection unit tests that do not
// need a real repository. kernelFacts() itself is exercised separately below, against a real
// makeProject() fixture.
const facts = (over = {}) => ({ slug: 'auth-tokens', set: [{ requirement: 'AUTH-003', text_digest: 'sha256:' + 'a'.repeat(64) }],
  concerns: [{ id: 'AUTH-003', valid: true }], pathClasses: { 'src/auth/rotate.mjs': 'source' }, attempts: { 'AUTH-003': 1 },
  openObligations: { escalations: 0, findings: 0, defects: 0, breaches: 0 }, decisions: [], lease: { action: 'implement', target: 'AUTH-003' },
  D: normalizeDraft(draft()), ...over });

describe('the narrow floor', () => {
  test('a clean draft does not fire the floor and projects completely', () => {
    assert.deepEqual(floorReasons(facts()), []);
    const A = authorityProjection(facts());
    assert.equal(A.option_index, 0);
    assert.equal(A.option_count, 2);
  });
  // Fix round 1 (Controller Ruling 7): section 10's narrow floor names exactly three conditions
  // (contract, agreement, data) plus the technical no-request cases. Reserved/protected-path
  // writes ('settings', a .cairn/settings.json write; 'reserved', a reserved or kernel-managed
  // path), the fourth-attempt rule and scope rulings are "already enforced by section 2 and
  // section 5 independent of this floor" (docs/spec/cairn-v2.md section 10) -- floorReasons no
  // longer fires on them, so those four assertions (present in the brief's own Step 1 test) are
  // removed along with the reasons themselves. The reasons that remain: data, contract, agreement,
  // missing-recommendation, incomplete-projection.
  test('each floor reason routes with no call', () => {
    assert.deepEqual(floorReasons(facts({ pathClasses: { 'migrations/1.sql': 'data' } })), ['data']);
    assert.deepEqual(floorReasons(facts({ pathClasses: { 'docs/spec/auth.md': 'protected' } })), ['contract']);
    assert.deepEqual(floorReasons(facts({ pathClasses: { 'AGENTS.md': 'protected' } })), ['agreement']);
    assert.deepEqual(floorReasons(facts({ D: { ...normalizeDraft(draft()), recommendation: '  ' } })), ['missing-recommendation']);
    assert.deepEqual(floorReasons(facts({ concerns: [{ id: 'AUTH-999', valid: false }] })), ['incomplete-projection']);
  });
  test('a recommendation not present in options is also incomplete-projection', () => {
    assert.deepEqual(floorReasons(facts({ D: { ...normalizeDraft(draft()), recommendation: 'weekly' } })), ['incomplete-projection']);
  });
  // Fix round 1, Important 1: authorityProjection's protected.contract used to disagree with
  // floorReasons's own 'contract' check for docs/spec/roadmap.md. PROTECTED_EXCEPT (lib/paths.mjs)
  // carves that one path out of classify()'s 'protected' class into 'reserved' (the kernel writes
  // it directly at start and promote), so floorReasons correctly never fires 'contract' for it --
  // both functions must agree that this path is not a contract write.
  test('the roadmap kernel-write exception does not fire contract in either function', () => {
    const f = facts({ pathClasses: { 'docs/spec/roadmap.md': 'reserved' } });
    assert.deepEqual(floorReasons(f), []);
    assert.equal(authorityProjection(f).protected.contract, false);
  });
  // Ruling 5 (plan 15's progress ledger) carries this subject forward by name from the superseded
  // evaluator's test 'an agent-written cited decision reaches A(D) only as id and read flag'
  // (tests/evaluate.test.mjs at b40fd65c, describe('protected(D) and A(D)')): unread decisions are
  // a kernel fact the floor itself sees and exposes -- A(D) carries a cited decision's id and
  // whether the developer has read it, never the agent's own prose, and an unread one must show up
  // as read: false rather than being silently dropped or coerced to true.
  test('an agent-written cited decision reaches A(D) only as id and read flag', () => {
    const A = authorityProjection(facts({ decisions: [{ id: '01J', by: 'agent', read: false, body: 'long agent prose', title: 't' }] }));
    assert.deepEqual(A.cited, [{ id: '01J', read: false }]);
    assert.ok(!JSON.stringify(A).includes('long agent prose'));
  });
  // Deviation from the brief text: the brief's Step 1 snippet builds this fixture's draft with
  // `concerns: []`. lib/escalate.mjs's validateDraft (this module's normalizeDraft) refuses an
  // empty concerns list ("draft needs at least one concern"), so that literal fixture throws
  // DraftError before kernelFacts is ever reached -- it never has, on any commit on this branch,
  // per the same escalate.mjs read noted above. The superseded evaluator's own equivalent test hit
  // this identical wall and used 'cycle' instead (git show b40fd65c:tests/evaluate.test.mjs): the
  // one concern kind that names no record and needs no open commitment, standing in for "no
  // meaningful concern" here too.
  test('kernelFacts reads a real project', async () => {
    const { cwd } = await makeProject();
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), commitment: 'none', concerns: ['cycle'], named_paths: [] }));
    assert.equal(f.lease, null);
    assert.deepEqual(f.openObligations, { escalations: 0, findings: 0, defects: 0, breaches: 0 });
  });
  // Fix round 1, Important 2: the only test that touched kernelFacts's own `read: !unread.has(id)`
  // line called authorityProjection directly against a hand-built facts() fixture with `read`
  // supplied literally -- it never exercised kernelFacts's real readAdr/queue computation, so an
  // inverted or otherwise broken unread check would not have failed anything. Built on
  // loopRepo (tests/helpers/loop.mjs), which already wires a started commitment and a decide()
  // step, rather than hand-built facts.
  test('kernelFacts reports a cited decision as unread, then read once the read line lands', async () => {
    const r = await loopRepo();
    const id = await r.decide();
    const D = normalizeDraft({ ...draft(), commitment: r.slug, concerns: [r.reqs[0]], named_paths: [], cited_decisions: [id] });
    const before = await kernelFacts(r.cwd, D);
    assert.deepEqual(before.decisions, [{ id, by: 'agent', read: false, body: 'A map keeps lookups constant.', title: 'Use a map' }]);
    const anyLogSha = (await r.log()).at(-1).sha;
    await appendDecision(r.cwd, { kind: 'read', of: id, record: anyLogSha }, { command: 'decisions --read' });
    const after = await kernelFacts(r.cwd, D);
    assert.equal(after.decisions[0].read, true);
  });
});

import { contractState, measureState, EgressError } from '../lib/evaluate.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { appendRecord } from '../lib/records.mjs';
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';
import { canonicalize } from '../lib/canon.mjs';

// A local write helper (mirrors tests/helpers/repo.mjs's own `write` and tests/helpers/loop.mjs's
// own `write`) for a bare untracked file placed straight into a makeProject() worktree, with no
// project-level fixture wiring of its own -- these tests need one loose file on disk, not a
// second full test-helper module.
async function mkdirAndWrite(cwd, path, content) {
  const full = join(cwd, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('C(c) and M(D)', () => {
  test('contractState carries the rule text nowhere: only keystone, glossary, commitment, requirements and developer-written decisions', async () => {
    const { cwd } = await makeProject({ files: { 'docs/spec/roadmap.md': 'Current: auth-tokens\n\n## auth-tokens\n\nRequirements: AUTH-003\n' } });
    // Starting the commitment for real would need a docs/spec domain file defining AUTH-003 as
    // Agreed, plus authorize() and the full transactional start() -- a matching domain file is not
    // this test's subject (contractState's key set, checked below, is). Appending the 'start'
    // record directly, the same shortcut tests/helpers/loop.mjs's own fixture and
    // tests/snapshots.test.mjs already use, opens the real commitment kernelFacts reads its slug
    // and frozen set from, with no domain file or authorization detour.
    const snapshot = await writeWorkspaceSnapshot(cwd);
    await appendRecord(cwd, 'start', 'auth-tokens', {
      slug: 'auth-tokens', snapshot, from_superseded: null, intent: null, results: [],
      requirements: [{ requirement: 'AUTH-003', text_digest: 'sha256:' + 'a'.repeat(64) }],
    });
    const f = await kernelFacts(cwd, normalizeDraft(draft()));
    const C = await contractState(cwd, f);
    assert.deepEqual(Object.keys(C).sort(), ['commitment', 'decisions', 'glossary', 'keystone', 'requirements']);
  });
  test('M(D) is exactly the four closed parts, no rule and no free context', async () => {
    const { cwd } = await makeProject();
    await mkdirAndWrite(cwd, 'src/auth/rotate.mjs', 'export const rotate = () => {};\n');
    const f = await kernelFacts(cwd, normalizeDraft(draft()));
    const C = await contractState(cwd, f);
    const { state } = await measureState(cwd, normalizeDraft(draft()), 0, C, f);
    assert.deepEqual(Object.keys(state).sort(), ['contract', 'facts', 'five', 'option']);
    assert.deepEqual(Object.keys(state.five).sort(), ['because', 'if_wrong', 'instead', 'question', 'recommendation']);
    assert.equal(state.option.text, 'hourly');
    assert.ok(state.option.files.some((x) => x.path === 'src/auth/rotate.mjs'));
  });
  test('an excluded touched path throws EgressError and never reaches state', async () => {
    const { cwd } = await makeProject({ settings: { network_exclude: ['fixtures/private/**'] } });
    await mkdirAndWrite(cwd, 'fixtures/private/key.txt', 'shh');
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['fixtures/private/key.txt'] }));
    const C = await contractState(cwd, f);
    await assert.rejects(measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['fixtures/private/key.txt'] }), 0, C, f), EgressError);
  });
  // Not in the brief's own test list: the Global Constraints call egress of a credential path's
  // content binding, and the brief's given test exercises only the network_exclude branch of
  // egressClass. A CREDENTIAL_PATTERNS entry (lib/paths.mjs) is a project-independent rule, so no
  // settings override is needed to trigger it, unlike the network_exclude case above.
  test('a credential-pattern touched path throws EgressError classed credential, with no settings override needed', async () => {
    const { cwd } = await makeProject();
    await mkdirAndWrite(cwd, 'secret/.env', 'TOKEN=shh');
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['secret/.env'] }));
    const C = await contractState(cwd, f);
    await assert.rejects(
      measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['secret/.env'] }), 0, C, f),
      (e) => e instanceof EgressError && e.klass === 'credential' && e.path === 'secret/.env',
    );
  });
  // Not in the brief's own test list: measureState's Interfaces line and the task's own
  // instructions name `{state, requestBytesEstimate}` as its return shape (the brief's Step 3
  // snippet returns `{ state }` alone); this covers the field the snippet omitted.
  test('measureState also returns a requestBytesEstimate, a positive byte count of the state', async () => {
    const { cwd } = await makeProject();
    await mkdirAndWrite(cwd, 'src/auth/rotate.mjs', 'export const rotate = () => {};\n');
    const f = await kernelFacts(cwd, normalizeDraft(draft()));
    const C = await contractState(cwd, f);
    const { state, requestBytesEstimate } = await measureState(cwd, normalizeDraft(draft()), 0, C, f);
    assert.equal(requestBytesEstimate, Buffer.byteLength(canonicalize(state)));
    assert.ok(requestBytesEstimate > 0);
  });
});
