// The harness hooks: a stop is refused while wake says Resolvable and
// allowed otherwise; session start links the command and prints the
// verdict; neither blocks outside a Cairn repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo as base, cairn, commit, review, fromFile } from "./helpers.mjs";

const HOOK = new URL("../bin/hook.mjs", import.meta.url).pathname;
const KERNEL = new URL("../bin/cairn.mjs", import.meta.url).pathname;
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
