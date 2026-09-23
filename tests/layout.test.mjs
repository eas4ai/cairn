// The two storage layouts (lib/layout.mjs) and `sudus migrate` (lib/migrate.mjs): a project
// initialized under the tool's former name keeps working unchanged, and moves once, between
// commitments, to the Sudus layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeProject } from './helpers/repo.mjs';
import { loopRepo } from './helpers/loop.mjs';
import { throwawayRepo, runHook, fakeSudus } from './helpers/hookenv.mjs';
import { layoutOf, forgetLayout, SUDUS, CAIRN } from '../lib/layout.mjs';
import { readLog, appendRecord } from '../lib/records.mjs';
import { git, readRef, catCommit } from '../lib/gitx.mjs';
import { migrate, runMigrate } from '../lib/migrate.mjs';
import { missingRefsLine } from '../lib/travel.mjs';
import { wake } from '../lib/wake.mjs';
import { declare } from '../lib/mechanisms.mjs';
import { check } from '../lib/check.mjs';
import { cliSigner } from '../lib/auth.mjs';
import { version } from '../lib/cli.mjs';

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
  await p.write('.gitignore', 'node_modules/\n.cairn/output/\n/.cairn/scratch\n');
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
  assert.equal(readFileSync(join(p.cwd, '.gitignore'), 'utf8'), 'node_modules/\n.sudus/output/\n/.sudus/scratch\n');
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
  assert.equal(await missingRefsLine(p.cwd), 'sudus migrate  (refs/cairn/log exists; the project was last used under the .cairn layout)');
  const w = await wake(p.cwd);
  assert.equal(w.exit, 3);
  const r = await migrate(p.cwd);
  assert.equal(r.dir, null); assert.equal(r.commit, null); assert.equal(r.moves.length, 2);
  assert.equal(await missingRefsLine(p.cwd), null);
  assert.equal((await readLog(p.cwd))[0].kind, 'init');
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
