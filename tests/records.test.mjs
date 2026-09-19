import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers/repo.mjs';
import { sha256 } from '../lib/canon.mjs';
import { git, emptyTree, catCommit } from '../lib/gitx.mjs';
import { KINDS, SCHEMAS, encodeRecord, decodeRecord, RecordError, refFieldsOf } from '../lib/records.mjs';

const WS = 'a'.repeat(40), D = 'sha256:' + 'b'.repeat(64);
// Deviation from the plan text (plan 06 carried obligation): 'start' now closes with
// intent/results, the same as 'promotion' and 'superseded' (lib/records.mjs).
const START = { slug: 'hooks', snapshot: WS, requirements: [{ requirement: 'LOOP-001', text_digest: D }], from_superseded: null, intent: null, results: [] };
async function rawCommit(repo, message) {
  const tree = await emptyTree(repo.dir);
  const head = Buffer.from(`tree ${tree}\nauthor A <a@b.c> 0 +0000\ncommitter A <a@b.c> 0 +0000\n\n`);
  const r = await git(['hash-object', '-t', 'commit', '-w', '--literally', '--stdin'], { cwd: repo.dir, input: Buffer.concat([head, Buffer.from(message)]) });
  return catCommit(repo.dir, r.stdout.trim());
}
const msg = (subject, body, trailers = [['Cairn-Schema', '1'], ['Cairn-Digest', sha256(body)]]) =>
  Buffer.concat([Buffer.from(`${subject}\n\n`), body, Buffer.from('\n\n' + trailers.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n')]);
const decodeRaw = (repo, subject, body, trailers) => rawCommit(repo, msg(subject, Buffer.isBuffer(body) ? body : Buffer.from(body), trailers)).then(decodeRecord);

test('the table has the 27 kinds of section 4 and no admin-transition', () => {
  assert.equal(KINDS.size, 27);
  assert.ok(KINDS.has('read') && !KINDS.has('admin-transition'));
  for (const k of KINDS) assert.ok(Object.keys(SCHEMAS[k]).length > 0, k);
});
// Fix round 1 item 2 (review-1.md finding 2): refFieldsOf must find every ref-typed field, not
// only the ones a hand-written list happened to name -- report.brief, escalation.evaluation,
// outside.evaluation, evaluation-intent.log_head and calibration.log_head, and superseded.start
// were all real fields lib/travel.mjs's old hand-written RECORD_REFS list omitted.
test('refFieldsOf finds every ref-typed field straight from SCHEMAS, including list(ref)', () => {
  const has = (fields, name, list = false) => fields.some((f) => f.name === name && f.list === list);
  assert.ok(has(refFieldsOf('report').recordFields, 'brief'), 'report.brief');
  assert.ok(has(refFieldsOf('escalation').recordFields, 'evaluation'), 'escalation.evaluation');
  assert.ok(has(refFieldsOf('outside').recordFields, 'evaluation'), 'outside.evaluation');
  assert.ok(has(refFieldsOf('outside').recordFields, 'item'), 'outside.item');
  assert.ok(has(refFieldsOf('evaluation-intent').recordFields, 'log_head'), 'evaluation-intent.log_head');
  assert.ok(has(refFieldsOf('calibration').recordFields, 'log_head'), 'calibration.log_head');
  assert.ok(has(refFieldsOf('superseded').recordFields, 'start'), 'superseded.start');
  assert.ok(has(refFieldsOf('superseded').recordFields, 'carried', true), 'superseded.carried (list)');
  assert.ok(has(refFieldsOf('superseded').recordFields, 'intent'), 'superseded.intent');
  assert.ok(has(refFieldsOf('start').snapshotFields, 'snapshot'), 'start.snapshot');
  assert.ok(has(refFieldsOf('start').recordFields, 'from_superseded'), 'start.from_superseded');
  assert.deepEqual(refFieldsOf('no-such-kind'), { snapshotFields: [], recordFields: [] });
  // A positive cross-check against SCHEMAS itself, kind by kind, so the derivation can never
  // silently drift even for a field this test did not name explicitly.
  for (const kind of KINDS) {
    for (const [name, desc] of Object.entries(SCHEMAS[kind])) {
      let d = desc, list = false;
      while (d.t === 'nullable' || d.t === 'list') { if (d.t === 'list') list = true; d = d.of; }
      if (d.t === 'ref') assert.ok(has(refFieldsOf(kind).recordFields, name, list), `${kind}.${name}`);
      if (d.t === 'ws' || d.t === 'input') assert.ok(has(refFieldsOf(kind).snapshotFields, name, list), `${kind}.${name}`);
    }
  }
});
test('encodeRecord emits the subject, canonical body and exactly two trailers', () => {
  const r = encodeRecord('start', 'hooks', START);
  assert.equal(r.subject, 'cairn: start hooks');
  assert.equal(r.body, '{"from_superseded":null,"intent":null,"requirements":[{"requirement":"LOOP-001","text_digest":"' + D + '"}],"results":[],"slug":"hooks","snapshot":"' + WS + '"}');
  assert.deepEqual(r.trailers, [['Cairn-Schema', '1'], ['Cairn-Digest', sha256(r.body)]]);
});
test('encodeRecord refuses unknown kinds, path targets, unknown keys, missing keys and wrong types', () => {
  assert.throws(() => encodeRecord('admin-transition', 'x', {}), RecordError);
  assert.throws(() => encodeRecord('start', 'docs/a.md', START), RecordError);
  assert.throws(() => encodeRecord('start', 'hooks', { ...START, extra: 1 }), (e) => e.reasons.some((r) => /unknown key extra/.test(r)));
  assert.throws(() => encodeRecord('done', 'hooks', { slug: 'hooks' }), (e) => e.reasons.some((r) => /missing snapshot/.test(r)));
  assert.throws(() => encodeRecord('resolution', 'hooks', { source: WS, finding: -1, snapshot: WS, explanation: 'x' }), (e) => e.reasons.some((r) => /finding/.test(r)));
  assert.throws(() => encodeRecord('calibration', 'p', { policy_digest: D, log_head: WS, predicted_agent: 60, false_downgrades: 0, bound: 1.5, criterion: 'c', result: 'pass' }), (e) => e.reasons.some((r) => /bound/.test(r)));
});
test('a payload key that shadows Object.prototype, such as toString, is still refused as an unknown key', () => {
  assert.throws(() => encodeRecord('done', 'hooks', { slug: 'hooks', snapshot: WS, toString: 'x' }), (e) => e.reasons.some((r) => /unknown key toString/.test(r)));
});
test('decodeRecord round-trips a well-formed record', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const { body } = encodeRecord('start', 'hooks', START);
  assert.deepEqual(await decodeRaw(repo, 'cairn: start hooks', body), { kind: 'start', target: 'hooks', payload: START });
});
test('the parser rejects invalid UTF-8 in the body', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = Buffer.concat([Buffer.from('{"slug":"'), Buffer.from([0xff]), Buffer.from(`","snapshot":"${WS}"}`)]);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body), /invalid UTF-8/);
});
test('the parser rejects control characters outside JSON escapes', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"slug":"a\u0001b","snapshot":"${WS}"}`), /invalid JSON/);
});
test('the parser rejects noncanonical JSON even with a matching digest', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"snapshot":"${WS}","slug":"hooks"}`), /noncanonical/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"slug":"hooks","slug":"x","snapshot":"${WS}"}`), /noncanonical/);
});
test('the parser rejects a body whose digest does not match the trailer', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = encodeRecord('done', 'hooks', { slug: 'hooks', snapshot: WS }).body;
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Schema', '1'], ['Cairn-Digest', sha256('other')]]), /digest/);
});
test('the parser rejects wrong field counts', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', '{"slug":"hooks"}'), /missing snapshot/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', `{"note":"x","slug":"hooks","snapshot":"${WS}"}`), /unknown key note/);
});
test('the parser rejects out-of-range numbers', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(decodeRaw(repo, 'cairn: resolution hooks', `{"explanation":"x","finding":1e400,"snapshot":"${WS}","source":"${WS}"}`), RecordError);
  await assert.rejects(decodeRaw(repo, 'cairn: resolution hooks', `{"explanation":"x","finding":1.5,"snapshot":"${WS}","source":"${WS}"}`), /finding/);
});
test('the parser rejects trailer sets other than the two, and content in trailers', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = encodeRecord('done', 'hooks', { slug: 'hooks', snapshot: WS }).body;
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Digest', sha256(body)]]), /two trailers/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Schema', '1'], ['Cairn-Digest', sha256(body)], ['Cairn-Slug', 'hooks']]), /two trailers/);
  await assert.rejects(decodeRaw(repo, 'cairn: done hooks', body, [['Cairn-Schema', '2'], ['Cairn-Digest', sha256(body)]]), /schema/);
});
test('the parser rejects subjects that are not kind and token', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const body = encodeRecord('done', 'hooks', { slug: 'hooks', snapshot: WS }).body;
  await assert.rejects(decodeRaw(repo, 'cairn: admin-transition hooks', body), /kind/);
  await assert.rejects(decodeRaw(repo, 'cairn: done docs/spec/a.md', body), /target/);
  await assert.rejects(decodeRaw(repo, 'Release 2.0', body), /subject/);
});

import { updateRefCAS, CasError } from '../lib/gitx.mjs';
import { appendRecord, readLog, range, LOG_REF } from '../lib/records.mjs';

test('appendRecord chains empty commits on refs/cairn/log and readLog returns them oldest first', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const s1 = await appendRecord(repo.dir, 'start', 'hooks', START);
  const s2 = await appendRecord(repo.dir, 'done', 'hooks', { slug: 'hooks', snapshot: WS });
  const log = await readLog(repo.dir);
  assert.deepEqual(log.map((r) => [r.sha, r.kind, r.parent]), [[s1, 'start', null], [s2, 'done', s1]]);
  assert.equal((await catCommit(repo.dir, s2)).tree, await emptyTree(repo.dir));
  assert.equal(await repo.git('rev-parse', 'refs/cairn/log'), s2);
});
test('the log ref refuses a stale old OID', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const s1 = await appendRecord(repo.dir, 'start', 'hooks', START);
  const s2 = await appendRecord(repo.dir, 'done', 'hooks', { slug: 'hooks', snapshot: WS });
  await assert.rejects(updateRefCAS(repo.dir, LOG_REF, s1, s1), CasError);
  assert.equal(await repo.git('rev-parse', LOG_REF), s2);
});
test('readLog refuses a commit on the log that is not a record', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const plain = await repo.commit('not a record');
  await updateRefCAS(repo.dir, LOG_REF, plain, null);
  await assert.rejects(readLog(repo.dir), RecordError);
});
test('range is the log after the last start and knows whether it is closed', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  assert.deepEqual(range([]), { start: null, records: [], closed: false });
  await appendRecord(repo.dir, 'start', 'a', { ...START, slug: 'a' });
  await appendRecord(repo.dir, 'done', 'a', { slug: 'a', snapshot: WS });
  const s2 = await appendRecord(repo.dir, 'start', 'b', { ...START, slug: 'b' });
  const item = await appendRecord(repo.dir, 'item', 'b', { kind: 'backlog', slug: 'b', source: 'LOOP-001', body: 'idea' });
  let r = range(await readLog(repo.dir));
  assert.deepEqual([r.start.sha, r.records.map((x) => x.sha), r.closed], [s2, [item], false]);
  await appendRecord(repo.dir, 'done', 'b', { slug: 'b', snapshot: WS });
  r = range(await readLog(repo.dir));
  assert.equal(r.closed, true);
});

const SHA = '1'.repeat(40);
const DIGEST = 'sha256:' + '2'.repeat(64);
function roundTrip(kind, target, payload) {
  const { subject, body, trailers } = encodeRecord(kind, target, payload);
  return decodeRecord({ subject, body, trailers });
}

describe('measurement-family schemas', () => {
  test('evaluation-intent: one request, source settled before any call', () => {
    const payload = { draft_digest: DIGEST, snapshot: SHA, log_head: SHA, adr_digest: DIGEST, settings_digest: DIGEST,
      policy_digest: DIGEST, source: 'jev', request_digest: DIGEST };
    assert.deepEqual(roundTrip('evaluation-intent', 'demo', payload).payload, payload);
    assert.deepEqual(roundTrip('evaluation-intent', 'demo', { ...payload, request_digest: null }).payload.request_digest, null);
    assert.throws(() => encodeRecord('evaluation-intent', 'demo', { ...payload, source: null }), /expected one of/);
    assert.throws(() => encodeRecord('evaluation-intent', 'demo', { ...payload, owner_request: DIGEST }), /unknown key|expected/);
  });
  test('evaluation-call: source, transport, session, no owner/option and no not_sent', () => {
    const payload = { intent: SHA, source: 'review', request_digest: DIGEST, outcome: 'response', model: 'claude-fable-5-1',
      transport: 'remote', session: 'sess-1', raw: 'abcd', failure_class: null,
      answers: [{ id: 'evidence', value: { score: 3.4, confidence: 0.7, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.5, 4: 0.4 } } }],
      usage: { input_tokens: 10, output_tokens: 2 } };
    assert.deepEqual(roundTrip('evaluation-call', 'demo', payload).payload, payload);
    assert.throws(() => encodeRecord('evaluation-call', 'demo', { ...payload, outcome: 'not_sent' }), /expected one of/);
    assert.throws(() => encodeRecord('evaluation-call', 'demo', { ...payload, call: 'option' }), /unknown key/);
  });
  test('measurement replaces evaluation, with the composite fields', () => {
    const payload = { intent: SHA, call: SHA, draft_digest: DIGEST, source: 'jev', model: 'jev-1.13.0',
      levels: [{ dimension: 'evidence', level: 3.4, confidence: 0.7 }, { dimension: 'reach', level: 0.6, confidence: 0.5 },
        { dimension: 'contract', level: 0.1, confidence: 0.9 }, { dimension: 'surface', level: 0, confidence: 0.8 },
        { dimension: 'ambiguity', level: 1.0, confidence: 0.5 }],
      composite: 0.22, veto: null, suggested: 'agent', outcome: 'composite', reason: 'composite 0.220 <= 0.35, confidences ok' };
    assert.deepEqual(roundTrip('measurement', 'demo', payload).payload, payload);
    assert.equal('evaluation' in SCHEMAS, false, 'the old kind name is gone, not kept alongside the new one');
    assert.ok('measurement' in SCHEMAS);
    assert.throws(() => encodeRecord('measurement', 'demo', { ...payload, dimension: 'evidence', level: 3.4 }), /unknown key/);
  });
  test('a floor-hit measurement carries no call, no levels, no composite, but source is never null: it is settled from settings alone', () => {
    const payload = { intent: SHA, call: null, draft_digest: DIGEST, source: 'jev', model: null, levels: [],
      composite: null, veto: null, suggested: null, outcome: 'floor', reason: 'floor:data' };
    assert.deepEqual(roundTrip('measurement', 'demo', payload).payload, payload);
    assert.throws(() => encodeRecord('measurement', 'demo', { ...payload, source: null }), /expected one of/);
  });
});
