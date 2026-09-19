// tests/check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectMechanism, observeIdentity, runCommand, CheckError } from '../lib/check.mjs';
import { declare } from '../lib/mechanisms.mjs';
import { project, declared, DEFINITION } from './helpers/mechanism-fixture.mjs';

test('selectMechanism finds the one declaration naming the requirement', async () => {
  const repo = await declared();
  const { name } = await selectMechanism(repo.cwd, 'DEMO-001');
  assert.equal(name, 'greeter');
  await assert.rejects(selectMechanism(repo.cwd, 'DEMO-009'), (e) => e instanceof CheckError && /no mechanism declares DEMO-009/.test(e.message));
  await declare(repo.cwd, 'greeter-two', DEFINITION);
  await assert.rejects(selectMechanism(repo.cwd, 'DEMO-001'), /two mechanisms declare DEMO-001: greeter, greeter-two/);
});

test('observeIdentity reads only declared names and records absence as null', async () => {
  const repo = await declared();
  delete process.env.CAIRN_FIXTURE_ENV;
  const a = await observeIdentity(repo.cwd, DEFINITION.identity);
  assert.deepEqual(a, { tools: { node: process.version }, env: { CAIRN_FIXTURE_ENV: null }, image: null });
  process.env.CAIRN_FIXTURE_ENV = 'one';
  const b = await observeIdentity(repo.cwd, DEFINITION.identity);
  assert.equal(b.env.CAIRN_FIXTURE_ENV, 'one');
  assert.equal(Object.keys(b.env).length, 1);
  const c = await observeIdentity(repo.cwd, { tools: { missing: 'no-such-tool-xyz --version' }, env: [], image: 'img:1' });
  assert.deepEqual(c, { tools: { missing: null }, env: {}, image: 'img:1' });
});

test('runCommand captures combined output, exit code and signal', async () => {
  const repo = await project();
  const ok = await runCommand(repo.cwd, 'printf a; printf b >&2; exit 3');
  assert.deepEqual([ok.spawned, ok.out.toString(), ok.code, ok.signal], [true, 'ab', 3, null]);
  const killed = await runCommand(repo.cwd, 'kill -TERM $$');
  assert.deepEqual([killed.spawned, killed.code, killed.signal], [true, null, 'SIGTERM']);
  const nodir = await runCommand(repo.cwd + '/does-not-exist', 'true');
  assert.equal(nodir.spawned, false);
});

import { readFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { check, productDigest, outputPresent, OUTPUT_DIR } from '../lib/check.mjs';
import { readLog, decodeRecord } from '../lib/records.mjs';
import { readSnapshot } from '../lib/snapshots.mjs';
import { catCommit } from '../lib/gitx.mjs';
import { readMechanisms } from '../lib/mechanisms.mjs';
import { sha256 } from '../lib/canon.mjs';

async function lastReceipt(cwd) { const log = await readLog(cwd); return log.filter((r) => r.kind === 'receipt').at(-1); }

test('check writes an input snapshot, an output file named by digest, and a receipt', async () => {
  const repo = await declared();
  const sha = await check(repo.cwd, 'DEMO-001');
  const rec = await lastReceipt(repo.cwd);
  assert.equal(rec.sha, sha);
  assert.equal(rec.target, 'greeter');
  const p = rec.payload;
  assert.deepEqual(Object.keys(p).sort(), ['definition_digest', 'exit', 'identity', 'input', 'mechanism', 'output', 'product_digest', 'results', 'status']);
  assert.equal(p.status, 'ran');
  assert.deepEqual(p.exit, { code: 0, signal: null });
  assert.equal(p.definition_digest, (await readMechanisms(repo.cwd)).greeter.definitionDigest);
  const snap = await readSnapshot(repo.cwd, p.input, 'input');
  assert.equal(snap.kind, 'input');
  assert.deepEqual(p.results.map((r) => [r.requirement, r.result]), [['DEMO-001', 'pass'], ['DEMO-002', 'unverified']]);
  assert.match(p.results[0].text_digest, /^sha256:/);
  const bytes = await readFile(join(repo.cwd, OUTPUT_DIR, p.output.slice(7)));
  assert.equal(bytes.toString(), 'cairn: DEMO-001: pass\n');
  assert.equal(p.output, sha256(bytes));
  assert.equal(await outputPresent(repo.cwd, rec), true);
  assert.equal(decodeRecord(await catCommit(repo.cwd, sha)).kind, 'receipt');
  await assert.doesNotReject(access(join(repo.cwd, OUTPUT_DIR, '.gitignore')));
});

test('a violating example yields a fail receipt: ran and fail', async () => {
  const repo = await declared();
  await repo.write('hello.txt', 'bye\n');
  await check(repo.cwd, 'DEMO-001');
  const p = (await lastReceipt(repo.cwd)).payload;
  assert.equal(p.status, 'ran');
  assert.equal(p.results[0].result, 'fail');
});

test('a command that cannot start is an error receipt with every result unverified', async () => {
  const repo = await declared({ cwd: 'missing-dir' });
  await check(repo.cwd, 'DEMO-001');
  const p = (await lastReceipt(repo.cwd)).payload;
  assert.equal(p.status, 'error');
  assert.deepEqual(p.results.map((r) => r.result), ['unverified', 'unverified']);
  assert.deepEqual(p.exit, { code: null, signal: null });
});

test('without per-requirement results the exit code decides; a killed command ran', async () => {
  const repo = await declared({ command: 'exit 2', results: null });
  await check(repo.cwd, 'DEMO-001');
  let p = (await lastReceipt(repo.cwd)).payload;
  assert.deepEqual([p.status, p.results[0].result, p.exit.code], ['ran', 'fail', 2]);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, command: 'kill -KILL $$', results: null });
  await check(repo.cwd, 'DEMO-001');
  p = (await lastReceipt(repo.cwd)).payload;
  assert.deepEqual([p.status, p.results[0].result, p.exit.signal], ['ran', 'fail', 'SIGKILL']);
});

test('per-requirement lines: any fail wins, undeclared identifiers are ignored', async () => {
  const repo = await declared({ command: 'echo "cairn: DEMO-001: pass"; echo "cairn: DEMO-001: fail"; echo "cairn: DEMO-777: pass"' });
  await check(repo.cwd, 'DEMO-001');
  const p = (await lastReceipt(repo.cwd)).payload;
  assert.deepEqual(p.results.map((r) => [r.requirement, r.result]), [['DEMO-001', 'fail'], ['DEMO-002', 'unverified']]);
});

test('check refuses a requirement that is not Agreed', async () => {
  const repo = await declared();
  await assert.rejects(check(repo.cwd, 'DEMO-002'), /DEMO-002 is not Agreed/);
});

test('product_digest ignores documents', async () => {
  const repo = await declared();
  await check(repo.cwd, 'DEMO-001');
  const a = (await lastReceipt(repo.cwd)).payload;
  await repo.write('notes.md', 'changed notes\n');
  await check(repo.cwd, 'DEMO-001');
  const b = (await lastReceipt(repo.cwd)).payload;
  assert.notEqual(a.input, b.input);
  assert.equal(a.product_digest, b.product_digest);
  await repo.write('hello.txt', 'hello!\n');
  await check(repo.cwd, 'DEMO-001');
  assert.notEqual((await lastReceipt(repo.cwd)).payload.product_digest, a.product_digest);
});
