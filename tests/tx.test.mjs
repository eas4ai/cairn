// tests/tx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
import { preIdentities, applyWrites } from '../lib/tx.mjs';

const yes = async () => true;
// Deviation from the plan text: lib/settings.mjs's validateSettings (plan 02, already committed)
// requires every typesafeai.* threshold key to be present (a closed object schema; see lib/init.mjs's
// own DEFAULT_SETTINGS comment for the same issue), so the plan's smaller
// `typesafeai: { enabled, mode, model }` stub fails loadSettings. Filled in with the same defaults
// tests/auth.test.mjs already uses.
const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [],
  network_exclude: [], signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { enabled: false, mode: 'shadow', model: null,
    route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3,
    reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05,
    min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } });
const BASE = { '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# a\n', 'docs/spec/overview.md': '# k\n' };
async function initialized() {
  const { cwd } = await repoWith(BASE);
  await init(cwd, { confirmRemote: async () => null, chooseKey: async () => null, confirm: yes, confirmDigest: yes });
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
