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
import { begin } from '../lib/lease.mjs';

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
    // Fix round 1 (review Important finding 2): the brief's own snippet, and this test until now,
    // only spot-checked state.option's content (text, files) and asserted nothing at all about
    // state.contract's or state.facts's key sets -- a reintroduced rule or context field on either
    // (the exact regression this task exists to prevent) would have passed silently. contract is
    // asserted by reference (measureState assigns it verbatim, never a copy); facts is asserted
    // against a fresh authorityProjection(f) call, the same function measureState itself calls.
    assert.deepEqual(Object.keys(state.option).sort(), ['diff', 'files', 'omitted', 'text']);
    assert.equal(state.contract, C);
    assert.deepEqual(state.facts, authorityProjection(f));
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
  // Fix round 1 (review Critical finding 1): validateDraft only checks that named_paths entries
  // are strings, not that they are well-formed repository paths, so an agent-authored draft could
  // previously name a path outside the repository (a traversal or an absolute path) or a
  // kernel-reserved path, and measureState read it and returned its real content in M(D). Each of
  // these three now throws EgressError('reserved', p) before writeTreeFromPaths ever runs, and
  // the message names the offending path (not only the klass), so a caller (or a human reading a
  // log) can tell which of several touched paths was refused.
  describe('the touched-path containment check', () => {
    test('a relative traversal outside the repository throws EgressError naming the path', async () => {
      const { cwd } = await makeProject();
      const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['../outside.txt'] }));
      const C = await contractState(cwd, f);
      await assert.rejects(
        measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['../outside.txt'] }), 0, C, f),
        (e) => e instanceof EgressError && e.klass === 'reserved' && e.path === '../outside.txt' && e.message.includes('../outside.txt'),
      );
    });
    test('an absolute path throws EgressError naming the path', async () => {
      const { cwd } = await makeProject();
      const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['/etc/passwd'] }));
      const C = await contractState(cwd, f);
      await assert.rejects(
        measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['/etc/passwd'] }), 0, C, f),
        (e) => e instanceof EgressError && e.klass === 'reserved' && e.path === '/etc/passwd' && e.message.includes('/etc/passwd'),
      );
    });
    test('a kernel-reserved path throws EgressError naming the path', async () => {
      const { cwd } = await makeProject();
      const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['.cairn/log'] }));
      const C = await contractState(cwd, f);
      await assert.rejects(
        measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['.cairn/log'] }), 0, C, f),
        (e) => e instanceof EgressError && e.klass === 'reserved' && e.path === '.cairn/log' && e.message.includes('.cairn/log'),
      );
    });
    test('a kernel-managed path (the ADR file) throws EgressError naming the path', async () => {
      const { cwd } = await makeProject();
      const d = normalizeDraft({ ...draft(), named_paths: ['docs/decisions.jsonl'] });
      const f = await kernelFacts(cwd, d);
      const C = await contractState(cwd, f);
      await assert.rejects(measureState(cwd, d, 0, C, f),
        (e) => e instanceof EgressError && e.klass === 'kernel-managed' && e.path === 'docs/decisions.jsonl');
    });
    test('a protected path (the working agreement) throws EgressError naming the path', async () => {
      const { cwd } = await makeProject();
      const d = normalizeDraft({ ...draft(), named_paths: ['AGENTS.md'] });
      const f = await kernelFacts(cwd, d);
      const C = await contractState(cwd, f);
      await assert.rejects(measureState(cwd, d, 0, C, f),
        (e) => e instanceof EgressError && e.klass === 'protected' && e.path === 'AGENTS.md');
    });
    test('a draft naming only ordinary source paths still builds the state', async () => {
      const { cwd } = await makeProject();
      await mkdirAndWrite(cwd, 'src/auth/rotate.mjs', 'export const rotate = () => {};\n');
      const f = await kernelFacts(cwd, normalizeDraft(draft()));
      const C = await contractState(cwd, f);
      const { state } = await measureState(cwd, normalizeDraft(draft()), 0, C, f);
      assert.ok(state.option.files.some((x) => x.path === 'src/auth/rotate.mjs'));
    });
  });
  // Fix round 1 (review Important finding 3): the brief's own test and the credential test above
  // cover network_exclude and credential; host, output and both key-detection branches were
  // written but untested. One focused test per branch.
  test('a domain Host paths: match throws EgressError classed host', async () => {
    const { cwd } = await makeProject({ files: { 'docs/spec/hosted.md': 'Host paths: web/index.html\n' } });
    await mkdirAndWrite(cwd, 'web/index.html', '<html></html>\n');
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['web/index.html'] }));
    const C = await contractState(cwd, f);
    await assert.rejects(
      measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['web/index.html'] }), 0, C, f),
      (e) => e instanceof EgressError && e.klass === 'host' && e.path === 'web/index.html',
    );
  });
  test('a kernel output path throws EgressError classed output', async () => {
    const { cwd } = await makeProject();
    await mkdirAndWrite(cwd, '.cairn/output/report.txt', 'report\n');
    const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: ['.cairn/output/report.txt'] }));
    const C = await contractState(cwd, f);
    await assert.rejects(
      measureState(cwd, normalizeDraft({ ...draft(), named_paths: ['.cairn/output/report.txt'] }), 0, C, f),
      (e) => e instanceof EgressError && e.klass === 'output' && e.path === '.cairn/output/report.txt',
    );
  });
  // TYPESAFEAI_API_KEY is set to an invented, non-real placeholder for the duration of this test
  // only, then restored -- never a real key, per the global constraint, and never printed or
  // written anywhere beyond this in-memory env var and the touched file's own throwaway fixture
  // content.
  test('a touched file containing the TypeSafe key throws EgressError classed key before it reaches state', async () => {
    const { cwd } = await makeProject();
    const prev = process.env.TYPESAFEAI_API_KEY;
    process.env.TYPESAFEAI_API_KEY = 'test-placeholder-key-000';
    try {
      await mkdirAndWrite(cwd, 'src/auth/rotate.mjs', '// test-placeholder-key-000\n');
      const f = await kernelFacts(cwd, normalizeDraft(draft()));
      const C = await contractState(cwd, f);
      await assert.rejects(
        measureState(cwd, normalizeDraft(draft()), 0, C, f),
        (e) => e instanceof EgressError && e.klass === 'key' && e.path === 'src/auth/rotate.mjs',
      );
    } finally {
      if (prev === undefined) delete process.env.TYPESAFEAI_API_KEY; else process.env.TYPESAFEAI_API_KEY = prev;
    }
  });
  test('the key appearing only in the diff (removed since the lease began) throws EgressError classed key on the diff', async () => {
    const { cwd } = await makeProject();
    await mkdirAndWrite(cwd, 'src/auth/rotate.mjs', 'export const rotate = () => {};\n// test-placeholder-key-111\n');
    await begin(cwd, { action: 'implement', target: 'AUTH-003', touch: ['src/auth/rotate.mjs'] });
    const prev = process.env.TYPESAFEAI_API_KEY;
    process.env.TYPESAFEAI_API_KEY = 'test-placeholder-key-111';
    try {
      // The key-bearing line is removed after the lease snapshot was taken: the current file text
      // no longer contains the key (the per-file content check passes), but the diff against the
      // lease's snapshot still shows the removed line, so only the diff check should fire.
      await mkdirAndWrite(cwd, 'src/auth/rotate.mjs', 'export const rotate = () => {};\n');
      const f = await kernelFacts(cwd, normalizeDraft({ ...draft(), named_paths: [] }));
      const C = await contractState(cwd, f);
      await assert.rejects(
        measureState(cwd, normalizeDraft({ ...draft(), named_paths: [] }), 0, C, f),
        (e) => e instanceof EgressError && e.klass === 'key' && e.path === 'diff',
      );
    } finally {
      if (prev === undefined) delete process.env.TYPESAFEAI_API_KEY; else process.env.TYPESAFEAI_API_KEY = prev;
    }
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

import { buildScoreRequest, requestBytes, requestDigest, sizeCheck } from '../lib/evaluate.mjs';

describe('the Score request', () => {
  test('five questions, each naming its backticked state path with a zero-based option index', () => {
    const req = buildScoreRequest(settings(), { five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} }, 0);
    assert.deepEqual(Object.keys(req.questions).sort(), ['ambiguity', 'contract', 'evidence', 'reach', 'surface']);
    assert.match(req.questions.evidence.instructions, /`state\.five\.because`/);
    assert.match(req.questions.ambiguity.instructions, /`state\.five\.question`/);
    // Fix round 1 (review Important 1): a conjunction, not the brief's own alternation
    // regex (`` `state\.option`.*\[0\]|`state\.option` `` reduces to just the second
    // alternative, since alternation is lowest-precedence, so the `[0]` clause was dead --
    // this passed for any instructions text that merely mentioned `state.option` at all).
    // Each of the three option-scoped dimensions must carry both the backticked state path
    // and the literal zero-based index text the recommended option's own array slot uses.
    for (const d of ['reach', 'contract', 'surface']) {
      const t = req.questions[d].instructions;
      assert.ok(t.includes('`state.option`'), `${d} instructions missing the backticked state.option path`);
      assert.ok(t.includes('draft.options[0]'), `${d} instructions missing the zero-based option index`);
    }
    for (const d of ['evidence', 'reach', 'contract', 'surface', 'ambiguity']) assert.deepEqual(req.questions[d].criteria.length, 5);
    assert.equal(req.model, settings().typesafeai.model);
  });
  test('the recommended-option index in the request text tracks n, zero-based, for every option-scoped dimension', () => {
    const state = { five: { question: 'q', recommendation: 'daily', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'daily', diff: '', files: [], omitted: [] }, contract: {}, facts: {} };
    const req = buildScoreRequest(settings(), state, 1);
    // Fix round 1 (review Important 1): the brief's own test checked only 'reach' at n=1;
    // 'contract' and 'surface' interpolate the same ${n} into their own instructions text
    // (lib/evaluate.mjs) and need the same check, or a future edit could drop the index
    // from either one with nothing here to catch it.
    for (const d of ['reach', 'contract', 'surface']) assert.ok(req.questions[d].instructions.includes('draft.options[1]'), `${d} instructions missing draft.options[1]`);
  });
  test('requests round-trip through canonical JSON: equal state yields byte-identical requests', () => {
    const state = { five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} };
    const a = buildScoreRequest(settings(), state, 0), b = buildScoreRequest(settings(), state, 0);
    assert.equal(requestBytes(a), requestBytes(b));
    assert.match(requestDigest(a), /^sha256:[0-9a-f]{64}$/);
  });
  test('sizeCheck refuses above 75 percent of either the request or the state-plus-longest-question limit', () => {
    const small = buildScoreRequest(settings(), { five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} }, 0);
    assert.equal(sizeCheck(settings(), small), null);
    const big = buildScoreRequest(settings(), { five: { question: 'q', recommendation: 'r', because: 'x'.repeat(200000), if_wrong: 'w', instead: 'i' }, option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {} }, 0);
    assert.equal(sizeCheck(settings(), big), 'oversize');
    assert.equal(sizeCheck({ typesafeai: { ...settings().typesafeai, request_cap_bytes: 10 } }, small), 'oversize');
  });
  // Fix round 1 (review Important 2): the test above only covers a clearly-small request, a
  // clearly-huge one (roughly 2.7x the state limit) and a toy request_cap_bytes: 10 override --
  // none of it lands near either real `> limit` boundary in lib/evaluate.mjs's sizeCheck, so an
  // off-by-one (`>=` vs `>`) or a wrong operand (e.g. dropping `* factor`, an 8x difference)
  // would pass every assertion here unnoticed. This test hits each of sizeCheck's three
  // thresholds exactly, then one byte past it, with every target computed from POLICY.LIMITS
  // and settings() rather than hardcoded, so a limit change moves the test with it.
  test('sizeCheck refuses exactly one byte past each of its three real boundaries', () => {
    const { requestTokens, stateTokens, bytesPerToken, factor } = POLICY.LIMITS;
    const requestLimit = requestTokens * bytesPerToken * factor;
    const stateLimit = stateTokens * bytesPerToken * factor;
    const len = (v) => Buffer.byteLength(canonicalize(v));

    // A minimal, fixed-shape request (not run through buildScoreRequest -- sizeCheck only
    // ever reads request.state and request.questions, per its own implementation, so this
    // is a faithful unit test of sizeCheck itself) with exactly one padded field per check,
    // so each boundary can be hit by padding plain ASCII 'x' characters -- canonicalize adds
    // no escaping for those, so every added character adds exactly one byte, and the padding
    // length needed to land exactly on a limit is `limit - <measured base size>`, never a
    // hardcoded byte count.
    const question = { type: 'score', instructions: 'i', criteria: ['a', 'b', 'c', 'd', 'e'] };
    const emptyState = { five: {}, option: {}, contract: {}, facts: {} };
    const questionBytes = len(question);
    const req = (modelPad, statePad) => ({
      model: 'x'.repeat(modelPad),
      questions: { q: question },
      state: { ...emptyState, pad: 'x'.repeat(statePad) },
    });
    const base = req(0, 0);
    const totalBase = len(base), stateBase = len(base.state);

    // (1) requestTokens * bytesPerToken * factor: request_cap_bytes is raised well above it
    // so Math.min picks this clause, and state stays unpadded so the much smaller
    // state-plus-longest-question check never fires -- only the whole-request clause is
    // under test here.
    const highCap = { typesafeai: { ...settings().typesafeai, request_cap_bytes: requestLimit + 1000 } };
    const padA = requestLimit - totalBase;
    assert.equal(sizeCheck(highCap, req(padA, 0)), null);
    assert.equal(sizeCheck(highCap, req(padA + 1, 0)), 'oversize');

    // (2) stateTokens * bytesPerToken * factor: padded through state.pad so len(state) plus
    // the one question's bytes lands exactly on it; request_cap_bytes is still raised so the
    // whole-request clause cannot be what fires here.
    const padB = stateLimit - questionBytes - stateBase;
    assert.equal(sizeCheck(highCap, req(0, padB)), null);
    assert.equal(sizeCheck(highCap, req(0, padB + 1)), 'oversize');

    // (3) settings.typesafeai.request_cap_bytes at its real value (48000, from this file's
    // own settings() helper, not a toy override) -- no cap override; state is unpadded, so
    // it sits far under the 72000 state limit and the cap is what fires first, the way it
    // does for any project whose settings cap is this far below the token limits.
    const cap = settings().typesafeai.request_cap_bytes;
    const padC = cap - totalBase;
    assert.equal(sizeCheck(settings(), req(padC, 0)), null);
    assert.equal(sizeCheck(settings(), req(padC + 1, 0)), 'oversize');
  });
});

import { parseScoreAnswers } from '../lib/evaluate.mjs';

// Deviation from the brief's Step 1 snippet: the snippet calls `buildScoreRequest(settings(),
// state(), 0)` as if `state()` were an existing zero-arg factory. No such helper exists in this
// file -- the Score-request describe block above builds its own inline state object literal per
// test instead (see e.g. line 370, 389, 398) -- so this file's own `scoreState()` follows that
// same local pattern rather than introducing a new shared fixture name.
const scoreState = () => ({
  five: { question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i' },
  option: { text: 'r', diff: '', files: [], omitted: [] }, contract: {}, facts: {},
});

// Fix round 1 (controller ruling): a real jev-1.13.0 Score answer carries no `type` field --
// see `realAnswers` below, copied verbatim from a live capture, and the Critical finding in
// task-7-review.md. goodBody's per-dimension objects no longer carry one either, so this fixture
// matches the real wire shape (score, confidence, legend, probabilities) rather than the brief's
// original (incorrect) assumption.
const goodBody = (over = {}) => JSON.stringify({
  model: 'jev-1.13.0',
  answers: {
    evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.5, 4: 0.4 } },
    reach: { score: 0.6, confidence: 0.5, legend: {}, probabilities: { 0: 0.7, 1: 0, 2: 0.1, 3: 0.2, 4: 0 } },
    contract: { score: 0.1, confidence: 0.9, legend: {}, probabilities: { 0: 0.9, 1: 0.1, 2: 0, 3: 0, 4: 0 } },
    surface: { score: 0, confidence: 0.8, legend: {}, probabilities: { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0 } },
    ambiguity: { score: 1.0, confidence: 0.5, legend: {}, probabilities: { 0: 0.3, 1: 0.4, 2: 0.2, 3: 0.1, 4: 0 } },
    ...over,
  },
  usage: { input_tokens: 10, output_tokens: 2 },
});

// A real answer object per dimension, copied verbatim from `.superpowers/bench/results.json`'s
// `round3.rows[0]` (scenario A01, jev-1.13.0, a live HTTP 200 response -- the same capture
// `results.md`'s "Data loss note" and this task's own tolerance fix cite). The superseded
// gate-cascade design that produced this capture scored each option separately (`contract_1`,
// `contract_2`, ...); this task's single-recommended-option design asks one question per
// dimension, so `reach`/`contract`/`surface` below are that scenario's own `<dimension>_1`
// object (the recommended option's own slot), renamed onto the current dimension id --
// `evidence` and `ambiguity` keep their original names, since neither was ever option-scoped.
// Scores, confidences, legend text and probabilities are unedited from the capture: this is the
// review's requested "fixture built straight from a real recorded answer," not a hand-written
// approximation of one, and it carries no `type` key because the real object never had one.
const realAnswers = {
  evidence: { score: 3.44, confidence: 0.57, legend: { 0: 'none', 1: 'a claim', 2: 'names a command or file', 3: 'quotes output or a diff', 4: 'quotes output and names the test that fails and the falsifier it maps to' }, probabilities: { 0: 0, 1: 0, 2: 0.03, 3: 0.49, 4: 0.48 } },
  reach: { score: 0.6, confidence: 0.5, legend: { 0: 'wording or message text', 1: 'internal structure, nothing visible', 2: 'behaviour inside an agreed requirement', 3: 'output or flags existing callers depend on', 4: 'data that cannot be regenerated, a migration, or a rewrite of user files' }, probabilities: { 0: 0.77, 1: 0, 2: 0.11, 3: 0.12, 4: 0 } },
  contract: { score: 0.07, confidence: 0.94, legend: { 0: 'implements the cited requirement as written', 1: 'chooses between readings the text allows', 2: 'adds behaviour no requirement names', 3: 'conflicts with a cited decision', 4: "changes a requirement's text or falsifier" }, probabilities: { 0: 0.96, 1: 0.03, 2: 0.01, 3: 0, 4: 0 } },
  surface: { score: 0.53, confidence: 0.56, legend: { 0: 'no new surface', 1: 'a new file or module', 2: 'a new flag or output', 3: 'a new dependency', 4: 'a network call, credential, or external service' }, probabilities: { 0: 0.74, 1: 0, 2: 0.26, 3: 0, 4: 0 } },
  ambiguity: { score: 1.02, confidence: 0.68, legend: { 0: 'one reading, the draft names it', 1: 'two readings, the draft picks one with a reason', 2: 'two readings, no reason', 3: 'the question asks the developer to choose a policy', 4: 'the question cannot be answered without facts the draft lacks' }, probabilities: { 0: 0.18, 1: 0.72, 2: 0.01, 3: 0.07, 4: 0.02 } },
};

describe('Score answer parsing', () => {
  test('parses all five dimensions', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const r = parseScoreAnswers(req, goodBody());
    assert.deepEqual(Object.keys(r.levels).sort(), ['ambiguity', 'contract', 'evidence', 'reach', 'surface']);
    assert.equal(r.levels.evidence, 3.4); assert.equal(r.confidences.evidence, 0.6);
    assert.equal(r.model, 'jev-1.13.0');
    assert.deepEqual(r.usage, { input_tokens: 10, output_tokens: 2 });
  });
  // Fix round 1: the review's Critical finding -- reproduced against `parseScoreAnswers` before
  // this fix, a body built from this exact real data returned `{"invalid":"answer evidence not
  // type score"}`, rejecting a real, successful API response on the first dimension checked.
  // This is the fixture the review's Critical fix asked for: built straight from a live capture,
  // not from the brief's (incorrect) assumption that a `type` field exists, with float scores
  // (`3.44`, not a rounded `3`) exercised the way the real API actually returns them.
  test('parses a real captured jev-1.13.0 response verbatim: no type field, float scores', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const body = JSON.stringify({ model: 'jev-1.13.0', answers: realAnswers, usage: { input_tokens: 3975, output_tokens: 124 } });
    const r = parseScoreAnswers(req, body);
    assert.equal(r.invalid, undefined);
    assert.deepEqual(r.levels, { evidence: 3.44, reach: 0.6, contract: 0.07, surface: 0.53, ambiguity: 1.02 });
    assert.deepEqual(r.confidences, { evidence: 0.57, reach: 0.5, contract: 0.94, surface: 0.56, ambiguity: 0.68 });
  });
  test('tolerates a probability sum within 0.02 of 1 (the round-3 data-loss bug, fixed)', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const body = goodBody({ evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.49, 4: 0.4 } } }); // sums to 0.99
    const r = parseScoreAnswers(req, body);
    assert.equal(r.invalid, undefined);
  });
  test('refuses a sum off by more than 0.02', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const body = goodBody({ evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.3, 4: 0.4 } } }); // sums to 0.8
    assert.ok(parseScoreAnswers(req, body).invalid);
  });
  // Fix round 1 (review Important 2): the tolerance's actual boundary was untested -- built from
  // 0.2 four times plus one perturbed value each, so the sum is the direct IEEE 754 double
  // nearest 0.98/1.02/0.979/1.021, not assembled from many small parts that could drift further
  // from it. Reproduced by hand before this fix: with the comparison as `Math.abs(sum - 1) >
  // POLICY.PROB_TOLERANCE` and no epsilon, a sum of the literal double 0.98 computed
  // Math.abs(0.98 - 1) as 0.020000000000000018 -- strictly greater than the double for 0.02 --
  // so the boundary itself was wrongly invalid; TOLERANCE_EPSILON in lib/evaluate.mjs fixes this.
  test('the probability-sum tolerance is inclusive at its edges: 0.98 and 1.02 are valid', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const low = goodBody({ evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0.18, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2 } } }); // sums to 0.98
    const high = goodBody({ evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0.22, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2 } } }); // sums to 1.02
    assert.equal(parseScoreAnswers(req, low).invalid, undefined);
    assert.equal(parseScoreAnswers(req, high).invalid, undefined);
  });
  test('the probability-sum tolerance excludes just past its edges: 0.979 and 1.021 are invalid', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const low = goodBody({ evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0.179, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2 } } }); // sums to 0.979
    const high = goodBody({ evidence: { score: 3.4, confidence: 0.6, legend: {}, probabilities: { 0: 0.221, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2 } } }); // sums to 1.021
    assert.ok(parseScoreAnswers(req, low).invalid);
    assert.ok(parseScoreAnswers(req, high).invalid);
  });
  // Fix round 1: the brief's own "wrong type" sub-case (an answer whose `type` was `'noul'`) is
  // dropped -- `type` is no longer part of the shape this parser checks at all (see the
  // controller ruling above), so there is nothing left for that sub-case to exercise. The other
  // four sub-cases from the brief's Step 1 snippet are unchanged.
  test('refuses out-of-range score, confidence, a missing dimension, or malformed JSON', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    assert.ok(parseScoreAnswers(req, 'not json').invalid);
    assert.ok(parseScoreAnswers(req, JSON.stringify({ model: 'jev-1.13.0', answers: {}, usage: {} })).invalid);
    assert.ok(parseScoreAnswers(req, goodBody({ evidence: { score: 5, confidence: 0.6, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 } } })).invalid);
    assert.ok(parseScoreAnswers(req, goodBody({ evidence: { score: 1, confidence: 1.5, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 } } })).invalid);
  });
  // Not in the brief's own test list: the task dispatch's own Global Constraints text separately
  // names "an extra question" and "a probabilities object with a missing or extra key" as
  // defects the parser must catch -- neither is exercised by the brief's Step 1 snippet, whose
  // probabilities check (Object.values(...).length !== 5) would miss a shifted key set entirely.
  // These tests cover them directly.
  test('refuses an answer key the request never asked for', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const body = goodBody({ sixth: { score: 1, confidence: 0.5, legend: {}, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1 } } });
    assert.ok(parseScoreAnswers(req, body).invalid);
  });
  test('refuses a probabilities object with a missing or extra key even when the five values are individually valid', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    // Keys 0,1,2,3,5: five values, each in [0,1], summing to 1 -- would pass a value-count-only
    // check but is missing "4" and carries an extra "5" instead.
    const body = goodBody({ evidence: { score: 3, confidence: 0.6, legend: {}, probabilities: { 0: 0.2, 1: 0.2, 2: 0.2, 3: 0.2, 5: 0.2 } } });
    assert.ok(parseScoreAnswers(req, body).invalid);
  });
  // Fix round 1 (review Important 3): `typeof x !== 'object'` admits arrays; a probabilities
  // array with five individually-valid values used to pass silently. Built by mutating a parsed
  // goodBody() rather than JSON.stringify-ing a literal containing an array in object position,
  // so this exercises exactly the shape `JSON.parse` would hand the parser from a real malformed
  // body (a top-level JSON array under the `probabilities` key), not a JS-only construct.
  test('refuses a probabilities array in place of an object, even with five valid values', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const bad = JSON.parse(goodBody());
    bad.answers.evidence.probabilities = [0.2, 0.2, 0.2, 0.2, 0.2];
    assert.ok(parseScoreAnswers(req, JSON.stringify(bad)).invalid);
  });
  test('carries usage through when present and valid, and reports null when usage is malformed', () => {
    const req = buildScoreRequest(settings(), scoreState(), 0);
    const bad = JSON.parse(goodBody());
    bad.usage = { input_tokens: -1, output_tokens: 2 };
    const r = parseScoreAnswers(req, JSON.stringify(bad));
    assert.equal(r.invalid, undefined);
    assert.equal(r.usage, null);
  });
});

// --- Task 8: the veto and the composite -----------------------------------------------------
// Section 10: code, not the model, computes what happens next from the five levels and
// confidences. computeVeto checks reach, then contract, then surface against fixed thresholds;
// computeComposite is the weighted mean over the five dimensions (evidence inverted); and
// computeSuggested is the composite-vs-ceiling-and-confidence-floors advisory. `levels` here are
// parseScoreAnswers's own `score` floats (e.g. 1.02), not rounded integers -- the boundary test
// below (`reach: 3.99`) is exactly why the veto compares floats, not `>= 4` on a rounded level.
import { computeVeto, computeComposite, computeSuggested } from '../lib/evaluate.mjs';

const levels = (over = {}) => ({ evidence: 3, reach: 1, contract: 0, surface: 0, ambiguity: 1, ...over });
const conf = (over = {}) => ({ evidence: 0.8, reach: 0.8, contract: 0.8, surface: 0.8, ambiguity: 0.8, ...over });

describe('veto and composite', () => {
  test('veto checks reach, then contract, then surface, in that order', () => {
    assert.equal(computeVeto(levels({ reach: 4 })), 'reach');
    assert.equal(computeVeto(levels({ reach: 4, contract: 3 })), 'reach', 'reach is checked first');
    assert.equal(computeVeto(levels({ contract: 3 })), 'contract');
    assert.equal(computeVeto(levels({ contract: 3, surface: 3 })), 'contract');
    assert.equal(computeVeto(levels({ surface: 3 })), 'surface');
    assert.equal(computeVeto(levels()), null);
    assert.equal(computeVeto(levels({ reach: 3.99 })), null, 'reach needs >= 4, not >= 3');
  });
  test('composite: weight_d * level_d / 4, evidence inverted, summed with no renormalization', () => {
    const c = computeComposite(levels(), dims());
    // evidence term (4-3)/4=0.25, reach 1/4=0.25, contract 0, surface 0, ambiguity 1/4=0.25; * 0.2 each, summed
    assert.ok(Math.abs(c - 0.2 * (0.25 + 0.25 + 0 + 0 + 0.25)) < 1e-9);
  });
  test('composite ignores confidence entirely; only the levels feed it', () => {
    assert.equal(computeComposite(levels(), dims()), computeComposite(levels(), dims()));
  });
  // A local settings shape, not the file's top-level settings() helper: that helper's
  // confidence_floors is dims() (0.2 for every dimension), which would clear even the
  // 'under one confidence floor' case below (0.3 >= 0.2) and defeat the test's own point.
  // 0.5 floors, matching the brief, keep conf()'s 0.8 default well clear and 0.3 clearly under.
  const suggestSettings = () => ({ typesafeai: { agent_ceiling: 0.35, confidence_floors: { evidence: 0.5, reach: 0.5, contract: 0.5, surface: 0.5, ambiguity: 0.5 } } });
  test('suggested is agent only when composite <= agent_ceiling and every confidence clears its floor', () => {
    const s = suggestSettings();
    assert.equal(computeSuggested(0.2, conf(), s), 'agent');
    assert.equal(computeSuggested(0.4, conf(), s), 'developer', 'over the ceiling');
    assert.equal(computeSuggested(0.2, conf({ ambiguity: 0.3 }), s), 'developer', 'under one confidence floor');
    assert.equal(computeSuggested(0.35, conf(), s), 'agent', 'at the ceiling is still agent');
  });
  test('boundary: composite exactly at the ceiling and a confidence exactly at its floor both pass', () => {
    const s = suggestSettings();
    // s.typesafeai.confidence_floors is 0.5 for every dimension (suggestSettings, above).
    assert.equal(computeSuggested(0.35, conf({ ambiguity: 0.5 }), s), 'agent', 'confidence exactly at its floor still clears it');
  });
});
