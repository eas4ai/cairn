import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, throwawayRepo, fakeCairn, fingerprint, runHook, RESOLVABLE } from "./helpers/hookenv.mjs";

function env(dir, verdict) {
  const bin = join(dir, "fakebin");
  fakeCairn(bin, { stdout: verdict });
  return { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") };
}

test("session-start prints verdict, action, reason and predicate and exits 0", () => {
  const { dir } = throwawayRepo();
  const r = runHook("session-start.sh", { cwd: dir, env: env(dir, RESOLVABLE) });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes(RESOLVABLE), r.stdout);
});

test("session-start names a missing link and durable refs in one line", () => {
  const { dir } = throwawayRepo();
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: join(dir, "home") } });
  const line = r.stdout.split("\n").find((l) => l.startsWith("cairn: missing"));
  assert.ok(line, r.stdout);
  for (const s of ["command link ~/.local/bin/cairn", "durable ref refs/cairn/log", "durable ref refs/cairn/snapshots"]) assert.ok(line.includes(s), line);
  assert.equal(r.status, 0);
});

test("session-start names a missing PATH entry when only the link exists", () => {
  const { dir } = throwawayRepo();
  const home = join(dir, "home");
  fakeCairn(join(home, ".local", "bin"), { stdout: RESOLVABLE });
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: home } });
  assert.ok(r.stdout.includes("cairn: missing PATH entry ~/.local/bin"), r.stdout);
  assert.ok(r.stdout.includes(RESOLVABLE));
});

test("session-start prints the exit-3 line verbatim and still exits 0", () => {
  const { dir } = throwawayRepo();
  const bin = join(dir, "fakebin");
  fakeCairn(bin, { stdout: "cairn: not a Cairn project; run /new-project or /existing-project\n", exit: 3 });
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") } });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("run /new-project or /existing-project"), r.stdout);
  assert.ok(!r.stdout.includes("wake exited"), r.stdout);
});

for (const name of ["session-start.sh", "turn.sh", "stop.sh"]) {
  test(`${name} prints the wake line and exits 0`, () => {
    const { dir } = throwawayRepo();
    const r = runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(r.status, 0); assert.ok(r.stdout.includes(RESOLVABLE), r.stdout);
  });
  test(`${name} does not refuse a stop: no JSON decision on a Resolvable verdict`, () => {
    const { dir } = throwawayRepo();
    const r = runHook(name, { cwd: dir, env: env(dir, RESOLVABLE), stdin: JSON.stringify({ hook_event_name: "Stop", cwd: dir }) });
    assert.equal(r.status, 0);
    assert.ok(!/"decision"\s*:\s*"block"/.test(r.stdout), r.stdout);
    assert.ok(!r.stdout.trimStart().startsWith("{"), r.stdout);
  });
  test(`${name} does not count refusals: nothing appears below the Git directory after four runs`, () => {
    const { dir, git } = throwawayRepo();
    const gitDir = join(dir, git("rev-parse", "--git-dir").trim());
    const before = fingerprint(gitDir);
    for (let i = 0; i < 4; i++) runHook(name, { cwd: dir, env: env(dir, RESOLVABLE), stdin: JSON.stringify({ session_id: "s1" }) });
    assert.equal(fingerprint(gitDir), before);
  });
  test(`${name} does not create a record: refs/cairn/* stay absent`, () => {
    const { dir, git } = throwawayRepo();
    runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(git("for-each-ref", "refs/cairn").trim(), "");
  });
  test(`${name} does not edit a file: the worktree fingerprint is unchanged`, () => {
    const { dir } = throwawayRepo();
    // Deviation from the plan text: env(dir, RESOLVABLE) writes the fake cairn binary under
    // dir/fakebin, inside the same worktree this test fingerprints. The plan's own literal code
    // took the "before" fingerprint first and called env() only as an inline argument to
    // runHook(), so the fakebin directory it creates always landed after the snapshot and always
    // showed up as a worktree change -- failing this test even for the already-correct
    // session-start.sh from Task 1. Fingerprinting after the fixture is in place isolates what the
    // hook itself does, which is the property this test names.
    const e = env(dir, RESOLVABLE);
    const before = fingerprint(dir);
    runHook(name, { cwd: dir, env: e });
    assert.equal(fingerprint(dir), before);
  });
  test(`${name} does not commit: HEAD unchanged, index clean`, () => {
    const { dir, git } = throwawayRepo();
    // Same deviation as above: compare status before/after the fixture is in place, rather than
    // asserting an unconditionally empty status, since dir/fakebin is untracked scaffolding, not a
    // hook action.
    const e = env(dir, RESOLVABLE);
    const head = git("rev-parse", "HEAD");
    const statusBefore = git("status", "--porcelain");
    runHook(name, { cwd: dir, env: e });
    assert.equal(git("rev-parse", "HEAD"), head); assert.equal(git("status", "--porcelain"), statusBefore);
  });
  test(`${name} does not push: a bare remote's refs are unchanged`, () => {
    const { dir, git } = throwawayRepo();
    const remote = throwawayRepo();
    git("remote", "add", "origin", remote.dir);
    const before = remote.git("for-each-ref");
    runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(remote.git("for-each-ref"), before);
  });
  test(`${name} does not call a model: the script names no network file, tool or key`, () => {
    const text = readFileSync(join(ROOT, "hooks", name), "utf8");
    for (const s of ["typesafeai", "curl", "wget", "fetch(", "TYPESAFEAI_API_KEY", "https://"]) assert.ok(!text.includes(s), `${name} mentions ${s}`);
  });
  test(`${name} does not complete an action: wake prints the same verdict before and after`, () => {
    const { dir } = throwawayRepo();
    const e = env(dir, RESOLVABLE);
    const first = runHook(name, { cwd: dir, env: e }).stdout, second = runHook(name, { cwd: dir, env: e }).stdout;
    assert.equal(second, first); assert.ok(first.includes("Resolvable: implement REQ-001"));
  });
}
