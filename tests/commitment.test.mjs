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
