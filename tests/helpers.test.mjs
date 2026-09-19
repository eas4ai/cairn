import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { makeRepo } from './helpers/repo.mjs';

test('helper builds a throwaway repo with a commit', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  assert.ok(repo.dir.startsWith(tmpdir()));
  await repo.write('a.txt', 'hello\n');
  const sha = await repo.commit('first');
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(await repo.readRef('HEAD'), sha);
  assert.equal(await repo.readRef('refs/cairn/log'), null);
  assert.equal(await repo.git('config', 'user.name'), 'Cairn Test');
});

import { makeProject } from './helpers/repo.mjs';
import { readLog } from '../lib/records.mjs';
import { loadSettings } from '../lib/settings.mjs';

test('makeProject returns an initialized project with settings, an init record and an origin remote', async (t) => {
  const p = await makeProject({ settings: { source: ['src/**'] }, files: { 'src/a.js': 'x\n' } });
  t.after(p.cleanup);
  const { settings } = await loadSettings(p.cwd);
  assert.equal(settings.authority_remote, 'origin');
  assert.deepEqual(settings.source, ['src/**']);
  const log = await readLog(p.cwd);
  assert.equal(log[0].kind, 'init');
  assert.equal(await p.readRef('refs/cairn/snapshots') !== null, true);
  const sha = await p.authorize();
  assert.equal((await readLog(p.cwd)).at(-1).sha, sha);
});
