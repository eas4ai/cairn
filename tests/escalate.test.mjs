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

// Fix round 1 finding 8 (plan 09 review): BAD_CHARS blocked C0 controls and DEL but not U+0085
// (NEL), U+2028 (LINE SEPARATOR), U+2029 (PARAGRAPH SEPARATOR) or the other C1 controls
// (U+0080-U+009F), so a "one non-empty line" field could carry a Unicode line terminator the
// terminal renders as a line break. A tab still survives (Task 8's own byte-for-byte test), and
// an ordinary Unicode character that is not a line terminator, such as U+00A0 (non-breaking
// space), still validates -- only line-breaking code points are refused.
test('a Unicode line terminator (NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR) or another C1 control is refused; a tab and an ordinary Unicode character still validate', () => {
  for (const f of ['question', 'recommendation', 'because', 'if_wrong', 'instead']) {
    for (const ch of ['\u0085', '\u2028', '\u2029', '\u0090']) {
      assert.throws(() => validateDraft(draft({ [f]: `one${ch}line` })), DraftError, `${f} with U+${ch.codePointAt(0).toString(16)}`);
    }
    assert.equal(validateDraft(draft({ [f]: 'a\ttab and a\u00a0non-breaking space' }))[f], 'a\ttab and a\u00a0non-breaking space');
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

import { readAdr } from '../lib/adr.mjs';
import { escalateWithRoute, decideConsequential } from '../lib/escalate.mjs';

// Deviation from the plan text: validateSettings (lib/settings.mjs, already committed) requires
// every typesafeai.* threshold key to be present (a closed-object schema); the plan's partial
// stub `{ typesafeai: { enabled: true, mode: 'shadow', model: 'jev-1.13.0' } }` fails loadSettings
// when makeProject/loopRepo shallow-merge it over the defaults (the same issue tests/tx.test.mjs
// already documents for its own settings fixture). Filled in with DEFAULT_SETTINGS' own defaults.
// Fix round 1 finding 11: kept at mode: 'shadow' rather than switched to 'route' -- 'route' mode
// needs a current passing calibration (lib/settings.mjs's validateSettings: "route mode needs a
// current passing calibration"), which no fixture in this plan's footprint provides (confirmed:
// loopRepo({ settings: { ...this object, mode: 'route' } }) throws SettingsError). The mode gate
// itself is plan 11's: lib/escalate.mjs's escalateWithRoute dispatches on whatever route the
// `evaluate` function it is given returns, and does not read typesafeai.mode at all -- these
// tests inject a stub `evaluate` directly, so the route below is the stub's own choice, not a
// live shadow-mode downgrade. Spec section 8: "In shadow mode the developer still decides"; that
// rule belongs to the real evaluator plan 11 builds, not to this stub.
const enabled = { typesafeai: { enabled: true, mode: 'shadow', model: 'jev-1.13.0',
  route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3,
  reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05,
  min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };
const EV = 'e'.repeat(40);

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
// This test's `route: 'agent'` comes from the stub `evaluate` passed in below, not from
// `enabled`'s mode: 'shadow' -- see the note on `enabled` above (finding 11).
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

import { answer, escalationState, unanswered } from '../lib/escalate.mjs';
import { describeEvidence, verifyEvidence } from '../lib/auth.mjs';
import { loadSettings } from '../lib/settings.mjs';

const asDev = { confirm: async () => true };

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

// Fix round 1 finding 6 (plan 09 review): escalate.mjs's own describeEvidence read ev.author as
// a string, but the answer record's real stored evidence (authenticateDeveloper's return value,
// stored as-is since Task 4) has author: {name, email} for unsigned-local -- so calling it on a
// real stored record produced "unsigned-local, author [object Object]: evidence, not
// authentication". lib/auth.mjs already exports a describeEvidence that reads the real shape;
// checked here against a real stored answer record instead of a hand-built flat object.
test('describeEvidence (lib/auth.mjs) reads a real stored answer record: unsigned-local is evidence, not authentication', async () => {
  const r = await loopRepo();
  const esc = await escalate(r.cwd, draft());
  const sha = await answer(r.cwd, 'first', 'ok', '', asDev);
  const rec = decodeRecord(await catCommit(r.cwd, sha));
  assert.equal(describeEvidence(rec.payload.evidence), 'unsigned-local: terminal confirmation by Cairn Test <test@example.invalid>; evidence, not authentication');
});

// Fix round 1 finding 7 (plan 09 review): answer() now re-checks its evidence with
// verifyEvidence right after authenticateDeveloper, the same defence-in-depth authorize() and
// readDecision() already apply. The review notes no live hole exists today (authenticateDeveloper
// itself already verifies a signature and always returns confirmed: true for unsigned-local, so
// no public-API path can make it return evidence verifyEvidence rejects); this is a positive
// regression check that the added call does not itself break the happy path, and that the
// evidence answer() stores is exactly what lib/auth.mjs's own verifyEvidence accepts.
test('the evidence answer() stores verifies with lib/auth.mjs verifyEvidence, the same check answer() now runs before writing', async () => {
  const r = await loopRepo();
  const esc = await escalate(r.cwd, draft());
  const sha = await answer(r.cwd, 'first', 'ok', '', asDev);
  const rec = decodeRecord(await catCommit(r.cwd, sha));
  const { settings } = await loadSettings(r.cwd);
  assert.equal(verifyEvidence(settings, rec.payload.evidence, { purpose: 'answer', subject: esc }), true);
});

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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { wake, render } from '../lib/wake.mjs';
const run = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/cairn.mjs', import.meta.url));

// Courtesy update, not one of the plan 09 review's 12 items: another (already-committed) fix
// round on lib/wake.mjs, "Fix round 1 item 7: Waiting's render drops the answer line section 6
// does not name, tested byte for byte", removed the trailing `answer: cairn answer ...` line from
// render()'s Waiting output (section 6's own contract is verdict, action or party, one reason
// line and the predicate; that line named a command the five fields never claimed to include).
// The five-fields-verbatim assertion below this plan actually owns is unaffected and still holds
// byte for byte; only the now-removed trailing line's own assertion is dropped, so this file's
// suite is green again against the current, stable lib/wake.mjs contract.
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
});

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

// Fix round 1 finding 10 (plan 09 review): cliDispute coerced --n with bare Number() and let a
// missing or malformed value flow straight into the concern token, so the refusal named the
// record ("concern token finding:<sha>#NaN needs a log SHA") instead of the actual problem: --n
// itself. Reproduced exactly as the review found it (no --n, --n 0, --n abc); each now refuses
// with a message naming the finding number, before dispute() or escalate() ever runs.
test('cairn dispute refuses a missing, non-integer or non-positive --n with a message naming the finding number', async () => {
  const r = await loopRepo();
  const rev = await r.review([{ n: 1, text: 'x' }]);
  const base = ['--commitment', 'first', '--record', rev, '--question', 'Defect?', '--recommendation', 'No.', '--because', 'declared', '--if-wrong', 'hidden input', '--instead', 'declare it'];
  const noN = await cliDispute(r.cwd, base);
  assert.equal(noN.code, 1);
  assert.match(noN.out, /^cairn: --n must be a positive integer naming the finding number/);
  const zero = await cliDispute(r.cwd, [...base, '--n', '0']);
  assert.equal(zero.code, 1);
  assert.match(zero.out, /^cairn: --n must be a positive integer naming the finding number/);
  const notANumber = await cliDispute(r.cwd, [...base, '--n', 'abc']);
  assert.equal(notANumber.code, 1);
  assert.match(notANumber.out, /^cairn: --n must be a positive integer naming the finding number/);
});
