import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeRepo, makeProject } from './helpers/repo.mjs';
import { git, readRef } from '../lib/gitx.mjs';
import { init } from '../lib/init.mjs';
import { authorize } from '../lib/auth.mjs';
import { start } from '../lib/commitment.mjs';
import { appendRecord, readLog } from '../lib/records.mjs';
import { ulid } from '../lib/canon.mjs';
import { wake } from '../lib/wake.mjs';
import {
  installRefspecs, refspecsFor, DURABLE_REFS, TravelError,
  fetchCommand, missingRefsLine,
  push, remoteOids, PUSH_COMMAND, ATOMIC_UNSUPPORTED,
  validateAfterFetch,
  AGREEMENT_PUSH_TEXT,
} from '../lib/travel.mjs';
import { writeWorkspaceSnapshot } from '../lib/snapshots.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// A bare repository that stands in for the authority remote.
function makeRemote() {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-remote-'));
  sh(dir, 'init', '--bare', '-q', '--initial-branch=main');
  return dir;
}

// Deviation from the plan text: the plan's own `project()` built directly on plan 03's
// makeProject({settings: {authority_remote: authority}}), which writes .cairn/settings.json (and
// runs `cairn init`, which loads and validates it) *before* the caller has any chance to `git
// remote add <authority>`. lib/settings.mjs's validateSettings (already committed, plan 02)
// refuses an authority_remote that is not a currently configured remote
// ("authority remote <x> is not a configured remote"), so that ordering throws inside makeProject
// itself as soon as `authority` is anything other than the 'origin' remote makeProject always
// configures first. This project() instead builds the repository by hand, in the order settings
// validation actually needs: add the authority and public remotes first, then run cairn init and
// cairn authorize (both imported directly from lib/init.mjs and lib/auth.mjs, the same functions
// makeProject itself calls) so `start()` (which every later task's fixture needs) has a current
// authorization to check against.
//
// Fix round 1 item 4 (Minor, review-1.md finding 4): the earlier version of this fixture wrote
// .cairn/settings.json to disk itself, before calling init() -- init()'s own `hadSettings` branch
// then skipped confirmRemote entirely (it only runs when no settings file exists yet), so no
// travel test ever exercised cairn init's actual developer-confirmation-of-remote step, only the
// "adopt an already-written digest" path. Settings are no longer pre-written: init() itself
// builds them from confirmRemote's return value (the same DEFAULT_SETTINGS(remote, key) it always
// uses), and this project() asserts confirmRemote is actually called, with the real configured
// remote names, on every call -- so a future regression back to the old bypassing order fails
// every travel test immediately rather than silently losing this coverage again.
async function project({ remote = makeRemote(), authority = 'authority' } = {}) {
  const repo = await makeRepo();
  sh(repo.dir, 'remote', 'add', authority, remote);
  sh(repo.dir, 'remote', 'add', 'public', makeRemote());
  await repo.write('AGENTS.md', '# Working agreement\n\nRun cairn wake.\n');
  await repo.write('docs/spec/overview.md', '# Keystone\n');
  await repo.write('docs/spec/roadmap.md', 'Current: first-slug\n\n## first-slug\n\nRequirements: \n\n## second-slug\n\nRequirements: \n');
  await repo.write('README.md', 'hello\n');
  await repo.commit('fixture');
  const yes = async () => true;
  let confirmRemoteCalls = 0;
  await init(repo.dir, {
    confirmRemote: async (names) => {
      confirmRemoteCalls++;
      assert.ok(names.includes(authority), `confirmRemote sees ${authority} among the configured remotes`);
      return authority;
    },
    chooseKey: async () => null, confirm: yes, confirmDigest: yes,
  });
  assert.equal(confirmRemoteCalls, 1, 'cairn init asked the developer to confirm the authority remote');
  await authorize(repo.dir, { confirm: yes });
  return { cwd: repo.dir, remote, authority };
}
async function started(opts) {
  const p = await project(opts);
  await start(p.cwd, 'first-slug');
  return p;
}
// A bare remote configured to genuinely lack --atomic support (fix round 1 item 1): the exact
// signal `push` now keys off, captured against a real repository below rather than inferred from
// any rejection text a hook could also produce.
function noAtomicRemote() {
  const dir = makeRemote();
  sh(dir, 'config', 'receive.advertiseAtomic', 'false');
  return dir;
}
// A pre-receive hook that refuses any push carrying more than one ref, or any ref matching `reject`.
function hook(remote, { multi = true, reject = null } = {}) {
  mkdirSync(join(remote, 'hooks'), { recursive: true });
  const body = `#!/bin/sh\nn=0\nwhile read old new ref; do n=$((n+1)); case "$ref" in ${reject ?? '__none__'}) echo "refused $ref" >&2; exit 1;; esac; done\n${multi ? 'if [ $n -gt 1 ]; then echo "one ref at a time" >&2; exit 1; fi\n' : ''}exit 0\n`;
  writeFileSync(join(remote, 'hooks/pre-receive'), body); chmodSync(join(remote, 'hooks/pre-receive'), 0o755);
}
const remoteRef = (remote, ref) => { try { return sh(remote, 'rev-parse', '--verify', '-q', ref); } catch { return null; } };

describe('refspecs', () => {
  test('the exact fetch and push refspecs, one per durable ref', () => {
    assert.deepEqual(DURABLE_REFS, ['refs/cairn/log', 'refs/cairn/snapshots']);
    assert.deepEqual(refspecsFor(), {
      fetch: ['refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'],
      push: ['refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots'],
    });
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

describe('push', () => {
  test('atomic push advances the branch and both durable refs, never the lease', async () => {
    const { cwd, remote } = await started();
    const r = await push(cwd);
    assert.equal(r.mode, 'atomic');
    assert.deepEqual(r.pushed, ['refs/cairn/snapshots', 'refs/cairn/log', 'refs/heads/main']);
    for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots', 'refs/heads/main']) assert.equal(remoteRef(remote, ref), await readRef(cwd, ref));
    assert.equal(remoteRef(remote, 'refs/cairn/in-progress'), null);
  });
  // Fix round 1 item 1 (Critical): rewritten to use a remote genuinely configured without
  // --atomic support (receive.advertiseAtomic=false) rather than a hook that merely enforces "one
  // ref at a time" -- that hook-level restriction is not the same fact as the remote lacking
  // --atomic, and a fixed, exact-text detection (see ATOMIC_UNSUPPORTED below) no longer treats
  // it as one.
  test('ordered fallback when the remote genuinely does not support atomic pushes: snapshots, log, branch', async () => {
    const remote = noAtomicRemote();
    const { cwd } = await started({ remote });
    const r = await push(cwd);
    assert.equal(r.mode, 'ordered');
    assert.deepEqual(r.pushed, ['refs/cairn/snapshots', 'refs/cairn/log', 'refs/heads/main']);
    for (const ref of ['refs/cairn/log', 'refs/cairn/snapshots', 'refs/heads/main']) assert.equal(remoteRef(remote, ref), await readRef(cwd, ref));
  });
  test('a failure stops the ordered sequence and the branch is not advanced without its records', async () => {
    const remote = noAtomicRemote();
    const { cwd } = await started({ remote });
    hook(remote, { reject: 'refs/cairn/log' });
    await assert.rejects(push(cwd), (e) => /cairn: push of refs\/cairn\/log failed after refs\/cairn\/snapshots/.test(e.message));
    assert.equal(remoteRef(remote, 'refs/cairn/snapshots'), await readRef(cwd, 'refs/cairn/snapshots'));
    assert.equal(remoteRef(remote, 'refs/cairn/log'), null);
    assert.equal(remoteRef(remote, 'refs/heads/main'), null);
  });
  // Fix round 1 item 1, reproduction 1 (review-1.md finding 1): an atomic-capable remote (default
  // config, no advertiseAtomic=false) whose pre-receive hook rejects only refs/cairn/log. Real
  // Git's atomic transaction refuses every ref together ("(pre-receive hook declined)" for all
  // three, confirmed against a real bare repository), so push() must throw the rejection as is
  // (rule 7) rather than misreading it as "remote lacks --atomic" and retrying per ref -- and,
  // because the remote genuinely refused the whole transaction, nothing lands.
  test('an atomic-capable remote rejecting one ref throws without any ordered fallback, and no ref lands', async () => {
    const { cwd, remote } = await started();
    hook(remote, { multi: false, reject: 'refs/cairn/log' });
    await assert.rejects(push(cwd), (e) => e instanceof TravelError && !/failed after/.test(e.message));
    assert.equal(remoteRef(remote, 'refs/cairn/snapshots'), null, 'a true atomic rejection lands nothing');
    assert.equal(remoteRef(remote, 'refs/cairn/log'), null);
    assert.equal(remoteRef(remote, 'refs/heads/main'), null);
  });
  test('the expected remote OID is the lease: a remote advanced by another clone refuses the push untouched', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const other = mkdtempSync(join(tmpdir(), 'cairn-other-'));
    sh(other, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(other, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    await appendRecord(other, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'from the other clone' });
    sh(other, 'push', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    const remoteLog = remoteRef(remote, 'refs/cairn/log');
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'from this clone' });
    await assert.rejects(push(cwd), /refs\/cairn\/log on authority is ahead of this clone; run: git fetch authority refs\/cairn\/log:refs\/cairn\/log/);
    assert.equal(remoteRef(remote, 'refs/cairn/log'), remoteLog, 'the remote log did not move');
  });
  test('a race at the same base loses at the remote, not silently', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const other = mkdtempSync(join(tmpdir(), 'cairn-other-'));
    sh(other, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(other, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log', 'refs/cairn/snapshots:refs/cairn/snapshots');
    await appendRecord(other, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'a' });
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'b' });
    const oids = await remoteOids(cwd, 'authority', ['refs/cairn/log']);
    sh(other, 'push', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');   // wins the race after our ls-remote
    const r = await git(['push', '--atomic', `--force-with-lease=refs/cairn/log:${oids['refs/cairn/log']}`, 'authority', 'refs/cairn/log:refs/cairn/log'], { cwd, expect: [0, 1, 128] });
    assert.match(String(r.stderr), /stale info|rejected/);
    // Fix round 1 item 1, reproduction 2 (review-1.md finding 1): real Git's stderr for a stale
    // force-with-lease atomic push includes "atomic push failed" and "failed to push some refs" --
    // the same words the old, broad detection matched to mean "remote lacks --atomic". Confirms
    // the fix: this genuine lease rejection on an atomic-capable remote does not match the exact
    // text ATOMIC_UNSUPPORTED now requires, so push() throws it as is (rule 7) instead of
    // silently retrying per ref.
    assert.ok(/atomic push failed|failed to push some refs/.test(String(r.stderr)), 'sanity: this is the exact failure class the old regex misclassified');
    assert.ok(!ATOMIC_UNSUPPORTED.test(String(r.stderr)), 'a genuine lease rejection on an atomic-capable remote must not be mistaken for missing --atomic support');
  });
  test('no authority remote: refused', async () => {
    const { cwd } = await makeProject({ settings: { authority_remote: null } });
    await assert.rejects(push(cwd), /cairn: no authority remote/);
  });
  test('PUSH_COMMAND is cairn push', () => assert.equal(PUSH_COMMAND, 'cairn push'));
});

describe('validateAfterFetch', () => {
  test('a consistent clone has no repairs', async () => {
    const { cwd } = await started();
    assert.deepEqual(await validateAfterFetch(cwd), []);
  });
  // Kernel fix round (plan 14 fixture, defect 1, ruling B): the ordinary spec-phase state --
  // Current: already names the roadmap section about to start, but no start record exists yet
  // anywhere in the log -- is not a dangling reference and must report no repair.
  test('a roadmap Current: line with no start record anywhere yet is the spec-phase state, not a repair', async () => {
    const { cwd } = await project();
    assert.deepEqual(await validateAfterFetch(cwd), []);
  });
  test('log fetched without snapshots: names the snapshot fetch', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    sh(clone, 'update-ref', 'refs/cairn/snapshots', sh(cwd, 'rev-parse', 'refs/cairn/snapshots^'));  // an older snapshot root, fetched by hand
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
    await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'later' });
    assert.deepEqual(await validateAfterFetch(cwd), []);
  });
  // Fix round 1 item 2 (review-1.md finding 2): RECORD_REFS was a hand-written list that omitted
  // report.brief, escalation.evaluation, outside.evaluation, evaluation-intent/calibration's
  // log_head, and superseded.start, and could never see a list(ref) field (superseded.carried)
  // regardless of the list, since the old scan only tested string values. validateAfterFetch now
  // walks lib/records.mjs's refFieldsOf, derived from SCHEMAS; these six cases are exactly the
  // fields the review confirmed missing, each on a fresh project so its repair is the only one.
  const zero = '0'.repeat(40);
  const digest64 = 'sha256:' + '1'.repeat(64);
  test('a dangling report.brief names refs/cairn/log', async () => {
    const { cwd } = await started();
    const snap = await writeWorkspaceSnapshot(cwd);
    await appendRecord(cwd, 'report', 'first-slug', {
      slug: 'first-slug', session: null, snapshot: snap, brief: zero, model: 'm', transport: 'local',
      boundary: 'enforced', builder_model: null, projection_digest: digest64, attempts: [], findings: [], interface_attempts: [],
    });
    const repairs = await validateAfterFetch(cwd);
    assert.deepEqual(repairs.map((r) => [r.kind, r.ref, r.missing]), [['push', 'refs/cairn/log', zero]]);
  });
  test('a dangling escalation.evaluation names refs/cairn/log', async () => {
    const { cwd } = await started();
    await appendRecord(cwd, 'escalation', 'first-slug', {
      slug: 'first-slug', question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i', concerns: 'c', evaluation: zero,
    });
    const repairs = await validateAfterFetch(cwd);
    assert.deepEqual(repairs.map((r) => [r.kind, r.ref, r.missing]), [['push', 'refs/cairn/log', zero]]);
  });
  test('a dangling outside.evaluation names refs/cairn/log', async () => {
    const { cwd } = await started();
    const item = await appendRecord(cwd, 'item', 'first-slug', { kind: 'backlog', slug: 'first-slug', source: 'test', body: 'x' });
    await appendRecord(cwd, 'outside', 'first-slug', { item, reason: 'r', evaluation: zero });
    const repairs = await validateAfterFetch(cwd);
    assert.deepEqual(repairs.map((r) => [r.kind, r.ref, r.missing]), [['push', 'refs/cairn/log', zero]]);
  });
  test('a dangling evaluation-intent.log_head names refs/cairn/log', async () => {
    const { cwd } = await started();
    const snap = await writeWorkspaceSnapshot(cwd);
    await appendRecord(cwd, 'evaluation-intent', 'first-slug', {
      draft_digest: digest64, snapshot: snap, log_head: zero, adr_digest: digest64, settings_digest: digest64,
      policy_digest: digest64, source: 'jev', request_digest: null,
    });
    const repairs = await validateAfterFetch(cwd);
    assert.deepEqual(repairs.map((r) => [r.kind, r.ref, r.missing]), [['push', 'refs/cairn/log', zero]]);
  });
  test('a dangling superseded.start names refs/cairn/log', async () => {
    const { cwd } = await started();
    await appendRecord(cwd, 'superseded', 'first-slug', {
      slug: 'first-slug', start: zero, decision: ulid(), transition: ulid(), successor: 'second-slug', carried: [], intent: null, results: [],
    });
    const repairs = await validateAfterFetch(cwd);
    assert.deepEqual(repairs.map((r) => [r.kind, r.ref, r.missing]), [['push', 'refs/cairn/log', zero]]);
  });
  test('a dangling entry in superseded.carried names refs/cairn/log', async () => {
    const { cwd } = await started();
    const startSha = (await readLog(cwd)).find((r) => r.kind === 'start').sha;
    await appendRecord(cwd, 'superseded', 'first-slug', {
      slug: 'first-slug', start: startSha, decision: ulid(), transition: ulid(), successor: 'second-slug', carried: [zero], intent: null, results: [],
    });
    const repairs = await validateAfterFetch(cwd);
    assert.deepEqual(repairs.map((r) => [r.kind, r.ref, r.missing]), [['push', 'refs/cairn/log', zero]]);
  });
  // Kernel fix round 2 (plan 14 fixture, re-review, New Important finding): kernel fix round 1's
  // ruling A ("never on wake's ordinary path") is withdrawn -- section 4 literally names wake as
  // the validator (see lib/wake.mjs's wake() and its own comment for the full quote). cairn
  // push's own post-push check (lib/travel.mjs's push, via afterPush) is kept as an additional
  // call site, for a push not preceded by a fresh cairn wake: a push that itself succeeds still
  // throws if a cross-reference this push did not and could not supply is left dangling.
  test("push's own post-push check catches a dangling reference this push did not supply", async () => {
    const { cwd } = await started();
    await push(cwd);
    await appendRecord(cwd, 'escalation', 'first-slug', {
      slug: 'first-slug', question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i', concerns: 'c', evaluation: '0'.repeat(40),
    });
    await assert.rejects(push(cwd), (e) => e instanceof TravelError && /cross-reference is still unresolved/.test(e.message));
  });
  // Restored (kernel fix round 2): commit ab55ca76 deleted this test when validateAfterFetch was
  // (wrongly, per the withdrawn ruling A) removed from wake()'s ordinary path, replacing it with
  // the push()-only test above rather than adapting it. wake() calls validateAfterFetch again,
  // before readState/verdictOf's own transaction-drift diagnosis, so this exact state -- a second
  // clone whose refs/cairn/snapshots is a real, older, non-ancestor commit -- is named directly
  // instead of misdiagnosed as an incomplete transaction (the re-reviewer's own reproduction; see
  // the next test for that exact recipe named explicitly).
  test('wake prints the first repair and exits 3', async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    sh(clone, 'update-ref', 'refs/cairn/snapshots', sh(cwd, 'rev-parse', 'refs/cairn/snapshots^'));
    const v = await wake(clone);
    assert.equal(v.exit, 3); assert.equal(v.line, 'git fetch authority refs/cairn/snapshots:refs/cairn/snapshots');
  });
  // Kernel fix round 2, item 3: the re-reviewer's own exact reproduction from
  // kernel-re-review.md's "New Important finding" -- a second clone that fetched the log ref but
  // left refs/cairn/snapshots at a stale (real, older) value must be named by wake() itself as the
  // fetch repair, never as `cairn recover <tx>` for a start transaction that already completed
  // cleanly. Confirms both that validateAfterFetch(clone) and wake(clone) agree, and that wake()
  // never reaches the 'recover' predicate for this state.
  test("the re-reviewer's exact reproduction: a second clone with log fetched and snapshots stale names the fetch repair, never cairn recover", async () => {
    const { cwd, remote } = await started();
    await push(cwd);
    const clone = mkdtempSync(join(tmpdir(), 'cairn-clone-'));
    sh(clone, 'clone', '-q', '-o', 'authority', remote, '.');
    sh(clone, 'fetch', '-q', 'authority', 'refs/cairn/log:refs/cairn/log');
    sh(clone, 'update-ref', 'refs/cairn/snapshots', sh(cwd, 'rev-parse', 'refs/cairn/snapshots^'));
    const direct = await validateAfterFetch(clone);
    assert.deepEqual(direct.map((r) => [r.kind, r.ref, r.command]), [['fetch', 'refs/cairn/snapshots', 'git fetch authority refs/cairn/snapshots:refs/cairn/snapshots']]);
    const v = await wake(clone);
    assert.equal(v.exit, 3);
    assert.equal(v.line, 'git fetch authority refs/cairn/snapshots:refs/cairn/snapshots');
    assert.doesNotMatch(v.line, /cairn recover/);
  });
});

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
