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
    ...t.mechanisms.flatMap((m) => [{ question: 'Q1', target: m, status: 'observed', text: `flag fail: cairn: ${m.toUpperCase()}: fail at receipt 3f2` }, { question: 'Q2', target: m, status: 'observed', text: 'the printed line names the flag, not a setup error' }]),
    ...t.requirements.flatMap((q) => [{ question: 'Q3', target: q, status: 'observed', text: 'node check.mjs with an empty flag exits 1' }, { question: 'Q4', target: q, status: 'not-checked', text: 'the logger changed too' }]),
    { question: 'Q5', target: r.slug, status: 'not-checked', text: 'a race between two writers' }, { question: 'Q6', target: r.slug, status: 'not-checked', text: '' },
  ];
  return { examined: ['src/demo.mjs'], answers, findings: [], ...over };
}

test('a review records the current snapshot, session, examined entries, every answer and numbered findings', async () => {
  for (const k of ['review', 'brief', 'report', 'resolution', 'acceptance']) assert.ok(KINDS.has(k));
  const r = await loopRepo();
  const sha = await review(r.cwd, 'first', await claims(r, { findings: [{ n: 1, text: 'no empty-input test' }] }), { env: { CAIRN_SESSION: 's-builder' } });
  const c = await catCommit(r.cwd, sha);
  assert.equal(c.subject, 'cairn: review first');
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
import os from 'node:os';
import path from 'node:path';
import { git } from '../lib/gitx.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { project } from '../lib/review.mjs';

async function tree(r) { await git(['add', '-A'], { cwd: r.cwd }); return (await git(['write-tree'], { cwd: r.cwd })).stdout.trim(); }
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'cairn-proj-'));

test('the projection omits network_exclude and credential paths, names them in the manifest without contents, and has no .git', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  for (const [p, c] of [['fixtures/private/k.json', '{"secret":1}'], ['.env', 'A=1\n'], ['server.pem', 'x'], ['src/b.mjs', 'export const b = 2;\n']]) await r.write(p, c);
  await r.commit('add fixtures');
  const { settings } = await loadSettings(r.cwd);
  const dir = await tmp();
  const out = await project(r.cwd, settings, await tree(r), dir);
  assert.deepEqual(out.manifest.classes, ['credential', 'network_exclude']);
  assert.deepEqual(out.manifest.paths.map((p) => `${p.class} ${p.path}`), ['credential .env', 'network_exclude fixtures/private/k.json', 'credential server.pem']);
  assert.equal(JSON.stringify(out.manifest).includes('secret'), false);
  for (const gone of ['fixtures/private/k.json', '.env', 'server.pem', '.git']) await assert.rejects(fs.stat(path.join(dir, gone)));
  assert.equal(await fs.readFile(path.join(dir, 'src/b.mjs'), 'utf8'), 'export const b = 2;\n');
  assert.ok((await fs.stat(path.join(dir, '.cairn/settings.json'))).isFile());
  assert.match(out.projectionDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(out.exclusionsDigest, /^sha256:[0-9a-f]{64}$/);
});

test('a safe relative symlink is preserved as link text; absolute and out-of-tree links and gitlinks are refused', async () => {
  const r = await loopRepo();
  const { settings } = await loadSettings(r.cwd);
  await r.write('src/real.txt', 'r\n');
  await r.link('src/abs', '/etc/passwd');
  await assert.rejects(project(r.cwd, settings, await tree(r), await tmp()), /absolute symlink at src\/abs/);
  await fs.unlink(path.join(r.cwd, 'src/abs'));
  await r.link('src/up', '../../outside');
  await assert.rejects(project(r.cwd, settings, await tree(r), await tmp()), /out-of-tree symlink at src\/up/);
  await fs.unlink(path.join(r.cwd, 'src/up'));
  await r.link('src/link', 'real.txt');
  const dir = await tmp();
  const out = await project(r.cwd, settings, await tree(r), dir);
  assert.equal(await fs.readlink(path.join(dir, 'src/link')), 'real.txt');
  assert.ok(out.included.some(([p, mode]) => p === 'src/link' && mode === '120000'));
  await git(['update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},sub`], { cwd: r.cwd });
  await assert.rejects(project(r.cwd, settings, (await git(['write-tree'], { cwd: r.cwd })).stdout.trim(), await tmp()), /unresolved gitlink at sub/);
});

// tests/review.test.mjs (append)
import { sha256 } from '../lib/canon.mjs';
import { detectHarness, brief, interfaceObligations, CONFINES } from '../lib/review.mjs';

test('the harness comes from --harness, then CAIRN_HARNESS, then the harness environment, and must name a settings entry; the model string passes through', () => {
  assert.deepEqual(detectHarness(SETTINGS, { harness: 'claude_code', env: {} }), { name: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', boundary: 'unenforced' });
  assert.equal(detectHarness(SETTINGS, { env: { CAIRN_HARNESS: 'claude_code' } }).name, 'claude_code');
  assert.equal(detectHarness(SETTINGS, { env: { CLAUDECODE: '1' } }).name, 'claude_code');
  assert.deepEqual(detectHarness(SETTINGS, { harness: 'codex', env: {} }), { name: 'codex', model: null, transport: null, boundary: 'unenforced' });
  assert.throws(() => detectHarness(SETTINGS, { env: {} }), /no harness detected; pass --harness/);
  assert.throws(() => detectHarness(SETTINGS, { harness: 'muse', env: {} }), /harness muse has no settings entry/);
  assert.deepEqual(CONFINES, { claude_code: false, codex: false, muse: false });
});

export async function reviewed(over = {}) {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('change an interface');
  r.rev = await review(r.cwd, 'first', await claims(r, over), { env: { CAIRN_SESSION: 's-builder' } });
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  return r;
}

test('brief writes the record, the projection and the rendered file, and prints the launch block', async () => {
  const bare = await loopRepo({ settings: SETTINGS });
  await assert.rejects(brief(bare.cwd, 'first', { harness: 'claude_code' }), /no review for first/);
  const r = await reviewed({ findings: [{ n: 1, text: 'no test' }] });
  const b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  const p = decodeRecord(await catCommit(r.cwd, b.sha)).payload;
  assert.deepEqual([p.slug, p.review, p.payload_digest], ['first', r.rev, sha256(b.text)]);
  assert.match(p.projection_digest, /^sha256:/);
  assert.match(p.exclusions_digest, /^sha256:/);
  assert.ok(b.briefPath.startsWith(path.join(r.cwd, '.cairn/output/brief-')));
  assert.equal(await fs.readFile(b.briefPath, 'utf8'), b.text);
  for (const s of ['## Interface obligations\nsrc/api/x.mjs\n', '## Builder findings\n1. no test\n', '[DEMO-001]', 'Falsifier:', 'mechanism demo-001 Q1 observed:',
    'cannot detect a secret a person or primary coding agent copied into ordinary prose', 'You may read only the projection directory. Boundary: unenforced.']) assert.ok(b.text.includes(s), s);
  const lines = b.launch.split('\n');
  assert.equal(lines[0], `cairn: brief first ${b.sha}`);
  assert.deepEqual(lines.slice(5, 9), ['harness: claude_code', 'model: claude-fable-5-1', 'transport: remote', 'boundary: unenforced']);
  assert.equal(lines[9], `start: in claude_code, start a fresh adversary with model claude-fable-5-1 over remote, working directory ${b.projectionDir}, with the file ${b.briefPath} as its entire prompt; when it finishes, run: cairn report first --file <its report>`);
  assert.equal(lines[10], '');
  await assert.rejects(fs.stat(path.join(b.projectionDir, '.git')));
  assert.deepEqual(await interfaceObligations(r.cwd, SETTINGS, r.startSnapshot, r.revPayload.snapshot), ['src/api/x.mjs']);
});

// tests/review.test.mjs (append)
import { report } from '../lib/review.mjs';

export async function briefed(over = {}) {
  const r = await reviewed(over);
  r.b = await brief(r.cwd, 'first', { harness: 'claude_code' });
  r.bp = decodeRecord(await catCommit(r.cwd, r.b.sha)).payload;
  return r;
}
export function adversary(r, over = {}) {
  return {
    harness: 'claude_code', model: 'claude-fable-5-1', transport: 'remote', session: 's-adversary', builder_model: null, projection_digest: r.bp.projection_digest,
    attempts: r.revPayload.answers.map((a) => ({ question: a.question, target: a.target, text: `tried to break ${a.target} for ${a.question}: held` })),
    findings: [{ n: 1, text: 'the flag accepts whitespace-only input' }],
    interface_attempts: [{ path: 'src/api/x.mjs', text: 'called x() from a fresh module: held' }], ...over,
  };
}

test('report records attempts, model, transport, boundary and session at the reviewed snapshot; a second report is refused', async () => {
  const r = await briefed();
  const sha = await report(r.cwd, 'first', adversary(r));
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.brief, p.snapshot, p.model, p.transport, p.boundary, p.session, p.builder_model], [r.b.sha, r.revPayload.snapshot, 'claude-fable-5-1', 'remote', 'unenforced', 's-adversary', null]);
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /one report per commitment; first has/);
});

test('report refuses a snapshot differing from the review, a stale projection and a stale brief', async () => {
  const r = await briefed();
  await assert.rejects(report(r.cwd, 'first', adversary(r, { projection_digest: 'sha256:' + '0'.repeat(64) })), /projection digest does not match the brief/);
  await r.write('src/demo.mjs', 'export const changed = 1;\n');
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /workspace differs from the reviewed snapshot/);
  await review(r.cwd, 'first', await claims(r));
  await assert.rejects(report(r.cwd, 'first', adversary(r)), /brief [0-9a-f]{40} is stale: the review is/);
});

test('report refuses a model or transport that does not match the launch instruction; a matching builder model is recorded', async () => {
  const r = await briefed();
  await assert.rejects(report(r.cwd, 'first', adversary(r, { model: 'other-model' })), /model other-model does not match the launch instruction claude-fable-5-1/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { transport: 'local' })), /transport local does not match the launch instruction remote/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { model: null })), /model must be a string/);
  const sha = await report(r.cwd, 'first', adversary(r, { builder_model: 'claude-fable-5-1' }));
  assert.equal(decodeRecord(await catCommit(r.cwd, sha)).payload.builder_model, 'claude-fable-5-1');
});

test('report refuses a missing question or interface attempt, and the session that wrote the review', async () => {
  const r = await briefed();
  const a = adversary(r);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: a.attempts.filter((x) => x.question !== 'Q4') }), /Q4 has no attempt/);
  await assert.rejects(report(r.cwd, 'first', { ...a, attempts: [...a.attempts, { question: 'Q3', target: 'ZZZ-999', text: 'x' }] }), /ZZZ-999 is not a target/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { interface_attempts: [] })), /interface src\/api\/x.mjs has no attempt/);
  await assert.rejects(report(r.cwd, 'first', adversary(r, { session: 's-builder' })), /session s-builder wrote the review/);
  const anon = await report(r.cwd, 'first', adversary(r, { session: null }));
  assert.equal(decodeRecord(await catCommit(r.cwd, anon)).payload.session, null);
});

// tests/review.test.mjs (append)
import { resolve, ledger } from '../lib/review.mjs';
import { dispute, answer } from '../lib/escalate.mjs';

export async function reported(over = {}) {
  const r = await briefed();
  r.rep = await report(r.cwd, 'first', adversary(r, over));
  return r;
}
export async function fixed(r, n, text, opts) {
  await r.write('src/demo.mjs', `export const demo = ${JSON.stringify(text)};\n`);
  return resolve(r.cwd, 'first', n, text, opts);
}

test('resolve names finding N on its exact source record and the snapshot after the fix', async () => {
  const r = await reported();
  await assert.rejects(resolve(r.cwd, 'first', 2, 'x'), /no unresolved finding 2/);
  await assert.rejects(resolve(r.cwd, 'first', 1, ''), /explanation needs text/);
  const sha = await fixed(r, 1, 'trim before the guard');
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.source, p.finding, p.explanation], [r.rep, 1, 'trim before the guard']);
  assert.notEqual(p.snapshot, r.revPayload.snapshot);
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.source, f.n, f.status]), [[r.rep, 1, 'submitted']]);
  await assert.rejects(fixed(r, 1, 'again'), /finding 1 on .* awaits acceptance/);
});

test('the same number on two records is ambiguous until --source names one; a settled dispute closes a finding', async () => {
  const r = await briefed({ findings: [{ n: 1, text: 'builder finding' }] });
  r.rep = await report(r.cwd, 'first', adversary(r));
  await assert.rejects(resolve(r.cwd, 'first', 1, 'x'), new RegExp(`finding 1 is on ${r.rev} and ${r.rep}; pass --source`));
  const sha = await resolve(r.cwd, 'first', 1, 'x', { source: r.rev });
  assert.equal(decodeRecord(await catCommit(r.cwd, sha)).payload.source, r.rev);
  await dispute(r.cwd, { commitment: 'first', record: r.rep, n: 1, question: 'Defect?', recommendation: 'No.', because: 'whitespace is valid here', if_wrong: 'bad input passes', instead: 'trim' });
  await assert.rejects(resolve(r.cwd, 'first', 1, 'y', { source: r.rep }), /is under escalation/);
  await answer(r.cwd, 'first', 'ok', '', { confirm: async () => true });
  assert.deepEqual(ledger(await r.log(), 'first').map((f) => [f.source, f.status]), [[r.rev, 'submitted'], [r.rep, 'disputed']]);
});

// tests/review.test.mjs (append)
import { accept, reviewState } from '../lib/review.mjs';
import { unanswered } from '../lib/escalate.mjs';
import { openCycleEscalation } from '../lib/cycle.mjs';

const verdict = (sha, v, reason = '') => ({ sha, verdict: v, reason });

test('accept examines the cumulative delta and gives a verdict on every submitted resolution', async () => {
  const r = await reported();
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [], findings: [] }), /nothing submitted since the report/);
  const r1 = await fixed(r, 1, 'first fix');
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [], findings: [] }), new RegExp(`resolution ${r1} has no verdict`));
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [verdict(r1, 'rejected')], findings: [] }), /rejected .* needs a reason/);
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [verdict('a'.repeat(40), 'accepted')], findings: [] }), /is not a submitted resolution/);
  await assert.rejects(accept(r.cwd, 'first', { resolutions: [verdict(r1, 'accepted')], findings: [], session: 's-builder' }), /session s-builder wrote the review/);
  const sha = await accept(r.cwd, 'first', { resolutions: [verdict(r1, 'accepted')], findings: [{ n: 1, text: 'the new trim drops tabs' }] });
  const p = decodeRecord(await catCommit(r.cwd, sha)).payload;
  assert.deepEqual([p.report, p.accepted, p.rejected], [r.rep, [{ resolution: r1, reason: '' }], []]);
  const { canonicalize } = await import('../lib/canon.mjs');
  assert.equal(p.delta_digest, sha256(canonicalize([{ path: 'src/demo.mjs', status: 'M' }])));
  const st = await reviewState(r.cwd, 'first');
  assert.equal(st.ready, false);
  assert.deepEqual(st.ledger.map((f) => [f.kind, f.status]), [['report', 'resolved'], ['acceptance', 'open']]);
  const r2 = await fixed(r, 1, 'second fix');
  assert.equal(decodeRecord(await catCommit(r.cwd, r2)).payload.source, sha);
  await accept(r.cwd, 'first', { resolutions: [verdict(r2, 'accepted')], findings: [] });
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, []);
  await r.write('src/demo.mjs', 'export const demo = "late";\n');
  assert.deepEqual((await reviewState(r.cwd, 'first')).reasons, ['the latest acceptance is not at the final workspace snapshot']);
});

test('a resolution rejected twice for the same finding escalates as a dispute the developer settles', async () => {
  const r = await reported();
  const r1 = await fixed(r, 1, 'one');
  await accept(r.cwd, 'first', { resolutions: [verdict(r1, 'rejected', 'still accepts tabs')], findings: [] });
  assert.deepEqual(unanswered(await r.log()), []);
  const r2 = await fixed(r, 1, 'two');
  await accept(r.cwd, 'first', { resolutions: [verdict(r2, 'rejected', 'still accepts form feeds')], findings: [] });
  const open = unanswered(await r.log());
  assert.equal(open.length, 1);
  assert.equal(open[0].payload.concerns, `finding:${r.rep}#1`);
  assert.equal(open[0].payload.question, 'Finding 1 on the report was rejected twice; does the developer rule on it?');
  await assert.rejects(fixed(r, 1, 'three'), /is under escalation/);
});

test('three acceptance rounds without Done create the cycle escalation through plan 08, even with newly numbered findings', async () => {
  const r = await reported();
  let source = null;
  for (let round = 1; round <= 3; round++) {
    const res = await fixed(r, 1, `round ${round}`, source ? { source } : {});
    source = await accept(r.cwd, 'first', { resolutions: [verdict(res, 'accepted')], findings: [{ n: 1, text: `new finding ${round}` }] });
    assert.equal(openCycleEscalation(await r.log()) !== null, round === 3, `round ${round}`);
  }
  const cycle = openCycleEscalation(await r.log());
  assert.equal(cycle.payload.concerns, 'cycle');
  assert.match(cycle.payload.question, /3 acceptance rounds after the report have not reached Done/);
});

// tests/review.test.mjs (append)
import { cliReview, cliBrief, cliReport, cliResolve, cliAccept } from '../lib/review.mjs';

test('the five commands print one line each and exit 1 with a cairn: line on refusal', async () => {
  const r = await loopRepo({ settings: SETTINGS });
  await r.write('src/api/x.mjs', 'export const x = 2;\n');
  await r.commit('interface change');
  const file = async (name, obj) => { const p = path.join(r.cwd, '.cairn/output', name); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj)); return p; };
  // Deviation from the plan text: the plan's own literal call gave the review a finding
  // ({n: 1, text: 'x'}), which is never resolved anywhere in this test, so the later
  // `reviewState(...).ready === true` assertion cannot hold together with a correct reviewState
  // (section 5's Done rule: "every finding on the review, report or any acceptance is resolved or
  // developer-disputed" -- Task 6's own tests exercise exactly this rule). Passing no findings here
  // keeps the CLI round-trip this test is actually checking (all five commands, each argument shape)
  // without contradicting the readiness rule Task 6 already covers.
  const rv = await cliReview(r.cwd, ['first', '--file', await file('rv.json', await claims(r, { findings: [] }))], { env: { CAIRN_SESSION: 'b' } });
  assert.match(rv.out, /^cairn: review first [0-9a-f]{40}\n$/);
  r.rev = rv.out.trim().split(' ')[3];
  r.revPayload = decodeRecord(await catCommit(r.cwd, r.rev)).payload;
  const br = await cliBrief(r.cwd, ['first', '--harness', 'claude_code']);
  assert.equal(br.code, 0);
  assert.match(br.out, /^cairn: brief first [0-9a-f]{40}\nbrief: .*\nbrief digest: sha256:[0-9a-f]{64}\nprojection: .*\nprojection digest: sha256:[0-9a-f]{64}\nharness: claude_code\nmodel: claude-fable-5-1\ntransport: remote\nboundary: unenforced\nstart: in claude_code, .*\n$/);
  r.bp = decodeRecord(await catCommit(r.cwd, br.out.split('\n')[0].split(' ')[3])).payload;
  const bad = await cliReport(r.cwd, ['first', '--file', await file('bad.json', adversary(r, { model: 'x' }))]);
  assert.deepEqual([bad.code, bad.out.startsWith('cairn: report: model x does not match')], [1, true]);
  const rp = await cliReport(r.cwd, ['first', '--file', await file('rp.json', adversary(r))]);
  assert.match(rp.out, /^cairn: report first [0-9a-f]{40}\n$/);
  await r.write('src/demo.mjs', 'export const demo = 9;\n');
  const rs = await cliResolve(r.cwd, ['first', '1', 'fixed', '--source', rp.out.trim().split(' ')[3]]);
  assert.match(rs.out, /^cairn: resolution first [0-9a-f]{40}\n$/);
  const ac = await cliAccept(r.cwd, ['first', '--file', await file('ac.json', { resolutions: [{ sha: rs.out.trim().split(' ')[3], verdict: 'accepted', reason: '' }], findings: [] })]);
  assert.match(ac.out, /^cairn: acceptance first [0-9a-f]{40}\n$/);
  assert.equal((await reviewState(r.cwd, 'first')).ready, true);
  const nofile = await cliAccept(r.cwd, ['first']);
  assert.deepEqual([nofile.code, nofile.out], [1, 'cairn: --file <path> is required\n']);
});
