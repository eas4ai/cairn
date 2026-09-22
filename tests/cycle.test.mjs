import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loopRepo, mechanismFor } from './helpers/loop.mjs';
import { git, gitPath } from '../lib/gitx.mjs';
import { BOUNDS, ADMIN, bump, readCounter, resetOnProgress, settle, guardKernelWrite, LivenessError, withLoop } from '../lib/cycle.mjs';
import { readState, verdictOf, wake, progressMade, progressSummary } from '../lib/wake.mjs';
import { begin } from '../lib/lease.mjs';
import { declare } from '../lib/mechanisms.mjs';
import { preflight, dispose } from '../lib/scope.mjs';

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

// Fix round 1, item 6: progressSummary's obligations count used to include openBreaches(log), so
// disposing a scope breach lowered it and progressMade read that as progress -- but the spec's
// four semantic-progress clauses name a finding, defect or escalation closing, never a scope
// breach.
test('disposing a scope breach alone is not semantic progress', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  const before = progressSummary(await readState(r.cwd));
  await r.remove('src/stray.mjs');
  await dispose(r.cwd, b, 'restore');
  assert.equal(progressMade(before, progressSummary(await readState(r.cwd))), false);
});

// Deviation from the plan text: lib/mechanisms.mjs (plan 05, already committed) stores one JSON
// entry per mechanism at '.cairn/mechanisms/<name>.json', not a single '.cairn/mechanisms' file;
// readFile(join(cwd, '.cairn/mechanisms')) on that real directory throws EISDIR. Both the guarded
// path and the good-bytes read below use the real per-mechanism file loopRepo's own declare()
// wrote (demo-001.json, since loopRepo declares 'DEMO-001' under mechanism name 'demo-001').
//
// This test covers only the cheap parse/append-only gate (bookkeepingViolation): is the write
// even valid canonical bookkeeping? A real declare()/appendDecision() call can never produce
// bytes that fail this gate (both always canonicalize what they write), so exercising it needs a
// direct byte injection; the fix round 1 item 3/12 test below drives the deeper, scratch-state
// precedence check through the real functions instead.
test('a kernel-managed write with corrupted or noncanonical bytes is refused, and the first refusal writes no escalation', async () => {
  const r = await loopRepo();
  const mechPath = '.cairn/mechanisms/demo-001.json';
  const good = await readFile(join(r.cwd, mechPath));
  await guardKernelWrite(r.cwd, mechPath, good, { action: 'declare' });
  await assert.rejects(guardKernelWrite(r.cwd, mechPath, Buffer.concat([good, Buffer.from(' ')]), { action: 'declare' }), LivenessError);
  const adr = await readFile(join(r.cwd, 'docs/decisions.jsonl')).catch(() => Buffer.alloc(0));
  await assert.rejects(guardKernelWrite(r.cwd, 'docs/decisions.jsonl', Buffer.concat([adr, Buffer.from('{"kind": "read"}\n')]), { action: 'decide' }), /would create a scope violation/);   // the space makes the line noncanonical
  await guardKernelWrite(r.cwd, 'docs/decisions.jsonl', Buffer.concat([adr, Buffer.from('{"id":"01HZZZZZZZZZZZZZZZZZZZZZZZ","kind":"read","of":"x","record":"y","ts":"2026-09-19T00:00:00Z"}\n')]), { action: 'decide' });
  assert.equal((await r.log()).filter((x) => x.kind === 'escalation' && x.payload.concerns === 'cycle').length, 0);
});

test('a refused write counts toward the same-target bound: the fourth refusal writes one cycle escalation naming the violation', async () => {
  const r = await loopRepo();
  await r.write('src/util.mjs', 'export const x = 1;\n');
  const widened = { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] };
  const cycle = async () => (await r.log()).filter((x) => x.kind === 'escalation' && x.payload.concerns === 'cycle');
  for (let i = 1; i <= 3; i++) {
    await assert.rejects(declare(r.cwd, 'demo-001', widened), (e) => e instanceof LivenessError && /record violation \(src\/util\.mjs is a declared input/.test(e.message) && !/escalation written/.test(e.message));
    assert.equal((await cycle()).length, 0, `refusal ${i} writes no escalation`);
  }
  await assert.rejects(declare(r.cwd, 'demo-001', widened), (e) => e instanceof LivenessError && /cycle escalation written/.test(e.message));
  const esc = await cycle();
  assert.equal(esc.length, 1);
  assert.match(esc[0].payload.question, /declare \.cairn\/mechanisms\/demo-001\.json was refused 4 times: it would create a record violation \(src\/util\.mjs/);
});

// Fix round 1, item 3 and 12: the liveness invariant now walks the real precedence predicates
// against a scratch state with the write already applied, so it must be driven through the real
// declare() (lib/mechanisms.mjs) and appendDecision() (lib/adr.mjs, via the loop fixture's own
// decide() step) with bytes those functions actually produce, not a hand-built buffer. A dirty,
// undeclared file with no recorded breach and no lease is invisible to every predicate until a
// declare() widens some mechanism's inputs to cover it -- at that instant 'record' (index 6, at or
// before declare's own index 7) goes from satisfied to unmet, so the write that would have
// legalized it is refused instead of landing.
test('declare is refused when its new input would legalize a pre-existing undeclared delta, and allowed otherwise', async () => {
  const r = await loopRepo();
  await r.write('src/util.mjs', 'export const x = 1;\n');   // dirty, undeclared, no lease, no preflight run
  await assert.rejects(
    declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] }),
    LivenessError,
  );
  const esc = (await r.log()).filter((x) => x.kind === 'escalation' && x.payload.concerns === 'cycle');
  assert.equal(esc.length, 0, 'a first refusal writes no escalation');
  // the refused declare wrote nothing: the mechanism definition still has its original inputs
  const before = JSON.parse(await readFile(join(r.cwd, '.cairn/mechanisms/demo-001.json'), 'utf8'));
  assert.deepEqual(before.definition.inputs, ['flags/DEMO-001', 'src/demo.mjs']);
  // a normal re-declare (same definition, nothing newly dirty-and-declared) is allowed
  await declare(r.cwd, 'demo-001', mechanismFor('DEMO-001'));
  // a legitimate ADR append (through the real appendDecision(), via the loop fixture's decide()
  // step) is allowed too
  const id = await r.decide();
  assert.ok(id);
});

test('a corrupted cycle counter file is a refusal, not a silent reset to empty', async () => {
  const r = await loopRepo();
  await bump(r.cwd, 'record', 'src/a.mjs');
  const file = await gitPath(r.cwd, 'cairn-cycle.json');
  await writeFile(file, 'not json');
  await assert.rejects(readCounter(r.cwd), /is corrupt/);
});

test('withLoop settles after a state-changing command and leaves wake pure', async () => {
  const r = await loopRepo();
  const result = await withLoop(r.cwd, 'begin', () => begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] }));
  assert.ok(result);
  const c = await (await import('../lib/cycle.mjs')).readCounter(r.cwd);
  assert.deepEqual(c.last, { action: 'run', target: 'DEMO-001' });
});

// Fix round 2 finding 15 (plan 09 re-review): the counter's temp file (<gitdir>/cairn-cycle.json.tmp)
// was a fixed name, so two concurrent state-changing commands racing to settle() at the same
// moment could each write their own record, print success, and still exit 1 on an unrelated
// "ENOENT: no such file or directory, rename '.../cairn-cycle.json.tmp' -> '.../cairn-cycle.json'"
// -- whichever renamed second found its own .tmp already gone. Reproduced with the reviewer's own
// method: 8 concurrent main(['escalate', ...]) calls. main(), for a state-changing command, always
// calls settle() after the command runs (lib/cli.mjs's withLoop), win or lose the escalation's own
// log CAS race (finding 12's territory), so every one of the 8 hits writeCounter() concurrently
// regardless of which escalate calls actually land.
import { main } from '../lib/cli.mjs';

test('8 concurrent state-changing commands never collide on the cycle counter temp file (finding 15)', async () => {
  const r = await loopRepo();
  const run = (i) => {
    let out = '', err = '';
    const argv = ['escalate', '--commitment', 'first', '--concern', 'DEMO-001', '--question', `Racer ${i}?`,
      '--recommendation', 'R', '--because', 'B', '--if-wrong', 'W', '--instead', 'I'];
    return main(argv, { cwd: r.cwd, stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } })
      .then((code) => ({ code, out, err }));
  };
  const results = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(run));
  for (const res of results) assert.equal(/ENOENT.*cairn-cycle\.json\.tmp/.test(res.err), false, res.err);
});
