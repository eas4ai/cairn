import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loopRepo, mechanismFor } from './helpers/loop.mjs';
import { makeProject } from './helpers/repo.mjs';
import { declare } from '../lib/mechanisms.mjs';
import { appendDecision } from '../lib/adr.mjs';
import { supersede, start } from '../lib/commitment.mjs';
import { authorize } from '../lib/auth.mjs';
import { git, readRef, catCommit, commitTree, updateRefCAS } from '../lib/gitx.mjs';
import { main } from '../lib/cli.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const cli = async (argv, cwd) => { let out = '', err = ''; const code = await main(argv, { cwd, stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } }); return { code, out, err }; };
test('a command typed in a subdirectory runs at the repository top level, and a --file path is read from where it was typed', async () => {
  const r = await loopRepo();
  const sub = join(r.cwd, 'src', 'deep'); await mkdir(sub, { recursive: true });
  // cmdWake prints to process.stdout itself, so wake runs as a child process here.
  const spawnWake = (cwd) => spawnSync(process.execPath, [join(process.cwd(), 'bin/sudus.mjs'), 'wake'], { cwd, encoding: 'utf8' });
  const fromRoot = spawnWake(r.cwd), fromSub = spawnWake(sub);
  assert.equal(fromSub.stderr, ''); assert.equal(fromSub.stdout, fromRoot.stdout); assert.match(fromRoot.stdout, /action: run DEMO-001/);
  await writeFile(join(sub, 'def.json'), JSON.stringify(mechanismFor('DEMO-001')));
  const declared = await cli(['declare', 'demo-001', '--file', 'def.json'], sub);
  assert.equal(declared.err, ''); assert.equal(declared.code, 0);
});
test('record names an untracked file under a declared input and says a build artifact is gitignored instead', async () => {
  const r = await loopRepo();
  await declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src', 'flags/DEMO-001'] });
  await r.commit('declare src/ as an input');
  await r.write('src/__pycache__/demo.pyc', 'x');
  const spawnWake = () => spawnSync(process.execPath, [join(process.cwd(), 'bin/sudus.mjs'), 'wake'], { cwd: r.cwd, encoding: 'utf8' }).stdout;
  const w = spawnWake();
  assert.match(w, /action: record src\/__pycache__\/demo.pyc/); assert.match(w, /untracked file under a declared input.*gitignore/);
  await r.write('.gitignore', '__pycache__/\n');
  assert.doesNotMatch(spawnWake(), /__pycache__/);
});
import { check } from '../lib/check.mjs';
import { ulid } from '../lib/canon.mjs';
import { wake, FETCH_LINE, ORDER, readState, verdictOf, PREDICATES, doneRule, predicates } from '../lib/wake.mjs';
import { begin, end } from '../lib/lease.mjs';
import { preflight, dispose } from '../lib/scope.mjs';

test('outside a project wake exits 3 naming the skills', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sudus-none-'));
  assert.deepEqual(await wake(dir), { exit: 3, line: 'sudus: outside a project; run /new-project or /existing-project' });
});

// Deviation from the plan text: tests/helpers/repo.mjs's makeProject (plan 01/03) already
// configures an 'origin' remote at the Git level and lib/init.mjs's DEFAULT_SETTINGS('origin',
// null) defaults settings.authority_remote to 'origin', so a plain loopRepo() already has a
// configured authority remote; the plan's literal test assumed the opposite default (no remote
// until the test adds one) and would have failed its first assertion under the real fixture.
// Split into two repositories instead: one built with authority_remote explicitly null (for the
// 'run sudus init' line) and a plain loopRepo() (for the fetch-command line, which the fixture's
// own default remote already exercises without needing to configure anything by hand).
test('missing durable refs print the exact fetch command from section 4, or name init without a remote', async () => {
  const r1 = await loopRepo({ settings: { authority_remote: null } });
  await git(['update-ref', '-d', 'refs/sudus/log'], { cwd: r1.cwd });
  // Deviation from the plan text: plan 12's lib/travel.mjs (missingRefsLine) now supplies this
  // line, naming every missing durable ref rather than only the first one this loop's own scan
  // happened to reach; its local-only wording is "sudus init  (durable refs ... are missing and no
  // authority remote is configured)", not this file's earlier placeholder text.
  assert.deepEqual(await wake(r1.cwd), { exit: 3, line: 'sudus init  (durable refs refs/sudus/log are missing and no authority remote is configured)' });

  const r2 = await loopRepo();
  await git(['update-ref', '-d', 'refs/sudus/log'], { cwd: r2.cwd });
  const v = await wake(r2.cwd);
  assert.equal(v.exit, 3);
  assert.equal(v.line, "git fetch origin 'refs/sudus/log:refs/sudus/log' \\\n  'refs/sudus/snapshots:refs/sudus/snapshots'");
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
    pre: { refs: { 'refs/sudus/log': null, 'refs/sudus/snapshots': null }, head: null, files: {} },
    writes: [],
  });
  assert.deepEqual(await wake(r.cwd), { exit: 3, line: 'sudus recover tx01' });
  const r2 = await loopRepo();
  await r2.add('superseded', r2.slug, {
    slug: r2.slug, start: r2.startSha, decision: ulid(), transition: ulid(), successor: 'second', carried: [],
    intent: null, results: [],
  });
  assert.deepEqual(await wake(r2.cwd), { exit: 3, line: 'sudus: pending supersession to second; run /existing-project' });
});

test('the precedence order is the one section 5 states', () => {
  assert.deepEqual(ORDER, ['repair', 'recover', 'reconcile', 'scope', 'waiting', 'supersede', 'fix', 'record', 'declare', 'run', 'review mechanism', 'capture', 'review', 'report', 'resolve', 'accept', 'build', 'done', 'promote']);
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

async function looseObjectCount(gitDir) {
  let count = 0;
  for (const d of await readdir(`${gitDir}/objects`, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === 'pack' || d.name === 'info') continue;
    count += (await readdir(`${gitDir}/objects/${d.name}`)).length;
  }
  return count;
}

// Task 22 registers `sudus wake` in lib/cli.mjs; until then r.runWake() exits 1 with "unknown
// command wake" and this test's second assertion fails as the plan's own text anticipates
// ("Expected: PASS once task 22 registers sudus wake; until then the runWake line fails with exit
// 1. Keep the test; it passes from task 22 on."). Committed here regardless, per that instruction.
//
// Fix round 1, item 2: the fixture above (a stray, undeclared file with no receipt at all) never
// reached lib/check.mjs's isCurrent -- readState's currentReceipt only calls it while scanning an
// existing receipt for the requirement, and this fixture had none, so the purity test never
// exercised the actual write path item 1 found (identitiesNow -> writeTreeFromPaths -> `git
// hash-object -w` / `write-tree`). passReq() first gives DEMO-001 a receipt to check currency
// against; dirtying a declared input afterwards (not just leaving it clean) matches the exact
// reproduction ("one wake call after a pass receipt and one edit added three loose objects").
test('wake writes nothing: the Git directory and worktree hash the same before and after', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  await r.write('src/demo.mjs', 'console.log("hello");\n// dirty\n');   // a declared input, uncommitted
  const gitDir = (await git(['rev-parse', '--absolute-git-dir'], { cwd: r.cwd })).stdout.trim();
  const before = [await treeHash(gitDir), await treeHash(r.cwd)];
  await wake(r.cwd);
  assert.equal(r.runWake().status, 0);
  assert.deepEqual([await treeHash(gitDir), await treeHash(r.cwd)], before);
});

// A direct, narrower check alongside the byte-hash one above: the loose object count under
// .git/objects is unchanged by wake, run twice, with a pass receipt and a dirty declared input in
// play (the exact state that, before item 1's fix, added three loose objects per call).
test('wake adds no loose Git object when checking currency against a dirty declared input', async () => {
  const r = await loopRepo();
  await git(['config', 'gc.auto', '0'], { cwd: r.cwd });   // an automatic gc mid-test packs objects and breaks the count
  await r.passReq('DEMO-001');
  await r.write('src/demo.mjs', 'console.log("hello");\n// dirty\n');
  const gitDir = (await git(['rev-parse', '--absolute-git-dir'], { cwd: r.cwd })).stdout.trim();
  const before = await looseObjectCount(gitDir);
  await wake(r.cwd);
  await wake(r.cwd);
  assert.equal(await looseObjectCount(gitDir), before);
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
  process.env.SUDUS_SESSION = 'test-session';               // begin (plan 04) records this as the lease's session
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] });
  delete process.env.SUDUS_SESSION;
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

test("the breach's own unanswered escalation is Waiting, not scope; an ok answer brings scope back until keep", async () => {
  const r = await loopRepo();
  await r.write('src/stray.mjs', 'x\n');
  const [b] = await preflight(r.cwd, await r.log(), { command: 'check' });
  assert.deepEqual([(await wake(r.cwd)).action, (await wake(r.cwd)).target], ['scope', 'src/stray.mjs']);
  const esc = await r.escalate(`breach:${b}`);
  const w = await wake(r.cwd);
  assert.equal(w.verdict, 'Waiting', JSON.stringify(w));
  await r.answer(esc, 'ok');
  assert.deepEqual([(await wake(r.cwd)).verdict, (await wake(r.cwd)).action], ['Resolvable', 'scope']);
  await dispose(r.cwd, b, 'keep');
  assert.notEqual((await wake(r.cwd)).action, 'scope');
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

// Task 7 (plan 16): developer: absent exits 4 when the open escalation names a floor- or
// veto-outcome measurement (spec section 5's floor-and-veto carve-out: with no developer, the
// floor or a veto is the only path left to the developer, so wake's own Waiting for it is a real
// verdict this run cannot answer, not sitting-and-waiting; section 2's exit-code table gives it
// exit 4, distinct from exit 3's non-verdict states). A raw 'measurement' record is appended
// directly here rather than through lib/evaluate.mjs's real measure() (which needs a full
// typesafeai/harness fixture -- see tests/escalate.test.mjs's repoWithCommitment -- for a real
// floor/veto outcome): wake's own 'waiting' predicate only ever reads the record's `outcome` field
// off the log, so a fixture-shaped draft digest satisfies it without a real evaluation-intent
// record behind it.
//
// `intent` (a ref-typed field, lib/records.mjs) cannot be an arbitrary well-formed sha the way
// `draft_digest` (a digest-typed field, never cross-checked) can: wake()'s own read path runs
// lib/travel.mjs's validateAfterFetch before verdictOf, which walks every ref-typed field of every
// record and names a `sudus push` repair for one that names no record actually in the log (section
// 4, "After fetch, wake validates all cross-references"). It does not check the referenced
// record's *kind*, only that some record with that sha exists, so `r.startSha` (always present,
// any loopRepo() fixture) stands in for it without needing a real evaluation-intent record.
//
// Deviation from the brief's own Step 1 snippet: its measurement literal sets `source: null`, but
// the real 'measurement' schema (lib/records.mjs) types `source` as `oneOf('jev', 'review')`, not
// nullable -- unlike `model`/`composite`/`veto`/`suggested`, which are genuinely nullable. `source:
// null` throws RecordError, not merely fails the eventual assertion, so the fixture below uses
// `source: 'jev'` instead, matching this file's existing schema-fidelity convention (every other
// deviation comment in this file over the real record schemas the plan text approximated).
const measurement = (r, outcome, extra = {}) => ({
  intent: r.startSha, call: null, draft_digest: 'sha256:' + 'b'.repeat(64), source: 'jev', model: null,
  levels: [], composite: null, veto: null, suggested: null, outcome, reason: `${outcome}:fixture`, ...extra,
});

test('developer: absent exits 4 when the open escalation names a floor-outcome measurement', async () => {
  const r = await loopRepo({ settings: { developer: 'absent' } });
  const mSha = await r.add('measurement', r.slug, measurement(r, 'floor', { reason: 'floor:data' }));
  const esc = await r.escalate('DEMO-001', r.slug, mSha);
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.exit, 4);
  assert.deepEqual(v.escalation, { sha: esc, slug: 'first', question: 'Q?', recommendation: 'R', because: 'B', if_wrong: 'W', instead: 'I' });
});

test('developer: absent exits 4 on any unanswered escalation, since no one can answer it', async () => {
  const r = await loopRepo({ settings: { developer: 'absent' } });
  await r.escalate('DEMO-001');
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting'); assert.equal(v.exit, 4);
});
test('a fourth distinct failing attempt is refused by sudus check until an escalation concerns the requirement', async () => {
  const r = await loopRepo();
  for (let i = 1; i <= 3; i++) { await r.write('src/demo.mjs', `console.log(${i});\n`); await r.commit(`attempt ${i}`); await check(r.cwd, 'DEMO-001'); }
  assert.deepEqual([(await wake(r.cwd)).action, (await wake(r.cwd)).target], ['escalate', 'DEMO-001']);
  await r.write('src/demo.mjs', 'console.log(4);\n'); await r.commit('attempt 4');
  await assert.rejects(check(r.cwd, 'DEMO-001'), /3 distinct failing attempts at DEMO-001 without a pass; a fourth attempt needs an escalation first/);
  await r.escalate('DEMO-001');
  await assert.doesNotReject(check(r.cwd, 'DEMO-001'));
});
test('review mechanism names the latest fail receipt in its reason', async () => {
  const r = await loopRepo();
  const fail = await r.failReq('DEMO-001');
  await r.write('flags/DEMO-001', 'pass\n'); await r.commit('pass'); await check(r.cwd, 'DEMO-001');   // a pass with no mechanism review bound
  const v = await wake(r.cwd);
  assert.equal(v.action, 'review mechanism');
  assert.match(v.reason, new RegExp(`its latest fail receipt is ${fail}`));
});
test('an unresolved finding carried by a supersession stays open in the successor until resolved', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  await r.review([{ n: 1, text: 'carried finding' }]);
  const rev = (await r.log()).findLast((x) => x.kind === 'review').sha;
  const roadmap = await readFile(join(r.cwd, 'docs/spec/roadmap.md'), 'utf8');
  await r.write('docs/spec/roadmap.md', roadmap + '\n## second\n\nRequirements: DEMO-001\n\nAgain.\n'); await r.commit('second section');
  await supersede(r.cwd, 'second', { quote: 'go on', env: {} });
  await authorize(r.cwd, { quote: 'ok', env: {} });
  await start(r.cwd, 'second');
  await r.passReq('DEMO-001'); await r.review(); await r.report();
  const v = await wake(r.cwd);
  assert.equal(v.action, 'resolve', JSON.stringify(v));
  await r.add('resolution', 'second', { source: rev, finding: 1, snapshot: await r.snap(), explanation: 'fixed' });
  assert.notEqual((await wake(r.cwd)).action, 'resolve');
});
test('the same floor escalation with developer: present is ordinary Waiting, no exit code', async () => {
  const r = await loopRepo({ settings: { developer: 'present' } });
  const mSha = await r.add('measurement', r.slug, measurement(r, 'floor', { reason: 'floor:data' }));
  await r.escalate('DEMO-001', r.slug, mSha);
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.exit, undefined);
});

// Controller Ruling 18 (binding, spec commit c3956291, postdates the brief's own floor-only text):
// "exit 4 applies when the escalation's measurement outcome is floor OR veto" -- section 5's own
// text agrees ("nothing routes a floor-caught or vetoed draft to the agent... A veto counts
// because section 5 says nothing routes a vetoed draft to the agent, so its Waiting is as
// unanswerable as the floor's"). Extended past the brief's own text and code accordingly.
test('developer: absent exits 4 when the open escalation names a veto-outcome measurement too (Controller Ruling 18)', async () => {
  const r = await loopRepo({ settings: { developer: 'absent' } });
  const mSha = await r.add('measurement', r.slug, measurement(r, 'veto', { veto: 'reach', reason: 'veto:reach' }));
  await r.escalate('DEMO-001', r.slug, mSha);
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.exit, 4);
});

// Revised 2026-09-22: every unanswered escalation exits 4 under developer: absent, since no one
// can answer any of them; the floor-or-veto-only rule left the agent's own escalations, cycle
// bounds and breaches at an exit-0 Waiting a benchmark run could never leave.
test('developer: absent exits 4 on a plain cycle escalation too', async () => {
  const r = await loopRepo({ settings: { developer: 'absent' } });
  await r.escalate('cycle');
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.exit, 4);
});

test("developer: absent exits 4 on the agent's own escalation past a composite measurement as well", async () => {
  const r = await loopRepo({ settings: { developer: 'absent' } });
  const mSha = await r.add('measurement', r.slug, measurement(r, 'composite', { composite: 0.1, suggested: 'agent', reason: 'composite 0.100' }));
  await r.escalate('DEMO-001', r.slug, mSha);
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Waiting');
  assert.equal(v.exit, 4);
});

test('developer: absent exits 4 on an unavailable or an indeterminate measurement escalation as well', async () => {
  const r1 = await loopRepo({ settings: { developer: 'absent' } });
  const m1 = await r1.add('measurement', r1.slug, measurement(r1, 'unavailable', { reason: 'unavailable excluded' }));
  await r1.escalate('DEMO-001', r1.slug, m1);
  assert.equal((await wake(r1.cwd)).exit, 4);

  const r2 = await loopRepo({ settings: { developer: 'absent' } });
  const m2 = await r2.add('measurement', r2.slug, measurement(r2, 'indeterminate', { reason: 'indeterminate: an intent was left open by a crash' }));
  await r2.escalate('DEMO-001', r2.slug, m2);
  assert.equal((await wake(r2.cwd)).exit, 4);
});

test('cmdWake exits 4 through main() and prints the five fields exactly as ordinary Waiting does, not a bare line', async () => {
  const r = await loopRepo({ settings: { developer: 'absent' } });
  const mSha = await r.add('measurement', r.slug, measurement(r, 'floor', { reason: 'floor:data' }));
  const esc = await r.escalate('DEMO-001', r.slug, mSha);
  const out = r.runWake();
  assert.equal(out.status, 4);
  assert.equal(out.stdout, [
    'verdict: Waiting', 'party: developer', `reason: escalation ${esc} awaits an answer`,
    'question: Q?', 'recommendation: R', 'because: B', 'if wrong: W', 'instead: I',
    `predicate: ${PREDICATES.waiting}`, '',
  ].join('\n'));
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

// Fix round 1, item 4: protectedChanged used to treat every docs/spec/** path as protected, with
// no exception for the roadmap (docs/spec/roadmap.md), so a fix snapshot that happened to also
// touch the roadmap was refused forever -- there was no way to ever satisfy 'fix' again. It now
// classifies with lib/paths.mjs's real classify(), which carries PROTECTED_EXCEPT the same way
// scope.mjs's own preflight() does.
test('a fix snapshot may edit the roadmap (excepted from protected) but a genuinely protected path still refuses it', async () => {
  const r = await loopRepo();
  const item = await r.item('defect', 'DEMO-001', 'wrong-greeting');
  await r.write('src/demo.mjs', 'console.log("hey");\n');
  const roadmap = await readFile(join(r.cwd, 'docs/spec/roadmap.md'), 'utf8');
  await r.write('docs/spec/roadmap.md', roadmap + '\n');
  await r.commit('fix greeting and touch the roadmap');
  await r.add('fix', 'wrong-greeting', { item, snapshot: await r.snap() });
  await r.passReq('DEMO-001');
  assert.notEqual((await wake(r.cwd)).action, 'fix');   // the roadmap edit alone does not block fix

  const item2 = await r.item('defect', 'DEMO-001', 'wrong-greeting-2');
  await r.write('src/demo.mjs', 'console.log("hey");\n');
  await r.write('AGENTS.md', '# Working agreement\nedited\n');
  await r.commit('fix greeting and touch AGENTS.md');
  await r.add('fix', 'wrong-greeting-2', { item: item2, snapshot: await r.snap() });
  await r.passReq('DEMO-001');
  const v = await wake(r.cwd);
  assert.equal(v.action, 'fix');
  assert.match(v.reason, /protected/);
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

test('declare is named for the first set requirement no definition names', async () => {
  const r = await loopRepo({ reqs: ['DEMO-001', 'DEMO-002'] });
  assert.notEqual((await wake(r.cwd)).action, 'declare');                   // the fixture declares every requirement it starts
  const st = await readState(r.cwd);
  st.set = [...st.set, { requirement: 'DEMO-003', text_digest: 'sha256:' + '0'.repeat(64) }];
  st.blocks.set('DEMO-003', { textDigest: 'sha256:' + '0'.repeat(64) });   // the text reads as frozen; only the declaration is missing
  const v = await verdictOf(st);
  assert.deepEqual([v.action, v.target], ['declare', 'DEMO-003']);
  assert.equal(v.predicate, 'a mechanism definition names the requirement and no pre-existing undeclared delta was legalized');
});

test('no current receipt is run; a current fail is implement; three attempts make escalate', async () => {
  const r = await loopRepo();
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['run', 'DEMO-001']);
  await r.failReq('DEMO-001');
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target, v.predicate], ['implement', 'DEMO-001', PREDICATES.implement]);
  for (const body of ['a', 'b']) { await r.write('src/demo.mjs', `// ${body}\n`); await r.failReq('DEMO-001'); }
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['escalate', 'DEMO-001']);
  const esc = await r.escalate('DEMO-001');
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc, 'ok');
  assert.equal((await wake(r.cwd)).action, 'implement');
});

test('a current pass whose review metadata is unbound is review mechanism', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  assert.equal((await wake(r.cwd)).action, 'review');
  await declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/util.mjs'] });
  await r.write('src/util.mjs', '');
  await r.commit('widen inputs');
  await r.failReq('DEMO-001');
  await r.write('flags/DEMO-001', 'pass\n'); await r.commit('pass again');
  await check(r.cwd, 'DEMO-001');
  const v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['review mechanism', 'DEMO-001']);
});

test('an item captured from a set requirement needs an outside record or an escalation', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  const item = await r.item('backlog', 'DEMO-001', 'nicer-greeting');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['capture', 'nicer-greeting']);
  await r.add('outside', 'nicer-greeting', { item, reason: 'the greeting text is not in DEMO-001', evaluation: null });
  assert.equal((await wake(r.cwd)).action, 'review');
  const item2 = await r.item('next-feature', 'DEMO-001', 'colour');
  await r.escalate(`item:${item2}`);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});

test('review is named until a review at the current workspace answers every fixed question for every target', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['review', 'first']);
  const rev = await r.review();
  assert.equal((await wake(r.cwd)).action, 'report');
  await r.write('src/demo.mjs', 'console.log("hello");\n// note\n'); await r.commit('later edit');
  await check(r.cwd, 'DEMO-001');                                   // keep the receipt current: src/demo.mjs is an input
  assert.equal((await wake(r.cwd)).action, 'review');              // no report yet: the review must be current
  const log = await r.log();
  const partial = { ...log.find((x) => x.sha === rev).payload, snapshot: await r.snap(), answers: [] };
  await r.add('review', 'first', partial);
  v = await wake(r.cwd);
  assert.equal(v.action, 'review');
  assert.match(v.reason, /Q1 for demo-001/);
});

// Deviation from the plan text: the real 'report' schema's interface_attempts entries are
// {path, text} objects, not bare path strings (the same {path,text}/{question,target,text} shape
// its `attempts` list already uses), so the wake predicate below checks `.some(a => a.path === p)`
// rather than the plan's `.includes(p)`, which can never match an object against a string.
test('report is named until a brief and report name the reviewed snapshot with every attempt', async () => {
  const r = await loopRepo({ settings: { interfaces: ['src/api/**'] } });
  await r.write('src/api/index.mjs', 'export const api = 1;\n');
  await r.commit('api');
  await declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src/demo.mjs', 'flags/DEMO-001', 'src/api'] });
  await r.commit('declare api');
  await r.passReq('DEMO-001');
  await r.review();
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['report', 'first']);
  const rep = await r.report();
  v = await wake(r.cwd);
  assert.equal(v.action, 'report');
  assert.match(v.reason, /interface src\/api\/index\.mjs/);
  const log = await r.log();
  await r.add('report', 'first', { ...log.find((x) => x.sha === rep).payload, interface_attempts: [{ path: 'src/api/index.mjs', text: 'attempted' }] });
  assert.notEqual((await wake(r.cwd)).action, 'report');
});

test('every finding on the review, report or an acceptance needs a resolution or a dispute; a rejection reopens it', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  await r.review([{ n: 1, text: 'builder finding' }]);
  const rep = await r.report([{ n: 1, text: 'adversary finding' }]);
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['resolve', 'first 1']);
  const rev = (await r.log()).find((x) => x.kind === 'review').sha;
  await r.resolveFinding(rev, 1);
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['resolve', 'first 1']);
  assert.match(v.reason, /report/);
  const res = await r.resolveFinding(rep, 1);
  assert.equal((await wake(r.cwd)).action, 'accept');
  await r.accept({ rejected: [res] });
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['resolve', 'first 1']);
  await r.escalate(`finding:${rep}#1`);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
});

// Fix round 1, item 9(a): a second rejection of resolutions for the same finding names 'escalate'
// itself, not just a longer 'resolve' reason.
// Fix round 2, finding 5: the predicate text is PREDICATES.resolve itself, the spec's own section
// 5 row for this action ("a resolution names finding N of its exact source record, or an
// escalation disputes it"), not an invented sentence.
test('a second rejection of a resolution for the same finding escalates', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  await r.review();
  const rep = await r.report([{ n: 1, text: 'finding' }]);
  const res1 = await r.resolveFinding(rep, 1);
  await r.accept({ rejected: [res1] });
  const res2 = await r.resolveFinding(rep, 1);
  await r.accept({ rejected: [res2] });
  const v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['escalate', 'first 1']);
  assert.equal(v.predicate, PREDICATES.resolve);
});

test('post-report resolutions or a changed workspace need an acceptance at the current snapshot', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  await r.review();
  const rep = await r.report([{ n: 1, text: 'finding' }]);
  await r.write('src/demo.mjs', 'console.log("hello");\n// fixed\n'); await r.commit('fix');
  await check(r.cwd, 'DEMO-001');                                   // the fix touched an input: refresh the pass first
  const res = await r.resolveFinding(rep, 1);
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['accept', 'first']);
  await r.accept({ accepted: [res] });
  assert.notEqual((await wake(r.cwd)).action, 'accept');
  await r.write('src/demo.mjs', 'console.log("hello");\n// again\n'); await r.commit('unreviewed change');
  await check(r.cwd, 'DEMO-001');
  v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['accept', 'first']);
});

// Deviation from the plan text: lib/adr.mjs's real appendDecision(cwd, line, {command}) takes a
// required second {command} argument checked against the line kind's assigned writer list
// (ASSIGNED.decision includes 'decide', ASSIGNED.realized is only 'realize'), and both the
// 'decision' and 'realized' schemas carry a required `interfaces` list field the plan's payloads
// omitted.
test('an unrealized Consequential decision is build until a realized line names it', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review(); await r.report();
  const id = await r.decide();
  await r.commit('record decision');
  await r.accept();                       // docs/decisions.jsonl is in the workspace: the delta needs an acceptance first
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['build', id]);
  await appendDecision(r.cwd, { kind: 'realized', of: id, base_snap: r.startSnapshot, snap: await r.snap(), subject: 'map in place', interfaces: [] }, { command: 'realize' });
  await r.commit('realized');
  await r.accept();
  assert.notEqual((await wake(r.cwd)).action, 'build');
});

// Fix round 1, item 5: doneRule's bullet 4 used to select every non-'decision' ADR line (a 'read'
// line included) as closing a Consequential decision, and separately never checked
// level === 'Consequential' at all. A 'read' line (`sudus decisions --read`, a developer
// acknowledgment, not a realization) must not close it; a 'realized' line must.
test('a read line does not close a Consequential decision for the Done rule, but a realized line does', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review(); await r.report();
  const id = await r.decide();
  await r.commit('record decision');
  await r.accept();
  assert.ok((await doneRule(await readState(r.cwd))).failed.includes('obligations'));
  await appendDecision(r.cwd, { kind: 'read', of: id, record: r.startSha }, { command: 'decisions --read' });
  await r.commit('read decision');
  await r.accept();
  assert.ok((await doneRule(await readState(r.cwd))).failed.includes('obligations'));   // a read line alone never closes it
  await appendDecision(r.cwd, { kind: 'realized', of: id, base_snap: r.startSnapshot, snap: await r.snap(), subject: 'done', interfaces: [] }, { command: 'realize' });
  await r.commit('realize decision');
  await r.accept();
  assert.equal((await doneRule(await readState(r.cwd))).holds, true);
});

async function finished() {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review(); await r.report();
  return r;
}

// Deviation from the plan text: doneRule is `export async function doneRule(st)`, so every call
// below is awaited before reading `.holds`/`.failed`; the plan's own literal test code called
// `doneRule(st).failed` and `doneRule(await readState(...)).holds` without awaiting doneRule
// itself, which reads properties off a pending Promise (always undefined) rather than the
// resolved object.
test('Done rule: a clean report with no change after it needs no acceptance record (documented exception)', async () => {
  const r = await finished();
  assert.equal((await r.log()).some((x) => x.kind === 'acceptance'), false);
  assert.equal((await doneRule(await readState(r.cwd))).holds, true);
  await r.write('README.md', '# demo, changed after the report\n'); await r.commit('a change after the report');
  assert.deepEqual((await doneRule(await readState(r.cwd))).failed, ['acceptance']);
});
test('Done rule bullet 1: every frozen requirement has a current bound pass', async () => {
  const r = await finished();
  await r.write('src/demo.mjs', 'console.log("changed");\n'); await r.commit('stale the receipt');
  const st = await readState(r.cwd);
  assert.deepEqual((await doneRule(st)).failed, ['evidence', 'acceptance']);
  assert.equal((await wake(r.cwd)).action, 'run');
});

test('Done rule bullet 2: a review and report exist at the reviewed snapshot', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  assert.deepEqual((await doneRule(await readState(r.cwd))).failed, ['review-report']);
  await r.review();
  assert.deepEqual((await doneRule(await readState(r.cwd))).failed, ['review-report']);
});

test('Done rule bullet 3: the latest acceptance is at the final snapshot with every resolution accepted and every finding answered', async () => {
  const r = await loopRepo();
  await r.passReq('DEMO-001'); await r.review();
  const rep = await r.report([{ n: 1, text: 'f' }]);
  assert.deepEqual((await doneRule(await readState(r.cwd))).failed, ['acceptance']);
  const res = await r.resolveFinding(rep, 1);
  await r.accept({ rejected: [res] });
  assert.deepEqual((await doneRule(await readState(r.cwd))).failed, ['acceptance']);
  const res2 = await r.resolveFinding(rep, 1);
  await r.accept({ accepted: [res2] });
  assert.equal((await doneRule(await readState(r.cwd))).holds, true);
});

test('Done rule bullet 4: no escalation, breach, defect, transaction, lease, decision or cycle escalation is open', async () => {
  const r = await finished();
  const esc = await r.escalate('cycle');
  assert.deepEqual((await doneRule(await readState(r.cwd))).failed, ['obligations']);
  assert.equal((await wake(r.cwd)).verdict, 'Waiting');
  await r.answer(esc, 'ok');
  assert.equal((await doneRule(await readState(r.cwd))).holds, true);
  const v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'done', 'first']);
});

// Deviation from the plan text: the real 'promotion' schema (lib/records.mjs) carries required
// intent/results fields (fix round 1 finding 8, the same MULTI_STORE-terminal-record treatment
// 'start' and 'superseded' already got), which the plan's payload omitted.
test('a closed range with a backlog item names promote; without one the verdict is Done', async () => {
  const r = await finished();
  await r.add('done', 'first', { slug: 'first', snapshot: await r.snap() });
  let v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Done', null, 'first']);
  const item = await r.item('backlog', 'DEMO-001', 'nicer-greeting');
  await r.add('outside', 'nicer-greeting', { item, reason: 'later', evaluation: null });
  v = await wake(r.cwd);
  assert.deepEqual([v.verdict, v.action, v.target], ['Resolvable', 'promote', 'nicer-greeting']);
  await r.item('next-feature', 'DEMO-001', 'colour');
  await r.add('promotion', 'nicer-greeting', { item, decision: ulid(), intent: null, results: [] });
  assert.equal((await wake(r.cwd)).verdict, 'Done');   // a next-feature item waits for the developer
});

// Fix round 1, item 7: the Waiting render no longer appends an `answer: sudus answer ...` line
// (section 6 names verdict, action or party, one reason line and the predicate; Waiting's own
// five fields never claimed an answer line too). Checked here against the exact stdout bytes, not
// just a slice, so a stray extra line would fail this test.
test('sudus wake prints verdict, action or party, one reason line and the predicate; Waiting adds the five fields', async () => {
  const r = await loopRepo();
  let out = r.runWake();
  assert.equal(out.status, 0);
  assert.deepEqual(out.stdout.split('\n').slice(0, 4), ['verdict: Resolvable', 'action: run DEMO-001', 'reason: no current receipt carries a result for DEMO-001', `predicate: ${PREDICATES.run}`]);
  const esc = await r.escalate('DEMO-001');
  out = r.runWake();
  assert.equal(out.status, 0);
  assert.equal(out.stdout, [
    'verdict: Waiting', 'party: developer', `reason: escalation ${esc} awaits an answer`,
    'question: Q?', 'recommendation: R', 'because: B', 'if wrong: W', 'instead: I',
    `predicate: ${PREDICATES.waiting}`, '',
  ].join('\n'));
  const dir = await mkdtemp(join(tmpdir(), 'sudus-none-'));
  const none = spawnSync(process.execPath, [new URL('../bin/sudus.mjs', import.meta.url).pathname, 'wake'], { cwd: dir, encoding: 'utf8' });
  assert.equal(none.status, 3);
  assert.equal(none.stdout, 'sudus: outside a project; run /new-project or /existing-project\n');
});

// Fix round 1, item 11(b), pulled forward as a dependency of item 3: under wake's own cascading
// precedence, 'report' and 'accept' are only ever reached once 'review' (respectively 'report')
// has already been satisfied, so their unmet(...) messages could safely dereference rev.payload /
// rep.payload unconditionally. lib/cycle.mjs's guardKernelWrite (item 3) now asks every predicate
// about a scratch state independently of that cascade, so it can reach 'report' with no review yet
// or 'accept' with no report yet; both used to throw a raw TypeError there instead of returning a
// clean unmet/null.
test('the report and accept predicates do not crash when asked about a state with no review or report yet', async () => {
  const r = await loopRepo();
  const st = await readState(r.cwd);
  const reportP = predicates.find((p) => p.name === 'report');
  const acceptP = predicates.find((p) => p.name === 'accept');
  const rv = await reportP.test(st);
  assert.equal(rv.action, 'report');
  assert.equal(await acceptP.test(st), null);
});

// Fix round 1, item 8: a fifth exit-3 case beyond section 2's four. makeProject() (plan 01/03)
// initializes settings, the init record and both durable refs but writes no start record at all --
// exactly the pending-initialization state between `sudus init` and the spec-phase tail's
// `sudus start`. The existing-project skill is what resumes it.
test('a project with durable refs but no start record at all names the pending-initialization skill', async () => {
  const { cwd } = await makeProject();
  assert.deepEqual(await wake(cwd), { exit: 3, line: 'sudus: no commitment started; run /new-project or /existing-project' });
});

// Fix round 1, item 11(a): nothing bound the predicates array's own registration order to ORDER
// itself -- a define() call placed at the wrong point in the file would silently reorder
// precedence with no test failing. 'supersession' is the one predicates entry with no ORDER
// position (it is the exit-3 gate tested between recover and reconcile, not a section 5 action).
test("the predicates array is registered in exactly ORDER's precedence, aside from the supersession exit-3 gate", () => {
  assert.deepEqual(predicates.filter((p) => p.name !== 'supersession').map((p) => p.name), ORDER);
});

// Fix round 1, item 11(f): a corrupted action lease commit (body that is not canonical JSON) used
// to propagate a raw CanonError straight out of readState/wake instead of becoming a clean
// 'repair' verdict, the same way a corrupted settings, mechanisms or ADR read already does.
test('a corrupted action lease is a repair refusal, not a crash', async () => {
  const r = await loopRepo();
  await begin(r.cwd, { action: 'implement', target: 'DEMO-001', touch: [] });
  const leaseSha = await readRef(r.cwd, 'refs/sudus/in-progress');
  const { tree } = await catCommit(r.cwd, leaseSha);
  const badSha = await commitTree(r.cwd, { tree, parents: [], subject: 'sudus: lease implement DEMO-001', body: 'not json', trailers: [] });
  await updateRefCAS(r.cwd, 'refs/sudus/in-progress', badSha, leaseSha);
  const v = await wake(r.cwd);
  assert.equal(v.verdict, 'Resolvable');
  assert.equal(v.action, 'repair');
});

// Fix round 2, finding 1: a declared input directory that expands to a '__proto__' path used to
// make lib/gitx.mjs's treeShaFromEntries compute a wrong, permanently-mismatched tree sha (or
// silently drop the entry), so isCurrent never found the receipt current again and wake named
// `run DEMO-001` forever, with no way for `sudus check` to clear it. '__proto__' and 'constructor'
// are ordinary path components to Git; declaring the whole 'src' directory (rather than the exact
// file) as the input is what makes resolveInputPaths actually walk into the awkward subdirectory.
test('a declared input directory containing a __proto__ path component is current after passing, not stuck on run', async () => {
  const r = await loopRepo();
  await declare(r.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: ['src'] });
  await r.write('src/__proto__/x.mjs', 'export const x = 1;\n');
  await r.commit('add an awkward path under the declared input directory');
  await r.passReq('DEMO-001');
  const v = await wake(r.cwd);
  assert.notEqual(v.action, 'run');
});
// Issue #6 (johnwlockwood, 3.0.2): between commitments the fix predicate checks every unfixed
// defect, but the pass table wake built covered only the last commitment's requirement set. A
// defect against a requirement that commitment never owned read an undefined entry, so a later
// passing check never counted and wake named fix forever.
test('a defect against a requirement outside the last commitment\'s set is discharged by a later pass (issue #6)', async () => {
  const { done, item, fix } = await import('../lib/commitment.mjs');
  const { authorize } = await import('../lib/auth.mjs');
  const { check } = await import('../lib/check.mjs');
  const r = await loopRepo({ reqs: ['DEMO-001', 'DEMO-002'] });
  await r.passReq('DEMO-001'); await r.passReq('DEMO-002'); await r.review(); await r.report();
  await done(r.cwd, 'first');
  await item(r.cwd, { kind: 'defect', slug: 'gate', source: 'DEMO-001', body: 'x' });
  await fix(r.cwd, 'gate');
  const roadmap = await readFile(join(r.cwd, 'docs/spec/roadmap.md'), 'utf8');
  await r.write('docs/spec/roadmap.md', roadmap.replace('Current: first', 'Current: second') + '\n## second\n\nRequirements: DEMO-002\n\nOnly the name.\n'); await r.commit('second');
  await authorize(r.cwd, { quote: 'ok', env: {} });
  await start(r.cwd, 'second');
  await done(r.cwd, 'second', { unchecked: true });
  assert.match((await wake(r.cwd)).reason, /DEMO-001 has no current pass at or after the fix/);
  await check(r.cwd, 'DEMO-001');
  const v = await wake(r.cwd);
  assert.notEqual(v.reason, 'DEMO-001 has no current pass at or after the fix', JSON.stringify(v));
  assert.notEqual(v.target, 'gate', JSON.stringify(v));
});
// Report of 2026-09-23 (a consumer project, 3.0.3): an Agreed requirement's text was revised under
// the open commitment. Receipts and the mechanism review bound to the revised text, wake's review
// predicate and the Done rule held the frozen digest, and wake named `review mechanism` after
// every review. The frozen contract is not amended (invariant 49): wake names the exit.
test('Agreed text revised under an open commitment is supersede, not review mechanism forever', async () => {
  const { check } = await import('../lib/check.mjs');
  const { reviewMechanism } = await import('../lib/mechanisms.mjs');
  const { authorize } = await import('../lib/auth.mjs');
  const r = await loopRepo();
  await r.passReq('DEMO-001');
  const spec = await readFile(join(r.cwd, 'docs/spec/demo.md'), 'utf8');
  await r.write('docs/spec/demo.md', spec.replace('prints hello for DEMO-001.', 'prints hello for DEMO-001 within 1 ms.'));
  await r.commit('raise the bound under the open commitment');
  let v = await wake(r.cwd);
  assert.deepEqual([v.action, v.target], ['supersede', 'first'], JSON.stringify(v));
  assert.match(v.reason, /the Agreed text of DEMO-001 changed under first .*restore the text the start froze, or with the developer's ruling supersede first/);
  // Re-checking and re-reviewing against the revised text does not change the verdict.
  await r.write('flags/DEMO-001', 'fail\n'); await r.commit('flag fail');
  await reviewMechanism(r.cwd, 'demo-001', 'DEMO-001', await check(r.cwd, 'DEMO-001'));
  await r.write('flags/DEMO-001', 'pass\n'); await r.commit('flag pass');
  await check(r.cwd, 'DEMO-001');
  assert.equal((await wake(r.cwd)).action, 'supersede');
  // Restoring the frozen text is one exit: one review against the frozen text, and the loop moves on.
  await r.write('docs/spec/demo.md', spec); await r.commit('restore the frozen text');
  v = await wake(r.cwd);
  assert.notEqual(v.action, 'supersede', JSON.stringify(v));
  await r.write('flags/DEMO-001', 'fail\n'); await r.commit('flag fail again');
  await reviewMechanism(r.cwd, 'demo-001', 'DEMO-001', await check(r.cwd, 'DEMO-001'));
  await r.write('flags/DEMO-001', 'pass\n'); await r.commit('flag pass again');
  await check(r.cwd, 'DEMO-001');
  v = await wake(r.cwd);
  assert.ok(!['supersede', 'review mechanism'].includes(v.action), JSON.stringify(v));
  // Superseding with the developer's ruling is the other.
  await r.write('docs/spec/demo.md', spec.replace('prints hello for DEMO-001.', 'prints hello for DEMO-001 within 1 ms.'));
  await r.commit('raise the bound again');
  await authorize(r.cwd, { quote: 'ok', env: {} });
  await supersede(r.cwd, 'second', { quote: 'raise the bound to 1 ms now', env: {} });
  assert.deepEqual(await wake(r.cwd), { exit: 3, line: 'sudus: pending supersession to second; run /existing-project' });
});
