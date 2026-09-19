import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loopRepo } from './helpers/loop.mjs';
import { git } from '../lib/gitx.mjs';
import { check } from '../lib/check.mjs';
import { ulid } from '../lib/canon.mjs';
import { wake, FETCH_LINE, ORDER } from '../lib/wake.mjs';
import { begin, end } from '../lib/lease.mjs';
import { preflight, dispose } from '../lib/scope.mjs';

test('outside a project wake exits 3 naming the skills', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cairn-none-'));
  assert.deepEqual(await wake(dir), { exit: 3, line: 'cairn: outside a project; run /new-project or /existing-project' });
});

// Deviation from the plan text: tests/helpers/repo.mjs's makeProject (plan 01/03) already
// configures an 'origin' remote at the Git level and lib/init.mjs's DEFAULT_SETTINGS('origin',
// null) defaults settings.authority_remote to 'origin', so a plain loopRepo() already has a
// configured authority remote; the plan's literal test assumed the opposite default (no remote
// until the test adds one) and would have failed its first assertion under the real fixture.
// Split into two repositories instead: one built with authority_remote explicitly null (for the
// 'run cairn init' line) and a plain loopRepo() (for the fetch-command line, which the fixture's
// own default remote already exercises without needing to configure anything by hand).
test('missing durable refs print the exact fetch command from section 4, or name init without a remote', async () => {
  const r1 = await loopRepo({ settings: { authority_remote: null } });
  await git(['update-ref', '-d', 'refs/cairn/log'], { cwd: r1.cwd });
  assert.deepEqual(await wake(r1.cwd), { exit: 3, line: 'cairn: missing refs/cairn/log; run cairn init' });

  const r2 = await loopRepo();
  await git(['update-ref', '-d', 'refs/cairn/log'], { cwd: r2.cwd });
  const v = await wake(r2.cwd);
  assert.equal(v.exit, 3);
  assert.equal(v.line, "git fetch origin 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'");
  assert.equal(FETCH_LINE('origin'), v.line);
});

// Deviation from the plan text: the real 'command-intent' schema (lib/records.mjs) is
// {tx, command, identity, pre, writes} (plan 04's settled shape), not the plan's provisional
// {transaction, command, inputs, expected, writes}; and the real 'superseded' schema carries
// required intent/results fields (fix round 1 finding 8, already applied to every other writer of
// a MULTI_STORE terminal record) plus a ulid-typed `transition` field, not an arbitrary token.
// Both fixtures below are built against the schema actually committed.
test('a pending supersession and an interrupted transaction are not verdicts', async () => {
  const r = await loopRepo();
  await r.add('command-intent', 'tx01', {
    tx: 'tx01', command: 'start', identity: {},
    pre: { refs: { 'refs/cairn/log': null, 'refs/cairn/snapshots': null }, head: null, files: {} },
    writes: [],
  });
  assert.deepEqual(await wake(r.cwd), { exit: 3, line: 'cairn recover tx01' });
  const r2 = await loopRepo();
  await r2.add('superseded', r2.slug, {
    slug: r2.slug, start: r2.startSha, decision: ulid(), transition: ulid(), successor: 'second', carried: [],
    intent: null, results: [],
  });
  assert.deepEqual(await wake(r2.cwd), { exit: 3, line: 'cairn: pending supersession to second; run /existing-project' });
});

test('the precedence order is the one section 5 states', () => {
  assert.deepEqual(ORDER, ['repair', 'recover', 'reconcile', 'scope', 'waiting', 'fix', 'record', 'declare', 'run', 'review mechanism', 'capture', 'review', 'report', 'resolve', 'accept', 'build', 'done', 'promote']);
});

async function treeHash(dir) {
  const h = createHash('sha256');
  for (const e of (await readdir(dir, { recursive: true, withFileTypes: true })).sort((a, b) => (a.parentPath + a.name < b.parentPath + b.name ? -1 : 1))) {
    if (!e.isFile()) continue;
    const p = join(e.parentPath, e.name);
    h.update(p).update(await readFile(p));
  }
  return h.digest('hex');
}

// Task 22 registers `cairn wake` in lib/cli.mjs; until then r.runWake() exits 1 with "unknown
// command wake" and this test's second assertion fails as the plan's own text anticipates
// ("Expected: PASS once task 22 registers cairn wake; until then the runWake line fails with exit
// 1. Keep the test; it passes from task 22 on."). Committed here regardless, per that instruction.
test('wake writes nothing: the Git directory and worktree hash the same before and after', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const gitDir = (await git(['rev-parse', '--absolute-git-dir'], { cwd: r.cwd })).stdout.trim();
  const before = [await treeHash(gitDir), await treeHash(r.cwd)];
  await wake(r.cwd);
  assert.equal(r.runWake().status, 0);
  assert.deepEqual([await treeHash(gitDir), await treeHash(r.cwd)], before);
});

// Deviation from the plan text: lib/spec.mjs's parseRoadmap has no check that Current: names an
// existing section, so the plan's own edit ('Current: first\n' alone, with the '## first' section
// removed) produces no lint finding at all under the real lint() -- 'repair' would never fire and
// 'scope' would win instead, failing this test's intent. parseRoadmap does refuse a second
// Requirements: line in one section (its own documented grammar problem), which is used here
// instead to make docs/spec/roadmap.md a genuinely unreadable hand-written input while keeping
// the same "repair precedes scope even with a stray file present" behavior under test.
test('an unreadable hand-written input names repair first', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');                       // would be scope, lower precedence
  await r.write('docs/spec/roadmap.md', 'Current: first\n\n## first\n\nRequirements: DEMO-001\n\nRequirements: DEMO-001\n\nDelivers the demo.\n');
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Resolvable');
  assert.equal(v.action, 'repair');
  assert.match(v.target, /^docs\/spec/);
  assert.equal(v.predicate, 'the named hand-written file reads under its grammar and no unrelated byte changed');
});

test('a stale lease is reconciled before scope', async () => {
  const r = await loopRepo();
  process.env.CAIRN_SESSION = 'test-session';               // begin (plan 04) records this as the lease's session
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] });
  delete process.env.CAIRN_SESSION;
  await r.write('src/stray.mjs', 'x\n');
  const other = await wake(r.cwd, { session: 'other-session' });
  assert.deepEqual([other.action, other.target], ['reconcile', 'implement DEMO-001']);
  // Deviation from the plan text: wake's 'scope' predicate (Task 7) only reads scope-breach
  // records already on the log; it never runs a live preflight scan itself (wake writes nothing,
  // per Task 4's purity test). A dirty undeclared path with no preflight() call records no breach
  // at all, so the plan's own test as written never produces the breach this test's next
  // assertion (and its "live lease: not stale" comment) assumes exists. A preflight() call is
  // added here, the same one Task 7's own test uses, to record it.
  await preflight(r.cwd, await r.log(), { command: 'check' });
  const same = await wake(r.cwd, { session: null });
  assert.equal(same.action, 'scope');                            // live lease: not stale
  await end(r.cwd);
  await begin(r.cwd, { action: 'implement', target: 'DEMO-009', touch: [] });
  assert.equal((await wake(r.cwd, { session: null })).action, 'reconcile');   // target not in the set
});

test('an undisposed breach is named before an unanswered escalation', async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  await r.escalate('DEMO-001');
  const v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'scope', 'src/stray.mjs']);
  await r.remove('src/stray.mjs');
  await dispose(r.cwd, b, 'restore');
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});

test('an escalation without a final answer is Waiting with the five fields verbatim; ask makes reply Resolvable', async () => {
  const r = await loopRepo();
  const esc = await r.escalate('DEMO-001');
  let v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.party, 'developer');
  assert.deepEqual(v.escalation, { sha: esc, slug: 'first', question: 'Q?', recommendation: 'R', because: 'B', if_wrong: 'W', instead: 'I' });
  await r.answer(esc, 'ask', 'why?');
  v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'reply', 'first']);
  await r.reply(esc);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc, 'instead', 'do this');
  assert.notEqual((await wake(r.cwd)).verdict, 'Waiting');
});

test('an unfixed defect against a set requirement is named before dirty inputs', async () => {
  const r = await loopRepo();
  const item = await r.item('defect', 'DEMO-001', 'wrong-greeting');
  await r.write('src/demo.mjs', 'console.log("hey");\n');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['fix', 'wrong-greeting']);
  await r.commit('fix greeting');
  await r.add('fix', 'wrong-greeting', { item, snapshot: await r.snap() });
  assert.equal((await wake(r.cwd)).action, 'fix');           // no current pass at or after the fix yet
  await r.passReq('DEMO-001');
  assert.notEqual((await wake(r.cwd)).action, 'fix');
});

// Deviation from the plan text: lib/lease.mjs's real ACTIONS set (plan 04) is
// {implement, build, run, review, declare, repair, promote, resolve, fix, scope}; it has no
// 'build-decision' member, so begin() with that action throws LeaseError. Any action whose
// target names no mechanism's requirements works to keep the lease from covering src/demo.mjs;
// 'build' with the same unrelated ULID target does the same job the plan's fixture intended.
test('a dirty declared input is record without a lease, commit when the lease does not cover it, nothing when it does', async () => {
  const r = await loopRepo();
  await r.write('src/demo.mjs', 'console.log("hey");\n');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target, v.predicate], ['record', 'src/demo.mjs', "the action lease covers the path through its target's declared inputs, or the path is clean"]);
  await begin(r.cwd, { action: 'build', target: '01HZZZZZZZZZZZZZZZZZZZZZZZ', touch: [] });
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['commit', 'src/demo.mjs']);
  await end(r.cwd);
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] });
  assert.notEqual((await wake(r.cwd)).action, 'commit');
  await end(r.cwd);
  await r.commit('clean');
  assert.notEqual((await wake(r.cwd)).action, 'record');
});
