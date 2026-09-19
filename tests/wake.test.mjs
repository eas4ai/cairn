import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loopRepo } from './helpers/loop.mjs';
import { git } from '../lib/gitx.mjs';
import { check } from '../lib/check.mjs';
import { ulid } from '../lib/canon.mjs';
import { wake, FETCH_LINE, ORDER } from '../lib/wake.mjs';

test('outside a project wake exits 3 naming the skills', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cairn-none-'));
  assert.deepEqual(await wake(dir), { exit: 3, line: 'cairn: outside a project; run /new-project or /existing-project' });
});

// Deviation from the plan text: tests/helpers/repo.mjs's makeProject (plan 01/03) already
// configures an 'origin' remote at the Git level and lib/init.mjs's DEFAULT_SETTINGS('origin',
// null) defaults settings.authority_remote to 'origin', so a plain loopRepo() already has a
// configured authority remote; the plan's literal test assumed the opposite default (no remote
// until the test adds one) and would have failed its first assertion under the real fixture.
// Split into two repositories instead: one built with authority_remote explicitly null (for the
// 'run cairn init' line) and a plain loopRepo() (for the fetch-command line, which the fixture's
// own default remote already exercises without needing to configure anything by hand).
test('missing durable refs print the exact fetch command from section 4, or name init without a remote', async () => {
  const r1 = await loopRepo({ settings: { authority_remote: null } });
  await git(['update-ref', '-d', 'refs/cairn/log'], { cwd: r1.cwd });
  assert.deepEqual(await wake(r1.cwd), { exit: 3, line: 'cairn: missing refs/cairn/log; run cairn init' });

  const r2 = await loopRepo();
  await git(['update-ref', '-d', 'refs/cairn/log'], { cwd: r2.cwd });
  const v = await wake(r2.cwd);
  assert.equal(v.exit, 3);
  assert.equal(v.line, "git fetch origin 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'");
  assert.equal(FETCH_LINE('origin'), v.line);
});

// Deviation from the plan text: the real 'command-intent' schema (lib/records.mjs) is
// {tx, command, identity, pre, writes} (plan 04's settled shape), not the plan's provisional
// {transaction, command, inputs, expected, writes}; and the real 'superseded' schema carries
// required intent/results fields (fix round 1 finding 8, already applied to every other writer of
// a MULTI_STORE terminal record) plus a ulid-typed `transition` field, not an arbitrary token.
// Both fixtures below are built against the schema actually committed.
test('a pending supersession and an interrupted transaction are not verdicts', async () => {
  const r = await loopRepo();
  await r.add('command-intent', 'tx01', {
    tx: 'tx01', command: 'start', identity: {},
    pre: { refs: { 'refs/cairn/log': null, 'refs/cairn/snapshots': null }, head: null, files: {} },
    writes: [],
  });
  assert.deepEqual(await wake(r.cwd), { exit: 3, line: 'cairn recover tx01' });
  const r2 = await loopRepo();
  await r2.add('superseded', r2.slug, {
    slug: r2.slug, start: r2.startSha, decision: ulid(), transition: ulid(), successor: 'second', carried: [],
    intent: null, results: [],
  });
  assert.deepEqual(await wake(r2.cwd), { exit: 3, line: 'cairn: pending supersession to second; run /existing-project' });
});

test('the precedence order is the one section 5 states', () => {
  assert.deepEqual(ORDER, ['repair', 'recover', 'reconcile', 'scope', 'waiting', 'fix', 'record', 'declare', 'run', 'review mechanism', 'capture', 'review', 'report', 'resolve', 'accept', 'build', 'done', 'promote']);
});
