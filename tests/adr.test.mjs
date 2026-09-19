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

// Fix round 1 finding 11: these 8 breach categories are all structural (canonical JSON, closed
// schema, id/ts format and uniqueness, or a cross-reference to another ADR line via the `ids` map
// already built while reading this file) -- readAdr's default, non-verify pass still catches every
// one of them, no git call needed, so readAdr/queue/decide (which itself only fully verifies the
// one new line it is about to write, not the whole existing file) all still reject exactly as
// before finding 11's change.
for (const [name, mutate, message] of [
  ['a duplicate ID', (l) => l, /duplicate id/],
  ['a noncanonical line', (l) => ' ' + l, /not canonical JSON/],
  ['an unknown key', (l) => canonicalize({ ...JSON.parse(l), extra: 1, id: ulid() }), /unknown key extra/],
  ['a missing key', (l) => { const o = JSON.parse(l); delete o.wrong_if; o.id = ulid(); return canonicalize(o); }, /lacks wrong_if/],
  ['an unknown kind', (l) => canonicalize({ ...JSON.parse(l), kind: 'note', id: ulid() }), /unknown kind/],
  ['a reference to a missing decision', (l) => canonicalize({ kind: 'superseded', id: ulid(), ts: JSON.parse(l).ts, of: JSON.parse(l).id, by: '01ARZ3NDEKTSV4RRFFQ69G5FAV', cause: 'the premise was false' }), /by names missing/],
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

// Fix round 1 finding 11: a reference to a missing workspace snapshot is the one breach category
// among the original nine that needs an actual git read (readSnapshot) to catch -- exactly the
// cost this finding removes from the default path. readAdr(cwd) (no verify) accepts the malformed
// base_snap's FORMAT (a well-formed-looking 40-hex string) without confirming it names a real
// snapshot commit, so queue() and a plain decide() -- both non-verify -- no longer reject it
// either; only readAdr(cwd, { verify: true }), the on-demand full check for a lint-style caller,
// still catches it. This is a deliberate, disclosed behavior change from finding 11's redesign,
// not an oversight: deep corruption of an EXISTING line is now caught by periodic verify: true
// checks, not by every ordinary append re-verifying the whole file's history.
test('breach: a reference to a missing workspace snapshot is caught by readAdr(cwd, {verify: true}), not by a plain read, queue or decide', async () => {
  const repo = await project();
  await decide(repo.cwd, draft);
  const good = (await readFile(join(repo.cwd, ADR_PATH), 'utf8')).trimEnd();
  const bad = canonicalize({ ...JSON.parse(good), id: ulid(), base_snap: '0'.repeat(40) });
  await appendFile(join(repo.cwd, ADR_PATH), bad + '\n');
  await assert.rejects(readAdr(repo.cwd, { verify: true }), (e) => e instanceof AdrError && /not a workspace snapshot/.test(e.message));
  await assert.doesNotReject(readAdr(repo.cwd));
  await assert.doesNotReject(queue(repo.cwd));
  await assert.doesNotReject(decide(repo.cwd, draft));
});

test('breach: a final line without its newline', async () => {
  const repo = await project();
  await decide(repo.cwd, draft);
  const text = await readFile(join(repo.cwd, ADR_PATH), 'utf8');
  await writeFile(join(repo.cwd, ADR_PATH), text.trimEnd());
  await assert.rejects(readAdr(repo.cwd), /newline/);
});

// Fix round 1

import { decisionAppendBytes } from '../lib/adr.mjs';

// Fix round 2 finding 1: renamed from decisionFileBytes and narrowed. It used to return the whole
// file's new bytes (the existing content, read here, plus the new line), for the caller to stage
// as a {store: 'file'} whole-file overwrite -- but that read races a concurrent command's own
// append in the window between this call and the write actually landing under a lock (see
// lib/tx.mjs's own 'append' store and this file's appendDecision). It now returns only the new
// line's own bytes, with no read of the file's existing content at all, for the caller to stage as
// a {store: 'append'} write instead.
test("Fix round 2 finding 1: decisionAppendBytes validates and computes only the new line's own bytes, without reading the file's existing content or writing anything", async () => {
  const repo = await project();
  const id1 = await decide(repo.cwd, draft); // one real line already on disk
  const before = await readFile(join(repo.cwd, ADR_PATH), 'utf8');
  const snap = await writeWorkspaceSnapshot(repo.cwd);
  const line = { kind: 'decision', level: 'Consequential', by: 'agent', ...draft, base_snap: snap, evaluation: null, interfaces: [] };
  const { id, bytes } = await decisionAppendBytes(repo.cwd, line, { command: 'decide' });
  assert.equal(await readFile(join(repo.cwd, ADR_PATH), 'utf8'), before, 'nothing was written to disk');
  assert.ok(!bytes.startsWith(before), "the returned bytes are only the new line, not the existing content plus it (unless the existing content happened to be empty)");
  assert.equal(bytes.at(-1), '\n');
  const obj = JSON.parse(bytes.trimEnd());
  assert.equal(canonicalize(obj), bytes.trimEnd(), 'the returned bytes are exactly one canonical JSON line');
  assert.deepEqual([obj.id, obj.kind, obj.base_snap], [id, 'decision', snap]);
  await appendFile(join(repo.cwd, ADR_PATH), bytes);
  assert.deepEqual((await readAdr(repo.cwd)).map((l) => l.id), [id1, id]);
  // decisionAppendBytes still refuses a wrongly-assigned command, before touching the file.
  await assert.rejects(decisionAppendBytes(repo.cwd, line, { command: 'realize' }), AdrError);
});

import { acquireLock } from '../lib/tx.mjs';

test('Fix round 2 finding 1: appendDecision takes the repository-local transaction lock, refusing while another transaction holds it', async () => {
  const repo = await project();
  const release = await acquireLock(repo.cwd, 'TXHELD');
  await assert.rejects(decide(repo.cwd, draft), /holds cairn-tx\.lock/);
  release();
  await assert.doesNotReject(decide(repo.cwd, draft));
});

test('Fix round 1 finding 12: decide wraps a malformed named_paths entry as an AdrError, not a raw PathError', async () => {
  const repo = await project();
  await assert.rejects(decide(repo.cwd, { ...draft, named_paths: ['/etc/passwd'] }), (e) => e instanceof AdrError && /absolute path/.test(e.message));
});

test('Fix round 1 finding 11: appendDecision and decisionAppendBytes still fully verify the one new line being written, even though readAdr no longer verifies existing ones by default', async () => {
  const repo = await project();
  const notASnapshot = '1'.repeat(40);
  const line = { kind: 'decision', level: 'Consequential', by: 'agent', ...draft, base_snap: notASnapshot, evaluation: null, interfaces: [] };
  await assert.rejects(appendDecision(repo.cwd, line, { command: 'decide' }), (e) => e instanceof AdrError && /base_snap is not a workspace snapshot/.test(e.message));
  await assert.rejects(decisionAppendBytes(repo.cwd, line, { command: 'decide' }), (e) => e instanceof AdrError && /base_snap is not a workspace snapshot/.test(e.message));
  assert.deepEqual(await readAdr(repo.cwd), [], 'the invalid line was never written');
});
