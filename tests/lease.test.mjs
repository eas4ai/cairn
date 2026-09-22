// tests/lease.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Fix round 1 finding 14: mkdirSync was imported per the plan's Task 7 step 1 code but never
// called; every fixture path here is written through repo.write, which already creates its
// directories.
import { existsSync, writeFileSync } from 'node:fs';
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
import { readRef, catCommit, git, gitPath } from '../lib/gitx.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { init } from '../lib/init.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { begin, readLease, LEASE_REF } from '../lib/lease.mjs';

// Deviation from the plan text: see tests/tx.test.mjs's SETTINGS note; lib/settings.mjs's
// validateSettings (plan 02, already committed) requires every typesafeai.* threshold key.
const SETTINGS = JSON.stringify({ schema: 1, authority_remote: null, outside: [], source: ['src/**'], interfaces: [], data: [],
  network_exclude: [], signing_key: null, attribution: 'forbidden', developer: 'present', harness: {}, typesafeai: { enabled: false, model: null,
    weights: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, agent_ceiling: 0.35,
    confidence_floors: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 },
    min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } });
async function initialized() {
  const { cwd } = await repoWith({ '.cairn/settings.json': SETTINGS, 'AGENTS.md': '# a\n', 'docs/spec/overview.md': '# k\n', 'src/a.mjs': 'export const a = 1;\n' });
  await init(cwd, { adopt: (await loadSettings(cwd)).digest, quote: 'ok', env: {} });
  return cwd;
}

test('begin creates the lease with the action, target, start snapshot, timestamp, session and touch list', async () => {
  const cwd = await initialized();
  const sha = await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs'], env: { CAIRN_SESSION: 'sess-1' } });
  assert.equal(await readRef(cwd, LEASE_REF), sha);
  const lease = await readLease(cwd);
  assert.equal(lease.action, 'implement');
  assert.equal(lease.target, 'CORE-001');
  assert.equal(lease.session, 'sess-1');
  assert.deepEqual(lease.touch, ['src/new.mjs']);
  assert.match(lease.started, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  const snap = await readSnapshot(cwd, lease.snapshot, 'workspace');
  assert.equal(snap.kind, 'workspace');
  const c = await catCommit(cwd, sha);
  assert.equal(c.subject, 'cairn: lease implement CORE-001');
  assert.deepEqual(c.parents, []);
  assert.equal(c.tree, snap.tree);
  assert.equal(existsSync(join(cwd, '.cairn/in-progress')), false, 'no shared slot file');
});

test('begin refuses when a lease exists and names reconcile', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  await assert.rejects(begin(cwd, { action: 'run', target: 'CORE-002', env: {} }),
    /^LeaseError: cairn: action lease held: implement CORE-001; run cairn end or cairn reconcile/);
});

test('begin refuses an unknown action and a touch path that is reserved, protected, invalid or output', async () => {
  const cwd = await initialized();
  await assert.rejects(begin(cwd, { action: 'dance', target: 'X', env: {} }), /^LeaseError: cairn: unknown action dance/);
  for (const p of ['docs/spec/x.md', 'AGENTS.md', '.cairn/mechanisms', '.cairn/output/o', '../x', 'a\\b']) {
    await assert.rejects(begin(cwd, { action: 'implement', target: 'X', touch: [p], env: {} }), /cairn: --touch/);
  }
  assert.equal(await readRef(cwd, LEASE_REF), null);
});

// Fix round 2 finding 1a (Important): checkTouch used to apply a narrower rule set than
// normalizeDefinition's, so `cairn begin --touch` accepted an outside or glob-shaped path that
// applyTouch's own declare() call would refuse later, at `cairn end`, with the lease already
// created and nothing left to retry against. Reproduced: begin implement REQ --touch README.md
// with README.md in settings.outside used to succeed. checkTouch now applies the same rules.
test('begin refuses a --touch path that is outside or names a glob metacharacter (finding 1a)', async (t) => {
  const settings = { ...JSON.parse(SETTINGS), outside: ['README.md'] };
  const { cwd } = await repoWith({ '.cairn/settings.json': JSON.stringify(settings), 'AGENTS.md': '# a\n', 'docs/spec/overview.md': '# k\n', 'src/a.mjs': 'export const a = 1;\n', 'README.md': 'r\n' });
  await init(cwd, { adopt: (await loadSettings(cwd)).digest, quote: 'ok', env: {} });
  await assert.rejects(begin(cwd, { action: 'implement', target: 'X', touch: ['README.md'], env: {} }),
    /^LeaseError: cairn: --touch README\.md is an outside path and cannot be a mechanism input/);
  await assert.rejects(begin(cwd, { action: 'implement', target: 'X', touch: ['src/*.mjs'], env: {} }),
    /^LeaseError: cairn: --touch src\/\*\.mjs has a glob metacharacter and cannot be a mechanism input/);
  assert.equal(await readRef(cwd, LEASE_REF), null);
});

test('readLease ignores a stray .cairn/in-progress file: the shared slot is gone', async () => {
  const cwd = await initialized();
  writeFileSync(join(cwd, '.cairn/in-progress'), 'action: implement\ntarget: X\n');
  assert.equal(await readLease(cwd), null);
});

import { end, onEnd, touchOutcome, covers } from '../lib/lease.mjs';

// Fix round 2 finding 3 (Minor): end() no longer computes a touchOutcome for hooks -- the only
// production hook (the mechanism definition write-back) moved out to lib/cli.mjs's endCommand in
// Fix round 1 finding 2, which calls touchOutcome itself; computing it here too ran the same git
// calls twice for no consumer. Hooks are now called with (cwd, lease) only, and end() returns the
// lease so a caller (or this test) does not need a second readLease for what end() already read.
test('end removes the lease with compare-and-swap, calls the hook with the lease, and returns it', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs', 'src/untouched.mjs'], env: {} });
  writeFileSync(join(cwd, 'src/new.mjs'), 'export const n = 1;\n');
  const seen = [];
  const off = onEnd(async (c, lease) => { seen.push({ c, target: lease.target }); });
  const returned = await end(cwd);
  off();
  assert.equal(await readRef(cwd, LEASE_REF), null);
  assert.deepEqual(seen, [{ c: cwd, target: 'CORE-001' }]);
  assert.equal(returned.target, 'CORE-001');
  assert.deepEqual(returned.touch, ['src/new.mjs', 'src/untouched.mjs']);
});

// Review-1 fix, item 4: section 5's reconcile row reads "the action it named finished or was
// explicitly abandoned", but nothing distinguished the two before this fix -- end() and
// end({abandon: true}) were identical. abandoned is now written into a terminal commit (the
// lease's own fields plus this one), parented on the lease commit, before the ref is removed;
// end() returns its sha so a caller (here, or lib/cli.mjs's endCommand) can read back what was
// actually recorded, not only trust an in-memory flag.
test('end records abandoned: false; end({abandon: true}) records abandoned: true, in a terminal commit', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  const finished = await end(cwd);
  assert.equal(finished.abandoned, false);
  assert.equal(JSON.parse((await catCommit(cwd, finished.terminalSha)).body).abandoned, false);

  await begin(cwd, { action: 'implement', target: 'CORE-002', env: {} });
  const abandoned = await end(cwd, { abandon: true });
  assert.equal(abandoned.abandoned, true);
  assert.equal(JSON.parse((await catCommit(cwd, abandoned.terminalSha)).body).abandoned, true);
  assert.equal(await readRef(cwd, LEASE_REF), null);
});

// Review-2 fix (Minor, new finding on the round-1 re-review): end() and end({abandon}) re-read
// refs/cairn/in-progress and acted on whatever lease was live, with no check that it was the lease
// the caller itself began -- reproduced here exactly as the reviewer found it: actor A's lease is
// released, actor B begins a different one, and a stale end "by A" (no identity check) used to end
// B's DEMO-002/CORE-002 lease instead. The ruling was explicit: no ownership check (a fresh
// session must still be able to reconcile a dead actor's lease), only an identity check for a
// caller that supplies the sha of the lease it itself began.
test('a stale expected lease is refused and names the newer lease, by sha (review-2 new finding, case 1)', async () => {
  const cwd = await initialized();
  const shaA = await begin(cwd, { action: 'implement', target: 'CORE-001', env: { CAIRN_SESSION: 's1' } });
  await end(cwd); // A's own lease is released
  await begin(cwd, { action: 'run', target: 'CORE-002', env: { CAIRN_SESSION: 's2' } });
  await assert.rejects(
    end(cwd, { expect: shaA }),
    /^LeaseError: cairn: action lease [0-9a-f]{40} is now run CORE-002 \(session s2\), not the lease [0-9a-f]{40} this end expected; run cairn reconcile$/,
  );
  // B's lease is untouched by A's stale, refused attempt.
  const live = await readLease(cwd);
  assert.equal(live.target, 'CORE-002');
  assert.equal(live.session, 's2');
});

// Case 2: reconcile from a fresh session, with no begin (and so no expected sha) of its own, must
// still be able to end or abandon a dead actor's stale lease -- this is the "no ownership check"
// half of the ruling. This lease's session (s1) differs from the reconciling session (s2) -- the
// same shape the "a lease from another session is stale" test below shows wake would name
// reconcile for -- and end/end({abandon}) with no `expect` supplied is unaffected by the new check
// and proceeds exactly as before.
test('reconcile from a fresh session with no expected lease still ends a dead actors lease (review-2 new finding, case 2)', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: { CAIRN_SESSION: 's1' } });
  const lease = await readLease(cwd);
  assert.equal(lease.session, 's1', 'the fresh session (s2, below) began nothing itself and differs from this');
  const abandoned = await end(cwd, { abandon: true }); // no `expect`: a fresh session's reconcile
  assert.equal(abandoned.abandoned, true);
  assert.equal(await readRef(cwd, LEASE_REF), null);
});

// Case 3: normal begin/end is unchanged, whether or not the caller supplies the matching expected
// lease sha.
test('a matching expected lease succeeds; normal begin/end is unchanged either way (review-2 new finding, case 3)', async () => {
  const cwd = await initialized();
  const sha1 = await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  const finished = await end(cwd, { expect: sha1 });
  assert.equal(finished.target, 'CORE-001');
  assert.equal(await readRef(cwd, LEASE_REF), null);

  await begin(cwd, { action: 'implement', target: 'CORE-002', env: {} });
  const finished2 = await end(cwd); // no `expect` at all: unchanged from before this fix
  assert.equal(finished2.target, 'CORE-002');
  assert.equal(await readRef(cwd, LEASE_REF), null);
});

test('a touched path whose bytes equal the start snapshot is unchanged; a modified existing file is changed', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', touch: ['src/a.mjs'], env: {} });
  assert.deepEqual(await touchOutcome(cwd, await readLease(cwd)), { changed: [], unchanged: ['src/a.mjs'] });
  writeFileSync(join(cwd, 'src/a.mjs'), 'export const a = 2;\n');
  assert.deepEqual(await touchOutcome(cwd, await readLease(cwd)), { changed: ['src/a.mjs'], unchanged: [] });
  await end(cwd);
});

// Fix round 1 finding 11: the ref is removed before hooks run, so a failing hook is reported but
// does not resurrect the lease (previously asserted the opposite: "a failing hook keeps the
// lease", which is exactly the bug finding 11 names -- a retry after a hook failure would have
// re-run every hook, repeating side effects like the mechanism definition write).
test('end without a lease is refused; a failing hook is reported but the lease stays removed', async () => {
  const cwd = await initialized();
  await assert.rejects(end(cwd), /^LeaseError: cairn: no action lease to end/);
  await begin(cwd, { action: 'run', target: 'CORE-001', env: {} });
  const off = onEnd(async () => { throw new Error('declare failed'); });
  await assert.rejects(end(cwd), /declare failed/);
  off();
  assert.equal(await readRef(cwd, LEASE_REF), null, 'the ref was already removed before the hook ran, so it is not resurrected by the hook throwing');
  await assert.rejects(end(cwd), /^LeaseError: cairn: no action lease to end/, 'a retry finds no lease left to end, not a second run of the hooks');
});

test('covers: a lease covers its target inputs and its touch list', async () => {
  const lease = { action: 'implement', target: 'CORE-001', touch: ['src/new.mjs'] };
  assert.equal(covers(lease, 'src/new.mjs', ['src/a.mjs']), true);
  assert.equal(covers(lease, 'src/a.mjs', ['src/a.mjs']), true);
  assert.equal(covers(lease, 'src/other.mjs', ['src/a.mjs']), false);
});

import { withCheckLock } from '../lib/lease.mjs';
import { readFileSync } from 'node:fs';

test('the check lock is held only for the run and nests inside an action lease', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  const lock = await gitPath(cwd, 'cairn-check.lock');
  const out = await withCheckLock(cwd, async () => { assert.equal(readFileSync(lock, 'utf8'), String(process.pid)); return 'ran'; });
  assert.equal(out, 'ran');
  assert.equal(existsSync(lock), false);
  assert.ok(await readRef(cwd, LEASE_REF), 'the action lease is untouched by a check');
  await end(cwd);
});

test('a live check holder refuses a second run; a dead holder is cleared', async () => {
  const cwd = await initialized();
  const lock = await gitPath(cwd, 'cairn-check.lock');
  await withCheckLock(cwd, async () => {
    await assert.rejects(withCheckLock(cwd, async () => {}), new RegExp(`^LeaseError: cairn: cairn-check.lock held by pid ${process.pid}; wait for that check`));
  });
  writeFileSync(lock, '999999999');
  assert.equal(await withCheckLock(cwd, async () => 1), 1);
  await assert.rejects(withCheckLock(cwd, async () => { throw new Error('check crashed'); }), /check crashed/);
  assert.equal(existsSync(lock), false, 'released after a throw');
});

import { isStale, reconcilePredicate, runBegin, runEnd } from '../lib/lease.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('a lease from another session is stale and wake would name reconcile; the same session is not', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: { CAIRN_SESSION: 's1' } });
  const lease = await readLease(cwd);
  assert.equal(isStale(lease, { CAIRN_SESSION: 's1' }), false);
  assert.equal(isStale(lease, { CAIRN_SESSION: 's2' }), true);
  assert.equal(isStale(lease, {}), false, 'a session-less wake cannot tell and does not nag');
  assert.deepEqual(await reconcilePredicate(cwd, { CAIRN_SESSION: 's2' }),
    { action: 'reconcile', target: 'implement CORE-001', reason: 'action lease from session s1 is stale in session s2' });
  assert.equal(await reconcilePredicate(cwd, { CAIRN_SESSION: 's1' }), null);
  await end(cwd);
  assert.equal(await reconcilePredicate(cwd, { CAIRN_SESSION: 's2' }), null);
});

// Review-1 fix, item 4's own test: begin, then end --abandon, then wake's reconcile predicate is
// satisfied. reconcile is unmet only while a stale lease exists (lib/wake.mjs's leaseStale reads
// isStale, above); end({abandon: true}) removes the lease exactly as a plain end does, so an
// explicitly abandoned action reconciles a stale lease the same way finishing it does -- the
// difference reconcile itself cannot see is which of the two happened, which is why it is now
// recorded in the terminal commit instead (the test above this one).
test('a stale lease can be reconciled by abandoning it: reconcile is satisfied once it is gone', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: { CAIRN_SESSION: 's1' } });
  assert.deepEqual(await reconcilePredicate(cwd, { CAIRN_SESSION: 's2' }),
    { action: 'reconcile', target: 'implement CORE-001', reason: 'action lease from session s1 is stale in session s2' });
  const abandoned = await end(cwd, { abandon: true });
  assert.equal(abandoned.abandoned, true);
  assert.equal(await reconcilePredicate(cwd, { CAIRN_SESSION: 's2' }), null);
});

test('the lease does not coordinate separate clones and never travels with the durable refs', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
  await git(['clone', '-q', cwd, clone], { cwd });
  await git(['fetch', '-q', 'origin', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'], { cwd: clone });
  assert.equal(await readRef(clone, LEASE_REF), null);
  await begin(clone, { action: 'run', target: 'CORE-002', env: {} }); // independent of the first clone's lease
  assert.equal((await readLease(clone)).target, 'CORE-002');
  assert.equal((await readLease(cwd)).target, 'CORE-001');
});

test('cairn begin and cairn end parse their arguments and refuse with one cairn: line', async () => {
  const cwd = await initialized();
  const err = []; const out = [];
  const io = { cwd, env: {}, stdout: (l) => out.push(l), stderr: (l) => err.push(l) };
  assert.equal(await runBegin(['implement', 'CORE-001', '--touch', 'src/new.mjs', '--touch', 'src/b.mjs'], io), 0);
  assert.deepEqual((await readLease(cwd)).touch, ['src/new.mjs', 'src/b.mjs']);
  assert.equal(await runBegin(['implement', 'CORE-001'], io), 1);
  assert.match(err.at(-1), /^cairn: action lease held/);
  assert.equal(await runEnd([], io), 0);
  assert.equal(await runEnd([], io), 1);
  assert.equal(err.at(-1), 'cairn: no action lease to end');
  assert.equal(await runBegin(['implement'], io), 1);
  assert.equal(err.at(-1), 'cairn: usage: cairn begin <action> <target> [--touch <path>]...');
});

// --- Fix round 1 ---

test('Fix round 1 finding 10: an unparseable cairn-check.lock is treated as held, never silently removed', async () => {
  const cwd = await initialized();
  const lock = await gitPath(cwd, 'cairn-check.lock');
  writeFileSync(lock, 'not-a-pid');
  await assert.rejects(withCheckLock(cwd, async () => {}), /^LeaseError: cairn: cairn-check.lock is unreadable/);
  assert.equal(readFileSync(lock, 'utf8'), 'not-a-pid', 'the unreadable lock file is left in place, not deleted');
  writeFileSync(lock, '0');
  await assert.rejects(withCheckLock(cwd, async () => {}), /^LeaseError: cairn: cairn-check.lock is unreadable/);
});

test('Fix round 1 finding 5: a lease ref that changed under cairn end is a CAS mismatch reported as LeaseError, not a raw GitError', async () => {
  const cwd = await initialized();
  await begin(cwd, { action: 'implement', target: 'CORE-001', env: {} });
  // Two concurrent `cairn end` calls on the same lease: git's own ref locking lets exactly one
  // delete succeed; the other's deleteRefCAS(cwd, LEASE_REF, sha) sees a real CAS mismatch (the ref
  // it read is no longer current), and lib/lease.mjs's end() must convert that into the friendly
  // LeaseError rather than let deleteRefCAS's raw CasError (or, before the fix, the git() wrapper's
  // own GitError on the '-d' update-ref's nonzero exit) propagate.
  const results = await Promise.allSettled([end(cwd), end(cwd)]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one of the two concurrent end() calls removes the ref');
  assert.equal(rejected.length, 1, 'the other observes the CAS mismatch');
  assert.equal(rejected[0].reason.name, 'LeaseError');
  assert.match(rejected[0].reason.message, /^cairn: action lease changed under cairn end; run cairn reconcile/);
  assert.equal(await readRef(cwd, LEASE_REF), null);
});
