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
