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
