// tests/mechanisms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalize, sha256 } from '../lib/canon.mjs';
import { declare, readMechanisms, definitionDigest, reviewDigest, MechanismError, requirementDigest } from '../lib/mechanisms.mjs';
import { project, declared, DEFINITION } from './helpers/mechanism-fixture.mjs';

test('declare writes one canonical file with two separately digested parts', async () => {
  const repo = await project();
  const { definitionDigest: d } = await declare(repo.cwd, 'greeter', DEFINITION);
  const text = await readFile(join(repo.cwd, '.cairn/mechanisms/greeter.json'), 'utf8');
  const obj = JSON.parse(text);
  assert.equal(text, canonicalize(obj));
  assert.deepEqual(Object.keys(obj).sort(), ['definition', 'review', 'schema']);
  assert.equal(d, sha256(canonicalize(obj.definition)));
  assert.equal(definitionDigest(obj.definition), d);
  assert.equal(reviewDigest({}), sha256('{}'));
  const all = await readMechanisms(repo.cwd);
  assert.equal(all.greeter.definitionDigest, d);
  assert.deepEqual(all.greeter.review, {});
  assert.notEqual(all.greeter.reviewDigest, d);
});

test('the definition records declared identity values verbatim and nothing else', async () => {
  const repo = await declared({ identity: { tools: { node: 'node --version' }, env: ['CAIRN_FIXTURE_ENV'], image: 'ubuntu:24.04' } });
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.identity, { tools: { node: 'node --version' }, env: ['CAIRN_FIXTURE_ENV'], image: 'ubuntu:24.04' });
  assert.equal(JSON.stringify(greeter).includes(process.env.HOME), false);
});

test('requirementDigest reads only Agreed blocks as checkable', async () => {
  const repo = await project();
  const a = await requirementDigest(repo.cwd, 'DEMO-001');
  assert.equal(a.agreed, true);
  assert.match(a.textDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal((await requirementDigest(repo.cwd, 'DEMO-002')).agreed, false);
  await assert.rejects(requirementDigest(repo.cwd, 'DEMO-999'), /not in docs\/spec/);
});

for (const [name, overrides, message] of [
  ['a document that is not an input', { documents: ['other.md'] }, /must also be an input/],
  ['a document below a source root', { inputs: [...DEFINITION.inputs, 'bin/guide.md'], documents: ['bin/guide.md'] }, /below a source root/],
  ['a reserved input', { inputs: [...DEFINITION.inputs, '.cairn/settings.json'] }, /reserved path/],
  ['an outside input', { inputs: [...DEFINITION.inputs, 'README.md'] }, /outside path/],
  ['an absolute input', { inputs: ['/etc/hosts'] }, /path/i],
  ['a secret-shaped env name', { identity: { tools: {}, env: ['API_KEY'], image: null } }, /secret-shaped/],
  ['an unknown definition key', { timeout: 5 }, /unknown definition key timeout/],
  ['an unknown identity key', { identity: { tools: {}, env: [], image: null, host: 'x' } }, /unknown identity key host/],
  ['an unknown results value', { results: 'exit-code' }, /results/],
  ['no requirements', { requirements: [] }, /at least one requirement/],
  ['a malformed requirement id', { requirements: ['demo1'] }, /requirement identifier/],
  ['an empty command', { command: '' }, /command/],
]) {
  test(`declare refuses ${name}`, async () => {
    const repo = await project();
    await assert.rejects(declare(repo.cwd, 'greeter', { ...DEFINITION, ...overrides }), (e) => e instanceof MechanismError && message.test(e.message));
    assert.deepEqual(await readMechanisms(repo.cwd), {});
  });
}

test('declare refuses a bad mechanism name and readMechanisms refuses a noncanonical file', async () => {
  const repo = await project();
  await assert.rejects(declare(repo.cwd, 'Greeter One', DEFINITION), /mechanism name/);
  await repo.write('.cairn/mechanisms/bad.json', '{ "schema": 1 }\n');
  await assert.rejects(readMechanisms(repo.cwd), /bad\.json/);
});

import { reviewMechanism, reviewBinds } from '../lib/mechanisms.mjs';
import { check } from '../lib/check.mjs';
import { readLog } from '../lib/records.mjs';

async function failReceipt(repo) {
  await repo.write('hello.txt', 'bye\n');
  const sha = await check(repo.cwd, 'DEMO-001');
  await repo.write('hello.txt', 'hello\n');
  return sha;
}

test('review mechanism binds the requirement to the definition and text digests with a fail receipt', async () => {
  const repo = await declared();
  const sha = await failReceipt(repo);
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', sha);
  const { greeter } = await readMechanisms(repo.cwd);
  const { textDigest } = await requirementDigest(repo.cwd, 'DEMO-001');
  assert.deepEqual(greeter.review, { 'DEMO-001': { definitionDigest: greeter.definitionDigest, textDigest, failReceipt: sha } });
  assert.equal(reviewBinds(greeter, 'DEMO-001', textDigest), true);
  assert.equal(reviewBinds(greeter, 'DEMO-001', 'sha256:' + '0'.repeat(64)), false);
  assert.notEqual(greeter.reviewDigest, reviewDigest({}));
});

test('a fail receipt written before any start record is accepted: currency is by identity, not position', async () => {
  const repo = await declared();
  const sha = await failReceipt(repo);
  assert.equal((await readLog(repo.cwd)).some((r) => r.kind === 'start'), false);
  await assert.doesNotReject(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', sha));
});

test('a changed definition unbinds the review metadata; an identical redeclare keeps it', async () => {
  const repo = await declared();
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', await failReceipt(repo));
  await declare(repo.cwd, 'greeter', { ...DEFINITION, requirements: ['DEMO-002', 'DEMO-001'] });
  assert.equal(Object.keys((await readMechanisms(repo.cwd)).greeter.review).length, 1);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, inputs: [...DEFINITION.inputs, 'extra.txt'] });
  assert.deepEqual((await readMechanisms(repo.cwd)).greeter.review, {});
});

test('review mechanism refuses a pass receipt, an error receipt, another mechanism, a stale definition and stale text', async () => {
  const repo = await declared();
  const pass = await check(repo.cwd, 'DEMO-001');
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', pass), /does not record fail for DEMO-001/);
  const good = await failReceipt(repo);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, cwd: 'missing' });
  const err = await check(repo.cwd, 'DEMO-001');
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', err), /error receipt never counts/);
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', good), /definition digest/);
  await declare(repo.cwd, 'greeter', DEFINITION);
  await declare(repo.cwd, 'other', { ...DEFINITION, requirements: ['DEMO-003'] });
  await assert.rejects(reviewMechanism(repo.cwd, 'other', 'DEMO-003', good), /names mechanism greeter/);
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-002', good), /does not record fail for DEMO-002/);
  const spec = await readFile(join(repo.cwd, 'docs/spec/demo.md'), 'utf8');
  await repo.write('docs/spec/demo.md', spec.replace('anything other than hello', 'anything else'));
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', good), /text digest/);
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', '0'.repeat(40)), /not a record on refs\/cairn\/log/);
});
