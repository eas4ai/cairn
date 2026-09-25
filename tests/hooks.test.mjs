import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, lstatSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, throwawayRepo, fakeSudus, fingerprint, runHook, RESOLVABLE } from "./helpers/hookenv.mjs";

function env(dir, verdict) {
  const bin = join(dir, "fakebin");
  fakeSudus(bin, { stdout: verdict });
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
  const line = r.stdout.split("\n").find((l) => l.startsWith("sudus: missing"));
  assert.ok(line, r.stdout);
  for (const s of ["command link ~/.local/bin/sudus", "durable ref refs/sudus/log", "durable ref refs/sudus/snapshots"]) assert.ok(line.includes(s), line);
  assert.equal(r.status, 0);
});

test("session-start uses the plugin's own copy and says so when the sudus found runs another version", () => {
  const { dir } = throwawayRepo();
  const bin = join(dir, "fakebin");
  fakeSudus(bin, { stdout: "STALE VERDICT", version: "2.0.2" });
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") } });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("sudus: the sudus command found runs 2.0.2, this plugin is "), r.stdout);
  assert.ok(!r.stdout.includes("STALE VERDICT"), r.stdout);
});

// Issue #9: the shim runs $SUDUS_ROOT, else $CAIRN_ROOT, first. When that pin is the older version
// found, the hooks name the variable, not the shim, whose copy would change nothing.
test("every hook names SUDUS_ROOT or CAIRN_ROOT when it pins the older version found, and the shim otherwise", () => {
  for (const name of ["session-start.sh", "turn.sh", "stop.sh"]) {
    for (const pin of ["SUDUS_ROOT", "CAIRN_ROOT"]) {
      const { dir } = throwawayRepo();
      const bin = join(dir, "fakebin");
      fakeSudus(bin, { stdout: "PINNED VERDICT", version: "2.0.2" });
      const pinned = fakeRoot(join(dir, "old"), "2.0.2", "unused");
      const r = runHook(name, { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home"), [pin]: pinned } });
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes(`sudus: ${pin}=${pinned} pins Sudus 2.0.2, this plugin is `), `${name} ${pin}: ${r.stdout}`);
      assert.ok(r.stdout.includes(`The sudus command runs ${pin} first: unset it so it runs the newest installed Sudus, or point it at ${ROOT}.`), `${name} ${pin}: ${r.stdout}`);
      assert.ok(!r.stdout.includes("Install the shim"), `${name} ${pin}: ${r.stdout}`);
      assert.ok(!r.stdout.includes("PINNED VERDICT"), `${name} ${pin}: ${r.stdout}`);
    }
    const { dir } = throwawayRepo();
    const bin = join(dir, "fakebin");
    fakeSudus(bin, { stdout: "STALE VERDICT", version: "2.0.2" });
    const other = fakeRoot(join(dir, "other"), "2.9.0", "unused");
    const r = runHook(name, { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home"), SUDUS_ROOT: other, CAIRN_ROOT: other } });
    assert.ok(r.stdout.includes("sudus: the sudus command found runs 2.0.2, this plugin is "), `${name}: ${r.stdout}`);
    assert.ok(!r.stdout.includes("pins Sudus"), `${name}: ${r.stdout}`);
  }
});

test("session-start and turn use a sudus found that runs a newer version than this plugin, silently", () => {
  for (const name of ["session-start.sh", "turn.sh"]) {
    const { dir } = throwawayRepo();
    const bin = join(dir, "fakebin");
    fakeSudus(bin, { stdout: "NEWER VERDICT", version: "99.0.0" });
    const r = runHook(name, { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") } });
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("NEWER VERDICT"), `${name}: ${r.stdout}`);
    assert.ok(!r.stdout.includes("using the plugin copy"), `${name}: ${r.stdout}`);
  }
});
test("session-start falls back to the plugin copy when the sudus found cannot say its version", () => {
  const { dir } = throwawayRepo();
  const bin = join(dir, "fakebin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "sudus"), "#!/bin/sh\n[ \"$1\" = --version ] && exit 1\nprintf 'ANCIENT'\nexit 0\n"); chmodSync(join(bin, "sudus"), 0o755);
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") } });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("runs an older version, this plugin is"), r.stdout);
  assert.ok(!r.stdout.includes("ANCIENT"), r.stdout);
});
// A fake plugin root: package.json with a version and a bin/sudus.mjs that prints a marker.
function fakeRoot(dir, version, marker) {
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
  writeFileSync(join(dir, "bin", "sudus.mjs"), `process.stdout.write(${JSON.stringify(marker)});\n`);
  return dir;
}
const nodeDir = dirname(process.execPath);

test("the shim runs the newest installed Sudus across the Claude Code and Codex caches, or says how to install", () => {
  const { dir } = throwawayRepo();
  const shim = join(dir, "shim"); writeFileSync(shim, readFileSync(join(ROOT, "bin", "sudus.sh"))); chmodSync(shim, 0o755);
  const run = () => spawnSync("sh", [shim, "wake"], { encoding: "utf8", env: { HOME: dir, PATH: `${nodeDir}:/usr/bin:/bin` } });
  const none = run();
  assert.equal(none.status, 127); assert.ok(none.stderr.includes("run /install-sudus"), none.stderr);
  fakeRoot(join(dir, ".claude", "plugins", "cache", "m", "sudus", "2.0.2"), "2.0.2", "cache-2.0.2");
  fakeRoot(join(dir, ".claude", "plugins", "cache", "m", "sudus", "2.1.10"), "2.1.10", "cache-2.1.10");
  fakeRoot(join(dir, ".claude", "plugins", "cache", "m", "sudus", "2.1.9"), "2.1.9", "cache-2.1.9");
  assert.equal(run().stdout, "cache-2.1.10", "newest by numeric version, not by string order");
  fakeRoot(join(dir, ".codex", "plugins", "cache", "m", "sudus", "2.2.0"), "2.2.0", "codex-2.2.0");
  assert.equal(run().stdout, "codex-2.2.0", "the Codex cache is scanned too");
  const pinned = fakeRoot(join(dir, "pinned"), "1.0.0", "pinned");
  assert.equal(spawnSync("sh", [shim, "wake"], { encoding: "utf8", env: { HOME: dir, PATH: `${nodeDir}:/usr/bin:/bin`, SUDUS_ROOT: pinned } }).stdout, "pinned", "SUDUS_ROOT wins");
});

// Review of 3.8.2: `root="${SUDUS_ROOT:-${CAIRN_ROOT:-}}"` used the pin exactly as given, so a
// relative value made which file ran depend on the shell's current directory at the moment the
// shim was invoked. A pin that is not an absolute path is now refused before it is used at all;
// an absolute one still works as before (the "SUDUS_ROOT wins" case just above).
test("the shim refuses a relative SUDUS_ROOT or CAIRN_ROOT and accepts an absolute one", () => {
  const { dir } = throwawayRepo();
  const shim = join(dir, "shim"); writeFileSync(shim, readFileSync(join(ROOT, "bin", "sudus.sh"))); chmodSync(shim, 0o755);
  const pinned = fakeRoot(join(dir, "pinned"), "1.0.0", "pinned");
  for (const name of ["SUDUS_ROOT", "CAIRN_ROOT"]) {
    // cwd is `dir` and the pin is "pinned", the real root's own basename relative to it: were the
    // shim to use it as given, this would still resolve to a real root, proving the refusal below
    // is about the value being relative, not about the path being missing.
    const rel = spawnSync("sh", [shim, "wake"], { encoding: "utf8", cwd: dir, env: { HOME: dir, PATH: `${nodeDir}:/usr/bin:/bin`, [name]: "pinned" } });
    assert.notEqual(rel.status, 0, rel.stdout);
    assert.ok(rel.stderr.includes(`${name}=pinned is not an absolute path`), rel.stderr);
    assert.equal(rel.stdout, "");
  }
  const abs = spawnSync("sh", [shim, "wake"], { encoding: "utf8", env: { HOME: dir, PATH: `${nodeDir}:/usr/bin:/bin`, SUDUS_ROOT: pinned } });
  assert.equal(abs.stdout, "pinned");
});

// A machine with only the Muse plugin: Muse keeps it under ~/.local/share/muse/plugins/cache/<source>/
// sudus/<digest>/package/, which the shim did not scan, so every sudus command said no Sudus was
// installed.
test("the shim finds a Sudus installed only as a Muse plugin", () => {
  const { dir } = throwawayRepo();
  const shim = join(dir, "shim"); writeFileSync(shim, readFileSync(join(ROOT, "bin", "sudus.sh"))); chmodSync(shim, 0o755);
  const run = () => spawnSync("sh", [shim, "wake"], { encoding: "utf8", env: { HOME: dir, PATH: `${nodeDir}:/usr/bin:/bin` } });
  fakeRoot(join(dir, ".local", "share", "muse", "plugins", "cache", "local", "sudus", "bcf40d52", "package"), "3.5.4", "muse-3.5.4");
  assert.equal(run().stdout, "muse-3.5.4");
  fakeRoot(join(dir, ".claude", "plugins", "cache", "m", "sudus", "3.5.3"), "3.5.3", "cache-3.5.3");
  assert.equal(run().stdout, "muse-3.5.4", "the newest version wins across harnesses");
});

test("session-start names a missing PATH entry when only the link exists", () => {
  const { dir } = throwawayRepo();
  const home = join(dir, "home");
  fakeSudus(join(home, ".local", "bin"), { stdout: RESOLVABLE });
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: home } });
  assert.ok(r.stdout.includes("sudus: missing PATH entry ~/.local/bin"), r.stdout);
  assert.ok(r.stdout.includes(RESOLVABLE));
});

test("session-start prints the exit-3 line verbatim and still exits 0", () => {
  const { dir } = throwawayRepo();
  const bin = join(dir, "fakebin");
  fakeSudus(bin, { stdout: "sudus: not a Sudus project; run /new-project or /existing-project\n", exit: 3 });
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
  test(`${name} does not create a record: refs/sudus/* stay absent`, () => {
    const { dir, git } = throwawayRepo();
    runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(git("for-each-ref", "refs/sudus").trim(), "");
  });
  test(`${name} does not edit a file: the worktree fingerprint is unchanged`, () => {
    const { dir } = throwawayRepo();
    // Deviation from the plan text: env(dir, RESOLVABLE) writes the fake sudus binary under
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
