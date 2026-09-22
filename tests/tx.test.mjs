// tests/tx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';

// Plan 01's makeRepo() returns {dir, git, write, commit, readRef, remove}; this wrapper
// writes the fixture files, commits them and exposes the directory as cwd.
async function repoWith(files) {
  const repo = await makeRepo();
  for (const [p, c] of Object.entries(files)) await repo.write(p, c);
  await repo.commit('fixture');
  return { cwd: repo.dir, repo };
}
import { gitPath } from '../lib/gitx.mjs';
import { sha256 } from '../lib/canon.mjs';
import { MULTI_STORE, acquireLock, stage, readStaging, writeAtomic } from '../lib/tx.mjs';

test('the four multi-store commands are the only transactional ones', () => {
  assert.deepEqual([...MULTI_STORE].sort(), ['authorize', 'promote', 'start', 'supersede']);
});

test('the lock is a repository-local file below the git path and refuses a live holder', async () => {
  const { cwd } = await repoWith({});
  const release = await acquireLock(cwd, 'TX1');
  const lock = await gitPath(cwd, 'cairn-tx.lock');
  assert.equal(readFileSync(lock, 'utf8'), `${process.pid} TX1`);
  await assert.rejects(acquireLock(cwd, 'TX2'), /^TxError: cairn: transaction TX1 holds cairn-tx.lock \(pid \d+ alive\); wait or run cairn recover TX1/);
  release();
  assert.equal(existsSync(lock), false);
});

test('a lock whose holder is dead is removed and retaken', async () => {
  const { cwd } = await repoWith({});
  writeFileSync(await gitPath(cwd, 'cairn-tx.lock'), '999999999 TXDEAD');
  const release = await acquireLock(cwd, 'TX3');
  assert.equal(readFileSync(await gitPath(cwd, 'cairn-tx.lock'), 'utf8'), `${process.pid} TX3`);
  release();
});

test('stage writes plan, pre-identities and exact bytes by rename, never a partial file', async () => {
  const { cwd } = await repoWith({});
  const plan = { identity: { a: 1 }, writes: [{ store: 'file', path: 'docs/x.md', bytes: Buffer.from('hello\n') }, { store: 'snapshot' }],
    terminal: { kind: 'authorization', target: 'protected', payload: { k: 1 } } };
  const pre = { refs: { 'refs/cairn/log': null, 'refs/cairn/snapshots': null }, head: 'a'.repeat(40), files: { 'docs/x.md': null } };
  const dir = await stage(cwd, 'TX4', plan, pre);
  assert.equal(dir, await gitPath(cwd, 'cairn-tx/TX4'));
  assert.deepEqual(readdirSync(dir).sort(), ['bytes', 'plan.json', 'pre.json']);
  assert.equal(readFileSync(join(dir, 'bytes/0'), 'utf8'), 'hello\n');
  const s = await readStaging(cwd, 'TX4');
  assert.deepEqual(s.plan.writes[0], { store: 'file', path: 'docs/x.md', digest: sha256('hello\n') });
  assert.deepEqual(s.pre, pre);
  assert.equal(s.intentSha, null);
  assert.deepEqual(s.done, {});
  assert.equal(readdirSync(dir).some((n) => n.endsWith('.tmp')), false);
});

import { git, readRef, catCommit } from '../lib/gitx.mjs';
import { readLog, appendRecord } from '../lib/records.mjs';
import { init } from '../lib/init.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { preIdentities, applyWrites } from '../lib/tx.mjs';

// Deviation from the plan text: lib/settings.mjs's validateSettings (plan 02, already committed)
// requires every typesafeai.* threshold key to be present (a closed object schema; see lib/init.mjs's
// own DEFAULT_SETTINGS comment for the same issue), so the plan's smaller
// `typesafeai: { enabled, mode, model }` stub fails loadSettings. Filled in with the same defaults
// tests/auth.test.mjs already uses.
const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [],
  network_exclude: [], signing_key: null, attribution: 'forbidden', developer: 'present', harness: {}, typesafeai: { enabled: false, model: null,
    weights: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, agent_ceiling: 0.35,
    confidence_floors: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 },
    min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } });
const BASE = { '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# a\n', 'docs/spec/overview.md': '# k\n' };
async function initialized() {
  const { cwd } = await repoWith(BASE);
  await init(cwd, { adopt: (await loadSettings(cwd)).digest, quote: 'ok', env: {} });
  return cwd;
}
const filePlan = (bytes = 'v2\n') => ({ identity: { i: 1 },
  writes: [{ store: 'file', path: 'docs/spec/overview.md', bytes: Buffer.from(bytes) },
    { store: 'branch', paths: ['docs/spec/overview.md'], message: 'Authorize the specification' },
    { store: 'snapshot' },
    { store: 'log', kind: 'read', target: '01J0000000000000000000ABCD', payload: { decision: '01J0000000000000000000ABCD', evidence: { mode: 'unsigned-local', purpose: 'read', subject: 'x', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true } } }],
  terminal: { kind: 'authorization', target: 'protected', payload: {} } });

test('preIdentities records every touched store before anything is written', async () => {
  const cwd = await initialized();
  const pre = await preIdentities(cwd, filePlan());
  assert.equal(pre.head, (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim());
  assert.equal(pre.refs['refs/cairn/log'], await readRef(cwd, 'refs/cairn/log'));
  assert.equal(pre.refs['refs/cairn/snapshots'], await readRef(cwd, 'refs/cairn/snapshots'));
  assert.deepEqual(pre.files, { 'docs/spec/overview.md': sha256('# k\n') });
});

test('a branch write commits a planned path that .gitignore ignores (a developer who ignores docs/)', async () => {
  const cwd = await initialized();
  writeFileSync(join(cwd, '.gitignore'), 'docs/\n');
  writeFileSync(join(cwd, 'docs/decisions.jsonl'), '{"kind":"decision"}\n');
  const plan = { identity: { i: 2 }, writes: [{ store: 'branch', paths: ['docs/decisions.jsonl'], message: 'Start commitment first' }], terminal: { kind: 'authorization', target: 'protected', payload: {} } };
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TX6', plan, pre);
  const results = await applyWrites(cwd, await readStaging(cwd, 'TX6'));
  const committed = (await git(['show', '--name-only', '--format=', results[0]], { cwd })).stdout.trim().split('\n').filter(Boolean);
  assert.deepEqual(committed, ['docs/decisions.jsonl']);
  assert.equal((await git(['status', '--porcelain', '--ignored', '--', 'docs/decisions.jsonl'], { cwd })).stdout, '', 'tracked now, no longer ignored');
});

test('applyWrites performs the ordered writes once and is idempotent when run again', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TX5', plan, pre);
  const results = await applyWrites(cwd, await readStaging(cwd, 'TX5'));
  assert.equal(readFileSync(join(cwd, 'docs/spec/overview.md'), 'utf8'), 'v2\n');
  const head = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
  assert.equal(results[1], head);
  assert.equal((await catCommit(cwd, head)).subject, 'Authorize the specification');
  assert.equal(results[2], await readRef(cwd, 'refs/cairn/snapshots'));
  assert.equal(results[3], await readRef(cwd, 'refs/cairn/log'));
  const again = await applyWrites(cwd, await readStaging(cwd, 'TX5'));
  assert.deepEqual(again, results);
  assert.equal((await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim(), head, 'no second commit');
  assert.equal((await readLog(cwd)).filter((r) => r.kind === 'read').length, 1, 'no second record');
});

test('a store showing neither the pre nor the planned identity is a conflict naming the repair', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TX6', plan, pre);
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'someone else\n');
  await assert.rejects(applyWrites(cwd, await readStaging(cwd, 'TX6')),
    new RegExp(`^TxConflict: cairn: transaction TX6 cannot complete: docs/spec/overview.md is ${sha256('someone else\n')}, expected ${sha256('# k\n')} or ${sha256('v2\n')}; restore it to ${sha256('# k\n')} then run cairn recover TX6`));
});

import { withTransaction } from '../lib/tx.mjs';

test('withTransaction refuses every command that is not one of the four', async () => {
  const cwd = await initialized();
  for (const command of ['check', 'begin', 'review', 'escalate', 'done', 'declare']) {
    await assert.rejects(withTransaction(cwd, { command, plan: filePlan() }, async () => ({})),
      new RegExp(`^TxError: cairn: ${command} writes one store and needs no transaction`));
  }
  assert.equal(existsSync(await gitPath(cwd, 'cairn-tx.lock')), false);
});

// Deviation from the plan text: the plan's own comment says the authorization schema "is closed"
// at Task 6, and this fn's payload carries an extra snapshot_check key "to show results reaching
// fn" until then. On this branch the authorization schema was already closed to exactly
// {spec_digest, agreement_digest, settings_digest, evidence, decision, intent} before Task 3 (see
// the records.mjs deviation note near the 'authorization' entry), so appendRecord would refuse the
// extra key immediately, not just from Task 6 onward. The demonstration that results reaches fn is
// kept as an assertion inside fn instead of as an extra payload field, and the payload already uses
// Task 6's closed shape.
test('withTransaction appends intent, performs the writes, appends the terminal record naming the intent, and cleans staging', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const logBefore = (await readLog(cwd)).length;
  const r = await withTransaction(cwd, { command: 'authorize', plan }, async ({ results }) => {
    assert.equal(results[2], await readRef(cwd, 'refs/cairn/snapshots'), 'results reaches fn');
    return { spec_digest: sha256('v2\n'), agreement_digest: sha256('# a\n'), settings_digest: 'sha256:' + '0'.repeat(64),
       evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 's', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true },
       decision: null };
  });
  const log = await readLog(cwd);
  const kinds = log.slice(logBefore).map((x) => x.kind);
  assert.deepEqual(kinds, ['command-intent', 'read', 'authorization']);
  const intent = log[logBefore];
  assert.equal(intent.sha, r.intentSha);
  assert.equal(intent.target, r.tx);
  assert.equal(intent.payload.command, 'authorize');
  assert.deepEqual(intent.payload.identity, { i: 1 });
  assert.equal(intent.payload.pre.head.length, 40);
  assert.deepEqual(intent.payload.writes.map((w) => w.store), ['file', 'branch', 'snapshot', 'log']);
  assert.equal(intent.payload.writes[0].digest, sha256('v2\n'));
  assert.equal(log.at(-1).payload.intent, r.intentSha);
  assert.equal(log.at(-1).sha, r.terminalSha);
  assert.equal(existsSync(await gitPath(cwd, `cairn-tx/${r.tx}`)), false);
  assert.equal(existsSync(await gitPath(cwd, 'cairn-tx.lock')), false);
});

import { recover, pendingTransaction, stagingDir } from '../lib/tx.mjs';
import { rmSync } from 'node:fs';

async function crashAfterIntent(cwd, plan, tx = 'TXCRASH') {
  const pre = await preIdentities(cwd, plan);
  const dir = await stage(cwd, tx, plan, pre);
  const intentSha = await appendRecord(cwd, 'command-intent', tx, { tx, command: 'authorize', identity: plan.identity, pre, writes: (await readStaging(cwd, tx)).plan.writes });
  writeAtomic(join(dir, 'intent'), intentSha);
  return intentSha;
}
const terminalPlan = () => { const p = filePlan(); p.terminal.payload = { spec_digest: sha256('v2\n'), agreement_digest: sha256('# a\n'), settings_digest: 'sha256:' + '0'.repeat(64),
  evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 's', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true }, decision: null }; return p; };

test('an intent with no writes and no effect is aborted with restored pre-identities', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  assert.equal((await pendingTransaction(cwd, await readLog(cwd))).sha, intentSha);
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'abort');
  const log = await readLog(cwd);
  assert.deepEqual(log.slice(-2).map((x) => x.kind), ['command-intent', 'command-abort']);
  const abort = log.at(-1).payload;
  assert.equal(abort.intent, intentSha);
  assert.equal(abort.failure_class, 'interrupted');
  // Fix round 1 finding 2/3: `restored` is now list(storeIdentity), re-read fresh under the lock
  // (not a copy of the pre-capture), and `results` is always [] on an abort (nothing landed).
  const byStore = (store) => abort.restored.find((r2) => r2.store === store)?.identity;
  assert.equal(byStore('HEAD'), log.at(-2).payload.pre.head);
  assert.equal(byStore('file:docs/spec/overview.md'), sha256('# k\n'));
  assert.deepEqual(abort.results, []);
  assert.equal(readFileSync(join(cwd, 'docs/spec/overview.md'), 'utf8'), '# k\n');
  assert.equal(await pendingTransaction(cwd, log), null);
  assert.equal(existsSync(await stagingDir(cwd, 'TXCRASH')), false);
});

test('an intent followed by one file write completes forward: the exact chain is intent, read, authorization', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'v2\n'); // the first planned write landed, then the process died
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'forward');
  const log = await readLog(cwd);
  const from = log.findIndex((x) => x.sha === intentSha);
  assert.deepEqual(log.slice(from).map((x) => x.kind), ['command-intent', 'read', 'authorization']);
  assert.equal(log.at(-1).payload.intent, intentSha);
  assert.equal((await catCommit(cwd, (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim())).subject, 'Authorize the specification');
  assert.equal(await pendingTransaction(cwd, log), null);
});

test('an intent followed by an append-only write completes forward and never rewrites the ref', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  const s = await readStaging(cwd, 'TXCRASH');
  const logHeadAfterIntent = await readRef(cwd, 'refs/cairn/log');
  await applyWrites(cwd, s); // all four writes landed, the terminal record did not
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'forward');
  const log = await readLog(cwd);
  assert.ok(log.some((x) => x.sha === logHeadAfterIntent), 'earlier log records remain reachable');
  assert.deepEqual(log.slice(log.findIndex((x) => x.sha === intentSha)).map((x) => x.kind), ['command-intent', 'read', 'authorization']);
});

test('recover of a completed transaction is a no-op', async () => {
  const cwd = await initialized();
  const r1 = await withTransaction(cwd, { command: 'authorize', plan: terminalPlan() }, null);
  const n = (await readLog(cwd)).length;
  const r2 = await recover(cwd, r1.tx);
  assert.equal(r2.completed, 'forward');
  assert.equal((await readLog(cwd)).length, n);
});

test('a conflicting writer blocks forward completion: the intent is preserved and the repair is named', async () => {
  const cwd = await initialized();
  const intentSha = await crashAfterIntent(cwd, terminalPlan());
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'v2\n');
  await git(['commit', '-q', '-am', 'Unrelated commit by another writer'], { cwd });
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'blocked');
  assert.match(r.repair, /^cairn: transaction TXCRASH cannot complete: HEAD is [0-9a-f]{40}, expected [0-9a-f]{40} or a commit "Authorize the specification" on [0-9a-f]{40}; restore it to [0-9a-f]{40} then run cairn recover TXCRASH$/);
  assert.equal(readFileSync(join(await stagingDir(cwd, 'TXCRASH'), 'repair'), 'utf8'), r.repair);
  const log = await readLog(cwd);
  assert.equal((await pendingTransaction(cwd, log)).sha, intentSha);
  assert.equal(log.at(-1).kind, 'command-intent');
});

test('lost staging with no effect is blocked and names the repair; staging without an intent is cleaned', async () => {
  const cwd = await initialized();
  await crashAfterIntent(cwd, terminalPlan());
  rmSync(await stagingDir(cwd, 'TXCRASH'), { recursive: true });
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'blocked');
  assert.match(r.repair, /staging for transaction TXCRASH is missing/);
  await stage(cwd, 'TXORPHAN', terminalPlan(), await preIdentities(cwd, terminalPlan()));
  assert.equal((await recover(cwd, 'TXORPHAN')).completed, 'abort');
  assert.equal(existsSync(await stagingDir(cwd, 'TXORPHAN')), false);
  assert.equal((await readLog(cwd)).at(-1).kind, 'command-intent', 'no abort record for a transaction that never reached the log');
});

import { recoverPredicate, runRecover } from '../lib/tx.mjs';

test('recoverPredicate names the pending transaction and is null once it has a terminal or abort record', async () => {
  const cwd = await initialized();
  assert.equal(await recoverPredicate(cwd, await readLog(cwd)), null);
  const intentSha = await crashAfterIntent(cwd, terminalPlan(), 'TXP');
  assert.deepEqual(await recoverPredicate(cwd, await readLog(cwd)),
    { action: 'recover', target: 'TXP', reason: `command-intent ${intentSha} for authorize has no terminal record` });
  await recover(cwd, 'TXP');
  assert.equal(await recoverPredicate(cwd, await readLog(cwd)), null);
});

test('cairn recover prints the result and exits 3 with the repair line when blocked', async () => {
  const cwd = await initialized();
  await crashAfterIntent(cwd, terminalPlan(), 'TXB');
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'v2\n');
  await git(['commit', '-q', '-am', 'Unrelated'], { cwd });
  const out = []; const err = [];
  const code = await runRecover(['TXB'], { cwd, stdout: (l) => out.push(l), stderr: (l) => err.push(l) });
  assert.equal(code, 3);
  assert.equal(out.length, 1);
  assert.match(out[0], /^cairn: transaction TXB cannot complete/);
  assert.equal(err.length, 0);
});

// --- Fix round 1 ---

test('Fix round 1 finding 13: stage refuses a planned file write whose path escapes the worktree', async () => {
  const cwd = await initialized();
  const plan = { identity: { i: 1 }, writes: [{ store: 'file', path: '../escape.md', bytes: Buffer.from('x\n') }],
    terminal: { kind: 'authorization', target: 'protected', payload: {} } };
  const pre = await preIdentities(cwd, plan);
  await assert.rejects(stage(cwd, 'TXESCAPE', plan, pre), /PathError|component in/);
  assert.equal(existsSync(join(cwd, '..', 'escape.md')), false, 'nothing was written outside the worktree');
});

test('Fix round 1 finding 10: an unparseable cairn-tx.lock is treated as held, never silently removed', async () => {
  const { cwd } = await repoWith({});
  const lock = await gitPath(cwd, 'cairn-tx.lock');
  writeFileSync(lock, 'not-a-pid');
  await assert.rejects(acquireLock(cwd, 'TX7'), /^TxError: cairn: cairn-tx.lock is unreadable/);
  assert.equal(readFileSync(lock, 'utf8'), 'not-a-pid', 'the unreadable lock file is left in place, not deleted');
  writeFileSync(lock, '0 TXZERO');
  await assert.rejects(acquireLock(cwd, 'TX8'), /^TxError: cairn: cairn-tx.lock is unreadable/);
});

test('Fix round 1 finding 6: applyWrites\' branch commit never sweeps an unrelated staged file into the write', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TX9', plan, pre);
  writeFileSync(join(cwd, 'unrelated.txt'), 'developer work in progress\n');
  await git(['add', 'unrelated.txt'], { cwd });
  await applyWrites(cwd, await readStaging(cwd, 'TX9'));
  const committed = (await git(['show', '--name-only', '--format=', 'HEAD'], { cwd })).stdout.trim().split('\n').filter(Boolean);
  assert.deepEqual(committed, ['docs/spec/overview.md']);
  assert.equal((await git(['status', '--porcelain', '--', 'unrelated.txt'], { cwd })).stdout.trim(), 'A  unrelated.txt');
});

import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';

test('Fix round 1 finding 4: every planned write kind carries a digest in the intent record', async () => {
  const cwd = await initialized();
  const plan = filePlan();
  const r = await withTransaction(cwd, { command: 'authorize', plan }, async () => ({
    spec_digest: sha256('v2\n'), agreement_digest: sha256('# a\n'), settings_digest: 'sha256:' + '0'.repeat(64),
    evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 's', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true },
    decision: null,
  }));
  const log = await readLog(cwd);
  const intent = log.find((x) => x.sha === r.intentSha);
  assert.equal(intent.payload.writes.map((w) => w.store).join(','), 'file,branch,snapshot,log');
  for (const w of intent.payload.writes) assert.match(w.digest, /^sha256:[0-9a-f]{64}$/, `${w.store} write carries a digest`);
});

test('Fix round 1 finding 1: a crash after the snapshot ref advances but before markDone adopts it, never duplicates it', async () => {
  const cwd = await initialized();
  const plan = terminalPlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TXSNAP', plan, pre);
  await writeWorkspaceSnapshot(cwd); // simulates the snapshot write landing, then the process dying before markDone
  const before = await readRef(cwd, 'refs/cairn/snapshots');
  const results = await applyWrites(cwd, await readStaging(cwd, 'TXSNAP'));
  assert.equal(results[2], before, 'the already-landed snapshot commit is adopted, not duplicated');
  assert.equal(await readRef(cwd, 'refs/cairn/snapshots'), before, 'no second snapshot commit was created');
});

test('Fix round 1 finding 2: an aborted transaction\'s restored names the log\'s real current identity, not the stale pre-capture', async () => {
  const cwd = await initialized();
  await crashAfterIntent(cwd, terminalPlan());
  const r = await recover(cwd, 'TXCRASH');
  assert.equal(r.completed, 'abort');
  const log = await readLog(cwd);
  const abort = log.at(-1).payload;
  const logEntry = abort.restored.find((e) => e.store === 'refs/cairn/log');
  // restored was read under the lock, one step before the abort record itself was appended (which
  // advances refs/cairn/log again); at that moment the ref's real value was the intent's own sha.
  assert.equal(logEntry.identity, log.at(-2).sha);
  assert.notEqual(logEntry.identity, log.at(-2).payload.pre.refs['refs/cairn/log'],
    'the log ref can never truthfully equal its stale pre-capture again: the intent record itself already advanced it');
});

// Fix round 2 finding 3 corrects this test's own original scenario: it used to assert that
// editing the file after completion WAS drift, which is exactly the bug finding 3 names ("every
// store matches its resulting identity" means the write landed, not that the store never changes
// again). A file write's resulting identity is now verified against the content its own
// transaction's branch commit holds, an immutable fact, not the mutable working tree.
test('Fix round 1/2 finding 3: a legitimate later edit of a transaction-written file is never drift', async () => {
  const cwd = await initialized();
  const r = await withTransaction(cwd, { command: 'authorize', plan: terminalPlan() }, null);
  assert.equal(await recoverPredicate(cwd, await readLog(cwd)), null, 'nothing has drifted yet');
  writeFileSync(join(cwd, 'docs/spec/overview.md'), 'edited later; not drift\n');
  assert.equal(await recoverPredicate(cwd, await readLog(cwd)), null,
    'the file the transaction wrote was later edited, same as promote editing the roadmap start wrote, or a developer editing AGENTS.md between commitments -- not drift');
  assert.equal((await pendingTransaction(cwd, await readLog(cwd))), null);
});

test('Fix round 2 finding 3: rewriting the branch so the recorded commit is no longer an ancestor of HEAD is drift', async () => {
  const cwd = await initialized();
  const headBefore = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
  const r = await withTransaction(cwd, { command: 'authorize', plan: terminalPlan() }, null);
  assert.equal(await recoverPredicate(cwd, await readLog(cwd)), null, 'nothing has drifted yet');
  // Rewrite history so the branch commit the transaction recorded is no longer reachable from HEAD.
  await git(['reset', '--hard', headBefore], { cwd });
  await git(['commit', '-q', '--allow-empty', '-m', 'rewritten history'], { cwd });
  const p = await recoverPredicate(cwd, await readLog(cwd));
  assert.deepEqual(p, { action: 'recover', target: r.tx,
    reason: `command-intent ${r.intentSha} for authorize closed, but a store no longer matches the identity it recorded; recover it before continuing` });
});

import { encodeRecord } from '../lib/records.mjs';

test('Fix round 1 finding 8: promotion and superseded round-trip intent and results', async () => {
  const cwd = await initialized();
  const sha = await appendRecord(cwd, 'promotion', 'item01',
    { item: 'a'.repeat(40), decision: '01J0000000000000000000ABCD', intent: 'b'.repeat(40), results: [{ store: 'HEAD', identity: 'c'.repeat(40) }] });
  const rec = (await readLog(cwd)).find((r) => r.sha === sha);
  assert.equal(rec.kind, 'promotion');
  assert.equal(rec.payload.intent, 'b'.repeat(40));
  assert.deepEqual(rec.payload.results, [{ store: 'HEAD', identity: 'c'.repeat(40) }]);
  const sha2 = await appendRecord(cwd, 'superseded', 'hooks',
    { slug: 'hooks', start: 'a'.repeat(40), decision: '01J0000000000000000000ABCD', transition: '01J0000000000000000000ABCE', successor: 'next', carried: [], intent: null, results: [] });
  const rec2 = (await readLog(cwd)).find((r) => r.sha === sha2);
  assert.equal(rec2.payload.intent, null);
  assert.deepEqual(rec2.payload.results, []);
});

test('Fix round 1 finding 9: a planned write missing its digest is refused by the closed writeEntry schema', async () => {
  const badWrites = [{ store: 'branch', paths: ['a'], message: 'm' }]; // no digest
  const pre = { refs: { 'refs/cairn/log': null, 'refs/cairn/snapshots': null }, head: null, files: {} };
  assert.throws(() => encodeRecord('command-intent', 'TXBAD', { tx: 'TXBAD', command: 'authorize', identity: {}, pre, writes: badWrites }),
    (e) => e.reasons.some((r) => /missing digest/.test(r)));
});

import { effectsHappened } from '../lib/tx.mjs';

test('Fix round 1 finding 12: an unrelated later record is not counted as this transaction\'s own effect', async () => {
  const cwd = await initialized();
  const plan = terminalPlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TXUNRELATED', plan, pre);
  const intentSha = await appendRecord(cwd, 'command-intent', 'TXUNRELATED',
    { tx: 'TXUNRELATED', command: 'authorize', identity: plan.identity, pre, writes: (await readStaging(cwd, 'TXUNRELATED')).plan.writes });
  writeAtomic(join(await stagingDir(cwd, 'TXUNRELATED'), 'intent'), intentSha);
  // An unrelated command appends its own record after our intent; it must not look like our effect.
  await appendRecord(cwd, 'read', '01J0000000000000000000ABCE',
    { decision: '01J0000000000000000000ABCE', evidence: { mode: 'unsigned-local', purpose: 'read', subject: 'y', nonce: 'n2', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true } });
  const log = await readLog(cwd);
  const intent = log.find((r) => r.sha === intentSha);
  const s = await readStaging(cwd, 'TXUNRELATED'); s.intentSha = intentSha;
  assert.equal(await effectsHappened(cwd, s, log, intent), false, 'an unrelated record after our intent is not our own effect');
});

test('Fix round 1 finding 12: pendingTransaction selects the newest command-intent when an id is reused', async () => {
  const cwd = await initialized();
  const plan = terminalPlan();
  const first = await crashAfterIntent(cwd, plan, 'TXREUSE');
  await recover(cwd, 'TXREUSE'); // aborts and closes the first one
  const second = await crashAfterIntent(cwd, plan, 'TXREUSE'); // the same id, reused
  assert.notEqual(first, second);
  const p = await pendingTransaction(cwd, await readLog(cwd));
  assert.equal(p.sha, second, 'the newest command-intent for the reused id is selected, not the first, already-closed one');
});

test('Fix round 1 finding 12: recover itself selects the newest command-intent for a reused id, not the first', async () => {
  const cwd = await initialized();
  const plan = terminalPlan();
  const first = await crashAfterIntent(cwd, plan, 'TXDUP'); // never recovered; still open
  const second = await crashAfterIntent(cwd, plan, 'TXDUP'); // the same id, reused, restages over it
  assert.notEqual(first, second);
  const r = await recover(cwd, 'TXDUP');
  assert.equal(r.completed, 'abort');
  const log = await readLog(cwd);
  assert.equal(log.at(-1).payload.intent, second, 'recovery closed the newest (second) intent, not the stale first one');
});

test('Fix round 1 finding 7: withTransaction crashed after each write recovers to an identical final state, every store written exactly once', async () => {
  for (let n = 0; n < 4; n++) {
    const cwd = await initialized();
    const snapshotsBefore = await readRef(cwd, 'refs/cairn/snapshots');
    const headBefore = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
    const logCountBefore = (await readLog(cwd)).length;

    await assert.rejects(
      withTransaction(cwd, { command: 'authorize', plan: terminalPlan(), failAfterWrite: n }, null),
      new RegExp(`^TxError: cairn: simulated crash after write ${n} \\(test only\\)`));

    const log = await readLog(cwd);
    const intent = log.findLast((r) => r.kind === 'command-intent');
    assert.ok(intent, `write ${n}: the intent record exists even after the crash`);
    const r = await recover(cwd, intent.target);
    assert.equal(r.completed, 'forward', `write ${n}: recovery completes forward`);

    // The final state is identical to an uninterrupted run, and every store was written exactly
    // once: no duplicate snapshot commit, no doubled log record, no second branch commit -- the
    // exact scenarios the old hand-built-intent tests never drove (a partial done set, the
    // 'branch'/'snapshot' adopt-own-write branches, and a genuine snapshot-write crash replay).
    assert.equal(readFileSync(join(cwd, 'docs/spec/overview.md'), 'utf8'), 'v2\n', `write ${n}: file content`);
    assert.equal((await readLog(cwd)).filter((x) => x.kind === 'read').length, 1, `write ${n}: exactly one log write`);
    assert.equal((await readLog(cwd)).length, logCountBefore + 3, `write ${n}: exactly command-intent, read, authorization added`);
    const snapshotsAfter = await readRef(cwd, 'refs/cairn/snapshots');
    assert.notEqual(snapshotsAfter, snapshotsBefore, `write ${n}: the snapshot ref advanced`);
    assert.equal((await catCommit(cwd, snapshotsAfter)).parents[0], snapshotsBefore, `write ${n}: by exactly one commit, not two`);
    const headAfter = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
    assert.notEqual(headAfter, headBefore, `write ${n}: HEAD advanced`);
    const headCommit = await catCommit(cwd, headAfter);
    assert.equal(headCommit.subject, 'Authorize the specification');
    assert.equal(headCommit.parents[0], headBefore, `write ${n}: by exactly one commit, not two`);
  }
});

// --- Fix round 2 ---

test('Fix round 2 finding 1: recover on a completed-but-drifted transaction names the drift, not missing staging', async () => {
  const cwd = await initialized();
  const headBefore = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
  const r = await withTransaction(cwd, { command: 'authorize', plan: terminalPlan() }, null);
  await git(['reset', '--hard', headBefore], { cwd });
  await git(['commit', '-q', '--allow-empty', '-m', 'rewritten history'], { cwd });
  const result = await recover(cwd, r.tx);
  assert.equal(result.completed, 'blocked');
  assert.match(result.repair, new RegExp(`^cairn: transaction ${r.tx} completed, but drifted: HEAD is [0-9a-f]{40}, expected [0-9a-f]{40}`));
  assert.equal(/staging for transaction/.test(result.repair), false, 'never the missing-staging text for a transaction that actually completed');
  assert.match(result.repair, /restore each store to its recorded identity, or accept the change and continue$/);
});

test('Fix round 2 finding 2: a branch write with empty paths is refused at stage time', async () => {
  const cwd = await initialized();
  const plan = { identity: {}, writes: [{ store: 'branch', paths: [], message: 'nothing' }],
    terminal: { kind: 'authorization', target: 'protected', payload: {} } };
  const pre = await preIdentities(cwd, plan);
  await assert.rejects(stage(cwd, 'TXEMPTY', plan, pre), /^TxError: cairn: a branch write needs at least one path/);
});

test('Fix round 2 finding 4: a fabricated sha in a recorded result does not throw a raw GitError; it counts as drift', async () => {
  const cwd = await initialized();
  const intentSha = await appendRecord(cwd, 'command-intent', 'TXFAKE', { tx: 'TXFAKE', command: 'authorize', identity: {},
    pre: { refs: { 'refs/cairn/log': null, 'refs/cairn/snapshots': null }, head: null, files: {} }, writes: [] });
  const fake = 'f'.repeat(40); // a well-formed but nonexistent sha
  await appendRecord(cwd, 'authorization', 'protected', {
    spec_digest: sha256('x\n'), agreement_digest: sha256('y\n'), settings_digest: 'sha256:' + '0'.repeat(64),
    evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 's', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true },
    decision: null, intent: intentSha, results: [{ store: 'HEAD', identity: fake }],
  });
  const p = await pendingTransaction(cwd, await readLog(cwd));
  assert.equal(p.sha, intentSha, 'a fabricated sha that cannot be resolved as an ancestor (git exits 128) is drift, not a thrown error');
});

test('Fix round 2 finding 5: a lock path that keeps disappearing and reappearing is bounded, not an infinite retry', async () => {
  const { cwd } = await repoWith({});
  const lock = await gitPath(cwd, 'cairn-tx.lock');
  // A dangling symlink deterministically reproduces the EEXIST-then-ENOENT race: POSIX open()
  // with O_CREAT|O_EXCL on a path that is a symlink fails EEXIST regardless of the target, and a
  // read through it fails ENOENT since the target never exists. No real concurrency needed.
  symlinkSync(join(cwd, 'nonexistent-lock-target'), lock);
  await assert.rejects(acquireLock(cwd, 'TXBOUND'), /^TxError: cairn: cairn-tx.lock keeps disappearing and reappearing; remove it by hand and retry/);
});

import { writeInputSnapshot } from '../lib/snapshots.mjs';

test('Fix round 2 finding 6: snapshot adoption verifies the candidate is a genuine workspace snapshot, not any commit sharing the parent', async () => {
  const cwd = await initialized();
  const plan = terminalPlan();
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TXBADSNAP', plan, pre);
  // Simulate a concurrent, unrelated writer landing on refs/cairn/snapshots with the exact parent
  // this transaction expects, but the wrong kind (an input snapshot, not the workspace snapshot
  // this write plans) -- the old code adopted any commit sharing that parent.
  await writeInputSnapshot(cwd, { mechanism: 'm', inputs: ['docs/spec/overview.md'] });
  await assert.rejects(applyWrites(cwd, await readStaging(cwd, 'TXBADSNAP')),
    new RegExp(`^TxConflict: cairn: transaction TXBADSNAP cannot complete: refs/cairn/snapshots is [0-9a-f]{40}, expected [0-9a-f]{40} or a new snapshot commit`));
});

// Fix round 2 finding 1 (Important). A 'file' write overwrites its path with staged, pre-computed
// final bytes; a caller building those bytes from the file's own prior content, read before the
// transaction's lock is taken, silently discards anything another writer appends to that same file
// in the window between that read and this write actually landing. 'append' never depends on the
// file's prior content: it stages only the bytes to add, and applyWrites always appends them to
// whatever the file actually holds when the write runs, under the transaction's lock.
import { appendFileSync } from 'node:fs';

test("Fix round 2 finding 1: an append write preserves bytes another writer appended between plan construction and staging", async () => {
  const { cwd } = await repoWith({ 'log.txt': 'first\n' });
  const plan = { identity: { i: 1 }, writes: [{ store: 'append', path: 'log.txt', bytes: Buffer.from('mine\n') }],
    terminal: { kind: 'authorization', target: 'protected', payload: {} } };
  // "Plan construction": the pre-identity is captured now, before any concurrent writer's own append.
  const pre = await preIdentities(cwd, plan);
  // A concurrent command's own append lands in the window between plan construction and staging.
  appendFileSync(join(cwd, 'log.txt'), 'concurrent\n');
  await stage(cwd, 'TXAPPEND1', plan, pre);
  await applyWrites(cwd, await readStaging(cwd, 'TXAPPEND1'));
  assert.equal(readFileSync(join(cwd, 'log.txt'), 'utf8'), 'first\nconcurrent\nmine\n',
    "the concurrent writer's line survives; ours is added after it, not used to overwrite the file");
});

test('Fix round 2 finding 1: crash after an append write, then recover, leaves the appended bytes exactly once', async () => {
  const cwd = await initialized();
  const plan = { identity: { i: 1 },
    writes: [{ store: 'append', path: 'docs/spec/overview.md', bytes: Buffer.from('more\n') }],
    terminal: {
      kind: 'authorization', target: 'protected', payload: {
        spec_digest: 'sha256:' + '0'.repeat(64), agreement_digest: 'sha256:' + '0'.repeat(64), settings_digest: 'sha256:' + '0'.repeat(64),
        evidence: { mode: 'unsigned-local', purpose: 'authorize', subject: 's', nonce: 'n', author: { name: 'Cairn Test', email: 'test@example.invalid' }, confirmed: true },
        decision: null,
      },
    } };
  await assert.rejects(withTransaction(cwd, { command: 'authorize', plan, failAfterWrite: 0 }, null), /simulated crash after write 0/);
  const intent = (await readLog(cwd)).findLast((r) => r.kind === 'command-intent');
  assert.ok(intent, 'the intent record exists even after the crash');
  const r = await recover(cwd, intent.target);
  assert.equal(r.completed, 'forward');
  assert.equal(readFileSync(join(cwd, 'docs/spec/overview.md'), 'utf8'), '# k\nmore\n', 'the append landed exactly once, not zero or twice');
});

test("Fix round 2 finding 1: an append write records the resulting bytes in lib/scope.mjs's kernel-managed ledger", async () => {
  const { cwd } = await repoWith({});
  const plan = { identity: { i: 1 }, writes: [{ store: 'append', path: 'docs/decisions.jsonl', bytes: Buffer.from('{"a":1}\n') }],
    terminal: { kind: 'authorization', target: 'protected', payload: {} } };
  const pre = await preIdentities(cwd, plan);
  await stage(cwd, 'TXAPPEND3', plan, pre);
  await applyWrites(cwd, await readStaging(cwd, 'TXAPPEND3'));
  // The ledger's own reader (managedWriteDigest) is private to lib/scope.mjs; lib/commitment.mjs's
  // own tests exercise it end to end (a realize() that accepts a ledger-recorded kernel-managed
  // write). Here, at the tx.mjs level, it is enough to confirm applyWrites' 'append' branch wrote
  // the expected line to the ledger file itself.
  const ledger = readFileSync(await gitPath(cwd, 'cairn-managed'), 'utf8');
  assert.match(ledger, /^docs\/decisions\.jsonl\tsha256:[0-9a-f]{64}$/m);
});
