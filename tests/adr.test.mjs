// tests/adr.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalize, sha256, ulid } from '../lib/canon.mjs';
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';
import { readLog } from '../lib/records.mjs';
import { appendDecision, readAdr, queue, adrDigest, decide, supersedeDecision, AdrError, ADR_PATH } from '../lib/adr.mjs';
import { project } from './helpers/commitment-fixture.mjs';

const draft = { title: 'Use a map', rests_on: ['DEMO-001'], wrong_if: 'the map is slower', body: 'A map replaces the list.' };

test('decide appends one canonical line with a base snapshot; readAdr returns it; the queue holds it', async () => {
  const repo = await project();
  const id = await decide(repo.cwd, draft);
  const text = await readFile(join(repo.cwd, ADR_PATH), 'utf8');
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], '');
  const obj = JSON.parse(lines[0]);
  assert.equal(lines[0], canonicalize(obj));
  assert.deepEqual(Object.keys(obj).sort(), ['base_snap', 'body', 'by', 'evaluation', 'id', 'interfaces', 'kind', 'level', 'rests_on', 'title', 'ts', 'wrong_if']);
  assert.deepEqual([obj.id, obj.level, obj.by, obj.evaluation, obj.interfaces], [id, 'Consequential', 'agent', null, []]);
  assert.match(obj.base_snap, /^[0-9a-f]{40}$/);
  assert.deepEqual(await readAdr(repo.cwd), [obj]);
  assert.deepEqual(await queue(repo.cwd), [id]);
  assert.equal(await adrDigest(repo.cwd), sha256(text));
});

test('a decision naming an interface path records the interface hit', async () => {
  const repo = await project();
  const id = await decide(repo.cwd, { ...draft, named_paths: ['src/api/greet.mjs', 'src/main.mjs'] });
  const [line] = await readAdr(repo.cwd);
  assert.deepEqual([line.id, line.interfaces], [id, ['src/api/greet.mjs']]);
});

test('an empty or missing ADR reads as no lines and digests as the empty file', async () => {
  const repo = await project();
  assert.deepEqual(await readAdr(repo.cwd), []);
  assert.equal(await adrDigest(repo.cwd), sha256(''));
});

test('a read line removes the decision from the queue; a superseded line does not', async () => {
  const repo = await project();
  const a = await decide(repo.cwd, draft);
  const b = await decide(repo.cwd, { ...draft, title: 'Use a set' });
  await supersedeDecision(repo.cwd, a, b, 'the premise was false');
  assert.deepEqual(await queue(repo.cwd), [a, b]);
  const anyLogRecord = (await readLog(repo.cwd)).at(-1).sha;
  await appendDecision(repo.cwd, { kind: 'read', of: a, record: anyLogRecord }, { command: 'decisions --read' });
  assert.deepEqual(await queue(repo.cwd), [b]);
  const notOnLog = await writeWorkspaceSnapshot(repo.cwd);
  await assert.rejects(appendDecision(repo.cwd, { kind: 'read', of: b, record: notOnLog }, { command: 'decisions --read' }), /names a missing record/);
  assert.deepEqual(await queue(repo.cwd), [b]);
});

test('breach: a line written outside its assigned command is refused before it is written', async () => {
  const repo = await project();
  const snap = await writeWorkspaceSnapshot(repo.cwd);
  const line = { kind: 'decision', level: 'Consequential', by: 'agent', ...draft, base_snap: snap, evaluation: null, interfaces: [] };
  await assert.rejects(appendDecision(repo.cwd, line, { command: 'realize' }), (e) => e instanceof AdrError && /decision lines are written only by decide, escalate, supersede or promote, not realize/.test(e.message));
  await assert.rejects(appendDecision(repo.cwd, { kind: 'realized', of: 'x', base_snap: snap, snap, subject: 's', interfaces: [] }, { command: 'decide' }), /realized lines are written only by realize/);
  assert.deepEqual(await readAdr(repo.cwd), []);
});

for (const [name, mutate, message] of [
  ['a duplicate ID', (l) => l, /duplicate id/],
  ['a noncanonical line', (l) => ' ' + l, /not canonical JSON/],
  ['an unknown key', (l) => canonicalize({ ...JSON.parse(l), extra: 1, id: ulid() }), /unknown key extra/],
  ['a missing key', (l) => { const o = JSON.parse(l); delete o.wrong_if; o.id = ulid(); return canonicalize(o); }, /lacks wrong_if/],
  ['an unknown kind', (l) => canonicalize({ ...JSON.parse(l), kind: 'note', id: ulid() }), /unknown kind/],
  ['a reference to a missing decision', (l) => canonicalize({ kind: 'superseded', id: ulid(), ts: JSON.parse(l).ts, of: JSON.parse(l).id, by: '01ARZ3NDEKTSV4RRFFQ69G5FAV', cause: 'the premise was false' }), /by names missing/],
  ['a reference to a missing workspace snapshot', (l) => canonicalize({ ...JSON.parse(l), id: ulid(), base_snap: '0'.repeat(40) }), /not a workspace snapshot/],
  ['an unknown supersession cause', (l) => canonicalize({ kind: 'superseded', id: ulid(), ts: JSON.parse(l).ts, of: JSON.parse(l).id, by: JSON.parse(l).id, cause: 'we changed our minds' }), /cause/],
  ['a bad level', (l) => canonicalize({ ...JSON.parse(l), id: ulid(), level: 'Blocking' }), /level/],
]) {
  test(`breach: ${name} makes readAdr, queue and appendDecision refuse`, async () => {
    const repo = await project();
    await decide(repo.cwd, draft);
    const good = (await readFile(join(repo.cwd, ADR_PATH), 'utf8')).trimEnd();
    await appendFile(join(repo.cwd, ADR_PATH), mutate(good) + '\n');
    await assert.rejects(readAdr(repo.cwd), (e) => e instanceof AdrError && message.test(e.message));
    await assert.rejects(queue(repo.cwd), AdrError);
    await assert.rejects(decide(repo.cwd, draft), AdrError);
  });
}

test('breach: a final line without its newline', async () => {
  const repo = await project();
  await decide(repo.cwd, draft);
  const text = await readFile(join(repo.cwd, ADR_PATH), 'utf8');
  await writeFile(join(repo.cwd, ADR_PATH), text.trimEnd());
  await assert.rejects(readAdr(repo.cwd), /newline/);
});
