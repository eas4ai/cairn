// The two storage layouts (lib/layout.mjs) and `sudus migrate` (lib/migrate.mjs): a project
// initialized under the tool's former name keeps working unchanged, and moves once, between
// commitments, to the Sudus layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeProject } from './helpers/repo.mjs';
import { loopRepo, mechanismFor } from './helpers/loop.mjs';
import { throwawayRepo, runHook, fakeSudus } from './helpers/hookenv.mjs';
import { layoutOf, forgetLayout, SUDUS, CAIRN } from '../lib/layout.mjs';
import { readLog, appendRecord } from '../lib/records.mjs';
import { git, readRef, catCommit } from '../lib/gitx.mjs';
import { migrate, runMigrate } from '../lib/migrate.mjs';
import { missingRefsLine } from '../lib/travel.mjs';
import { wake } from '../lib/wake.mjs';
import { declare } from '../lib/mechanisms.mjs';
import { check } from '../lib/check.mjs';
import { preflight } from '../lib/scope.mjs';
import { cliSigner } from '../lib/auth.mjs';
import { version } from '../lib/cli.mjs';
import { project } from './helpers/commitment-fixture.mjs';
import { start, done } from '../lib/commitment.mjs';
import { pendingTransaction } from '../lib/tx.mjs';

const BIN = new URL('../bin/sudus.mjs', import.meta.url).pathname;
const ALIAS = new URL('../bin/cairn.mjs', import.meta.url).pathname;
const run = (bin, args, cwd) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, SUDUS_SESSION: 'test-session' } });

test('a project initialized under the former layout writes refs/cairn/* and cairn: records, and every reader accepts them', async (t) => {
  const p = await makeProject({ layout: 'cairn' });
  t.after(p.cleanup);
  assert.equal(layoutOf(p.cwd), CAIRN);
  assert.ok(await readRef(p.cwd, 'refs/cairn/log'));
  assert.ok(await readRef(p.cwd, 'refs/cairn/snapshots'));
  assert.equal(await readRef(p.cwd, 'refs/sudus/log'), null);
  const log = await readLog(p.cwd);
  assert.equal(log[0].kind, 'init');
  const c = await catCommit(p.cwd, log[0].sha);
  assert.equal(c.subject, 'cairn: init project');
  assert.deepEqual(c.trailers.map((x) => x[0]), ['Cairn-Schema', 'Cairn-Digest']);
  assert.equal(await missingRefsLine(p.cwd), null);
  const w = run(BIN, ['wake'], p.cwd);
  assert.equal(w.status, 3, w.stderr); // no start record yet: the spec phase's own exit
  assert.ok(w.stdout.includes('layout: .cairn (the former name); sudus migrate moves it to .sudus between commitments'), w.stdout);
});

test('a mechanism that still prints cairn: REQ: pass is a pass under either layout', async (t) => {
  const r = await loopRepo({ layout: 'cairn' });
  await r.write('flags/DEMO-001', 'pass\n'); await r.commit('flag pass');
  // The same mechanism, redeclared with the former prefix in its output line.
  await declare(r.cwd, 'demo-001', {
    command: `node -e "process.stdout.write('cairn: DEMO-001: '+require('fs').readFileSync('flags/DEMO-001','utf8').trim()+'\\n')"`,
    inputs: ['src/demo.mjs', 'flags/DEMO-001'], documents: [], requirements: ['DEMO-001'], results: 'per-requirement', identity: {},
  });
  await r.commit('redeclare with the former prefix');
  const sha = await check(r.cwd, 'DEMO-001');
  const rec = (await readLog(r.cwd)).find((x) => x.sha === sha);
  assert.equal(rec.kind, 'receipt');
  assert.equal(rec.payload.results.find((x) => x.requirement === 'DEMO-001').result, 'pass');
});

test('migrate refuses while a commitment is open, and names the slug', async (t) => {
  const r = await loopRepo({ layout: 'cairn' });
  await assert.rejects(migrate(r.cwd), /sudus: first is open; migrate runs between commitments; run sudus wake and follow it to Done first/);
  assert.equal(layoutOf(r.cwd), CAIRN);
  assert.ok(await readRef(r.cwd, 'refs/cairn/log'));
});

test('migrate moves the refs and the directory between commitments, commits the move, rewrites .gitignore, and the log reads as one', async (t) => {
  const p = await makeProject({ layout: 'cairn' });
  t.after(p.cleanup);
  await p.write('.gitignore', 'node_modules/\n.cairn/output/\n/.cairn/scratch\n!.cairn/keep-me\n.cairn\n.cairnfoo/stays\n');
  await p.write('.cairn/mechanisms/demo.json', '{}\n');
  await p.commit('ignore and a mechanism');
  const before = (await readLog(p.cwd)).map((x) => x.sha);
  const r = await migrate(p.cwd);
  assert.equal(r.migrated, true);
  assert.deepEqual(r.moves.map((m) => `${m.from} -> ${m.to}`), ['refs/cairn/log -> refs/sudus/log', 'refs/cairn/snapshots -> refs/sudus/snapshots']);
  assert.equal(r.dir, '.cairn -> .sudus');
  assert.ok(r.commit);
  assert.equal(layoutOf(p.cwd), SUDUS);
  assert.equal(await readRef(p.cwd, 'refs/cairn/log'), null);
  assert.ok(await readRef(p.cwd, 'refs/sudus/log'));
  assert.ok(existsSync(join(p.cwd, '.sudus/settings.json')) && !existsSync(join(p.cwd, '.cairn')));
  assert.equal(readFileSync(join(p.cwd, '.gitignore'), 'utf8'), 'node_modules/\n.sudus/output/\n/.sudus/scratch\n!.sudus/keep-me\n.sudus\n.cairnfoo/stays\n');
  const status = (await git(['status', '--porcelain'], { cwd: p.cwd })).stdout;
  assert.equal(status, '');
  const shown = (await git(['show', '--stat', '--format=%s', 'HEAD'], { cwd: p.cwd })).stdout;
  assert.ok(shown.startsWith('sudus: migrate from the .cairn layout to .sudus'), shown);
  assert.ok(shown.includes('.cairn/settings.json => .sudus/settings.json') || shown.includes('{.cairn => .sudus}'), shown);
  // The records already on the log keep their cairn: envelope; a new one is written as sudus:.
  const after = await readLog(p.cwd);
  assert.deepEqual(after.map((x) => x.sha), before);
  const sha = await appendRecord(p.cwd, 'item', 'idea', { kind: 'backlog', slug: 'idea', source: 'DEMO-001', body: 'later' });
  assert.equal((await catCommit(p.cwd, sha)).subject, 'sudus: item idea');
  assert.equal((await readLog(p.cwd)).length, before.length + 1);
  assert.equal(await missingRefsLine(p.cwd), null);
  assert.ok(!run(BIN, ['wake'], p.cwd).stdout.includes('layout:'));
  // A second migrate has nothing to do.
  const out = [];
  assert.equal(await runMigrate([], { cwd: p.cwd, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }), 0);
  assert.equal(out[0], 'sudus: nothing to migrate; this project uses the .sudus layout');
});

test('migrate refuses uncommitted changes under .cairn so the move is the whole commit', async (t) => {
  const p = await makeProject({ layout: 'cairn' });
  t.after(p.cleanup);
  writeFileSync(join(p.cwd, '.cairn/settings.json'), readFileSync(join(p.cwd, '.cairn/settings.json'), 'utf8') + '\n');
  await assert.rejects(migrate(p.cwd), /1 path\(s\) under .cairn or .gitignore are changed and uncommitted; commit or discard them, then migrate/);
  assert.ok(await readRef(p.cwd, 'refs/cairn/log'));
});

test('a clone whose branch already carries .sudus/ but whose refs are still refs/cairn/* is told to migrate, and migrate moves the refs alone', async (t) => {
  const p = await makeProject({ layout: 'cairn' });
  t.after(p.cleanup);
  await git(['mv', '.cairn', '.sudus'], { cwd: p.cwd }); await p.commit('another clone migrated and pushed');
  forgetLayout(p.cwd);
  assert.equal(layoutOf(p.cwd), SUDUS);
  assert.match(await missingRefsLine(p.cwd), /^sudus migrate  \(this clone still holds refs\/cairn\/log; /);
  const w = await wake(p.cwd);
  assert.equal(w.exit, 3);
  const r = await migrate(p.cwd);
  assert.equal(r.dir, null); assert.equal(r.commit, null); assert.equal(r.moves.length, 2);
  assert.equal(await missingRefsLine(p.cwd), null);
  assert.equal((await readLog(p.cwd))[0].kind, 'init');
});

// Issue #5 (johnwlockwood, 3.0.0): the last start transaction's closing record names its stores as
// refs/cairn/*; after the move those refs are gone, so the drift check read them as null and wake
// named a recover that could never succeed. A store name resolves through the layout.
test('after migrate, a transaction recorded under the former refs is not drift: wake does not name recover (issue #5)', async (t) => {
  const repo = await project({}, { layout: 'cairn' });
  t.after(repo.cleanup);
  await start(repo.cwd, 'first');
  await done(repo.cwd, 'first', { unchecked: true });
  const r = await migrate(repo.cwd);
  assert.equal(r.dir, '.cairn -> .sudus');
  assert.equal(await pendingTransaction(repo.cwd, await readLog(repo.cwd)), null);
  const v = await wake(repo.cwd);
  assert.notEqual(v.action, 'recover', JSON.stringify(v));
});

// Issue #5, secondary: a repository hook that rewrites files (an end-of-file fixer) aborted the
// migrate commit after the refs were already renamed and the directory moved. The commit is purely
// mechanical and runs with --no-verify; the refs move only after it succeeds, and a failed commit
// puts the directory and .gitignore back.
test('migrate commits with hooks bypassed, and leaves the project untouched when the commit fails', async (t) => {
  const repo = await project({}, { layout: 'cairn' });
  t.after(repo.cleanup);
  const hooks = join(repo.cwd, '.git/hooks');
  writeFileSync(join(hooks, 'pre-commit'), '#!/bin/sh\nprintf x >> .cairn/settings.json 2>/dev/null; printf x >> .sudus/settings.json 2>/dev/null; exit 1\n', { mode: 0o755 });
  const r = await migrate(repo.cwd);
  assert.ok(r.commit);
  assert.equal((await git(['status', '--porcelain'], { cwd: repo.cwd })).stdout, '');
  assert.ok(await readRef(repo.cwd, 'refs/sudus/log'));
});

test('the session-start hook does not report the former refs as missing', () => {
  const { dir, git: sh } = throwawayRepo();
  const head = sh('rev-parse', 'HEAD').trim();
  sh('update-ref', 'refs/cairn/log', head); sh('update-ref', 'refs/cairn/snapshots', head);
  const bin = join(dir, 'fakebin'); fakeSudus(bin, { stdout: 'VERDICT\n' });
  const r = runHook('session-start.sh', { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, 'home') } });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('durable ref'), r.stdout);
});

test('the former command name runs the same kernel, and CAIRN_SIGNATURE still supplies a signature', async () => {
  const v = await version();
  assert.equal(run(ALIAS, ['--version'], process.cwd()).stdout.trim(), v);
  assert.equal(run(ALIAS, ['migrate', '--help'], process.cwd()).stdout, 'usage: sudus migrate\n');
  const sign = cliSigner(['--nonce', 'n1'], { env: { CAIRN_SIGNATURE: 'c2ln' }, stdout: () => {} });
  assert.equal(Buffer.from(await sign(Buffer.from(JSON.stringify({ nonce: 'n1' })))).toString(), 'sig');
});

// Second adversarial review, legacy-layout area: the evaluator captured the log head from the
// Sudus-layout ref whatever the layout, so every measure on a former-layout project threw a
// schema error on log_head; and the CAS hint compared the failing ref with the Sudus-layout log.
test('measure captures the former layout\'s log head, and a CAS race on its log gets the retry hint', async (t) => {
  const { measure } = await import('../lib/evaluate.mjs');
  const { cliMessage } = await import('../lib/escalate.mjs');
  const { CasError } = await import('../lib/gitx.mjs');
  const dims = () => ({ evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 });
  const r = await loopRepo({ layout: 'cairn', settings: { data: ['migrations/**'], typesafeai: { enabled: true, model: 'jev-1.13.0', weights: dims(), agent_ceiling: 0.35, confidence_floors: dims(), min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } } });
  const draft = { commitment: 'first', concerns: ['DEMO-001'], question: 'Q?', recommendation: 'R', because: 'B', if_wrong: 'W', instead: 'I', options: ['R', 'I'], named_paths: ['migrations/1.sql'], cited_decisions: [] };
  // The intent record is written before any call; its log_head used to be captured from the
  // Sudus-layout ref and came back null here, which the schema refused.
  await measure(r.cwd, draft, { transport: async () => { throw new Error('no network in this test'); } }).catch(() => {});
  const intent = (await readLog(r.cwd)).findLast((x) => x.kind === 'evaluation-intent');
  assert.ok(intent, 'an evaluation-intent record was written');
  assert.match(intent.payload.log_head, /^[0-9a-f]{40}$/);
  assert.equal(cliMessage(r.cwd, new CasError('refusing refs/cairn/log: expected abc', { ref: 'refs/cairn/log' })), 'sudus: refusing refs/cairn/log: expected abc; run the command again');
  assert.equal(cliMessage(process.cwd(), new CasError('refusing refs/cairn/log: expected abc', { ref: 'refs/cairn/log' })).endsWith('; run the command again'), false);
});

// Second adversarial review, migrate area: a second clone that still held refs/cairn/* after the
// first clone migrated, pushed and did more work was told to migrate; renaming its stale refs
// made a stale log current and wake called it Done. When the authority remote already holds the
// moved refs, migrate names the fetch instead; and the moving clone gets the new refspecs.
test('migrate refuses when the authority remote already holds refs/sudus/*, naming the fetch; the moving clone gets the new refspecs', async (t) => {
  const { push } = await import('../lib/travel.mjs');
  const repo = await project({}, { layout: 'cairn' });
  t.after(repo.cleanup);
  const remote = (await git(['remote', 'get-url', 'origin'], { cwd: repo.cwd })).stdout.trim();
  await start(repo.cwd, 'first'); await done(repo.cwd, 'first', { unchecked: true });
  await push(repo.cwd);
  const { mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os');
  const clone = mkdtempSync(join(tmpdir(), 'sudus-stale-'));
  await git(['clone', '-q', remote, '.'], { cwd: clone });
  await git(['config', 'user.email', 't@example.invalid'], { cwd: clone }); await git(['config', 'user.name', 't'], { cwd: clone });
  await git(['fetch', '-q', 'origin', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'], { cwd: clone });
  // Clone 1 migrates, pushes, and works on.
  await migrate(repo.cwd);
  const specs = (await git(['config', '--get-all', 'remote.origin.fetch'], { cwd: repo.cwd })).stdout;
  assert.ok(specs.includes('refs/sudus/log:refs/sudus/log'), specs);
  await push(repo.cwd);
  await appendRecord(repo.cwd, 'item', 'later', { kind: 'backlog', slug: 'later', source: 'DEMO-001', body: 'later' });
  await push(repo.cwd);
  // Clone 2 pulls the branch (now .sudus/) but still holds refs/cairn/*.
  await git(['pull', '-q', '--ff-only'], { cwd: clone });
  forgetLayout(clone);
  assert.match(await missingRefsLine(clone), /^sudus migrate  /);
  await assert.rejects(migrate(clone), /origin already holds refs\/sudus\/log: another clone migrated and pushed; run: git fetch origin 'refs\/sudus\/log:refs\/sudus\/log'/);
  assert.ok(await readRef(clone, 'refs/cairn/log'));
  await git(['fetch', '-q', 'origin', 'refs/sudus/log:refs/sudus/log', 'refs/sudus/snapshots:refs/sudus/snapshots'], { cwd: clone });
  assert.equal(await missingRefsLine(clone), null);
  assert.equal((await readLog(clone)).length, (await readLog(repo.cwd)).length);
});

// Issue #7 (johnwlockwood, 3.1.1): after migrate, the first preflight between commitments read the
// migration's own move of the mechanism definitions as breaches, one per side of each moved file.
// The former path was a deletion; the new path had no bytes in the base tree and no ledger line,
// because declare had recorded its write under the former path. A kernel-managed path now resolves
// its former-layout counterpart: the moved file's bytes, or the ledger line under the old path.
test('after migrate, the moved mechanism files are not scope breaches at the next preflight (issue #7)', async (t) => {
  const repo = await project({}, { layout: 'cairn' });
  t.after(repo.cleanup);
  await repo.write('flags/DEMO-001', 'fail\n'); await repo.commit('flag');
  await declare(repo.cwd, 'demo-001', mechanismFor('DEMO-001'));
  await repo.commit('declare demo-001');
  await start(repo.cwd, 'first');
  await done(repo.cwd, 'first', { unchecked: true });
  const r = await migrate(repo.cwd);
  assert.equal(r.dir, '.cairn -> .sudus');
  // The spec phase for the next commitment: a new mechanism, then a check. The CLI runs the scope
  // preflight before each; it is called here the way runWithPreflight does.
  await repo.write('flags/DEMO-002', 'fail\n'); await repo.commit('flag 2');
  await preflight(repo.cwd, await readLog(repo.cwd), { command: 'declare' });
  await declare(repo.cwd, 'demo-002', mechanismFor('DEMO-002'));
  await repo.commit('declare demo-002');
  await preflight(repo.cwd, await readLog(repo.cwd), { command: 'check' });
  await check(repo.cwd, 'DEMO-001');
  const breaches = (await readLog(repo.cwd)).filter((x) => x.kind === 'scope-breach').map((x) => x.payload.path);
  assert.deepEqual(breaches, [], JSON.stringify(breaches));
  const v = await wake(repo.cwd);
  assert.notEqual(v.action, 'scope', JSON.stringify(v));
});

// A pasted agent report: a decision made before sudus migrate could not be realized after it.
// The realization delta ran from the decision's base, which still held .cairn/, so the settings
// file and every mechanism definition read as protected or reserved changes the decision made, and
// realize escalated them to the developer. A definition redeclared after the move no longer
// matched the base bytes issue #7 compared with, so even its deletion stopped.
import { decide, readAdr } from '../lib/adr.mjs';
import { realize, RealizationError } from '../lib/commitment.mjs';

test('after migrate, a decision made before the move realizes without stopping on the moved files', async (t) => {
  const repo = await project({}, { layout: 'cairn' });
  t.after(repo.cleanup);
  await repo.write('flags/DEMO-001', 'fail\n'); await repo.commit('flag');
  await declare(repo.cwd, 'demo-001', mechanismFor('DEMO-001'));
  await repo.write('.cairn/notes.txt', 'kept\n');
  await repo.commit('declare demo-001');
  await start(repo.cwd, 'first');
  const id = await decide(repo.cwd, { title: 'Split main', rests_on: ['DEMO-001'], wrong_if: 'the split hides the greeting', body: 'Move the greeting into a module.' });
  await repo.commit('decision');
  await done(repo.cwd, 'first', { unchecked: true });
  assert.equal((await migrate(repo.cwd)).dir, '.cairn -> .sudus');
  // Redeclared the ordinary way after the move: its bytes are the ledger's, not the base's.
  await declare(repo.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: [...mechanismFor('DEMO-001').inputs, 'src'] });
  await repo.write('src/greet.mjs', 'export const greet = () => "hello";\n');
  await repo.commit('redeclare and realize');
  const rid = await realize(repo.cwd, id, { subject: 'Greeting module' });
  assert.equal((await readAdr(repo.cwd)).find((l) => l.id === rid)?.kind, 'realized');
});

test('after migrate, a former-layout file with no counterpart in the layout in use is still a stop', async (t) => {
  const repo = await project({}, { layout: 'cairn' });
  t.after(repo.cleanup);
  await repo.write('.cairn/notes.txt', 'kept\n');
  await repo.commit('notes');
  await start(repo.cwd, 'first');
  const id = await decide(repo.cwd, { title: 'Split main', rests_on: ['DEMO-001'], wrong_if: 'the split hides the greeting', body: 'Move the greeting into a module.' });
  await repo.commit('decision');
  await done(repo.cwd, 'first', { unchecked: true });
  await migrate(repo.cwd);
  await git(['rm', '-q', '.sudus/notes.txt'], { cwd: repo.cwd });
  await repo.commit('drop the notes');
  await assert.rejects(realize(repo.cwd, id, { subject: 's' }), (e) => e instanceof RealizationError && e.paths.some((p) => p.path === '.cairn/notes.txt' && p.class === 'reserved'));
});

test('after migrate, a definition redeclared before the next start leaves no breach on its former path', async (t) => {
  const repo = await project({}, { layout: 'cairn' });
  t.after(repo.cleanup);
  await repo.write('flags/DEMO-001', 'fail\n'); await repo.commit('flag');
  await declare(repo.cwd, 'demo-001', mechanismFor('DEMO-001'));
  await repo.commit('declare demo-001');
  await start(repo.cwd, 'first');
  await done(repo.cwd, 'first', { unchecked: true });
  await migrate(repo.cwd);
  await preflight(repo.cwd, await readLog(repo.cwd), { command: 'declare' });
  await declare(repo.cwd, 'demo-001', { ...mechanismFor('DEMO-001'), inputs: [...mechanismFor('DEMO-001').inputs, 'src'] });
  await repo.commit('redeclare demo-001');
  await preflight(repo.cwd, await readLog(repo.cwd), { command: 'check' });
  const breaches = (await readLog(repo.cwd)).filter((x) => x.kind === 'scope-breach').map((x) => x.payload.path);
  assert.deepEqual(breaches, [], JSON.stringify(breaches));
});
