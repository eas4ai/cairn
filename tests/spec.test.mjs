import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../lib/canon.mjs';
import { normalize, textDigest, parseDomainFile } from '../lib/spec.mjs';

const FILE = `# Loop
Prefix: LOOP
Scope: every commitment
Host paths: ~/.claude/settings.json, /etc/hosts

Some prose the parser ignores.

[LOOP-001] The kernel refuses a write
  to a durable ref whose old OID differs.
Falsifier: a ref advances past a stale expected OID.
Mechanism: refs-cas
Rationale: the log is append-only.
Status: Agreed 2026-09-19

[LOOP-002] Wake writes nothing.
Falsifier: any ref or file changes during wake.
Mechanism:
Status: Draft
`;

test('normalize collapses whitespace runs and trims', () => {
  assert.equal(normalize('  a \t b\r\n c  '), 'a b c');
});
test('parseDomainFile reads the header and blocks in order', () => {
  const { header, blocks, problems } = parseDomainFile(FILE);
  assert.deepEqual(header, { prefix: 'LOOP', scopeEvery: true, hostPaths: ['~/.claude/settings.json', '/etc/hosts'] });
  assert.deepEqual(problems, []);
  assert.equal(blocks.length, 2);
  const b = blocks[0];
  assert.deepEqual([b.id, b.line, b.obligation, b.falsifier, b.mechanism, b.rationale, b.status],
    ['LOOP-001', 8, 'The kernel refuses a write to a durable ref whose old OID differs.', 'a ref advances past a stale expected OID.', 'refs-cas', 'the log is append-only.', { kind: 'Agreed', date: '2026-09-19' }]);
  assert.equal(b.textDigest, sha256('LOOP-001\nThe kernel refuses a write to a durable ref whose old OID differs.\na ref advances past a stale expected OID.'));
  assert.deepEqual([blocks[1].mechanism, blocks[1].rationale, blocks[1].status], ['', null, { kind: 'Draft', date: null }]);
});
test('the digest ignores reflow and the Mechanism and Rationale lines, not word changes', () => {
  const reflowed = FILE.replace('a write\n  to a durable', 'a write to a durable').replace('refs-cas', 'other').replace('Rationale: the log is append-only.\n', '');
  assert.equal(parseDomainFile(reflowed).blocks[0].textDigest, parseDomainFile(FILE).blocks[0].textDigest);
  assert.notEqual(parseDomainFile(FILE.replace('stale expected', 'stale')).blocks[0].textDigest, parseDomainFile(FILE).blocks[0].textDigest);
  assert.equal(textDigest('LOOP-001', ' x ', 'y'), sha256('LOOP-001\nx\ny'));
});
test('broken order, repeated lines and bad status are reported as problems with line numbers', () => {
  const bad = (text) => parseDomainFile(text).problems.map((p) => p.reason);
  assert.match(bad('[A-001] x\nStatus: Draft\nFalsifier: f\n').join(), /Falsifier: after Status:/);
  assert.match(bad('[A-001] x\nFalsifier: f\nRationale: r\nRationale: r2\nStatus: Draft\n').join(), /second Rationale:/);
  assert.match(bad('[A-001] x\nFalsifier: f\nMechanism: m\nmore text\nStatus: Draft\n').join(), /unexpected line after Falsifier:/);
  assert.match(bad('[A-001] x\nFalsifier: f\nStatus: Agreed 2026-9-1\n').join(), /noncanonical status date/);
  assert.match(bad('[A-001] x\nFalsifier: f\nStatus: Agreed 2026-02-30\n').join(), /noncanonical status date/);
  assert.match(bad('[A-001] x\nFalsifier: f\nStatus: Done\n').join(), /unknown status/);
  assert.match(bad('[A-001] x\nMechanism: m\nStatus: Draft\n').join(), /missing Falsifier:/);
  assert.match(bad('[A-001] x\nFalsifier: f\n').join(), /missing Status:/);
  assert.match(bad('[A-001]\nFalsifier: f\nStatus: Draft\n').join(), /empty obligation/);
});
test('S7: an unrelated problem that quotes the word status does not suppress a genuinely missing Status: line', () => {
  const problems = parseDomainFile('[A-001] x\nFalsifier: f\nStatus quo preserved\n').problems.map((p) => p.reason);
  assert.ok(problems.some((r) => /unexpected line after Falsifier:/.test(r)));
  assert.ok(problems.some((r) => /missing Status:/.test(r)));
});
test('S8: two blocks with no blank line between them is a grammar problem, not two valid blocks', () => {
  const problems = parseDomainFile('[A-001] x\nFalsifier: f\nStatus: Draft\n[A-002] y\nFalsifier: f\nStatus: Draft\n').problems.map((p) => p.reason);
  assert.ok(problems.some((r) => /missing blank line before the next requirement block/.test(r)));
});

import { parseRoadmap } from '../lib/spec.mjs';

test('parseRoadmap reads only Current: and Requirements: under the matching heading', () => {
  const r = parseRoadmap('# Roadmap\n\nCurrent: hooks\n\n## records\n\nRequirements: LOOP-001, LOOP-002\nDone when the log reads.\n\n## hooks\n\nProse first.\nRequirements: LOOP-003 LOOP-001\nRequirements: LOOP-999\n\n### notes\n');
  assert.equal(r.current, 'hooks');
  assert.deepEqual(r.sections.records, { requirements: ['LOOP-001', 'LOOP-002'], line: 5 });
  assert.deepEqual(r.sections.hooks.requirements, ['LOOP-003', 'LOOP-001']);
  assert.deepEqual(r.sections.notes.requirements, []);
  // S2: the parser still keeps reading only the first Requirements: line, but the second one
  // (line 14, 'Requirements: LOOP-999') is now recorded as a grammar problem for lint to refuse.
  assert.deepEqual(r.problems, [{ line: 14, reason: 'second Requirements: line in section hooks' }]);
  assert.equal(parseRoadmap('no current line').current, null);
});

import { makeRepo } from './helpers/repo.mjs';
import { lint, parseSpecMap } from '../lib/spec.mjs';

const OVERVIEW = '# Overview\n\nWhat it is.\n\n| File | Prefix |\n|---|---|\n| loop.md | LOOP |\n| ui.md | UI |\n';
const LOOP = 'Prefix: LOOP\n\n[LOOP-001] The kernel refuses stale writes.\nFalsifier: a stale write lands.\nMechanism: refs-cas\nStatus: Agreed 2026-09-19\n\n[LOOP-002] Wake writes nothing.\nFalsifier: wake changes a file.\nMechanism:\nStatus: Draft\n';
const UI = 'Prefix: UI\n\n[UI-001] The CLI prints usage.\nFalsifier: --help prints nothing.\nMechanism: cli\nStatus: Observed\n';
async function specRepo(t, files = {}) {
  const repo = await makeRepo(); t.after(repo.remove);
  const all = { 'overview.md': OVERVIEW, 'glossary.md': '# Glossary\n', 'roadmap.md': '# Roadmap\n\nCurrent: first\n\n## first\n\nRequirements: LOOP-001\n', 'loop.md': LOOP, 'ui.md': UI, ...files };
  for (const [name, text] of Object.entries(all)) await repo.write(`docs/spec/${name}`, text);
  return repo;
}
const reasons = async (repo) => (await lint(repo.dir)).map((f) => `${f.file}:${f.line}: ${f.reason}`);

test('parseSpecMap reads the File/Prefix table', () => {
  assert.deepEqual(parseSpecMap(OVERVIEW), [{ file: 'loop.md', prefix: 'LOOP' }, { file: 'ui.md', prefix: 'UI' }]);
  assert.deepEqual(parseSpecMap('# no table'), []);
});
test('a consistent spec lints clean', async (t) => { assert.deepEqual(await reasons(await specRepo(t)), []); });
test('lint refuses broken order', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nStatus: Draft\nFalsifier: f\n' });
  assert.match((await reasons(repo)).join(), /docs\/spec\/ui.md:5: UI-001: Falsifier: after Status:/);
});
test('lint refuses duplicate identifiers across files and a reused Retired identifier', async (t) => {
  const repo = await specRepo(t, { 'ui.md': UI + '\n[LOOP-001] Again.\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(repo)).join(), /duplicate identifier LOOP-001 \(also docs\/spec\/loop.md:3\)/);
  const reused = await specRepo(t, { 'ui.md': UI + '\n[UI-002] Old.\nFalsifier: f\nStatus: Retired 2026-01-01\n\n[UI-002] New.\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(reused)).join(), /duplicate identifier UI-002/);
});
test('lint refuses references to absent identifiers', async (t) => {
  const repo = await specRepo(t, { 'roadmap.md': '# Roadmap\n\nCurrent: first\n\n## first\n\nRequirements: LOOP-001, LOOP-007\n', 'glossary.md': 'See UI-009.\n' });
  const r = (await reasons(repo)).join();
  assert.match(r, /docs\/spec\/roadmap.md:7: reference to absent identifier LOOP-007/);
  assert.match(r, /docs\/spec\/glossary.md:1: reference to absent identifier UI-009/);
});
test('S2: lint refuses a second Requirements: line in one roadmap section', async (t) => {
  const repo = await specRepo(t, { 'roadmap.md': '# Roadmap\n\nCurrent: first\n\n## first\n\nRequirements: LOOP-001\nRequirements: LOOP-001\n' });
  assert.match((await reasons(repo)).join(), /docs\/spec\/roadmap.md:8: second Requirements: line in section first/);
});
test('S8: lint refuses two blocks with no blank line between them', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nFalsifier: f\nMechanism: m\nStatus: Draft\n[UI-002] y\nFalsifier: f\nMechanism: m\nStatus: Draft\n' });
  assert.match((await reasons(repo)).join(), /missing blank line before the next requirement block/);
});
test('S6: lint checks a reference on the opening line of a block and flags a mistyped prefix', async (t) => {
  const repo = await specRepo(t, {
    'ui.md': 'Prefix: UI\n\n[UI-001] See also UI-999 for details.\nFalsifier: --help prints nothing.\nMechanism: cli\nStatus: Observed\n',
    'glossary.md': 'See LOP-001 for background.\n',
  });
  const r = (await reasons(repo)).join();
  assert.match(r, /docs\/spec\/ui.md:3: reference to absent identifier UI-999/);
  assert.match(r, /docs\/spec\/glossary.md:1: reference to absent identifier LOP-001/);
});
test('lint refuses a missing falsifier', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nMechanism: m\nStatus: Draft\n' });
  assert.match((await reasons(repo)).join(), /UI-001: missing Falsifier:/);
});
test('lint refuses an Agreed block without a mechanism', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nFalsifier: f\nStatus: Agreed 2026-09-19\n' });
  assert.match((await reasons(repo)).join(), /UI-001: Agreed block without a mechanism/);
});
test('lint refuses noncanonical status dates', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nFalsifier: f\nMechanism: m\nStatus: Agreed 19/09/2026\n' });
  assert.match((await reasons(repo)).join(), /noncanonical status date/);
});
test('lint refuses a spec map that does not match domain prefixes', async (t) => {
  const missingRow = await specRepo(t, { 'overview.md': '| File | Prefix |\n|---|---|\n| loop.md | LOOP |\n' });
  assert.match((await reasons(missingRow)).join(), /docs\/spec\/overview.md:1: spec map has no row for ui.md/);
  const wrongPrefix = await specRepo(t, { 'overview.md': OVERVIEW.replace('| UI |', '| UX |') });
  assert.match((await reasons(wrongPrefix)).join(), /spec map says ui.md has prefix UX, file says UI/);
  const extraRow = await specRepo(t, { 'overview.md': OVERVIEW + '| gone.md | GONE |\n' });
  assert.match((await reasons(extraRow)).join(), /spec map names missing file gone.md/);
  const wrongBlock = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UX-001] x\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(wrongBlock)).join(), /UX-001 does not carry prefix UI/);
  const noHeader = await specRepo(t, { 'ui.md': '[UI-001] x\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(noHeader)).join(), /docs\/spec\/ui.md:1: no Prefix: header/);
});

import { requirementSet, SpecError } from '../lib/spec.mjs';

test('requirementSet is the section plus every Agreed Scope: every commitment block, Agreed only', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\nScope: every commitment\n\n[UI-001] x\nFalsifier: f\nMechanism: cli\nStatus: Agreed 2026-09-19\n\n[UI-002] y\nFalsifier: f\nMechanism: cli\nStatus: Draft\n' });
  const set = await requirementSet(repo.dir, 'first');
  assert.deepEqual(set.map((r) => r.id), ['LOOP-001', 'UI-001']);
  assert.match(set[0].textDigest, /^sha256:[0-9a-f]{64}$/);
  await assert.rejects(requirementSet(repo.dir, 'none'), (e) => e instanceof SpecError && /no roadmap section none/.test(e.message));
  const draft = await specRepo(t, { 'roadmap.md': 'Current: first\n\n## first\n\nRequirements: LOOP-002\n' });
  await assert.rejects(requirementSet(draft.dir, 'first'), /LOOP-002 is Draft, not Agreed/);
  const absent = await specRepo(t, { 'roadmap.md': 'Current: first\n\n## first\n\nRequirements: LOOP-009\n' });
  await assert.rejects(requirementSet(absent.dir, 'first'), /LOOP-009 is not defined/);
});
