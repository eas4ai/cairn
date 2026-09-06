import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { repo, cairn, git, records, head, CLI, passing } from "./helpers.mjs";

const setup = (source) => repo({
  ".cairn/mechanisms/m": passing("R-001", "R-002").replace("node -e 0", "node src/check.mjs").replace("src/other", "src/"),
  "src/check.mjs": source,
});
const start = (root) => {
  const child = spawn(process.execPath, [CLI, "check"], { cwd: root });
  let stdout = "", stderr = "";
  child.stdout.on("data", (b) => { stdout += b; }); child.stderr.on("data", (b) => { stderr += b; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject); child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  return { child, done };
};
const waitFor = async (path) => {
  for (let i = 0; i < 500 && !existsSync(path); i++) await delay(10);
  assert.ok(existsSync(path), `mechanism did not reach ${path}`);
};
const waiting = "import fs from 'node:fs'; if(fs.existsSync('.cairn/started')) fs.writeFileSync('.cairn/overlap','second run'); else { fs.writeFileSync('.cairn/started',String(process.pid)); const timer=setInterval(()=>{if(fs.existsSync('.cairn/release')) clearInterval(timer)},10); }\n";

for (const agentOwned of [false, true]) test(`LOOP-066: one check owns execution with ${agentOwned ? "an agent" : "a kernel"} action record`, async () => {
  const root = setup(waiting), ip = join(root, ".cairn/in-progress");
  const agentRecord = `action: run-mechanism\ntarget: m\nbase: ${head(root)}\n`;
  if (agentOwned) writeFileSync(ip, agentRecord);
  const first = start(root);
  try {
    await waitFor(join(root, ".cairn/started"));
    const before = readFileSync(ip, "utf8");
    const second = cairn(root, "check");
    assert.equal(second.status, 1, second.stdout + second.stderr);
    assert.match(second.stdout, /live process|check.*running/);
    assert.equal(existsSync(join(root, ".cairn/overlap")), false, "second mechanism never executes");
    assert.equal(records(root, "R-001").length, 0);
    assert.equal(readFileSync(ip, "utf8"), before, "another check cannot change the workflow record");
    assert.match(cairn(root, "wake").stdout, /live process/);
  } finally {
    writeFileSync(join(root, ".cairn/release"), "release\n");
    await first.done;
  }
  assert.equal(records(root, "R-001").length, 1);
  assert.equal(existsSync(join(root, ".git/cairn-check.lock")), false, "finished owner releases the lock");
  if (agentOwned) assert.equal(readFileSync(ip, "utf8"), agentRecord); else assert.equal(existsSync(ip), false);
});

for (const owner of ["live", "dead", "incomplete"]) test(`LOOP-066: a ${owner} lock is named and never silently overwritten`, () => {
  const root = setup("process.exit(0)\n"), path = join(root, ".git/cairn-check.lock");
  const pid = owner === "live" ? process.pid : git(root, "--version").pid;
  const text = owner === "incomplete" ? "" : `pid: ${pid}\nstarted: 2026-09-06T00:00:00Z\n`;
  writeFileSync(path, text);
  for (const command of ["wake", "check"]) {
    const r = cairn(root, command);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^Resolvable: reconcile/);
    assert.match(r.stdout, /cairn-check.lock/);
    if (owner === "live") assert.match(r.stdout, /live process/);
    else assert.match(r.stdout, /remove|inspect/);
    assert.equal(readFileSync(path, "utf8"), text);
    assert.equal(records(root, "R-001").length, 0);
  }
});

test("LOOP-066: an execution error releases the check lock for a corrected rerun", () => {
  const root = setup("process.exit(0)\n");
  // A directory in place of the evidence destination makes log creation fail.
  writeFileSync(join(root, ".cairn/evidence"), "not a directory");
  const r = cairn(root, "check");
  assert.equal(r.status, 3);
  assert.equal(existsSync(join(root, ".git/cairn-check.lock")), false);
  rmSync(join(root, ".cairn/evidence"));
  assert.match(cairn(root, "check").stdout, /recorded .*: pass/);
});

test("LOOP-066: a live kernel action from an older Cairn also blocks execution", () => {
  const root = setup("process.exit(0)\n"), ip = join(root, ".cairn/in-progress");
  const text = `owner: kernel\naction: run-mechanism\npid: ${process.pid}\n`;
  writeFileSync(ip, text);
  const r = cairn(root, "check");
  assert.equal(records(root, "R-001").length, 0, r.stdout);
  assert.match(r.stdout, /live process/);
  assert.equal(readFileSync(ip, "utf8"), text);
});

test("LOOP-066: separate Git worktrees can run checks independently", async () => {
  const root = setup(waiting), other = join(root, "..", `worktree-${root.split("/").at(-1)}`);
  assert.equal(git(root, "worktree", "add", "--detach", other).status, 0);
  const first = start(root), second = start(other);
  try {
    await Promise.all([waitFor(join(root, ".cairn/started")), waitFor(join(other, ".cairn/started"))]);
    assert.match(cairn(root, "wake").stdout, new RegExp(`live process ${first.child.pid}`));
    assert.match(cairn(other, "wake").stdout, new RegExp(`live process ${second.child.pid}`));
  } finally {
    for (const path of [root, other]) writeFileSync(join(path, ".cairn/release"), "release\n");
    await Promise.all([first.done, second.done]);
  }
  assert.equal(records(root, "R-001").length, 1);
  assert.equal(records(other, "R-001").length, 1);
});
