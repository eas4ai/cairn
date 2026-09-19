// tests/commitment.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLog, decodeRecord } from '../lib/records.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { item, outside, fix, start, openCommitment, CommitmentError } from '../lib/commitment.mjs';
import { project } from './helpers/commitment-fixture.mjs';

const last = async (cwd, kind) => (await readLog(cwd)).filter((r) => r.kind === kind).at(-1);

test('item records backlog, next-feature and defect items with closed payloads', async () => {
  const repo = await project();
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'greet-twice', source: 'DEMO-001', body: 'Greet twice on request.' });
  const n = await item(repo.cwd, { kind: 'next-feature', slug: 'farewell', source: 'DEMO-001 falsifier', body: 'Add goodbye; changes DEMO-001.' });
  const d = await item(repo.cwd, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'Prints helo.' });
  const rec = await last(repo.cwd, 'item');
  assert.equal(rec.sha, d);
  assert.deepEqual(rec.payload, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'Prints helo.' });
  assert.equal(rec.target, 'hello-typo');
  assert.equal(decodeRecord(await catCommit(repo.cwd, b)).kind, 'item');
  assert.equal(decodeRecord(await catCommit(repo.cwd, n)).payload.kind, 'next-feature');
});

test('item refuses an unknown kind, a taken slug, an empty body, and a defect against a non-Agreed requirement', async () => {
  const repo = await project();
  await item(repo.cwd, { kind: 'backlog', slug: 'taken', source: 'DEMO-001', body: 'x' });
  await assert.rejects(item(repo.cwd, { kind: 'idea', slug: 'a', source: 'DEMO-001', body: 'x' }), /kind/);
  await assert.rejects(item(repo.cwd, { kind: 'backlog', slug: 'taken', source: 'DEMO-001', body: 'x' }), /slug taken is taken/);
  await assert.rejects(item(repo.cwd, { kind: 'backlog', slug: 'b', source: 'DEMO-001', body: '  ' }), /body/);
  await assert.rejects(item(repo.cwd, { kind: 'defect', slug: 'c', source: 'DEMO-003', body: 'x' }), /DEMO-003 is not an Agreed requirement/);
  await assert.rejects(item(repo.cwd, { kind: 'backlog', slug: 'd', source: 'DEMO-999', body: 'x' }), /DEMO-999 is not an Agreed requirement/);
});

test('outside names an item and a reason; it refuses a non-item SHA', async () => {
  const repo = await project();
  const i = await item(repo.cwd, { kind: 'backlog', slug: 'greet-twice', source: 'DEMO-001', body: 'x' });
  await outside(repo.cwd, i, 'Repeating the greeting is not part of printing hello.');
  const rec = await last(repo.cwd, 'outside');
  assert.deepEqual(rec.payload, { item: i, reason: 'Repeating the greeting is not part of printing hello.', evaluation: null });
  await assert.rejects(outside(repo.cwd, rec.sha, 'x'), /not an item record/);
  await assert.rejects(outside(repo.cwd, i, ''), /reason/);
});

test('fix names a defect item and a workspace snapshot under an open commitment', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  const d = await item(repo.cwd, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'Prints helo.' });
  await repo.write('src/main.mjs', 'console.log("hello!");\n');
  const sha = await fix(repo.cwd, d);
  const rec = await last(repo.cwd, 'fix');
  assert.equal(rec.sha, sha);
  assert.equal(rec.payload.item, d);
  assert.match(rec.payload.snapshot, /^[0-9a-f]{40}$/);
});

test('fix refuses a backlog item, no open commitment, and a snapshot that changes protected contract', async () => {
  const repo = await project();
  const b = await item(repo.cwd, { kind: 'backlog', slug: 'greet-twice', source: 'DEMO-001', body: 'x' });
  const d = await item(repo.cwd, { kind: 'defect', slug: 'hello-typo', source: 'DEMO-001', body: 'x' });
  await assert.rejects(fix(repo.cwd, d), /open commitment/);
  await start(repo.cwd, 'first');
  await assert.rejects(fix(repo.cwd, b), /only a defect item is fixed/);
  await repo.write('AGENTS.md', '# Working agreement\n\nChanged.\n');
  await assert.rejects(fix(repo.cwd, d), (e) => e instanceof CommitmentError && /fix changes protected contract AGENTS.md/.test(e.message));
});

import { frozenSet, protectedDigests, currentAuthorization, setCurrent } from '../lib/commitment.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { git } from '../lib/gitx.mjs';
import { sha256 } from '../lib/canon.mjs';

test('start freezes the roadmap section plus every Scope: every commitment Agreed block, at one workspace snapshot', async () => {
  const repo = await project();
  const calls = [];
  const sha = await start(repo.cwd, 'first', { installRefspecs: async (cwd, remote) => calls.push(remote) });
  const rec = await last(repo.cwd, 'start');
  assert.equal(rec.sha, sha);
  assert.equal(rec.target, 'first');
  // Deviation from the plan text: 'start' is written through withTransaction (a MULTI_STORE
  // command), which unconditionally injects intent and results into the terminal payload
  // (lib/tx.mjs's finish()); the plan's own carried obligation for this task closes the 'start'
  // schema with those two fields. The plan's literal 4-key list is extended to 6 here.
  assert.deepEqual(Object.keys(rec.payload).sort(), ['from_superseded', 'intent', 'requirements', 'results', 'slug', 'snapshot']);
  assert.deepEqual(rec.payload.requirements.map((r) => r.requirement), ['CORE-001', 'DEMO-001']);
  assert.deepEqual(rec.payload.requirements, await frozenSet(repo.cwd, 'first'));
  assert.equal(rec.payload.from_superseded, null);
  assert.equal((await readSnapshot(repo.cwd, rec.payload.snapshot, 'workspace')).kind, 'workspace');
  assert.equal(decodeRecord(await catCommit(repo.cwd, sha)).kind, 'start');
  assert.deepEqual(calls, ['origin']);
  const status = (await git(['status', '--porcelain', '--', 'docs/spec', 'AGENTS.md', '.cairn/settings.json'], { cwd: repo.cwd })).stdout;
  assert.equal(status, '', 'start committed the contract bytes');
  assert.deepEqual(openCommitment(await readLog(repo.cwd)).open.sha, sha);
});

test('start with a local-only authority remote installs nothing', async () => {
  const repo = await project({ authority_remote: null });
  const calls = [];
  await start(repo.cwd, 'first', { installRefspecs: async () => calls.push(1) });
  assert.deepEqual(calls, []);
});

test('at most one commitment is open', async () => {
  const repo = await project();
  await start(repo.cwd, 'first');
  await assert.rejects(start(repo.cwd, 'second'), (e) => e instanceof CommitmentError && /commitment first is open; at most one commitment is open/.test(e.message));
  assert.equal((await readLog(repo.cwd)).filter((r) => r.kind === 'start').length, 1);
});

test('start refuses a section naming a non-Agreed requirement, a missing section and a bad slug before writing anything', async () => {
  const repo = await project();
  const before = await readLog(repo.cwd);
  await assert.rejects(start(repo.cwd, 'drafty'), /DEMO-003 is Draft; a commitment names only Agreed requirements/);
  await assert.rejects(start(repo.cwd, 'nowhere'), /roadmap has no section nowhere/);
  await assert.rejects(start(repo.cwd, 'Bad Slug'), /invalid slug/);
  assert.equal((await readLog(repo.cwd)).length, before.length);
});

test('start refuses without a current authorization, and after a protected file changed since it', async () => {
  const repo = await project();
  await repo.write('AGENTS.md', '# Working agreement\n\nEdited after authorize.\n');
  await assert.rejects(start(repo.cwd, 'first'), /no current authorization/);
  assert.equal(await currentAuthorization(repo.cwd, await readLog(repo.cwd)), null);
  await repo.authorize();
  await assert.doesNotReject(start(repo.cwd, 'first'));
});

test('protectedDigests excludes the roadmap and covers every other spec file, the agreement and settings', async () => {
  const repo = await project();
  const a = await protectedDigests(repo.cwd);
  await repo.write('docs/spec/roadmap.md', (await readFile(join(repo.cwd, 'docs/spec/roadmap.md'), 'utf8')) + '\nMore prose.\n');
  const b = await protectedDigests(repo.cwd);
  assert.equal(a.spec, b.spec);
  await repo.write('docs/spec/glossary.md', '# Glossary\n\nchanged\n');
  assert.notEqual((await protectedDigests(repo.cwd)).spec, a.spec);
  assert.equal(a.agreement, sha256(await readFile(join(repo.cwd, 'AGENTS.md'))));
});

test('setCurrent replaces exactly the Current: line', async () => {
  const text = '# Roadmap\n\nCurrent: first\n\n## first\n\nCurrent: not a header\n';
  assert.equal(setCurrent(text, 'second'), '# Roadmap\n\nCurrent: second\n\n## first\n\nCurrent: not a header\n');
  assert.throws(() => setCurrent('# Roadmap\n', 'x'), /no Current: line/);
});
