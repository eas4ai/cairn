import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makeRepo } from './helpers/repo.mjs';
import { appendRecord } from '../lib/records.mjs';
import { writeWorkspaceSnapshot, writeInputSnapshot } from '../lib/snapshots.mjs';
import { main, FETCH_LINE } from '../lib/cli.mjs';

const run = async (argv, cwd) => { let out = '', err = ''; const code = await main(argv, { cwd, stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { err += s; } } }); return { code, out, err }; };

test('--help exits 0 and lists commands; an unknown command exits 1 with one cairn: line', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const help = await run(['--help'], repo.dir);
  assert.equal(help.code, 0); assert.match(help.out, /cairn show <sha>/);
  const bad = await run(['bogus'], repo.dir);
  assert.equal(bad.code, 1); assert.match(bad.err, /^cairn: unknown command bogus/); assert.equal(bad.err.split('\n').length, 2);
});
test('show exits 3 and names the fetch when the durable refs are missing', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const r = await run(['show', 'a'.repeat(40)], repo.dir);
  assert.equal(r.code, 3); assert.equal(r.out, `cairn: durable refs missing; run: ${FETCH_LINE}\n`);
});
test('show renders a record with its references resolved and kind-checked', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('a.txt', 'a'); await repo.commit('base');
  const ws = await writeWorkspaceSnapshot(repo.dir);
  const start = await appendRecord(repo.dir, 'start', 'hooks', { slug: 'hooks', snapshot: ws, requirements: [], from_superseded: null });
  const done = await appendRecord(repo.dir, 'done', 'hooks', { slug: 'hooks', snapshot: ws });
  const r = await run(['show', done], repo.dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /^cairn: done hooks\n/); assert.match(r.out, /"slug": "hooks"/); assert.match(r.out, new RegExp(`done.snapshot: workspace snapshot ${ws}, tree [0-9a-f]{40}`));
  const inp = await writeInputSnapshot(repo.dir, { mechanism: 'm', inputs: ['a.txt'] });
  const wrong = await appendRecord(repo.dir, 'fix', 'x', { item: start, snapshot: inp });
  const w = await run(['show', wrong], repo.dir);
  assert.equal(w.code, 1); assert.match(w.err, /^cairn: expected a workspace snapshot/);
  const plain = await run(['show', await repo.readRef('HEAD')], repo.dir);
  assert.equal(plain.code, 1); assert.match(plain.err, /^cairn: not a record subject/);
});
test('bin/cairn.mjs runs', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['bin/cairn.mjs', '--help']);
  assert.match(stdout, /usage: cairn/);
});
