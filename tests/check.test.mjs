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
