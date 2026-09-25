import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLog, decodeRecord, KINDS } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { loopRepo } from './helpers/loop.mjs';
import { review, targets, ReviewError } from '../lib/review.mjs';

export const SETTINGS = {
  harness: { claude_code: { adversary_model: 'claude-fable-5-1', adversary_transport: 'remote' }, codex: null },
  interfaces: ['src/api/**'], network_exclude: ['fixtures/private/**'],
};
export async function claims(r, over = {}) {
  const t = await targets(r.cwd, await r.log(), r.slug);
  const answers = [
    ...t.mechanisms.flatMap((m) => [{ question: 'Q1', target: m, status: 'observed', text: `flag fail: sudus: ${m.toUpperCase()}: fail at receipt 3f2` }, { question: 'Q2', target: m, status: 'observed', text: 'the printed line names the flag, not a setup error' }]),
    ...t.requirements.flatMap((q) => [{ question: 'Q3', target: q, status: 'observed', text: 'node check.mjs with an empty flag exits 1' }, { question: 'Q4', target: q, status: 'not-checked', text: 'the logger changed too' }]),
    { question: 'Q5', target: r.slug, status: 'not-checked', text: 'a race between two writers' }, { question: 'Q6', target: r.slug, status: 'not-checked', text: '' },
  ];
  return { examined: ['src/demo.mjs'], answers, findings: [], ...over };
}

test('a review records the current snapshot, session, examined entries, every answer and numbered findings', async () => {
  for (const k of ['review', 'brief', 'report', 'resolution', 'acceptance']) assert.ok(KINDS.has(k));
  const r = await loopRepo();
  const sha = await review(r.cwd, 'first', await claims(r, { findings: [{ n: 1, text: 'no empty-input test' }] }), { env: { SUDUS_SESSION: 's-builder' } });
  const c = await catCommit(r.cwd, sha);
  assert.equal(c.subject, 'sudus: review first');
  const p = decodeRecord(c).payload;
  assert.deepEqual([p.slug, p.session, p.examined, p.findings], ['first', 's-builder', ['src/demo.mjs'], [{ n: 1, text: 'no empty-input test' }]]);
  assert.match(p.snapshot, /^[0-9a-f]{40}$/);
  assert.equal(p.answers.length, (await claims(r)).answers.length);
});

test('coverage: a missing pair, an unknown target, a duplicate, an empty examined list and a bad finding number are refused', async () => {
  const r = await loopRepo();
  const s = await claims(r);
  await assert.rejects(review(r.cwd, 'first', { ...s, answers: s.answers.filter((a) => a.question !== 'Q2') }), new RegExp(`${s.answers[0].target} Q2 has no answer`));
  await assert.rejects(review(r.cwd, 'first', { ...s, answers: [...s.answers, { question: 'Q3', target: 'ZZZ-999', status: 'observed', text: 'x' }] }), /ZZZ-999 is not a target of first/);
  await assert.rejects(review(r.cwd, 'first', { ...s, answers: [...s.answers, s.answers[0]] }), /answered twice/);
  await assert.rejects(review(r.cwd, 'first', { ...s, examined: [] }), /examined needs at least one entry/);
  await assert.rejects(review(r.cwd, 'first', { ...s, findings: [{ n: 2, text: 'x' }] }), /findings must be numbered 1, 2/);
  await assert.rejects(review(r.cwd, 'other', s), /no open commitment other/);
});

test('shape: observed needs text; the status is closed; keys are closed', async () => {
  const r = await loopRepo();
  const s = await claims(r);
  const swap = (a) => ({ ...s, answers: s.answers.map((x) => (x.question === 'Q5' ? a : x)) });
  await assert.rejects(review(r.cwd, 'first', swap({ question: 'Q5', target: 'first', status: 'observed', text: '' })), /Q5 observed needs text/);
  await assert.rejects(review(r.cwd, 'first', swap({ question: 'Q5', target: 'first', status: 'true', text: 'y' })), /status must be observed or not-checked/);
  await assert.rejects(review(r.cwd, 'first', swap({ question: 'Q5', target: 'first', status: 'not-checked', text: 'y', cite: 1 })), /answer keys are question, target, status, text/);
});

// tests/review.test.mjs (append)
import fs from 'node:fs/promises';
import path from 'node:path';
import { git } from '../lib/gitx.mjs';
import { sha256 } from '../lib/canon.mjs';
import { detectHarness, brief, interfaceObligations, CONFINES, ROLE } from '../lib/review.mjs';

// Fix round 1 item 4: rewritten per the review's ruling. Section 9: "A null or unknown entry
// means any model." Read as written, a harness with no settings entry at all imposes no model or
// transport constraint rather than blocking the brief; `muse` (absent from SETTINGS.harness
// entirely, the same as `codex: null`) resolves the same way `codex` does.
test('the harness comes from --harness, then SUDUS_HARNESS, then the harness environment; an absent or null settings entry means any model and any transport', () => {
  assert.deepEqual(detectHarness(SETTINGS, { harness: 'claude_code', env: {} }), { name: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', boundary: 'unenforced' });
  assert.equal(detectHarness(SETTINGS, { env: { SUDUS_HARNESS: 'claude_code' } }).name, 'claude_code');
  assert.equal(detectHarness(SETTINGS, { env: { CLAUDECODE: '1' } }).name, 'claude_code');
  assert.deepEqual(detectHarness(SETTINGS, { harness: 'codex', env: {} }), { name: 'codex', model: null, transport: null, boundary: 'unenforced' });
  assert.throws(() => detectHarness(SETTINGS, { env: {} }), /no harness detected; pass --harness/);
  assert.deepEqual(detectHarness(SETTINGS, { harness: 'muse', env: {} }), { name: 'muse', model: null, transport: null, boundary: 'unenforced' });
  assert.deepEqual(CONFINES, { claude_code: false, codex: false, muse: false });
});

export async function reviewed(over = {}, { pass = false } = {}) {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('change an interface');
  if (pass) await r.passReq('DEMO-001');
  r.rev = await review(r.cwd, 'first', await claims(r, over), { env: { SUDUS_SESSION: 's-builder' } });
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  return r;
}

// Sudus 4.0.0 (spec revision 16): one fresh subagent reads the project itself, read-only; there is
// no projection, and the launch line names no working-directory copy.
test('brief writes the record and the rendered file, and prints the launch block for one fresh read-only subagent', async () => {
  const bare = await loopRepo({ settings: SETTINGS });
  await assert.rejects(brief(bare.cwd, 'first', { harness: 'claude_code' }), /no review for first/);
  const r = await reviewed({ findings: [{ n: 1, text: 'no test' }] }, { pass: true });
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  const p = decodeRecord(await catCommit(r.cwd, b.sha)).payload;
  const receipts = (await r.log()).filter((x) => x.kind === 'receipt');
  assert.ok(b.text.includes(`\n## Receipts (what already ran; do not run it again)\nDEMO-001: latest receipt ${receipts.at(-1).sha} from mechanism demo-001: pass\nDEMO-001: fail receipt ${receipts.at(-2).sha} from mechanism demo-001, the violating example its review binds\n`), b.text);
  assert.deepEqual(p, { slug: 'first', review: r.rev, harness: 'claude_code', model: 'claude-fable-5-1', payload_digest: sha256(b.text), decisions: [] });
  assert.ok(b.briefPath.startsWith(path.join(r.cwd, '.sudus/output/brief-')));
  assert.equal(await fs.readFile(b.briefPath, 'utf8'), b.text);
  for (const s of ['## Your role\nYour task is READ-ONLY in the repo.', '- Do not start subagents. Do the whole review inline, yourself.', '- Do not build, run tests or run any project code. The receipts below say what already ran.',
    '## Agent decisions (each is a decision pair below)\nnone recorded\n',
    '## Interface obligations\nsrc/api/x.mjs\n', '## Changed paths (start snapshot to reviewed snapshot; A added, M modified, D deleted)\n', '\nA src/api/x.mjs\n', '## Builder findings\n1. no test\n', '[DEMO-001]', 'Falsifier:', 'mechanism demo-001 Q1 observed:',
    '## Paths not to read\n', '\npattern fixtures/private/**\n', '\n  falsifier DEMO-001\n  security first\n  logic first\n  complexity first\n', '- "sudus_bug": null, or the bug report']) assert.ok(b.text.includes(s), s);
  assert.equal(/projection|experiment/i.test(b.text), false);
  assert.equal(/[^\x00-\x7f]/.test(b.text), false, 'the brief is ASCII');
  assert.deepEqual(b.launch.split('\n'), [`sudus: brief first ${b.sha}`, `brief: ${b.briefPath}`, `brief digest: ${sha256(b.text)}`, 'harness: claude_code', 'model: claude-fable-5-1',
    `start: in claude_code, start one fresh subagent running as claude-fable-5-1 with none of your conversation, working in ${r.cwd}, with the file ${b.briefPath} as its entire prompt. It reads only and starts no subagents. When it hands back its report file, run: sudus report first --file <its report>`, '']);
  assert.deepEqual(await interfaceObligations(r.cwd, SETTINGS, r.startSnapshot, r.revPayload.snapshot), ['src/api/x.mjs']);
  const any = await brief(r.cwd, 'first', { harness: 'codex' });
  assert.match(any.launch, /\nmodel: any\nstart: in codex, start one fresh subagent with none of your conversation, /);
});

// The developer's role text of 2026-09-25, quoted as written except "imperative" and "your
// report"; the five lenses and the severity scale are in it word for word.
test('the brief carries the developer\'s role text: no stake in Done, the five lenses, the severities, a Sudus bug stops the review', async () => {
  const b = await brief((await reviewed()).cwd, 'first', { harness: 'claude_code' });
  for (const s of ['You have no stake in Done.', 'Accuracy and candidness is imperative.', 'If your report includes a bug report about Sudus, that you have discovered - stop the review, provide the bug report to the builder and stop.',
    '1. The falsifier.', '2. The decisions.', '3. Security.', '4. Logic.', '5. Complexity and spec adherence.', 'Mark it Critical', 'Major (', 'Minor (', 'Developer rulings are settled; the implementation of them is not.', 'The user requires your best effort.',
    '- Treat every claim in the builder\'s account as something to disprove, not as settled.', '- Read the whole specification under docs/spec']) assert.ok(b.text.includes(s), s);
  assert.equal(ROLE.join('\n').includes('imperitive') || ROLE.join('\n').includes('you\'re report'), false);
});

// tests/review.test.mjs (append)
import { report, attackPairs } from '../lib/review.mjs';

export async function briefed(over = {}) {
  const r = await reviewed(over);
  r.b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  r.bp = decodeRecord(await catCommit(r.cwd, r.b.sha)).payload;
  return r;
}
export function adversary(r, over = {}) {
  const pairs = attackPairs({ slug: r.slug ?? 'first', requirements: [...new Set(r.revPayload.answers.filter((a) => a.question === 'Q3').map((a) => a.target))] }, r.bp.decisions);
  return {
    attempts: pairs.map(([question, target]) => ({ question, target, looked_for: `a way to break ${target} through ${question}`, found: 'held', held: true })),
    interface_attempts: [{ path: 'src/api/x.mjs', looked_for: 'a caller of x() the change breaks', found: 'none', held: true }],
    findings: [{ n: 1, severity: 'Major', where: 'src/demo.mjs:1', text: 'the flag accepts whitespace-only input', remedy: null }],
    sudus_bug: null, ...over,
  };
}

test('report records the attempts, interface attempts and rated findings at the reviewed snapshot; a second report is refused', async () => {
  const r = await briefed();
  const sha = await report(r.cwd, 'first', adversary(r, { findings: [{ n: 1, severity: 'Critical', where: 'DEMO-001', text: 'blank passes', remedy: 'trim first' }] }));
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.slug, p.brief, p.snapshot, p.sudus_bug], ['first', r.b.sha, r.revPayload.snapshot, null]);
  assert.deepEqual(p.attempts.map((a) => `${a.question} ${a.target}`), ['falsifier DEMO-001', 'security first', 'logic first', 'complexity first']);
  assert.deepEqual(p.findings, [{ n: 1, severity: 'Critical', where: 'DEMO-001', text: 'blank passes', remedy: 'trim first' }]);
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /one report per commitment; first has/);
  // Review of 4.0.0: a brief after the complete report wrote an orphan brief record.
  const head = (await readLog(r.cwd)).length;
  await assert.rejects(brief(r.cwd, 'first', { harness: 'claude_code' }), new RegExp(`one report per commitment; first has ${sha}, so it takes no new brief`));
  assert.equal((await readLog(r.cwd)).length, head);
});
// Review of 3.8.2: a second review after the report made wake name `report` for the new review
// forever, while report refused a second report, and no cycle escalation fired.
test('a review after the report is refused: changes after it are resolutions', async () => {
  const r = await briefed();
  await report(r.cwd, 'first', adversary(r));
  const head = (await readLog(r.cwd)).length;
  await assert.rejects(review(r.cwd, 'first', await claims(r), { env: { SUDUS_SESSION: 's-builder' } }), /first has a report; a change after it gets a resolution/);
  assert.equal((await readLog(r.cwd)).length, head);
});

// Issue #13: the brief is the adversary's entire prompt, so an adversary that reads only the brief
// text can write a report that is accepted.
test('a report written from the brief text alone is accepted', async () => {
  const r = await briefed();
  const report_ = r.b.text.slice(r.b.text.indexOf('## Report\n'));
  const listed = (field) => { const lines = report_.split('\n'); const i = lines.findIndex((l) => l.startsWith(`- "${field}"`)); const out = []; for (let j = i + 1; j < lines.length && lines[j].startsWith('  '); j++) out.push(lines[j].trim()); return out; };
  const body = {
    attempts: listed('attempts').map((l) => { const [question, target] = l.split(' '); return { question, target, looked_for: 'a way around it', found: 'none', held: true }; }),
    interface_attempts: listed('interface_attempts').map((line) => ({ path: JSON.parse(line), looked_for: 'a broken caller', found: 'none', held: true })),
    findings: [], sudus_bug: null,
  };
  assert.ok(body.attempts.length === 4 && body.interface_attempts.length === 1, JSON.stringify(body));
  const sha = await report(r.cwd, 'first', body);
  assert.equal(decodeRecord(await catCommit(r.cwd, sha)).payload.attempts.length, 4);
});

// Issue #13: the host's limits for the adversary come from settings.adversary_rules and are part of
// the recorded brief, so nobody edits the prompt the brief record names.
test('the brief prints adversary_rules under Host rules, inside the text its record digests', async () => {
  const r = await loopRepo({ settings: { ...SETTINGS, adversary_rules: ['stay out of vendor/', 'read no file over 1 MB'] } });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('change an interface');
  await review(r.cwd, 'first', await claims(r), { env: { SUDUS_SESSION: 's-builder' } });
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  assert.ok(b.text.includes('\n## Host rules\nThe machine you run on sets these limits; keep to them.\n- stay out of vendor/\n- read no file over 1 MB\n\n## Report\n'), b.text);
  assert.equal(decodeRecord(await catCommit(r.cwd, b.sha)).payload.payload_digest, sha256(b.text));
  assert.ok(!(await briefed()).b.text.includes('## Host rules'));
});

// Review of 3.5.0: git C-quoted a non-ASCII path in diffTree's output, so no interfaces glob
// matched it and a changed interface file got no obligation at all.
test('a changed interface file with a non-ASCII name is an obligation in the brief and the report', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/caf\u00e9.mjs', 'export const x = 2;\n');
  await r.commit('change an interface');
  const rev = await review(r.cwd, 'first', await claims(r), { env: { SUDUS_SESSION: 's-builder' } });
  const revPayload = decodeRecord(await catCommit(r.cwd, rev)).payload;
  assert.deepEqual(await interfaceObligations(r.cwd, SETTINGS, r.startSnapshot, revPayload.snapshot), ['src/api/caf\u00e9.mjs']);
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  assert.ok(b.text.includes('## Interface obligations\nsrc/api/caf\u00e9.mjs\n'), b.text);
  const bp = decodeRecord(await catCommit(r.cwd, b.sha)).payload;
  const body = adversary({ bp, revPayload }, { interface_attempts: [] });
  await assert.rejects(report(r.cwd, 'first', body), /interface src\/api\/caf\u00e9\.mjs has no attempt/);
});

// Review of 3.5.0: a path ending in a space was not recoverable from a plain line; the Report
// section writes each interface path as a JSON string.
test('the Report section writes interface paths as JSON strings, so a trailing space survives', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/handler.mjs ', 'export const x = 2;\n');
  await r.commit('change an interface');
  await review(r.cwd, 'first', await claims(r), { env: { SUDUS_SESSION: 's-builder' } });
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  assert.ok(b.text.includes('\n  "src/api/handler.mjs "\n'), b.text);
});

// The adversary reads only: a report is taken only while the work is as reviewed.
test('report refuses once the workspace differs from the reviewed snapshot, and refuses a stale, a Sudus 3 or a used brief', async () => {
  const r = await briefed();
  await r.write('src/demo.mjs', 'export const changed = 1;\n');
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /workspace differs from the reviewed snapshot; the adversary reads only/);
  await review(r.cwd, 'first', await claims(r));
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /brief [0-9a-f]{40} is stale: the review is/);
  const rev = (await r.log()).filter((x) => x.kind === 'review').at(-1);
  const old = await r.add('brief', 'first', { slug: 'first', review: rev.sha, harness: 'claude_code', model: null, transport: null, boundary: 'unenforced', projection_digest: 'sha256:' + '1'.repeat(64), payload_digest: 'sha256:' + '2'.repeat(64), exclusions_digest: 'sha256:' + '3'.repeat(64) });
  await assert.rejects(report(r.cwd, 'first', adversary(r)), new RegExp(`brief ${old} was written by Sudus 3; run sudus brief first again`));
  const b2 = await brief(r.cwd, 'first', { harness: 'claude_code' });
  await report(r.cwd, 'first', adversary(r, { attempts: [], interface_attempts: [], findings: [], sudus_bug: 'the brief lists no receipt' }));
  await assert.rejects(report(r.cwd, 'first', adversary(r)), new RegExp(`brief ${b2.sha} already has a report; run sudus brief first again`));
});

test('report refuses the 3.x fields, a missing or unknown attempt, a malformed attempt or interface attempt, and a malformed finding', async () => {
  const r = await briefed();
  const a = adversary(r);
  await assert.rejects(report(r.cwd, 'first', { ...a, model: 'claude-fable-5-1', projection_digest: 'x' }), /unknown field model, projection_digest; the fields are attempts, findings, interface_attempts, sudus_bug/);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: a.attempts.filter((x) => x.question !== 'logic') }), /logic first has no attempt/);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: [...a.attempts, { question: 'falsifier', target: 'ZZZ-999', looked_for: 'x', found: 'y', held: true }] }), /falsifier ZZZ-999 is not a pair the brief for first names/);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: [...a.attempts.slice(1), { question: 'falsifier', target: 'DEMO-001', text: 'x' }] }), /an attempt is \{question, target, looked_for, found, held\}/);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: [...a.attempts.slice(1), { question: 'falsifier', target: 'DEMO-001', looked_for: 'x', found: '', held: 'yes' }] }), /falsifier DEMO-001 needs looked_for and found text and held true or false/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { interface_attempts: [] })), /interface src\/api\/x.mjs has no attempt/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { interface_attempts: [{ path: 'src/api/x.mjs', text: 'x' }] })), /an interface attempt is \{path, looked_for, found, held\}/);
  const finding = (f) => adversary(r, { findings: [{ n: 1, severity: 'Major', where: 'src/demo.mjs', text: 'x', remedy: null, ...f }] });
  await assert.rejects(report(r.cwd, 'first', finding({ severity: 'Blocker' })), /finding 1 severity is Critical, Major or Minor/);
  await assert.rejects(report(r.cwd, 'first', finding({ where: '' })), /finding 1 needs where and text/);
  await assert.rejects(report(r.cwd, 'first', finding({ remedy: 'one\ntwo' })), /finding 1 remedy is one line or null/);
  await assert.rejects(report(r.cwd, 'first', finding({ n: 2 })), /findings are numbered 1, 2, \.\.\. each \{n, severity, where, text, remedy\}/);
  const sha = await report(r.cwd, 'first', adversary(r, { findings: [{ n: 1, severity: 'Minor', where: 'README.md', text: 'stale example' }] }));
  assert.deepEqual(decodeRecord(await catCommit(r.cwd, sha)).payload.findings, [{ n: 1, severity: 'Minor', where: 'README.md', text: 'stale example', remedy: null }]);
});

// The developer's role text: "If your report includes a bug report about Sudus ... stop the
// review, provide the bug report to the builder and stop." Such a report attempts nothing, does not
// complete the review, and the review goes on through a new brief.
test('a report that stops on a Sudus bug records only the bug; a new brief takes the review on', async () => {
  const r = await briefed();
  await assert.rejects(report(r.cwd, 'first', adversary(r, { sudus_bug: 'the brief lists no receipt' })), /a report that stops on a Sudus bug has empty attempts, interface_attempts and findings/);
  await assert.rejects(report(r.cwd, 'first', { sudus_bug: '  ' }), /sudus_bug is null or the bug report text/);
  const bug = await report(r.cwd, 'first', { sudus_bug: 'the brief lists no receipt for DEMO-001' });
  const p = decodeRecord(await catCommit(r.cwd, bug)).payload;
  assert.deepEqual([p.sudus_bug, p.attempts, p.interface_attempts, p.findings], ['the brief lists no receipt for DEMO-001', [], [], []]);
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, ['no report']);
  await brief(r.cwd, 'first', { harness: 'claude_code' });
  await report(r.cwd, 'first', adversary(r, { findings: [] }));
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, []);
});

// Lens 2 needs the decisions: every decision line the agent added in the commitment and every
// item it put off becomes a pair the report must attempt; a developer's line is a ruling.
test('the brief lists the agent\'s decisions and captured items as decision pairs the report must attempt', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  const id = await r.decide();
  await r.commit('decide');
  const item = await r.item('backlog', 'DEMO-001', 'later-greeting');
  r.rev = await review(r.cwd, 'first', await claims(r), { env: { SUDUS_SESSION: 's-builder' } });
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  r.b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  r.bp = decodeRecord(await catCommit(r.cwd, r.b.sha)).payload;
  assert.deepEqual(r.bp.decisions, [id, item]);
  assert.ok(r.b.text.includes(`decision ${id}: [Consequential] Use a map. Rests on: nothing named. Wrong if: lookups are rare. A map keeps lookups constant.\n`), r.b.text);
  assert.ok(r.b.text.includes(`decision ${item}: captured the backlog item later-greeting from DEMO-001: an idea\n`), r.b.text);
  assert.ok(r.b.text.includes(`\n  decision ${id}\n  decision ${item}\n`));
  const a = adversary(r);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: a.attempts.filter((x) => x.target !== item) }), new RegExp(`decision ${item} has no attempt`));
  await report(r.cwd, 'first', a);
});

// tests/review.test.mjs (append)
import { resolve, decline, ledger, reviewState } from '../lib/review.mjs';
import { answer, escalate } from '../lib/escalate.mjs';

export async function reported(over = {}) {
  const r = await briefed();
  r.rep = await report(r.cwd, 'first', adversary(r, over));
  return r;
}
export async function fixed(r, n, text, opts) {
  await r.write('src/demo.mjs', `export const demo = ${JSON.stringify(text)};\n`);
  return resolve(r.cwd, 'first', n, text, opts);
}
const disputeOf = (record, n, commitment = 'first') => ({ commitment, concerns: [`finding:${record}#${n}`], question: 'Defect?', recommendation: 'No.', because: 'whitespace is valid here', if_wrong: 'bad input passes', instead: 'trim', options: [], named_paths: [], cited_decisions: [] });

test('resolve names finding N on its exact source record and the snapshot after the fix; it closes the finding', async () => {
  const r = await reported();
  await assert.rejects(resolve(r.cwd, 'first', 2, 'x'), /no finding 2 is open/);
  await assert.rejects(resolve(r.cwd, 'first', 1, ''), /explanation needs text/);
  const sha = await fixed(r, 1, 'trim before the guard');
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.source, p.finding, p.explanation], [r.rep, 1, 'trim before the guard']);
  assert.notEqual(p.snapshot, r.revPayload.snapshot);
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.source, f.n, f.severity, f.status]), [[r.rep, 1, 'Major', 'resolved']]);
  await assert.rejects(fixed(r, 1, 'again'), new RegExp(`finding 1 on ${r.rep} is resolved by ${sha}`));
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, []);
});

// Developer's ruling, 2026-09-25: "The builder is the decision maker and Sudus will judge". A
// decline needs its reason and nothing else; it closes the finding whatever its severity.
test('decline records the builder\'s reason and closes the finding, a Critical one too; a closed finding takes neither again', async () => {
  const r = await reported({ findings: [{ n: 1, severity: 'Critical', where: 'DEMO-001', text: 'blank passes', remedy: null }] });
  await assert.rejects(decline(r.cwd, 'first', 1, ' '), /a decline needs its reason/);
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, [`finding 1 on ${r.rep} is open`]);
  const sha = await decline(r.cwd, 'first', 1, 'DEMO-001 names a missing name, not a blank one');
  assert.deepEqual(decodeRecord(await catCommit(r.cwd, sha)).payload, { source: r.rep, finding: 1, reason: 'DEMO-001 names a missing name, not a blank one' });
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.severity, f.status]), [['Critical', 'declined']]);
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, []);
  await assert.rejects(decline(r.cwd, 'first', 1, 'again'), new RegExp(`finding 1 on ${r.rep} was declined by ${sha}`));
  await assert.rejects(resolve(r.cwd, 'first', 1, 'fix'), new RegExp(`finding 1 on ${r.rep} was declined by ${sha}`));
});

test('the same number on two records is ambiguous until --source names one; an escalation holds a finding and the developer\'s ok closes it', async () => {
  const r = await briefed({ findings: [{ n: 1, text: 'builder finding' }] });
  r.rep = await report(r.cwd, 'first', adversary(r));
  await assert.rejects(resolve(r.cwd, 'first', 1, 'x'), new RegExp(`finding 1 is on ${r.rev} and ${r.rep}; pass --source`));
  await assert.rejects(decline(r.cwd, 'first', 1, 'x'), new RegExp(`finding 1 is on ${r.rev} and ${r.rep}; pass --source`));
  const sha = await resolve(r.cwd, 'first', 1, 'x', { source: r.rev });
  assert.equal(decodeRecord(await catCommit(r.cwd, sha)).payload.source, r.rev);
  await escalate(r.cwd, disputeOf(r.rep, 1));
  await assert.rejects(resolve(r.cwd, 'first', 1, 'y', { source: r.rep }), /is under escalation/);
  await assert.rejects(decline(r.cwd, 'first', 1, 'y', { source: r.rep }), /is under escalation/);
  await answer(r.cwd, 'first', 'ok', { quote: 'ok', env: {} });
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.source, f.status]), [[r.rev, 'resolved'], [r.rep, 'disputed']]);
});

// A log written before 4.0.0 keeps its meaning: a resolution a 3.x acceptance rejected leaves the
// finding open, and a finding a 3.x acceptance raised needs a resolution or a decline too.
test('a 3.x acceptance: its rejection reopens a finding, and its own findings count', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review();
  const rep = await r.legacyReport([{ n: 1, text: 'f' }]);
  const res = await r.resolveFinding(rep, 1);
  const acc = await r.accept({ rejected: [res], findings: [{ n: 1, text: 'a new gap' }] });
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.kind, f.status]), [['report', 'open'], ['acceptance', 'open']]);
  await r.declineFinding(rep, 1);
  await r.resolveFinding(acc, 1);
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.kind, f.status]), [['report', 'declined'], ['acceptance', 'resolved']]);
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, []);
});

// tests/review.test.mjs (append)
import { cliReview, cliBrief, cliReport, cliResolve, cliDecline } from '../lib/review.mjs';

test('the five commands print one line each and exit 1 with a sudus: line on refusal', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('interface change');
  const file = async (name, obj) => { const p = path.join(r.cwd, '.sudus/output', name); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj)); return p; };
  const rv = await cliReview(r.cwd, ['first', '--file', await file('rv.json', await claims(r, { findings: [] }))], { env: { SUDUS_SESSION: 'b' } });
  assert.match(rv.out, /^sudus: review first [0-9a-f]{40}\n$/);
  r.rev = rv.out.trim().split(' ')[3];
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  const br = await cliBrief(r.cwd, ['first', '--harness', 'claude_code']);
  assert.equal(br.code, 0);
  assert.match(br.out, /^sudus: brief first [0-9a-f]{40}\nbrief: .*\nbrief digest: sha256:[0-9a-f]{64}\nharness: claude_code\nmodel: claude-fable-5-1\nstart: in claude_code, .*\n$/);
  r.bp = decodeRecord(await catCommit(r.cwd, br.out.split('\n')[0].split(' ')[3])).payload;
  const bad = await cliReport(r.cwd, ['first', '--file', await file('bad.json', adversary(r, { model: 'x' }))]);
  assert.deepEqual([bad.code, bad.out.startsWith('sudus: report: unknown field model')], [1, true]);
  const rp = await cliReport(r.cwd, ['first', '--file', await file('rp.json', adversary(r, { findings: [1, 2].map((n) => ({ n, severity: 'Minor', where: 'src/demo.mjs', text: `gap ${n}`, remedy: null })) }))]);
  assert.match(rp.out, /^sudus: report first [0-9a-f]{40}\n$/);
  await r.write('src/demo.mjs', 'export const demo = 9;\n');
  const rs = await cliResolve(r.cwd, ['first', '1', 'fixed', '--source', rp.out.trim().split(' ')[3]]);
  assert.match(rs.out, /^sudus: resolution first [0-9a-f]{40}\n$/);
  const dc = await cliDecline(r.cwd, ['first', '2', 'not', 'in', 'DEMO-001']);
  assert.match(dc.out, /^sudus: decline first [0-9a-f]{40}\n$/);
  assert.equal(decodeRecord(await catCommit(r.cwd, dc.out.trim().split(' ')[3])).payload.reason, 'not in DEMO-001');
  assert.equal((await reviewState(r.cwd, 'first')).ready, true);
  const nofile = await cliReport(r.cwd, ['first']);
  assert.deepEqual([nofile.code, nofile.out], [1, 'sudus: --file <path> is required\n']);
});

// tests/review.test.mjs (fix round 1, item 1)
import { spawnSync } from 'node:child_process';
const sudusBin = new URL('../bin/sudus.mjs', import.meta.url).pathname;
function sudus(args, cwd) { return spawnSync(process.execPath, [sudusBin, ...args], { cwd, encoding: 'utf8' }); }

test('end to end: sudus brief then sudus report takes a report written outside the repository', async () => {
  const r = await reviewed();
  const briefRes = sudus(['brief', 'first', '--harness', 'claude_code'], r.cwd);
  assert.equal(briefRes.status, 0, briefRes.stderr);
  r.bp = decodeRecord(await catCommit(r.cwd, briefRes.stdout.split('\n')[0].split(' ')[3])).payload;
  const out = await fs.mkdtemp(path.join((await import('node:os')).tmpdir(), 'sudus-adversary-'));
  const inRepo = path.join(r.cwd, 'report.json');
  await fs.writeFile(inRepo, JSON.stringify(adversary(r)));
  const refused = sudus(['report', 'first', '--file', inRepo], r.cwd);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /^sudus: report: the workspace differs from the reviewed snapshot/);
  await fs.rm(inRepo);
  const outside = path.join(out, 'report.json');
  await fs.writeFile(outside, JSON.stringify(adversary(r)));
  const reportRes = sudus(['report', 'first', '--file', outside], r.cwd);
  assert.equal(reportRes.status, 0, reportRes.stderr);
  assert.match(reportRes.stdout, /^sudus: report first [0-9a-f]{40}\n$/);
  await fs.rm(out, { recursive: true, force: true });
});

// tests/review.test.mjs (fix round 1, item 3)
import { readRef } from '../lib/gitx.mjs';
import { SNAPSHOTS_REF } from '../lib/snapshots.mjs';

test('a refused report leaves refs/sudus/snapshots unchanged', async () => {
  const r = await briefed();
  const before = await readRef(r.cwd, SNAPSHOTS_REF);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { attempts: [] })), /has no attempt/);
  assert.equal(await readRef(r.cwd, SNAPSHOTS_REF), before);
  // a genuinely successful report still records the review's own already-existing snapshot, never
  // a fresh one written along the way
  await report(r.cwd, 'first', adversary(r));
  assert.equal(await readRef(r.cwd, SNAPSHOTS_REF), before);
});

test('reviewState is read-only: calling it twice leaves refs/sudus/snapshots unchanged', async () => {
  const r = await reported();
  const before = await readRef(r.cwd, SNAPSHOTS_REF);
  await reviewState(r.cwd, 'first');
  await reviewState(r.cwd, 'first');
  assert.equal(await readRef(r.cwd, SNAPSHOTS_REF), before);
});

// tests/review.test.mjs (fix round 1, item 5)
import { catBlob } from '../lib/review.mjs';
import { readFile as readSourceFile } from 'node:fs/promises';

test('catBlob goes through lib/gitx.mjs and never hard-codes a maxBuffer that a large blob could exceed', async () => {
  const src = await readSourceFile(new URL('../lib/review.mjs', import.meta.url), 'utf8');
  assert.equal(src.includes('maxBuffer:'), false, 'no hard-coded maxBuffer option left');
  assert.equal(src.includes("from 'node:child_process'"), false, 'no direct child_process import left');
  const r = await loopRepo();
  const big = 'x'.repeat(3 * 1024 * 1024); // 3MB: larger than node:child_process's unoverridden 1MB default maxBuffer
  await r.write('src/big.mjs', big);
  await r.commit('add a large tracked file');
  const treeSha = (await git(['write-tree'], { cwd: r.cwd })).stdout.trim();
  const entries = await import('../lib/gitx.mjs').then((m) => m.listTree(r.cwd, treeSha));
  const entry = entries.find((e) => e.path === 'src/big.mjs');
  const bytes = await catBlob(r.cwd, entry.sha);
  assert.equal(bytes.length, big.length);
  assert.equal(bytes.toString('utf8'), big);
});

// tests/review.test.mjs (fix round 1, item 6)
import { checkAttempts } from '../lib/review.mjs';

test('checkAttempts refuses a repeated (question, target) pair, mirroring checkAnswers', async () => {
  const pairs = attackPairs({ slug: 'first', requirements: ['DEMO-001'] }, []);
  const base = pairs.map(([question, target]) => ({ question, target, looked_for: 'x', found: 'y', held: false }));
  assert.deepEqual(checkAttempts(base, pairs, 'first'), base);
  assert.throws(() => checkAttempts([...base, base[0]], pairs, 'first'), /falsifier DEMO-001 attempted twice/);
});

// tests/review.test.mjs (fix round 1, item 7)
import { roadmapSection } from '../lib/review.mjs';

test('roadmapSection matches the slug exactly against lib/spec.mjs\'s roadmap parser, not a heading substring', () => {
  const decoy = 'Current: first\n\n## first-pass (abandoned)\n\nDECOY TEXT THAT IS NOT THIS COMMITMENT\n\n## first\n\nRequirements: DEMO-001\n\nThe real section.\n';
  assert.equal(roadmapSection(decoy, 'first'), '## first\n\nRequirements: DEMO-001\n\nThe real section.');
  assert.equal(roadmapSection(decoy, 'first-pass (abandoned)'), '## first-pass (abandoned)\n\nDECOY TEXT THAT IS NOT THIS COMMITMENT');
  assert.equal(roadmapSection(decoy, 'no-such-section'), '');
});

test('brief renders the real roadmap section, not a decoy heading whose title contains the slug as a substring', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('docs/spec/roadmap.md', 'Current: first\n\n## first-pass (abandoned)\n\nDECOY TEXT THAT IS NOT THIS COMMITMENT\n\n## first\n\nRequirements: DEMO-001\n\nThe real section.\n');
  await r.commit('decoy roadmap heading above the real section');
  r.rev = await review(r.cwd, 'first', await claims(r), { env: { SUDUS_SESSION: 's-builder' } });
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  assert.ok(b.text.includes('The real section.'));
  assert.equal(b.text.includes('DECOY TEXT THAT IS NOT THIS COMMITMENT'), false);
});

// tests/review.test.mjs (fix round 1, item 8)
test('cliResolve and cliDecline refuse a missing, non-integer or less-than-1 finding number, naming it', async () => {
  const r = await reported();
  for (const [cli, verb] of [[cliResolve, 'resolve'], [cliDecline, 'decline']]) {
    const abc = await cli(r.cwd, ['first', 'abc', 'why']);
    assert.deepEqual([abc.code, abc.out], [1, `sudus: ${verb}: finding number "abc" must be a positive integer\n`]);
    const zero = await cli(r.cwd, ['first', '0', 'why']);
    assert.deepEqual([zero.code, zero.out], [1, `sudus: ${verb}: finding number "0" must be a positive integer\n`]);
    const frac = await cli(r.cwd, ['first', '1.5', 'why']);
    assert.deepEqual([frac.code, frac.out], [1, `sudus: ${verb}: finding number "1.5" must be a positive integer\n`]);
    const missing = await cli(r.cwd, ['first']);
    assert.deepEqual([missing.code, missing.out], [1, `sudus: ${verb}: finding number (none given) must be a positive integer\n`]);
  }
  const good = await cliResolve(r.cwd, ['first', '1', 'why']);
  assert.match(good.out, /^sudus: resolution first [0-9a-f]{40}\n$/);
});

// tests/review.test.mjs (fix round 2, new finding 2)
import { checkBlobSize, MAX_BLOB_BYTES } from '../lib/review.mjs';

test('fix round 2 new finding 2: a blob above the documented size limit is refused with a sudus: line, checked before any bytes are read', async () => {
  // A pure, stub-driven check: no 300+ MiB file needed. checkBlobSize takes the size
  // `git cat-file -s` would have reported and applies the same refusal catBlob does.
  assert.equal(MAX_BLOB_BYTES, 256 * 1024 * 1024);
  assert.equal(checkBlobSize('a'.repeat(40), MAX_BLOB_BYTES), MAX_BLOB_BYTES);
  assert.throws(
    () => checkBlobSize('a'.repeat(40), MAX_BLOB_BYTES + 1),
    (e) => e instanceof ReviewError && e.message === `sudus: brief: blob ${'a'.repeat(40)} is ${MAX_BLOB_BYTES + 1} bytes, over the ${MAX_BLOB_BYTES} byte limit`,
  );
  // An ordinary blob still round-trips through the real catBlob (git cat-file -s runs first,
  // then the actual read); this is the same 3MB blob fix round 1 item 5 already exercises,
  // confirming the added size check does not break the normal path.
  const r = await loopRepo();
  await r.write('src/small.mjs', 'x'.repeat(1024));
  await r.commit('a small tracked file');
  const treeSha = (await git(['write-tree'], { cwd: r.cwd })).stdout.trim();
  const entries = await import('../lib/gitx.mjs').then((m) => m.listTree(r.cwd, treeSha));
  const entry = entries.find((e) => e.path === 'src/small.mjs');
  const bytes = await catBlob(r.cwd, entry.sha);
  assert.equal(bytes.length, 1024);
});

// Issue #8: a successor started after a supersede carries the superseded commitment's work, all
// of it committed before the successor's own start. The brief, the report and wake measure the
// changed paths and the interface obligations from the first start of the supersession chain.
import { supersede, start as startCommitment } from '../lib/commitment.mjs';
import { authorize } from '../lib/auth.mjs';
import { readState, predicates, wake, render } from '../lib/wake.mjs';
import { chainStart } from '../lib/records.mjs';

test('after a supersede, the brief, the report and wake measure the successor from the first start of the chain (issue #8)', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('change an interface under first');
  const roadmap = await fs.readFile(path.join(r.cwd, 'docs/spec/roadmap.md'), 'utf8');
  await r.write('docs/spec/roadmap.md', roadmap + '\n## second\n\nRequirements: DEMO-001\n\nCarries the work of first.\n');
  await r.commit('second section');
  await supersede(r.cwd, 'second', { quote: 'go on under second', env: {} });
  await authorize(r.cwd, { quote: 'ok', env: {} });
  await startCommitment(r.cwd, 'second');
  const log = await r.log();
  const second = log.findLast((x) => x.kind === 'start');
  assert.equal(chainStart(log, second).sha, r.startSha);
  const s = { ...r, slug: 'second' };
  r.slug = 'second';
  r.rev = await review(r.cwd, 'second', await claims(s), { env: { SUDUS_SESSION: 's-builder' } });
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  r.b = await brief(r.cwd, 'second', { harness: 'claude_code' });
  r.bp = decodeRecord(await catCommit(r.cwd, r.b.sha)).payload;
  for (const x of ['## Interface obligations\nsrc/api/x.mjs\n', '\nA src/api/x.mjs\n',
    '## Changed paths (start snapshot of first, whose work second carries through a supersede, to reviewed snapshot; A added, M modified, D deleted)\n']) assert.ok(r.b.text.includes(x), x);
  await assert.rejects(report(r.cwd, 'second', adversary(r, { interface_attempts: [] })), /interface src\/api\/x\.mjs has no attempt/);
  // Wake's report predicate reads the same base: a report record that skipped the carried
  // interface does not satisfy it (the verdict itself stops earlier, at run, in this fixture).
  await r.add('report', 'second', { slug: 'second', snapshot: r.revPayload.snapshot, brief: r.b.sha, attempts: adversary(r).attempts, findings: [], interface_attempts: [], sudus_bug: null });
  const reportP = predicates.find((p) => p.name === 'report');
  const v = await reportP.test(await readState(r.cwd));
  assert.deepEqual([v?.action, v?.target], ['report', 'second'], JSON.stringify(v));
  assert.match(v.reason, /no caller-level attempt at interface src\/api\/x\.mjs/);
});

// Issue #22: a finding carried by a supersession could be resolved but never escalated, since an
// escalation's concern had to name a record in the open range; and the supersession carried
// findings by "any resolution record exists". Since 4.0.0 a finding is settled by a resolution, a
// decline or the developer's ok on an escalation naming it.
async function supersededToSecond(r) {
  const roadmap = await fs.readFile(path.join(r.cwd, 'docs/spec/roadmap.md'), 'utf8');
  await r.write('docs/spec/roadmap.md', roadmap + '\n## second\n\nRequirements: DEMO-001\n\nCarries the work of first.\n');
  await r.commit('second section');
  await supersede(r.cwd, 'second', { quote: 'go on under second', env: {} });
  const carried = (await r.log()).find((x) => x.kind === 'superseded').payload.carried;
  await authorize(r.cwd, { quote: 'ok', env: {} });
  await startCommitment(r.cwd, 'second');
  return carried;
}

test('a finding carried by a supersede can be escalated, and the developer\'s ok settles it in the successor (issue #22)', async () => {
  const r = await reported();
  assert.deepEqual(await supersededToSecond(r), [r.rep]);
  await escalate(r.cwd, disputeOf(r.rep, 1, 'second'));
  await answer(r.cwd, 'second', 'ok', { quote: 'ok', env: {} });
  assert.deepEqual(ledger(await r.log(), 'second').map((f) => [f.source, f.status]), [[r.rep, 'disputed']]);
  assert.equal(await predicates.find((p) => p.name === 'resolve').test(await readState(r.cwd)), null);
});

test('an open finding carries across a supersede and can be declined in the successor; a declined one does not carry', async () => {
  const r = await reported();
  assert.deepEqual(await supersededToSecond(r), [r.rep]);
  assert.deepEqual(ledger(await r.log(), 'second').map((f) => [f.source, f.status]), [[r.rep, 'open']]);
  await decline(r.cwd, 'second', 1, 'the successor drops whitespace handling');
  assert.equal(await predicates.find((p) => p.name === 'resolve').test(await readState(r.cwd)), null);

  const d = await reported();
  await decline(d.cwd, 'first', 1, 'tabs are valid names here');
  assert.deepEqual(await supersededToSecond(d), []);
});

// Issue #32: a commitment read every supersession's carried list, so a finding carried into
// another, finished commitment sat in a later commitment's ledger and review report, a refusal
// named that record instead of the commitment's own, and an escalation could concern it.
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';
test('only the supersession that opened a commitment carries findings into it (issue #32)', async () => {
  const r = await reported();
  assert.deepEqual(await supersededToSecond(r), [r.rep]);
  await decline(r.cwd, 'second', 1, 'whitespace names are valid');
  await r.add('done', 'second', { slug: 'second', snapshot: await writeWorkspaceSnapshot(r.cwd) });
  const roadmap = await fs.readFile(path.join(r.cwd, 'docs/spec/roadmap.md'), 'utf8');
  await r.write('docs/spec/roadmap.md', roadmap.replace(/^Current: .*$/m, 'Current: third') + '\n## third\n\nRequirements: DEMO-001\n\nMore of the demo.\n');
  await r.commit('third section');
  await authorize(r.cwd, { quote: 'ok', env: {} });
  await startCommitment(r.cwd, 'third');
  await r.write('src/api/x.mjs', 'export const x = 3;\n');
  await r.commit('change the interface under third');
  r.slug = 'third';
  r.revPayload = decodeRecord(await catCommit(r.cwd, await review(r.cwd, 'third', await claims(r), { env: { SUDUS_SESSION: 's-builder' } }))).payload;
  r.b = await brief(r.cwd, 'third', { harness: 'claude_code' });
  r.bp = decodeRecord(await catCommit(r.cwd, r.b.sha)).payload;
  const rep = await report(r.cwd, 'third', adversary(r));
  assert.deepEqual(ledger(await r.log(), 'third').map((f) => [f.source, f.status]), [[rep, 'open']]);
  const res = await resolve(r.cwd, 'third', 1, 'rejects whitespace-only names');
  await assert.rejects(resolve(r.cwd, 'third', 1, 'again'), { message: `sudus: resolve: finding 1 on ${rep} is resolved by ${res}` });
  await assert.rejects(escalate(r.cwd, disputeOf(r.rep, 1, 'third')), { message: `sudus: no record ${r.rep} in the open range or carried into it` });
  assert.equal(await predicates.find((p) => p.name === 'resolve').test(await readState(r.cwd)), null);
});

// Issue #23: closing N findings took N escalations, since an escalation naming several findings
// closed none. One escalation naming several findings holds them all and one ok closes them.
test('one escalation naming two findings holds both while it waits and closes both on ok', async () => {
  const r = await briefed();
  r.rep = await report(r.cwd, 'first', adversary(r, { findings: [1, 2].map((n) => ({ n, severity: 'Minor', where: 'src/check.mjs', text: `a check script corner case ${n}`, remedy: null })) }));
  const e = await escalate(r.cwd, { commitment: 'first', concerns: [`finding:${r.rep}#1`, `finding:${r.rep}#2`], question: 'Close both mechanism findings?', recommendation: 'Close findings 1 and 2 as answered.', because: 'both harden a check script, not the requirement code', if_wrong: 'the check script keeps both gaps', instead: 'fix both', options: [], named_paths: [], cited_decisions: [] });
  await assert.rejects(resolve(r.cwd, 'first', 2, 'x'), { message: `sudus: resolve: finding 2 on ${r.rep} is under escalation ${e}` });
  await answer(r.cwd, 'first', 'ok', { quote: 'ok', env: {} });
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.n, f.status]), [[1, 'disputed'], [2, 'disputed']]);
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, []);
});

// Issue #23 review: an ok closes every finding an escalation names, and its fields need not name
// them all, so wake prints the list the developer's ok would close.
test("wake prints every finding an escalation's ok closes, whatever its fields say", async () => {
  const r = await briefed();
  r.rep = await report(r.cwd, 'first', adversary(r, { findings: [1, 2, 3].map((n) => ({ n, severity: 'Minor', where: 'src/demo.mjs', text: `gap ${n}`, remedy: null })) }));
  await escalate(r.cwd, { commitment: 'first', concerns: [1, 2, 3].map((n) => `finding:${r.rep}#${n}`), question: 'Close finding 1 as a duplicate?', recommendation: 'Close finding 1 as answered.', because: 'finding 1 restates a fixed gap', if_wrong: 'finding 1 ships unfixed', instead: 'fix finding 1', options: [], named_paths: [], cited_decisions: [] });
  const v = await wake(r.cwd);
  const s = r.rep.slice(0, 12);
  assert.deepEqual(v.escalation.closes, [1, 2, 3].map((n) => `finding ${n} on the report ${s}`));
  assert.match(render(v), new RegExp(`\\ninstead: fix finding 1\\nok closes: finding 1 on the report ${s}, finding 2 on the report ${s}, finding 3 on the report ${s}\\npredicate: `));
});

// The brief names paths the adversary must not read: tracked files the settings exclude from every
// model or that match a credential pattern, and the patterns themselves for untracked ones.
test('the brief lists the network_exclude and credential paths and patterns the adversary must not read', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  for (const [p, c] of [['fixtures/private/k.json', '{"secret":1}'], ['server.pem', 'x'], ['src/api/x.mjs', 'export const x = 2;\n']]) await r.write(p, c);
  await r.commit('add fixtures');
  await review(r.cwd, 'first', await claims(r), { env: { SUDUS_SESSION: 's-builder' } });
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  const section = b.text.slice(b.text.indexOf('## Paths not to read'), b.text.indexOf('\n## Report'));
  for (const s of ['pattern fixtures/private/**', 'network_exclude fixtures/private/k.json', 'credential server.pem']) assert.ok(section.includes(s), s);
  assert.equal(b.text.includes('"secret"'), false);
});
