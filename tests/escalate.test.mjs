import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, draftDigest, parseConcern, DraftError } from '../lib/escalate.mjs';
import { loopRepo } from './helpers/loop.mjs';
import { readLog, decodeRecord, KINDS } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { escalate, escalationsFor } from '../lib/escalate.mjs';

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
