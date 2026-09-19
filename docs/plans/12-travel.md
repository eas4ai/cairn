# Travel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two durable refs travel with the code to one confirmed authority remote: exact refspecs, an atomic or safely ordered leased push, cross-reference validation after fetch that names the exact repair, and the exit-3 line for a clone without the refs.

**Architecture:** `lib/travel.mjs` wraps four Git operations and never writes a Cairn record. `installRefspecs` edits the remote's fetch and push config idempotently. `push` reads the remote's current OIDs with `git ls-remote`, refuses unless each is an ancestor of the local ref, and pushes with `--atomic` and `--force-with-lease=<ref>:<remote oid>`; when the remote refuses an atomic push it pushes snapshots, log and branch one at a time in that order and stops at the first failure. `validateAfterFetch` walks every cross-reference between log records, snapshot commits and the branch tree and returns the fetch or push command that repairs each gap. Wake (plan 08) prints that command and exits 3; `cairn start` (plan 06) calls `installRefspecs`.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`, Git 2.40 or later (`--atomic`, `--force-with-lease=<ref>:<oid>`, `ls-remote`). No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 4 (Travel with the code), section 2 (Settings: `authority_remote`; Durable refs), section 3 (the shared spec-phase tail's refspec sentence), section 11 (two durable refs travel), section 13 decisions 38, 52. The map is `docs/plans/overview.md`.

**Depends on:** plans 01 (gitx, records, snapshots), 03 (init, settings). Modifies plan 06's `start` and plan 08's `wake` at their named lines only.

## Global constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Only `refs/cairn/log` and `refs/cairn/snapshots` travel."
- "When `authority_remote` is non-null, `cairn start` installs their exact fetch and push refspecs on that remote only."
- "Without remote atomicity, Cairn pushes snapshots first, log second and branch last. A failure stops the sequence."
- "The durable refs are append-only and a push uses the expected remote OID as a lease."
- "After fetch, wake validates all cross-references and names the exact fetch or push repair; it never guesses."
- "A clone without the durable refs exits 3 and names:" the two-line `git fetch` command in section 4, verbatim.
- "`refs/cairn/in-progress` (the action lease)" and the check lock, staging and cycle counter are local and never pushed.
- Tests use a bare repository under `os.tmpdir()` as the remote and never touch a real remote.

**Test helper:** plan 03 ships `makeProject({settings, files}) -> { cwd, ... }` in `tests/helpers/repo.mjs`, an initialized project with settings, the `init` record, both durable ref roots and a bare `origin` remote. The additional bare-remote helper this plan needs is defined in its test file.

---

## File structure

```
lib/travel.mjs          DURABLE_REFS, LOCAL_REFS, refspecsFor, installRefspecs, remoteOids, push,
                        validateAfterFetch, fetchCommand, missingRefsLine, PUSH_COMMAND, AGREEMENT_PUSH_TEXT
lib/commitment.mjs      (modify) start calls installRefspecs after the transaction
lib/wake.mjs            (modify) missing refs use missingRefsLine; validateAfterFetch runs before predicates
lib/cli.mjs             (modify) cairn push command
tests/travel.test.mjs   bare remote under os.tmpdir(); a pre-receive hook that refuses multi-ref pushes
```

Shared test fixture, at the top of `tests/travel.test.mjs` and used by every task:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeProject } from './helpers/repo.mjs';
import { git, readRef } from '../lib/gitx.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// A bare repository that stands in for the authority remote.
function makeRemote() {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-remote-'));
  sh(dir, 'init', '--bare', '-q', '--initial-branch=main');
  return dir;
}
// A pre-receive hook that refuses any push carrying more than one ref, or any ref matching `reject`.
function hook(remote, { multi = true, reject = null } = {}) {
  mkdirSync(join(remote, 'hooks'), { recursive: true });
  const body = `#!/bin/sh\nn=0\nwhile read old new ref; do n=$((n+1)); case "$ref" in ${reject ?? '__none__'}) echo "refused $ref" >&2; exit 1;; esac; done\n${multi ? 'if [ $n -gt 1 ]; then echo "one ref at a time" >&2; exit 1; fi\n' : ''}exit 0\n`;
  writeFileSync(join(remote, 'hooks/pre-receive'), body); chmodSync(join(remote, 'hooks/pre-receive'), 0o755);
}
// A project with an authority remote and one commit on main.
async function project({ remote = makeRemote(), authority = 'authority' } = {}) {
  const { cwd } = await makeProject({ settings: { authority_remote: authority } });
  sh(cwd, 'remote', 'add', authority, remote);
  sh(cwd, 'remote', 'add', 'public', makeRemote());
  writeFileSync(join(cwd, 'README.md'), 'hello\n'); sh(cwd, 'add', '-A'); sh(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first');
  return { cwd, remote, authority };
}
const remoteRef = (remote, ref) => { try { return sh(remote, 'rev-parse', '--verify', '-q', ref); } catch { return null; } };
```

---

### Task 1: Exact refspecs on the authority remote only

**Files:**
- Create: `lib/travel.mjs`
- Modify: `lib/commitment.mjs` (`start`, after the transaction commits)
- Test: `tests/travel.test.mjs`

**Interfaces:**
- Consumes: `git(args, {cwd})` from `lib/gitx.mjs`; `loadSettings(cwd)` from `lib/settings.mjs`; `start(cwd, slug)` from `lib/commitment.mjs`.
- Produces: `DURABLE_REFS = ['refs/cairn/log', 'refs/cairn/snapshots']`, `LOCAL_REFS = ['refs/cairn/in-progress']`, `refspecsFor() -> {fetch: [..], push: [..]}`, `installRefspecs(cwd, remote) -> Promise<void>` (no-op when `remote` is `null`; throws `TravelError` with a `cairn: ` message when the remote does not exist).

The exact entries, one per ref, in `remote.<name>.fetch` and `remote.<name>.push`:

```
refs/cairn/log:refs/cairn/log
refs/cairn/snapshots:refs/cairn/snapshots
```

No `+` prefix: the refs are append-only and a forced fetch would hide a rewrite. The same string serves both directions because the ref keeps its name on both sides.

- [ ] **Step 1: Write the failing tests**

```js
import { installRefspecs, refspecsFor, DURABLE_REFS, TravelError } from '../lib/travel.mjs';
import { start } from '../lib/commitment.mjs';

describe('refspecs', () => {
  test('the exact fetch and push refspecs, one per durable ref', () => {
    assert.deepEqual(DURABLE_REFS, ['refs/cairn/log', 'refs/cairn/snapshots']);
    assert.deepEqual(refspecsFor(), { fetch: ['refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'],
      push: ['refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'] });
  });
  test('installRefspecs writes them on the authority remote only and is idempotent', async () => {
    const { cwd } = await project();
    await installRefspecs(cwd, 'authority'); await installRefspecs(cwd, 'authority');
    const fetch = sh(cwd, 'config', '--get-all', 'remote.authority.fetch').split('\n');
    const push = sh(cwd, 'config', '--get-all', 'remote.authority.push').split('\n');
    assert.deepEqual(fetch, ['+refs/heads/*:refs/remotes/authority/*', ...refspecsFor().fetch]);
    assert.deepEqual(push, refspecsFor().push);
    assert.throws(() => sh(cwd, 'config', '--get-all', 'remote.public.push'), 'the public remote gets nothing');
    assert.ok(!sh(cwd, 'config', '--get-all', 'remote.public.fetch').includes('cairn'));
  });
  test('null remote is a no-op; an unknown remote is refused', async () => {
    const { cwd } = await project();
    await installRefspecs(cwd, null);
    assert.throws(() => sh(cwd, 'config', '--get-all', 'remote.authority.push'));
    await assert.rejects(installRefspecs(cwd, 'nowhere'), (e) => e instanceof TravelError && /cairn: remote nowhere/.test(e.message));
  });
  test('cairn start installs the refspecs on the configured authority remote', async () => {
    const { cwd } = await project();
    await start(cwd, 'first-slug');
    assert.deepEqual(sh(cwd, 'config', '--get-all', 'remote.authority.push').split('\n'), refspecsFor().push);
  });
  test('the action lease never gets a refspec', async () => {
    const { cwd } = await project();
    await installRefspecs(cwd, 'authority');
    assert.ok(!sh(cwd, 'config', '--get-all', 'remote.authority.push').includes('in-progress'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/travel.test.mjs`
Expected: FAIL, `Cannot find module '../lib/travel.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/travel.mjs
import { git, readRef } from './gitx.mjs';
import { loadSettings } from './settings.mjs';

export class TravelError extends Error {}
export const DURABLE_REFS = Object.freeze(['refs/cairn/log', 'refs/cairn/snapshots']);
export const LOCAL_REFS = Object.freeze(['refs/cairn/in-progress']);

export function refspecsFor() {
  const specs = DURABLE_REFS.map((r) => `${r}:${r}`);
  return { fetch: [...specs], push: [...specs] };
}

async function configAll(cwd, key) {
  const r = await git(['config', '--get-all', key], { cwd }).catch((e) => (e.code === 1 ? { stdout: '' } : Promise.reject(e)));
  return r.stdout.split('\n').filter(Boolean);
}

export async function installRefspecs(cwd, remote) {
  if (remote === null || remote === undefined) return;
  const remotes = (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
  if (!remotes.includes(remote)) throw new TravelError(`cairn: remote ${remote} does not exist; add it or set authority_remote to null`);
  const { fetch, push } = refspecsFor();
  for (const [key, wanted] of [[`remote.${remote}.fetch`, fetch], [`remote.${remote}.push`, push]]) {
    const have = await configAll(cwd, key);
    for (const spec of wanted) if (!have.includes(spec)) await git(['config', '--add', key, spec], { cwd });
  }
}
```

In `lib/commitment.mjs`, at the end of `start(cwd, slug)` after `withTransaction` returns the start SHA:

```js
import { installRefspecs } from './travel.mjs';
// ...
const { settings } = loadSettings(cwd);
await installRefspecs(cwd, settings.authority_remote);
return sha;
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/travel.test.mjs tests/commitment.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/travel.mjs lib/commitment.mjs tests/travel.test.mjs
git commit -m "Install exact durable-ref refspecs on the authority remote at start"
```

---

### Task 2: The fetch command and the exit-3 line for a clone without the refs

**Files:**
- Modify: `lib/travel.mjs`, `lib/wake.mjs` (the missing-refs branch of `wake`)
- Test: `tests/travel.test.mjs`

**Interfaces:**
- Consumes: `wake(cwd)` from `lib/wake.mjs`; `readRef`.
- Produces: `fetchCommand(authority) -> string` (the exact two lines from section 4, joined by `\n`), `missingRefsLine(cwd) -> Promise<string|null>` (null when both durable refs exist).

The command text, byte for byte, with `<authority>` replaced by the remote name:

```
git fetch <authority> 'refs/cairn/log:refs/cairn/log' \
  'refs/cairn/snapshots:refs/cairn/snapshots'
```

When `authority_remote` is null the line instead names `cairn init`, because no remote can supply the refs.

- [ ] **Step 1: Write the failing tests**

```js
import { fetchCommand, missingRefsLine } from '../lib/travel.mjs';
import { wake } from '../lib/wake.mjs';

describe('clone without the durable refs', () => {
  test('fetchCommand is the exact two-line text from section 4', () => {
    assert.equal(fetchCommand('origin'), "git fetch origin 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'");
  });
  test('a fresh clone gets the line and exit 3; after the fetch it does not', async () => {
    const { cwd, remote } = await project();
    await start(cwd, 'first-slug');
    sh(cwd, 'push', '-q', 'authority', 'main', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    assert.equal(await missingRefsLine(clone), fetchCommand('authority'));
    const v = await wake(clone);
    assert.equal(v.exit, 3); assert.equal(v.line, fetchCommand('authority'));
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    assert.equal(await missingRefsLine(clone), null);
    assert.equal((await wake(clone)).exit, undefined);
  });
  test('local-only project without refs names cairn init', async () => {
    const { cwd } = await makeProject({ settings: { authority_remote: null } });
    sh(cwd, 'update-ref', '-d', 'refs/cairn/log');
    assert.match(await missingRefsLine(cwd), /^cairn init/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/travel.test.mjs`
Expected: FAIL, `fetchCommand` is not exported.

- [ ] **Step 3: Implement**

```js
export function fetchCommand(authority) {
  return `git fetch ${authority} 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'`;
}

export async function missingRefsLine(cwd) {
  const missing = [];
  for (const ref of DURABLE_REFS) if (!(await readRef(cwd, ref))) missing.push(ref);
  if (!missing.length) return null;
  const { settings } = loadSettings(cwd);
  if (settings.authority_remote === null) return `cairn init  (durable refs ${missing.join(', ')} are missing and no authority remote is configured)`;
  return fetchCommand(settings.authority_remote);
}
```

In `lib/wake.mjs`, where `wake` detects a missing durable ref and returns `{exit: 3, line}`, replace the line with:

```js
import { missingRefsLine } from './travel.mjs';
// ...
const missing = await missingRefsLine(cwd);
if (missing) return { exit: 3, line: missing };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/travel.test.mjs tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/travel.mjs lib/wake.mjs tests/travel.test.mjs
git commit -m "Name the exact fetch command when a clone lacks the durable refs"
```

---

### Task 3: Leased push: atomic where supported, ordered otherwise

**Files:**
- Modify: `lib/travel.mjs`, `lib/cli.mjs` (add `cairn push`)
- Test: `tests/travel.test.mjs`

**Interfaces:**
- Consumes: `git`, `readRef` from `lib/gitx.mjs`; `loadSettings`.
- Produces: `remoteOids(cwd, remote, refs) -> Promise<{[ref]: sha|null}>` (via `git ls-remote`), `push(cwd, {branch} = {}) -> Promise<{mode: 'atomic'|'ordered', pushed: [ref], remote}>` (throws `TravelError` naming the failed ref and the repair), `PUSH_COMMAND = 'cairn push'`.

Rules inside `push`:

1. `authority_remote` null: throw `cairn: no authority remote; the durable refs stay local`.
2. `branch` defaults to the current branch (`git symbolic-ref --short HEAD`); a detached HEAD is refused.
3. Read the remote OIDs of the branch and both durable refs in one `ls-remote`. For each ref with a remote OID, the remote OID must be an ancestor of the local ref (`git merge-base --is-ancestor`); otherwise throw `cairn: <ref> on <remote> is ahead of this clone; run: git fetch <remote> <ref>:<ref>` (for a durable ref) or `git pull --ff-only` (for the branch). Nothing is pushed.
4. Each ref carries `--force-with-lease=<ref>:<remote oid>` (or `<ref>:` with an empty expectation when the remote lacks the ref). The lease makes the remote check its OID at push time, so two clones racing at the same base cannot both win.
5. Try one `git push --atomic <remote> <three refspecs>`. On success, mode is `atomic`.
6. If the remote answers that it does not support atomic push, or the atomic push is refused as a whole (`atomic push failed`), push one ref per command: `refs/cairn/snapshots`, then `refs/cairn/log`, then the branch. The first failure stops the sequence and throws `cairn: push of <ref> failed after <pushed refs>; retry with: cairn push`. Snapshots ahead of the log and a log ahead of the branch are safe by construction.
7. Any other failure of the atomic push (a lease mismatch, a hook rejecting one ref) is thrown as is with the remote's stderr; the ordered fallback is never used to work around a rejection of a single ref.

- [ ] **Step 1: Write the failing tests**

```js
import { push, remoteOids, PUSH_COMMAND } from '../lib/travel.mjs';
import { appendRecord } from '../lib/records.mjs';

async function started() {
  const p = await project();
  await start(p.cwd, 'first-slug');
  return p;
}

describe('push', () => {
  test('atomic push advances the branch and both durable refs, never the lease', async () => {
    const { cwd, remote } = await started();
    const r = await push(cwd);
    assert.equal(r.mode, 'atomic');
    assert.deepEqual(r.pushed, ['refs/cairn/snapshots', 'refs/cairn/log', 'refs/heads/main']);
    for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots', 'refs/heads/main']) assert.equal(remoteRef(remote, ref), await readRef(cwd, ref));
    assert.equal(remoteRef(remote, 'refs/cairn/in-progress'), null);
  });
  test('ordered fallback when the remote refuses a multi-ref push: snapshots, log, branch', async () => {
    const { cwd, remote } = await started();
    hook(remote, { multi: true });
    const r = await push(cwd);
    assert.equal(r.mode, 'ordered');
    assert.deepEqual(r.pushed, ['refs/cairn/snapshots', 'refs/cairn/log', 'refs/heads/main']);
    for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots', 'refs/heads/main']) assert.equal(remoteRef(remote, ref), await readRef(cwd, ref));
  });
  test('a failure stops the ordered sequence and the branch is not advanced without its records', async () => {
    const { cwd, remote } = await started();
    hook(remote, { multi: true, reject: 'refs/cairn/log' });
    await assert.rejects(push(cwd), (e) => /cairn: push of refs\/cairn\/log failed after refs\/cairn\/snapshots/.test(e.message));
    assert.equal(remoteRef(remote, 'refs/cairn/snapshots'), await readRef(cwd, 'refs/cairn/snapshots'));
    assert.equal(remoteRef(remote, 'refs/cairn/log'), null);
    assert.equal(remoteRef(remote, 'refs/heads/main'), null);
  });
  test('the expected remote OID is the lease: a remote advanced by another clone refuses the push untouched', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const other = mkdtempSync(join(tmpdir(), 'cairn-other-'));
    sh(other, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(other, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    await appendRecord(other, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: null, body: 'from the other clone' });
    sh(other, 'push', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    const remoteLog = remoteRef(remote, 'refs/cairn/log');
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: null, body: 'from this clone' });
    await assert.rejects(push(cwd), /refs\/cairn\/log on authority is ahead of this clone; run: git fetch authority refs\/cairn\/log:refs\/cairn\/log/);
    assert.equal(remoteRef(remote, 'refs/cairn/log'), remoteLog, 'the remote log did not move');
  });
  test('a race at the same base loses at the remote, not silently', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const other = mkdtempSync(join(tmpdir(), 'cairn-other-'));
    sh(other, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(other, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    await appendRecord(other, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: null, body: 'a' });
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: null, body: 'b' });
    const oids = await remoteOids(cwd, 'authority', ['refs/cairn/log']);
    sh(other, 'push', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');   // wins the race after our ls-remote
    const r = await git(['push', '--atomic', `--force-with-lease=refs/cairn/log:${oids['refs/cairn/log']}`, 'authority', 'refs/cairn/log:refs/cairn/log'], { cwd }).catch((e) => e);
    assert.match(String(r.stderr), /stale info|rejected/);
  });
  test('no authority remote: refused', async () => {
    const { cwd } = await makeProject({ settings: { authority_remote: null } });
    await assert.rejects(push(cwd), /cairn: no authority remote/);
  });
  test('PUSH_COMMAND is cairn push', () => assert.equal(PUSH_COMMAND, 'cairn push'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/travel.test.mjs`
Expected: FAIL, `push` is not exported.

- [ ] **Step 3: Implement**

```js
export const PUSH_COMMAND = 'cairn push';

export async function remoteOids(cwd, remote, refs) {
  const out = (await git(['ls-remote', '--refs', remote, ...refs], { cwd })).stdout;
  const map = Object.fromEntries(refs.map((r) => [r, null]));
  for (const line of out.split('\n').filter(Boolean)) { const [sha, ref] = line.split('\t'); if (ref in map) map[ref] = sha; }
  return map;
}

async function isAncestor(cwd, maybeAncestor, sha) {
  const r = await git(['merge-base', '--is-ancestor', maybeAncestor, sha], { cwd }).catch((e) => e);
  return r.code === 0;
}

function leases(oids, refs) {
  return refs.map((ref) => `--force-with-lease=${ref}:${oids[ref] ?? ''}`);
}

export async function push(cwd, { branch } = {}) {
  const { settings } = loadSettings(cwd);
  const remote = settings.authority_remote;
  if (remote === null) throw new TravelError('cairn: no authority remote; the durable refs stay local');
  if (!branch) {
    const r = await git(['symbolic-ref', '--short', 'HEAD'], { cwd }).catch(() => null);
    if (!r) throw new TravelError('cairn: HEAD is detached; check out the branch to push');
    branch = r.stdout.trim();
  }
  const branchRef = `refs/heads/${branch}`;
  const order = ['refs/cairn/snapshots', 'refs/cairn/log', branchRef];
  const oids = await remoteOids(cwd, remote, order);
  for (const ref of order) {
    const local = await readRef(cwd, ref);
    if (!local) throw new TravelError(`cairn: ${ref} does not exist locally`);
    if (oids[ref] && !(await isAncestor(cwd, oids[ref], local))) {
      const repair = ref === branchRef ? 'git pull --ff-only' : `git fetch ${remote} ${ref}:${ref}`;
      throw new TravelError(`cairn: ${ref} on ${remote} is ahead of this clone; run: ${repair}`);
    }
  }
  const specs = order.map((r) => `${r}:${r}`);
  const atomic = await git(['push', '--atomic', ...leases(oids, order), remote, ...specs], { cwd }).catch((e) => e);
  if (atomic.code === 0) return { mode: 'atomic', pushed: order, remote };
  const err = String(atomic.stderr ?? '');
  const noAtomic = /does not support --atomic|atomic push failed|one ref at a time/i.test(err);
  if (!noAtomic) throw new TravelError(`cairn: push to ${remote} refused: ${err.trim().split('\n').pop()}`);
  const pushed = [];
  for (const ref of order) {
    const one = await git(['push', ...leases(oids, [ref]), remote, `${ref}:${ref}`], { cwd }).catch((e) => e);
    if (one.code !== 0) throw new TravelError(`cairn: push of ${ref} failed after ${pushed.join(', ') || 'nothing'}; retry with: ${PUSH_COMMAND}`);
    pushed.push(ref);
  }
  return { mode: 'ordered', pushed, remote };
}
```

In `lib/cli.mjs` add to the command table:

```js
push: {
  help: 'cairn push                 push the branch and both durable refs to the authority remote',
  async run(cwd) {
    const { push } = await import('./travel.mjs');
    const r = await push(cwd);
    process.stdout.write(`pushed ${r.pushed.join(', ')} to ${r.remote} (${r.mode})\n`);
    return 0;
  },
},
```

A `TravelError` reaches the CLI's ordinary error path: its message already begins `cairn: ` and the exit code is 1.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/travel.test.mjs tests/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/travel.mjs lib/cli.mjs tests/travel.test.mjs
git commit -m "Push the branch and durable refs atomically with a remote-OID lease, ordered when atomic is refused"
```

---

### Task 4: Validate cross-references after fetch and name the exact repair

**Files:**
- Modify: `lib/travel.mjs`, `lib/wake.mjs` (before the predicate loop)
- Test: `tests/travel.test.mjs`

**Interfaces:**
- Consumes: `readLog(cwd)` from `lib/records.mjs`; `readSnapshot(cwd, sha, kind)` from `lib/snapshots.mjs`; `readAdr(cwd)` from `lib/adr.mjs`; `parseRoadmap` from `lib/spec.mjs`; `catCommit`, `git`.
- Produces: `validateAfterFetch(cwd) -> Promise<[] | [{kind: 'fetch'|'push', ref, missing, from, command}]>`.

The cross-references checked, and the repair for each:

| Reference | Missing object | Repair |
|---|---|---|
| A log record's `ws` or `input` field names a snapshot commit | not on `refs/cairn/snapshots` | remote has it: `git fetch <remote> refs/cairn/snapshots:refs/cairn/snapshots`; remote lacks it: `cairn push` from the clone that wrote record `<sha>` |
| A log record names another record by SHA (`intent`, `escalation`, `item`, `breach`, `report`, `review`, `source`, `from_superseded`, `option_call`, `owner_call`) | not on `refs/cairn/log` | same, for `refs/cairn/log` |
| The branch tree's `docs/spec/roadmap.md` says `Current: <slug>` | no `start` record for that slug | remote log has one: fetch the log; else `cairn push` from the writer |
| An ADR `answered` or `read` line on the branch names a log record | not on the log | same |

"Remote has it" is decided by `git ls-remote` plus `git cat-file -e <sha>` after a dry `git fetch --dry-run` is not possible for arbitrary objects, so the check fetches nothing: it asks whether the remote ref's OID differs from the local one and, when it does, names the fetch; when the remote ref equals the local one the object cannot be on the remote either and the repair is a push from the writer. No repair is ever guessed from chronology.

- [ ] **Step 1: Write the failing tests**

```js
import { validateAfterFetch } from '../lib/travel.mjs';
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';

describe('validateAfterFetch', () => {
  test('a consistent clone has no repairs', async () => {
    const { cwd } = await started();
    assert.deepEqual(await validateAfterFetch(cwd), []);
  });
  test('log fetched without snapshots: names the snapshot fetch', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    sh(clone, 'update-ref', 'refs/cairn/snapshots', sh(cwd, 'rev-parse', 'refs/cairn/snapshots^'), '');  // an older snapshot root, fetched by hand
    const repairs = await validateAfterFetch(clone);
    assert.equal(repairs.length, 1);
    assert.deepEqual([repairs[0].kind, repairs[0].ref, repairs[0].command], ['fetch', 'refs/cairn/snapshots', 'git fetch authority refs/cairn/snapshots:refs/cairn/snapshots']);
  });
  test('branch ahead of the log: Current names a slug with no start on the remote log; the repair is a push from the writer', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    writeFileSync(join(cwd, 'docs/spec/roadmap.md'), 'Current: second-slug\n\n## second-slug\nRequirements: \n');
    sh(cwd, 'add', '-A'); sh(cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'move current by hand');
    sh(cwd, 'push', '-q', 'authority', 'main');   // a bypassing ordinary Git push
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    const repairs = await validateAfterFetch(clone);
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].kind, 'push'); assert.equal(repairs[0].ref, 'refs/cairn/log');
    assert.match(repairs[0].command, /^cairn push  \(in the clone that wrote the start record for second-slug\)$/);
  });
  test('branch behind the log is safe', async () => {
    const { cwd } = await started();
    await push(cwd);
    await writeWorkspaceSnapshot(cwd);
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: null, body: 'later' });
    assert.deepEqual(await validateAfterFetch(cwd), []);
  });
  test('wake prints the first repair and exits 3', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    sh(clone, 'update-ref', 'refs/cairn/snapshots', sh(cwd, 'rev-parse', 'refs/cairn/snapshots^'), '');
    const v = await wake(clone);
    assert.equal(v.exit, 3); assert.equal(v.line, 'git fetch authority refs/cairn/snapshots:refs/cairn/snapshots');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/travel.test.mjs`
Expected: FAIL, `validateAfterFetch` is not exported.

- [ ] **Step 3: Implement**

```js
import { readLog } from './records.mjs';
import { readAdr } from './adr.mjs';
import { parseRoadmap } from './spec.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RECORD_REFS = ['intent', 'escalation', 'item', 'breach', 'report', 'review', 'source', 'from_superseded', 'option_call', 'owner_call', 'answer'];
const SNAPSHOT_REFS = ['ws', 'input', 'roadmap_snapshot', 'base', 'snapshot'];

async function chain(cwd, ref) {
  const tip = await readRef(cwd, ref);
  if (!tip) return new Set();
  return new Set((await git(['rev-list', tip], { cwd })).stdout.split('\n').filter(Boolean));
}

function repairFor(remote, ref, localTip, remoteTip, missing, from) {
  if (remote !== null && remoteTip && remoteTip !== localTip) {
    return { kind: 'fetch', ref, missing, from, command: `git fetch ${remote} ${ref}:${ref}` };
  }
  return { kind: 'push', ref, missing, from, command: `${PUSH_COMMAND}  (in the clone that wrote ${from})` };
}

export async function validateAfterFetch(cwd) {
  const { settings } = loadSettings(cwd);
  const remote = settings.authority_remote;
  const log = await readLog(cwd);
  const logSet = new Set(log.map((r) => r.sha));
  const snapSet = await chain(cwd, 'refs/cairn/snapshots');
  const tips = { 'refs/cairn/log': await readRef(cwd, 'refs/cairn/log'), 'refs/cairn/snapshots': await readRef(cwd, 'refs/cairn/snapshots') };
  const remoteTips = remote === null ? {} : await remoteOids(cwd, remote, DURABLE_REFS);
  const repairs = []; const seen = new Set();
  const add = (ref, missing, from) => {
    if (seen.has(`${ref} ${missing}`)) return; seen.add(`${ref} ${missing}`);
    repairs.push(repairFor(remote, ref, tips[ref], remoteTips[ref] ?? null, missing, from));
  };
  for (const r of log) {
    for (const k of SNAPSHOT_REFS) if (typeof r.payload[k] === 'string' && r.payload[k].length === 40 && !snapSet.has(r.payload[k])) add('refs/cairn/snapshots', r.payload[k], `record ${r.sha}`);
    for (const k of RECORD_REFS) if (typeof r.payload[k] === 'string' && r.payload[k].length === 40 && !logSet.has(r.payload[k])) add('refs/cairn/log', r.payload[k], `record ${r.sha}`);
  }
  let roadmap = '';
  try { roadmap = readFileSync(join(cwd, 'docs/spec/roadmap.md'), 'utf8'); } catch { roadmap = ''; }
  const current = roadmap ? parseRoadmap(roadmap).current : null;
  if (current && !log.some((r) => r.kind === 'start' && r.payload.slug === current)) add('refs/cairn/log', `start ${current}`, `the start record for ${current}`);
  let adr = [];
  try { adr = readAdr(cwd); } catch { adr = []; }
  for (const line of adr) {
    for (const k of ['answer', 'escalation', 'record']) if (typeof line[k] === 'string' && line[k].length === 40 && !logSet.has(line[k])) add('refs/cairn/log', line[k], `ADR line ${line.id}`);
  }
  return repairs;
}
```

In `lib/wake.mjs`, after the missing-refs check from Task 2 and before the predicate loop:

```js
import { missingRefsLine, validateAfterFetch } from './travel.mjs';
// ...
const repairs = await validateAfterFetch(cwd);
if (repairs.length) return { exit: 3, line: repairs[0].command };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/travel.test.mjs tests/wake.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/travel.mjs lib/wake.mjs tests/travel.test.mjs
git commit -m "Validate log, snapshot and branch cross-references after fetch and name the exact repair"
```

---

### Task 5: The working agreement's push text

**Files:**
- Modify: `lib/travel.mjs`
- Test: `tests/travel.test.mjs`

**Interfaces:**
- Produces: `AGREEMENT_PUSH_TEXT` (a string constant). Plan 13's `skills/new-project/templates/AGENTS.md` carries this paragraph verbatim; plan 13 imports the constant in its template test so the two cannot drift.

- [ ] **Step 1: Write the failing test**

```js
import { AGREEMENT_PUSH_TEXT } from '../lib/travel.mjs';

describe('working agreement text', () => {
  test('the push paragraph names the command, the three refs, atomicity, the order and the lease', () => {
    assert.equal(AGREEMENT_PUSH_TEXT, [
      'Push with `cairn push`. It pushes the branch, `refs/cairn/log` and',
      '`refs/cairn/snapshots` to the authority remote in one atomic push where the',
      'remote supports it; otherwise snapshots first, log second and branch last,',
      'and a failure stops the sequence. Each ref carries the expected remote OID',
      'as a lease, so a clone that is behind is refused and told what to fetch.',
      'Never push `refs/cairn/*` with plain `git push`; after any fetch, `cairn',
      'wake` checks the records against the code and names the exact repair.',
    ].join('\n'));
    assert.ok(/^[\x20-\x7e\n]+$/.test(AGREEMENT_PUSH_TEXT), 'ASCII only');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/travel.test.mjs`
Expected: FAIL, `AGREEMENT_PUSH_TEXT` is not exported.

- [ ] **Step 3: Implement**

```js
export const AGREEMENT_PUSH_TEXT = [
  'Push with `cairn push`. It pushes the branch, `refs/cairn/log` and',
  '`refs/cairn/snapshots` to the authority remote in one atomic push where the',
  'remote supports it; otherwise snapshots first, log second and branch last,',
  'and a failure stops the sequence. Each ref carries the expected remote OID',
  'as a lease, so a clone that is behind is refused and told what to fetch.',
  'Never push `refs/cairn/*` with plain `git push`; after any fetch, `cairn',
  'wake` checks the records against the code and names the exact repair.',
].join('\n');
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/travel.test.mjs`
Expected: PASS, every travel test.

- [ ] **Step 5: Commit**

```bash
git add lib/travel.mjs tests/travel.test.mjs
git commit -m "Fix the working agreement's push paragraph as a kernel constant"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| "Only `refs/cairn/log` and `refs/cairn/snapshots` travel." (4, 11, 13.52) | 1, 3 |
| "When `authority_remote` is non-null, `cairn start` installs their exact fetch and push refspecs on that remote only." (3, 4) | 1 |
| `authority_remote`: the one remote, `null` means local-only, `origin` never assumed (2) | 1, 2, 3 |
| "The working agreement's push command atomically pushes the branch and both refs where the remote supports atomic push." (4, 13.38) | 3, 5 |
| "Without remote atomicity, Cairn pushes snapshots first, log second and branch last. A failure stops the sequence." (4) | 3 |
| "Snapshots ahead of the log and a log ahead of the branch are safe and retried; the branch is never intentionally advanced without the records it needs." (4) | 3, 4 |
| "A bypassing ordinary Git push can still create a mismatch. After fetch, wake validates all cross-references and names the exact fetch or push repair; it never guesses." (4) | 4 |
| "The durable refs are append-only and a push uses the expected remote OID as a lease." (2, 4) | 3 |
| "The action lease does not coordinate separate clones. Concurrent clones meet at the authority remote: a non-fast-forward or failed lease push stops the later writer before its branch is published." (2, 13.52) | 3 |
| "`refs/cairn/in-progress`, local to the repository and never pushed." (2) | 1, 3 |
| "A clone without the durable refs exits 3 and names:" the two-line fetch command (4) | 2 |
| "Wake ... on missing durable refs ... prints one line naming the command or skill that continues and exits 3" (2) | 2, 4 |
| "Two durable refs travel to one confirmed authority remote; the action lease, transaction staging and cycle counter remain local." (11) | 1, 3 |

Left to other plans:

- "Every ref advance is compare-and-swap" for local writes (section 2, Durable refs): plan 01's `updateRefCAS`; this plan covers only the remote side of the lease.
- "The kernel alone writes them, never rewrites them": plan 01 (append) and plan 03 (init creates the roots).
- `cairn init` asking the developer to confirm the authority remote or explicit local-only operation, and refusing an invalid authority remote in settings (sections 2, 3): plan 03 and plan 02.
- The pre-push hook that keeps `v2` and `refs/cairn/*` off the public remote (overview, Privacy): a repository hook for cairn-dev, not kernel code; plan 13 documents it.
- The working agreement template that carries `AGREEMENT_PUSH_TEXT` (section 3, "writes or updates the working agreement"): plan 13.
- "Records from 1.x are not read." (4): plan 14, cutover.
