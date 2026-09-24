// tests/mechanisms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rm, chmod } from 'node:fs/promises';
import { canonicalize, sha256 } from '../lib/canon.mjs';
import { declare, readMechanisms, definitionDigest, reviewDigest, MechanismError, requirementDigest } from '../lib/mechanisms.mjs';
import { project, declared, DEFINITION } from './helpers/mechanism-fixture.mjs';

test('declare writes one canonical file with two separately digested parts', async () => {
  const repo = await project();
  const { definitionDigest: d } = await declare(repo.cwd, 'greeter', DEFINITION);
  const text = await readFile(join(repo.cwd, '.sudus/mechanisms/greeter.json'), 'utf8');
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
  const repo = await declared({ identity: { tools: { node: 'node --version' }, env: ['SUDUS_FIXTURE_ENV'], image: 'ubuntu:24.04' } });
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.identity, { tools: { node: 'node --version' }, env: ['SUDUS_FIXTURE_ENV'], image: 'ubuntu:24.04' });
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
  ['a reserved input', { inputs: [...DEFINITION.inputs, '.sudus/settings.json'] }, /reserved path/],
  ['an outside input', { inputs: [...DEFINITION.inputs, 'README.md'] }, /outside path/],
  ['an absolute input', { inputs: ['/etc/hosts'] }, /path/i],
  ['a secret-shaped env name', { identity: { tools: {}, env: ['API_KEY'], image: null } }, /secret-shaped/],
  ['an unknown definition key', { timeout: 5 }, /unknown definition key timeout/],
  ['an unknown identity key', { identity: { tools: {}, env: [], image: null, host: 'x' } }, /unknown identity key host/],
  ['an unknown results value', { results: 'exit-code' }, /results/],
  ['no requirements', { requirements: [] }, /at least one requirement/],
  ['a malformed requirement id', { requirements: ['demo1'] }, /requirement identifier/],
  ['an empty command', { command: '' }, /command/],
  // Fix round 1 finding 3: a glob metacharacter in inputs or documents must be refused (the
  // carried plan 02 obligation the original Task 1 pass missed).
  ['a * glob metacharacter in inputs', { inputs: [...DEFINITION.inputs, 'src/*.mjs'] }, /glob metacharacter/],
  ['a ? glob metacharacter in inputs', { inputs: [...DEFINITION.inputs, 'note?.md'] }, /glob metacharacter/],
  ['a [ glob metacharacter in documents', { inputs: [...DEFINITION.inputs, 'bad[1].md'], documents: ['bad[1].md'] }, /glob metacharacter/],
  // Fix round 2 finding 3 (missing test the re-reviewer noted): documents is validated from its
  // own raw.documents array (`.map(path).map(noGlob)`), independently of inputs -- a glob
  // metacharacter in a documents entry is refused even when that entry is not also declared as an
  // input (so the "must also be an input" check, which runs later, is never reached).
  ['a glob metacharacter in a documents-only entry not declared as an input', { documents: ['bad[1].md'] }, /glob metacharacter/],
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
  await repo.write('.sudus/mechanisms/bad.json', '{ "schema": 1 }\n');
  await assert.rejects(readMechanisms(repo.cwd), /bad\.json/);
});

// Fix round 1 finding 9: readMechanisms shape-checks the definition, not just the top-level keys.
// Fix round 2 finding 2: the message itself carries no "sudus: " prefix (lib/cli.mjs's main()
// prepends one when a command lets this reach it unwrapped; a prefix here would double it).
test('readMechanisms refuses a malformed definition shape, naming the file, with no inner sudus: prefix', async () => {
  const repo = await project();
  const entry = { schema: 1, definition: {}, review: {} };
  await repo.write('.sudus/mechanisms/broken.json', canonicalize(entry));
  await assert.rejects(readMechanisms(repo.cwd), (e) => e instanceof MechanismError && !e.message.startsWith('sudus: ') && /broken\.json/.test(e.message));
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
  const { detectionDigest } = await import('../lib/mechanisms.mjs');
  assert.deepEqual(greeter.review, { 'DEMO-001': { definitionDigest: greeter.definitionDigest, detectionDigest: detectionDigest(greeter.definition), textDigest, failReceipt: sha } });
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

// Spec revision 10: a review binds to the command, the working directory and the results mode.
test('a changed command unbinds the review metadata; an added requirement or input keeps it', async () => {
  const repo = await declared();
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', await failReceipt(repo));
  const { textDigest } = await requirementDigest(repo.cwd, 'DEMO-001');
  await declare(repo.cwd, 'greeter', { ...DEFINITION, requirements: ['DEMO-002', 'DEMO-001'] });
  assert.deepEqual(Object.keys((await readMechanisms(repo.cwd)).greeter.review), ['DEMO-001']);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, requirements: ['DEMO-002', 'DEMO-001'], inputs: [...DEFINITION.inputs, 'extra.txt'] });
  assert.equal(reviewBinds((await readMechanisms(repo.cwd)).greeter, 'DEMO-001', textDigest), true);
  await declare(repo.cwd, 'greeter', { ...DEFINITION, command: `${DEFINITION.command} --strict` });
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
  await assert.rejects(reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', '0'.repeat(40)), /not a record on refs\/sudus\/log/);
});

import { begin, end, readLease, touchOutcome } from '../lib/lease.mjs';
import { applyTouch } from '../lib/mechanisms.mjs';

// Fix round 1 findings 2 and 7: applyTouch is no longer wired in as a module-level onEnd side
// effect (lib/cli.mjs's endCommand calls it explicitly instead -- see tests/cli.test.mjs), and it
// no longer recomputes "changed" itself; it takes the same outcome lib/lease.mjs's own
// touchOutcome computes. These tests call applyTouch directly with a real lease and a real
// outcome, the same shape lib/cli.mjs's wiring produces, then call end() separately to confirm it
// still finishes normally (it does not, itself, write anything into a definition any more).
test('applyTouch writes a changed touched path into the definition and keeps the review metadata bound', async () => {
  const repo = await declared();
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', await failReceipt(repo));
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['helper.mjs'] });
  await repo.write('helper.mjs', 'export const x = 1;\n');
  const lease = await readLease(repo.cwd);
  const outcome = await touchOutcome(repo.cwd, lease);
  const result = await applyTouch(repo.cwd, lease, outcome);
  assert.deepEqual(result, { added: ['helper.mjs'], dropped: [], unclaimed: [], covered: [] });
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.inputs, ['check.mjs', 'hello.txt', 'helper.mjs', 'notes.md']);
  assert.equal(reviewBinds(greeter, 'DEMO-001', (await requirementDigest(repo.cwd, 'DEMO-001')).textDigest), true);
  await end(repo.cwd);
  assert.equal(await readLease(repo.cwd), null);
});

test('applyTouch drops an unchanged touched path and leaves the definition and review alone', async () => {
  const repo = await declared();
  await reviewMechanism(repo.cwd, 'greeter', 'DEMO-001', await failReceipt(repo));
  const before = await readMechanisms(repo.cwd);
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['helper.mjs'] });
  const lease = await readLease(repo.cwd);
  const outcome = await touchOutcome(repo.cwd, lease);
  const result = await applyTouch(repo.cwd, lease, outcome);
  assert.deepEqual(result, { added: [], dropped: ['helper.mjs'], unclaimed: [], covered: [] });
  assert.deepEqual(await readMechanisms(repo.cwd), before);
  await end(repo.cwd);
});

test('a touched path that changed and was removed again is dropped, following touchOutcome', async () => {
  const repo = await declared();
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['scratch.txt'] });
  await repo.write('scratch.txt', 'x\n');
  await rm(join(repo.cwd, 'scratch.txt'));
  const lease = await readLease(repo.cwd);
  const outcome = await touchOutcome(repo.cwd, lease);
  assert.deepEqual(outcome, { changed: [], unchanged: ['scratch.txt'] });
  assert.deepEqual(await applyTouch(repo.cwd, lease, outcome), { added: [], dropped: ['scratch.txt'], unclaimed: [], covered: [] });
  await end(repo.cwd);
});

// Fix round 2 finding 3 (missing test the re-reviewer noted): a mode-only change (chmod +x, same
// content) used to be invisible to touchOutcome, which compared only git blob hashes; lib/lease.mjs
// now compares the tree entry's mode too. 'extra.txt' is committed before begin so there is a
// recorded "before" mode to compare against (a brand-new touched file has no before state at all).
test('a mode-only change (chmod +x) is reported changed by touchOutcome and written by applyTouch', async () => {
  const repo = await declared();
  await repo.write('extra.txt', 'unchanged content\n');
  await repo.commit('add extra.txt');
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['extra.txt'] });
  await chmod(join(repo.cwd, 'extra.txt'), 0o755);
  const lease = await readLease(repo.cwd);
  const outcome = await touchOutcome(repo.cwd, lease);
  assert.deepEqual(outcome, { changed: ['extra.txt'], unchanged: [] }, 'mode-only change is changed, not unchanged');
  const result = await applyTouch(repo.cwd, lease, outcome);
  assert.deepEqual(result, { added: ['extra.txt'], dropped: [], unclaimed: [], covered: [] });
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.inputs, ['check.mjs', 'extra.txt', 'hello.txt', 'notes.md']);
  await end(repo.cwd);
});

// Issue #14: a --touch path that a declared directory input already covers is not declared again.
// Declaring it changed the definition digest, rewrote the mechanism file after the builder's commit
// and repeated the directory in the inputs. A touched path no input covers is still added.
test('applyTouch reports a path a directory input covers and leaves the definition alone', async () => {
  const repo = await declared({ inputs: [...DEFINITION.inputs, 'src'] });
  await repo.write('src/existing.mjs', 'export const x = 1;\n');
  await repo.commit('add src');
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-001', touch: ['src/new_file.mjs', 'helper.mjs'] });
  await repo.write('src/new_file.mjs', 'export const y = 2;\n');
  await repo.write('helper.mjs', 'export const z = 3;\n');
  const lease = await readLease(repo.cwd);
  const result = await applyTouch(repo.cwd, lease, await touchOutcome(repo.cwd, lease));
  assert.deepEqual(result, { added: ['helper.mjs'], dropped: [], unclaimed: [], covered: [{ path: 'src/new_file.mjs', by: 'src' }] });
  const { greeter } = await readMechanisms(repo.cwd);
  assert.deepEqual(greeter.definition.inputs, ['check.mjs', 'hello.txt', 'helper.mjs', 'notes.md', 'src']);
  await end(repo.cwd);
  const only = await declared({ inputs: [...DEFINITION.inputs, 'src'] });
  const digest = (await readMechanisms(only.cwd)).greeter.definitionDigest;
  await begin(only.cwd, { action: 'implement', target: 'DEMO-001', touch: ['src/new_file.mjs'] });
  await only.write('src/new_file.mjs', 'export const y = 2;\n');
  const l2 = await readLease(only.cwd);
  const r2 = await applyTouch(only.cwd, l2, await touchOutcome(only.cwd, l2));
  assert.deepEqual(r2, { added: [], dropped: [], unclaimed: [], covered: [{ path: 'src/new_file.mjs', by: 'src' }] });
  assert.equal((await readMechanisms(only.cwd)).greeter.definitionDigest, digest);
  await end(only.cwd);
});

// Fix round 1 finding 4: a lease target that no mechanism declares, or more than one, used to make
// applyTouch throw. Now that end() removes the lease ref before running hooks, that throw would
// lose the change with nothing left to retry against; applyTouch instead reports it as unclaimed
// and still completes.
test('finding 4: applyTouch reports an unclaimable touch instead of throwing, for a review-slug target', async () => {
  const repo = await declared();
  await begin(repo.cwd, { action: 'review', target: 'my-slug', touch: ['helper.mjs'] });
  await repo.write('helper.mjs', 'export const x = 1;\n');
  const lease = await readLease(repo.cwd);
  const outcome = await touchOutcome(repo.cwd, lease);
  const result = await applyTouch(repo.cwd, lease, outcome);
  assert.deepEqual(result, { added: [], dropped: [], unclaimed: [{ path: 'helper.mjs', reason: 'no mechanism declares my-slug' }], covered: [] });
  await end(repo.cwd);
});

test('finding 4: applyTouch reports an unclaimable touch for a REQ no mechanism declares', async () => {
  const repo = await declared();
  await begin(repo.cwd, { action: 'implement', target: 'DEMO-999', touch: ['helper.mjs'] });
  await repo.write('helper.mjs', 'export const x = 1;\n');
  const lease = await readLease(repo.cwd);
  const outcome = await touchOutcome(repo.cwd, lease);
  const result = await applyTouch(repo.cwd, lease, outcome);
  assert.deepEqual(result, { added: [], dropped: [], unclaimed: [{ path: 'helper.mjs', reason: 'no mechanism declares DEMO-999' }], covered: [] });
  await end(repo.cwd);
});

// Spec revision 10, part B: which reviews a redeclare keeps.
test('carriedReviews keeps a review whose command, working directory and results mode are unchanged, including one written before revision 10', async () => {
  const { carriedReviews, definitionDigest, detectionDigest, reviewHolds } = await import('../lib/mechanisms.mjs');
  const def = { command: 'node check.mjs', cwd: '.', inputs: ['src/a.mjs'], documents: [], requirements: ['APP-001', 'APP-002'], results: 'per-requirement', identity: { tools: {}, env: [], image: null } };
  const entry = (d, review) => ({ definition: d, definitionDigest: definitionDigest(d), review });
  const legacy = { definitionDigest: definitionDigest(def), textDigest: 'sha256:t1', failReceipt: 'f1' };
  const stale = { definitionDigest: 'sha256:old', textDigest: 'sha256:t2', failReceipt: 'f2' };
  const moreInputs = { ...def, inputs: ['src/a.mjs', 'src/b.mjs'], identity: { tools: { node: 'node --version' }, env: [], image: null } };
  const kept = carriedReviews(entry(def, { 'APP-001': legacy, 'APP-002': stale }), moreInputs);
  assert.deepEqual(Object.keys(kept), ['APP-001']);
  assert.equal(kept['APP-001'].detectionDigest, detectionDigest(def));
  assert.ok(reviewHolds(kept['APP-001'], entry(moreInputs, kept), 'APP-001'));
  assert.deepEqual(carriedReviews(entry(def, { 'APP-001': legacy }), { ...def, command: 'node other.mjs' }), {});
  assert.deepEqual(carriedReviews(entry(def, { 'APP-001': legacy }), { ...moreInputs, requirements: ['APP-002'] }), {});
  assert.deepEqual(carriedReviews(undefined, def), {});
});
