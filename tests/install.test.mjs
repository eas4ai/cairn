// scripts/link.sh: Cairn onto the path and its skills into a skill
// directory, in a temporary home, and the linked cairn runs (PKG-014).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo } from "./helpers.mjs";

const SCRIPT = new URL("../scripts/link.sh", import.meta.url).pathname;
const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const run = (home, ...a) => spawnSync("bash", [SCRIPT, "--bin", join(home, "bin"), "--skills", join(home, "skills"), ...a], { encoding: "utf8", env: { ...process.env, HOME: home } });
const home = () => mkdtempSync(join(tmpdir(), "cairn-home-"));

test("the script links cairn and the skills, and the linked cairn runs (PKG-014, PKG-005)", () => {
  const h = home();
  const r = run(h);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readlinkSync(join(h, "bin/cairn")), join(REPO, "bin/cairn.mjs"));
  for (const s of ["new-project", "existing-project"]) assert.ok(existsSync(join(h, "skills", s, "SKILL.md")), s);
  const w = spawnSync(join(h, "bin/cairn"), ["wake"], { cwd: repo(), encoding: "utf8" });
  assert.equal(w.status, 1, w.stdout + w.stderr);
  assert.match(w.stdout, /^Resolvable: /);
  const again = run(h);
  assert.equal(again.status, 0, "a second run is the same as one");
  assert.match(again.stdout, /^kept /m);
});

test("a link owned by another package is kept; --force replaces it; --unlink removes ours and leaves a stranger's", () => {
  const h = home();
  mkdirSync(join(h, "skills"), { recursive: true });
  symlinkSync("/elsewhere/new-project", join(h, "skills/new-project"));
  let r = run(h);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /kept .*new-project -> \/elsewhere\/new-project; pass --force/);
  assert.equal(readlinkSync(join(h, "skills/new-project")), "/elsewhere/new-project");
  r = run(h, "--force");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readlinkSync(join(h, "skills/new-project")), join(REPO, "skills/new-project"));
  symlinkSync("/elsewhere/other", join(h, "skills/other"));
  r = run(h, "--unlink");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lstatSync(join(h, "bin/cairn"), { throwIfNoEntry: false }), undefined);
  assert.equal(lstatSync(join(h, "skills/new-project"), { throwIfNoEntry: false }), undefined);
  assert.equal(readlinkSync(join(h, "skills/other")), "/elsewhere/other", "a stranger's link survives unlink");
});

test("--force never replaces a real directory", () => {
  const h = home();
  mkdirSync(join(h, "skills/new-project"), { recursive: true });
  const r = run(h, "--force");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a link; remove it yourself/);
  assert.ok(!lstatSync(join(h, "skills/new-project")).isSymbolicLink());
});
