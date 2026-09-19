import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';
import { validatePath, validateGlob, assertInside, PathError, RESERVED, PROTECTED, PROTECTED_EXCEPT, KERNEL_MANAGED, CREDENTIAL_PATTERNS } from '../lib/paths.mjs';

test('validatePath accepts slash-separated relative UTF-8 paths', () => {
  for (const p of ['a', 'src/a.js', '.github/w.yml', 'dir/é.md', '.cairn/settings.json']) assert.equal(validatePath(p), p);
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
  const outside = await mkdtemp(join(tmpdir(), 'cairn-outside-'));
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
  assert.deepEqual(RESERVED, ['.cairn/**', 'docs/spec/**', 'docs/decisions.jsonl', 'AGENTS.md']);
  assert.deepEqual(PROTECTED, ['.cairn/settings.json', 'docs/spec/**', 'AGENTS.md']);
  assert.deepEqual(PROTECTED_EXCEPT, ['docs/spec/roadmap.md']);
  assert.deepEqual(KERNEL_MANAGED, ['.cairn/mechanisms', '.cairn/mechanisms/**', 'docs/decisions.jsonl']);
  assert.ok(CREDENTIAL_PATTERNS.includes('**/.env.*') && CREDENTIAL_PATTERNS.includes('**/id_ed25519'));
});
