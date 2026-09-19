import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, draftDigest, parseConcern, DraftError } from '../lib/escalate.mjs';
import { loopRepo } from './helpers/loop.mjs';
import { readLog, decodeRecord, KINDS } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { escalate, escalationsFor } from '../lib/escalate.mjs';
import { readAdr } from '../lib/adr.mjs';
import { escalateWithRoute, decideConsequential } from '../lib/escalate.mjs';

// Deviation from the plan text: validateSettings (lib/settings.mjs, already committed) requires
// every typesafeai.* threshold key to be present (a closed-object schema); the plan's partial
// stub `{ typesafeai: { enabled: true, mode: 'shadow', model: 'jev-1.13.0' } }` fails loadSettings
// when makeProject/loopRepo shallow-merge it over the defaults (the same issue tests/tx.test.mjs
// already documents for its own settings fixture). Filled in with DEFAULT_SETTINGS' own defaults.
const enabled = { typesafeai: { enabled: true, mode: 'shadow', model: 'jev-1.13.0',
  route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3,
  reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05,
  min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };
const EV = 'e'.repeat(40);
import { answer, escalationState, unanswered, describeEvidence } from '../lib/escalate.mjs';

const asDev = { confirm: async () => true };
import { reply } from '../lib/escalate.mjs';
import { dispute, disputes } from '../lib/escalate.mjs';

import { concerns, escalatedRequirement } from '../lib/escalate.mjs';

const disputeFields = (record, n) => ({
  commitment: 'first', record, n,
  question: `Is finding ${n} a defect?`, recommendation: 'No: the check reads the declared fixture.',
  because: 'hello.txt is in the mechanism inputs.', if_wrong: 'A hidden input goes undeclared.', instead: 'Declare it and re-run.',
});

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

test('with the evaluator disabled the route is developer and the evaluator is never loaded', async () => {
  const r = await loopRepo();
  const out = await escalateWithRoute(r.cwd, draft(), { evaluate: async () => { throw new Error('must not be called'); } });
  assert.equal(out.route, 'developer');
  assert.equal(decodeRecord(await catCommit(r.cwd, out.sha)).kind, 'escalation');
});

// Deviation from the plan text: lib/adr.mjs's real appendDecision/prepareLine always validates a
// non-null decision `evaluation` field against the actual log (validateLine's `sha()` checker
// calls readLog and requires logShas.has(s)); the plan's fabricated EV = 'e'.repeat(40) is not a
// record any of these fixtures ever write, so decide(..., 'escalate') would throw "evaluation
// names a missing record". Using r.startSha (a real record already in the log) instead keeps the
// test's stated behavior -- the evaluation SHA reaches the decision line -- true against the real
// validator. The 'developer' route test below stores the evaluation on an escalation record, whose
// schema (lib/records.mjs) checks only SHA format, not log membership, so EV is left as written there.
test('an evaluation that downgrades writes an ADR decision line naming the evaluation and no escalation record', async () => {
  const r = await loopRepo({ settings: enabled });
  const out = await escalateWithRoute(r.cwd, draft(), { evaluate: async () => ({ route: 'agent', evaluationSha: r.startSha }) });
  assert.deepEqual(out, { route: 'agent', sha: r.startSha });
  const line = (await readAdr(r.cwd)).find((l) => l.kind === 'decision');
  assert.deepEqual([line.level, line.by, line.title, line.evaluation], ['Consequential', 'agent', draft().question, r.startSha]);
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

test('answer refuses without developer evidence: no terminal, or a declined confirmation', async () => {
  const r = await loopRepo();
  const sha = await escalate(r.cwd, draft());
  await assert.rejects(answer(r.cwd, 'first', 'ok', ''), /cairn: /);
  await assert.rejects(answer(r.cwd, 'first', 'ok', '', { confirm: async () => false }), /cairn: /);
  assert.equal(escalationState(await r.log(), sha).status, 'open');
});

// Deviation from the plan text: the plan's own note ("The stored evidence is plan 01's shape
// {mode, author, signature}") does not match the actual `evidence` variant lib/records.mjs
// (already committed) uses for the answer/authorization/read record kinds -- the 'unsigned-local'
// branch needs {mode, purpose, subject, nonce, author: {name, email}, confirmed}, with no
// top-level `signature` field at all; tests/helpers/loop.mjs's own fixture documents this same
// gap. Checked against that real shape instead: mode, confirmed, and a non-empty author.name.
test('ok writes the answer record with the evidence and the answered ADR line', async () => {
  const r = await loopRepo();
  const esc = await escalate(r.cwd, draft());
  const sha = await answer(r.cwd, 'first', 'ok', '', asDev);
  const rec = decodeRecord(await catCommit(r.cwd, sha));
  assert.equal(rec.target, 'first');
  assert.deepEqual([rec.payload.escalation, rec.payload.kind, rec.payload.text, rec.payload.owner], [esc, 'ok', '', null]);
  assert.equal(rec.payload.evidence.mode, 'unsigned-local');
  assert.equal(rec.payload.evidence.confirmed, true);
  assert.ok(rec.payload.evidence.author.name.length > 0);
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
