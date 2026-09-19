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
