// The harness hooks: a stop is refused while wake says Resolvable and
// allowed otherwise; session start links the command and prints the
// verdict; neither blocks outside a Cairn repository.
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readlinkSync, lstatSync, mkdirSync, cpSync, writeFileSync, appendFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo as base, cairn, commit, review, fromFile } from "./helpers.mjs";

const HOOK = fileURLToPath(new URL("../bin/hook.mjs", import.meta.url));
const KERNEL = fileURLToPath(new URL("../bin/cairn.mjs", import.meta.url));
const hook = (mode, cwd, env = {}, event = {}) => spawnSync(process.execPath, [HOOK, mode], { cwd, encoding: "utf8", input: JSON.stringify({ cwd, hook_event_name: mode, ...event }), env: { ...process.env, ...env } });
const repo = () => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
const escalate = (root) => cairn(root, "escalate", "--concerns", "R-001", "--question", "q", "--recommend", "x", "--because", "y", "--if-wrong", "z", "--instead", "w");

test("the stop hook refuses a stop while wake says Resolvable, with the verdict as the reason (PKG-018)", () => {
  const root = repo();
  const r = hook("stop", root, {}, { stop_hook_active: false });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.decision, "block");
  assert.match(out.reason, /^Resolvable: run R-001/); assert.match(out.reason, /cairn wake again/);
});

test("the stop hook allows a stop at Done, at Escalate, and outside a Cairn repository (PKG-018)", () => {
  const root = repo(); cairn(root, "check"); review(root); commit(root, "green");
  assert.match(cairn(root, "wake").stdout, /^Done: /);
  let r = hook("stop", root); assert.equal(r.status, 0); assert.equal(r.stdout, "");
  escalate(root); commit(root, "ask");
  assert.match(cairn(root, "wake").stdout, /^Escalate: /);
  r = hook("stop", root); assert.equal(r.status, 0); assert.equal(r.stdout, "");
  const plain = mkdtempSync(join(tmpdir(), "not-cairn-"));
  r = hook("stop", plain); assert.equal(r.status, 0); assert.equal(r.stdout, "");
});

test("the session-start hook links the command once and prints the verdict in a Cairn repository (PKG-019, PKG-014, PKG-005)", () => {
  const root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  let r = hook("session-start", root, { HOME: home }, { source: "startup" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cairn: linked /); assert.match(r.stdout, /cairn wake:\nResolvable: run R-001/);
  assert.equal(readlinkSync(join(home, ".local/bin/cairn")), KERNEL);
  const linked = spawnSync(join(home, ".local/bin/cairn"), ["wake"], { cwd: root, encoding: "utf8" });
  assert.match(linked.stdout, /^Resolvable: run R-001/, "the linked cairn runs");
  r = hook("session-start", root, { HOME: home }, { source: "resume" });
  assert.equal(r.status, 0); assert.doesNotMatch(r.stdout, /linked/); assert.match(r.stdout, /Resolvable: run R-001/);
  assert.equal(readlinkSync(join(home, ".local/bin/cairn")), KERNEL, "the link is kept");
});

test("the session-start hook prints no verdict outside a Cairn repository and leaves an existing link alone (PKG-019)", () => {
  const home = mkdtempSync(join(tmpdir(), "cairn-home-")), plain = mkdtempSync(join(tmpdir(), "not-cairn-"));
  spawnSync("mkdir", ["-p", join(home, ".local/bin")]); spawnSync("ln", ["-s", "/elsewhere/cairn", join(home, ".local/bin/cairn")]);
  const r = hook("session-start", plain, { HOME: home });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Resolvable|Done|Escalate|linked/);
  assert.equal(readlinkSync(join(home, ".local/bin/cairn")), "/elsewhere/cairn");
  assert.ok(lstatSync(join(home, ".local/bin/cairn")).isSymbolicLink());
});

// A copy of bin/ at another path, optionally altered so its kernel digest differs.
const copy = (dir, alter = false) => { mkdirSync(join(dir, "bin"), { recursive: true }); cpSync(join(KERNEL, ".."), join(dir, "bin"), { recursive: true }); if (alter) appendFileSync(join(dir, "bin/cairn.mjs"), "\n// another checkout\n"); return join(dir, "bin"); };
const hookFrom = (bin, mode, cwd, env = {}, input = JSON.stringify({ cwd })) => spawnSync(process.execPath, [join(bin, "hook.mjs"), mode], { cwd, encoding: "utf8", input, env: { ...process.env, ...env } });

test("a checkout under a path with a space links a command that resolves, and its stop hook still blocks (PKG-019, PKG-021)", () => {
  const bin = copy(mkdtempSync(join(tmpdir(), "cairn with space-"))), root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  const r = hookFrom(bin, "session-start", root, { HOME: home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cairn: linked /); assert.match(r.stdout, /Resolvable: run R-001/);
  assert.ok(existsSync(realpathSync(join(home, ".local/bin/cairn"))), "the link resolves");
  assert.match(JSON.parse(hookFrom(bin, "stop", root, { HOME: home }).stdout).reason, /^Resolvable: run R-001/);
});

test("the hooks run the kernel the command link resolves to, so hook and agent share one referee (PKG-021, LOOP-096)", () => {
  const other = copy(mkdtempSync(join(tmpdir(), "cairn-other-")), true), root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  mkdirSync(join(home, ".local/bin"), { recursive: true }); spawnSync("ln", ["-s", join(other, "cairn.mjs"), join(home, ".local/bin/cairn")]);
  const otherCairn = (...a) => spawnSync(process.execPath, [join(other, "cairn.mjs"), ...a], { cwd: root, encoding: "utf8" });
  otherCairn("check"); review(root); commit(root, "green under the other kernel");
  assert.match(otherCairn("wake").stdout, /^Done: /);
  assert.match(cairn(root, "wake").stdout, /the kernel changed/, "this checkout's kernel disagrees");
  let r = hook("stop", root, { HOME: home });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, "", "the hook judged with the linked kernel");
  r = hook("session-start", root, { HOME: home });
  assert.match(r.stdout, /Done: /); assert.match(r.stdout, /another checkout|linked kernel/);
});

test("a dangling link is replaced and reported (PKG-019)", () => {
  const root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  mkdirSync(join(home, ".local/bin"), { recursive: true }); spawnSync("ln", ["-s", "/nowhere/cairn.mjs", join(home, ".local/bin/cairn")]);
  const r = hook("session-start", root, { HOME: home });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /cairn: linked /);
  assert.equal(readlinkSync(join(home, ".local/bin/cairn")), KERNEL);
});

test("errors exit 0 with one line on standard error and no stack trace (PKG-022)", () => {
  const root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  let r = hookFrom(join(KERNEL, ".."), "stop", root, {}, JSON.stringify({ cwd: 5 }));
  assert.equal(r.status, 0); assert.equal(r.stdout, ""); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); assert.doesNotMatch(r.stderr, /\n\s+at /);
  mkdirSync(join(home, ".local")); writeFileSync(join(home, ".local/bin"), "not a directory\n");
  r = hook("session-start", root, { HOME: home });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); assert.doesNotMatch(r.stderr, /\n\s+at /);
});
