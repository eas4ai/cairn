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
