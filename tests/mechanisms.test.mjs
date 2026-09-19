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
