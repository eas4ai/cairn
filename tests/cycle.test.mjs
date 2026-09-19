import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loopRepo } from './helpers/loop.mjs';
import { git, gitPath } from '../lib/gitx.mjs';
import { BOUNDS, ADMIN, bump, readCounter, resetOnProgress, settle, guardKernelWrite, LivenessError, withLoop } from '../lib/cycle.mjs';
import { readState, verdictOf, wake, progressMade, progressSummary } from '../lib/wake.mjs';
import { begin } from '../lib/lease.mjs';

test('the counter lives below the Git directory, counts by class and target, and never travels', async () => {
  const r = await loopRepo();
  assert.deepEqual(BOUNDS, { sameTarget: 4, total: 28, acceptanceRounds: 3 });
  assert.equal(ADMIN.size, 9);
  const refsBefore = (await git(['for-each-ref'], { cwd: r.cwd })).stdout;
  let last;
  for (let i = 0; i < 3; i++) last = await bump(r.cwd, 'record', 'src/a.mjs');
  assert.deepEqual(last, { sameTarget: 3, total: 3, bound: null });
  assert.deepEqual(await bump(r.cwd, 'commit', 'src/a.mjs'), { sameTarget: 1, total: 4, bound: null });
  assert.deepEqual(await bump(r.cwd, 'record', 'src/a.mjs'), { sameTarget: 4, total: 5, bound: 'sameTarget' });
  const file = await gitPath(r.cwd, 'cairn-cycle.json');
  assert.ok((await stat(file)).isFile());
  assert.ok(!file.startsWith(r.cwd + '/src'));
  assert.equal((await git(['for-each-ref'], { cwd: r.cwd })).stdout, refsBefore);
  assert.equal((await git(['status', '--porcelain'], { cwd: r.cwd })).stdout, '');
  await resetOnProgress(r.cwd);
  assert.deepEqual((await readCounter(r.cwd)).counts, {});
  assert.equal((await readCounter(r.cwd)).total, 0);
});

test('the twenty-eighth transition of any class is the second bound', async () => {
  const r = await loopRepo();
  const classes = [...ADMIN];
  let res;
  for (let i = 0; i < 28; i++) res = await bump(r.cwd, classes[i % 9], 't' + Math.floor(i / 9));
  assert.equal(res.total, 28);
  assert.equal(res.bound, 'total');
  assert.ok(res.sameTarget < BOUNDS.sameTarget);
});

const V = (action, target) => ({ verdict: 'Resolvable', action, target, reason: '', predicate: '' });

test('a fourth same-target administrative completion writes one Blocking cycle escalation and keeps every obligation', async () => {
  const r = await loopRepo();
  await r.write('src/demo.mjs', 'console.log("dirty");\n');     // a dirty declared input: the record obligation
  const st = await readState(r.cwd);
  let bound = null, n = 0;
  while (!bound && n < 10) { bound = (await settle(r.cwd, V(n % 2 ? 'commit' : 'record', 'src/a.mjs'), st)).bound; n++; }
  assert.deepEqual(bound, { kind: 'sameTarget', actionClass: 'record', target: 'src/a.mjs' });
  assert.ok(n <= 8);
  const esc = (await r.log()).filter((x) => x.kind === 'escalation');
  assert.equal(esc.length, 1);
  assert.equal(esc[0].payload.concerns, 'cycle');
  assert.deepEqual((await settle(r.cwd, V('record', 'src/a.mjs'), st)).bound, null);   // one escalation, not one per completion
  assert.equal((await r.log()).filter((x) => x.kind === 'escalation').length, 1);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc[0].sha, 'ok');
  assert.deepEqual([(await wake(r.cwd)).action, (await wake(r.cwd)).target], ['record', 'src/demo.mjs']);   // still dirty: nothing was dropped
});

test('a rotating cycle is caught at the twenty-eighth transition', async () => {
  const r = await loopRepo();
  const st = await readState(r.cwd);
  const classes = ['repair', 'recover', 'reconcile', 'scope', 'record', 'commit', 'declare', 'review mechanism', 'capture'];
  let bound = null, n = 0;
  while (!bound) { bound = (await settle(r.cwd, V(classes[n % 9], 't' + (Math.floor(n / 9) % 3)), st)).bound; n++; }
  assert.equal(bound.kind, 'total');
  assert.ok(n <= 29);   // 28 completions are observed by the 29th settle
});

test('the third acceptance round without Done is the same escalation', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review();
  const rep = await r.report([{ n: 1, text: 'f' }]);
  for (let i = 0; i < 3; i++) { const res = await r.resolveFinding(rep, 1); await r.accept({ rejected: [res], findings: [{ n: i + 2, text: 'new' }] }); }
  const st = await readState(r.cwd);
  const { bound } = await settle(r.cwd, await verdictOf(st), st);
  assert.deepEqual(bound, { kind: 'acceptanceRounds', actionClass: 'accept', target: 'first' });
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});

test('semantic progress resets the count; a snapshot or record alone does not', async () => {
  const r = await loopRepo();
  const before = progressSummary(await readState(r.cwd));
  await r.snap(); await r.add('item', 'x', { kind: 'backlog', slug: 'x', source: 'DEMO-001', body: 'b' });
  assert.equal(progressMade(before, progressSummary(await readState(r.cwd))), false);
  await r.passReq('DEMO-001');
  assert.equal(progressMade(before, progressSummary(await readState(r.cwd))), true);
  await settle(r.cwd, V('record', 'a'), await readState(r.cwd));
  await settle(r.cwd, V('record', 'b'), await readState(r.cwd));            // completes record a
  const esc = await r.escalate('DEMO-001'); await r.answer(esc, 'ok');      // developer authorizes continuation
  await settle(r.cwd, V('record', 'c'), await readState(r.cwd));
  assert.equal((await (await import('../lib/cycle.mjs')).readCounter(r.cwd)).total, 1);   // reset, then the completion of record b starts the new window
});

// Deviation from the plan text: lib/mechanisms.mjs (plan 05, already committed) stores one JSON
// entry per mechanism at '.cairn/mechanisms/<name>.json', not a single '.cairn/mechanisms' file;
// readFile(join(cwd, '.cairn/mechanisms')) on that real directory throws EISDIR. Both the guarded
// path and the good-bytes read below use the real per-mechanism file loopRepo's own declare()
// wrote (demo-001.json, since loopRepo declares 'DEMO-001' under mechanism name 'demo-001').
test('a kernel-managed write whose bytes would create a violation of equal or higher precedence is refused with the cycle escalation', async () => {
  const r = await loopRepo();
  const mechPath = '.cairn/mechanisms/demo-001.json';
  const good = await readFile(join(r.cwd, mechPath));
  await guardKernelWrite(r.cwd, mechPath, good, { action: 'declare' });
  await assert.rejects(guardKernelWrite(r.cwd, mechPath, Buffer.concat([good, Buffer.from(' ')]), { action: 'declare' }), LivenessError);
  const adr = await readFile(join(r.cwd, 'docs/decisions.jsonl')).catch(() => Buffer.alloc(0));
  await assert.rejects(guardKernelWrite(r.cwd, 'docs/decisions.jsonl', Buffer.concat([adr, Buffer.from('{"kind": "read"}\n')]), { action: 'decide' }), /would create a scope violation/);   // the space makes the line noncanonical
  await guardKernelWrite(r.cwd, 'docs/decisions.jsonl', Buffer.concat([adr, Buffer.from('{"id":"01HZZZZZZZZZZZZZZZZZZZZZZZ","kind":"read","of":"x","record":"y","ts":"2026-09-19T00:00:00Z"}\n')]), { action: 'decide' });
  assert.equal((await r.log()).filter((x) => x.kind === 'escalation' && x.payload.concerns === 'cycle').length, 1);
});

test('withLoop settles after a state-changing command and leaves wake pure', async () => {
  const r = await loopRepo();
  const result = await withLoop(r.cwd, 'begin', () => begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] }));
  assert.ok(result);
  const c = await (await import('../lib/cycle.mjs')).readCounter(r.cwd);
  assert.deepEqual(c.last, { action: 'run', target: 'DEMO-001' });
});
