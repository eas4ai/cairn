import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';
import { validatePath, validateGlob, assertInside, PathError, RESERVED, PROTECTED, PROTECTED_EXCEPT, KERNEL_MANAGED, CREDENTIAL_PATTERNS } from '../lib/paths.mjs';

test('validatePath accepts slash-separated relative UTF-8 paths', () => {
  for (const p of ['a', 'src/a.js', '.github/w.yml', 'dir/\u00e9.md', '.sudus/settings.json']) assert.equal(validatePath(p), p);
});
test('validatePath rejects absolute, .git root, empty components, dot components, NUL, backslash, bad Unicode', () => {
  const cases = { '/etc/x': /absolute/, '.git/config': /\.git/, 'a/.git/x': /\.git/, 'a//b': /empty component/, 'a/': /empty component/, '': /empty path/,
    './a': /\. component/, 'a/../b': /\.\. component/, '..': /\.\. component/, 'a\0b': /NUL/, 'a\\b': /backslash/, 'a\ud800': /Unicode/ };
  for (const [p, re] of Object.entries(cases)) assert.throws(() => validatePath(p), (e) => e instanceof PathError && re.test(e.message), p);
});
test('validateGlob allows * ? and whole-segment **, applies the path rules otherwise', () => {
  for (const g of ['**/*.md', 'src/**', 'config/*.secret.*', 'a/**/b', 'READ?E.md']) assert.equal(validateGlob(g), g);
  for (const g of ['/abs/**', 'a/***/b', 'a**', 'a/../**', 'a\\**', '']) assert.throws(() => validateGlob(g), PathError, g);
});
test('assertInside refuses a path that escapes after symlink resolution', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const outside = await mkdtemp(join(tmpdir(), 'sudus-outside-'));
  await writeFile(join(outside, 'secret'), 'x');
  await symlink(outside, join(repo.dir, 'vendor'));
  await mkdir(join(repo.dir, 'src'), { recursive: true });
  await symlink('../src', join(repo.dir, 'alias'));
  assert.equal(await assertInside(repo.dir, 'src/new.js'), 'src/new.js');
  assert.equal(await assertInside(repo.dir, 'alias/x.js'), 'alias/x.js');
  await assert.rejects(assertInside(repo.dir, 'vendor/secret'), /escapes/);
  await assert.rejects(assertInside(repo.dir, 'vendor/not/yet/there'), /escapes/);
});
test('the reserved constants are kernel constants', () => {
  // Both layouts' state directories are reserved: a project moved by `sudus migrate` must never
  // treat a stray .cairn/ path as plain, and a project still on the former layout is protected too.
  assert.deepEqual(RESERVED, ['.sudus/**', '.cairn/**', 'docs/spec/**', 'docs/decisions.jsonl', 'AGENTS.md']);
  assert.deepEqual(PROTECTED, ['.sudus/settings.json', '.cairn/settings.json', 'docs/spec/**', 'AGENTS.md']);
  assert.deepEqual(PROTECTED_EXCEPT, ['docs/spec/roadmap.md']);
  assert.deepEqual(KERNEL_MANAGED, ['.sudus/mechanisms', '.sudus/mechanisms/**', '.cairn/mechanisms', '.cairn/mechanisms/**', 'docs/decisions.jsonl']);
  assert.ok(CREDENTIAL_PATTERNS.includes('**/.env.*') && CREDENTIAL_PATTERNS.includes('**/id_ed25519'));
});

import { matchGlob } from '../lib/paths.mjs';

test('matchGlob matches entry paths with segment-aware wildcards', () => {
  assert.ok(matchGlob('**/.env', '.env') && matchGlob('**/.env', 'a/b/.env') && !matchGlob('**/.env', '.envrc'));
  assert.ok(matchGlob('src/api/**', 'src/api/v1/x.js') && !matchGlob('src/api/**', 'src/apix/y.js'));
  assert.ok(matchGlob('config/*.secret.*', 'config/db.secret.json') && !matchGlob('config/*.secret.*', 'config/x/db.secret.json'));
  assert.ok(matchGlob('README.md', 'README.md') && !matchGlob('README.md', 'docs/README.md'));
  assert.ok(matchGlob('a/**/b', 'a/b') && matchGlob('a/**/b', 'a/x/y/b') && matchGlob('READ?E.md', 'README.md'));
});

import { classify } from '../lib/paths.mjs';

test('classify applies the fixed precedence', () => {
  const s = { outside: ['README.md', '.github/**'], source: ['bin/**', 'src/**'], interfaces: ['src/api/**'], data: ['src/store/**', 'migrations/**'] };
  const cases = { '.sudus/settings.json': 'protected', 'docs/spec/loop.md': 'protected', 'AGENTS.md': 'protected', 'docs/spec/roadmap.md': 'reserved', '.sudus/mechanisms': 'kernel-managed',
    '.sudus/mechanisms/unit': 'kernel-managed', 'docs/decisions.jsonl': 'kernel-managed', '.sudus/output/abc': 'output', '.sudus/stray': 'reserved',
    'README.md': 'outside', '.github/w/ci.yml': 'outside', 'src/store/db.js': 'data', 'migrations/1.sql': 'data', 'src/api/v1.js': 'interface',
    'src/lib/x.js': 'source', 'bin/sudus.mjs': 'source', 'docs/guide.md': 'plain' };
  for (const [p, want] of Object.entries(cases)) assert.equal(classify(p, s), want, p);
  assert.throws(() => classify('../x', s), PathError);
});
