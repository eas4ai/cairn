// The harness hooks: a stop is refused while wake says Resolvable and
// allowed otherwise; session start links the command and prints the
// verdict; neither blocks outside a Cairn repository.
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readlinkSync, lstatSync, mkdirSync, cpSync, writeFileSync, appendFileSync, existsSync, realpathSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo as base, cairn, commit, review, fromFile } from "./helpers.mjs";

const HOOK = fileURLToPath(new URL("../bin/hook.mjs", import.meta.url));
// A PATH with git and the shell but no cairn: the machine's own command must not judge these fixtures (PKG-033).
const BARE = "/usr/bin:/bin";
const KERNEL = fileURLToPath(new URL("../bin/cairn.mjs", import.meta.url));
// A scratch HOME by default: the real one may link a different checkout, and the hooks judge with the linked kernel (PKG-021).
const hook = (mode, cwd, env = {}, event = {}) => spawnSync(process.execPath, [HOOK, mode], { cwd, encoding: "utf8", input: JSON.stringify({ cwd, hook_event_name: mode, ...event }), env: { ...process.env, PATH: BARE, HOME: mkdtempSync(join(tmpdir(), "cairn-home-")), ...env } });
const repo = () => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
const escalate = (root) => cairn(root, "escalate", "--concerns", "R-001", "--question", "q", "--recommend", "x", "--because", "y", "--if-wrong", "z", "--instead", "w");

test("a working directory that no longer exists is named as the failure, and git is not blamed (PKG-041, PKG-022)", () => {
  const gone = mkdtempSync(join(tmpdir(), "cairn-gone-")); rmSync(gone, { recursive: true });
  const file = join(mkdtempSync(join(tmpdir(), "cairn-file-")), "a-file"); writeFileSync(file, "x\n");   // exists, but is not a directory
  for (const cwd of [gone, file]) for (const mode of ["stop", "session-start"]) {
    const r = spawnSync(process.execPath, [HOOK, mode], { cwd: tmpdir(), encoding: "utf8", input: JSON.stringify({ cwd, hook_event_name: mode }), env: { ...process.env, PATH: BARE, HOME: mkdtempSync(join(tmpdir(), "cairn-home-")) } });
    assert.equal(r.status, 0, mode + ": " + r.stderr); assert.doesNotMatch(r.stdout, /decision/, mode + " must not block");
    assert.equal(r.stderr.trim().split("\n").length, 1, mode + ": one line: " + r.stderr);
    assert.match(r.stderr, /^cairn hook: working directory .* does not exist or is not a directory/, mode + ": " + r.stderr); assert.ok(r.stderr.includes(cwd)); assert.doesNotMatch(r.stderr, /cannot run git/, mode + ": " + r.stderr);
  }
});

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

test("the session-start hook prints no verdict outside a Cairn repository and leaves an existing link that resolves alone (PKG-019)", () => {
  const home = mkdtempSync(join(tmpdir(), "cairn-home-")), plain = mkdtempSync(join(tmpdir(), "not-cairn-")), elsewhere = join(mkdtempSync(join(tmpdir(), "elsewhere-")), "cairn.mjs");
  writeFileSync(elsewhere, "// another kernel\n");
  spawnSync("mkdir", ["-p", join(home, ".local/bin")]); spawnSync("ln", ["-s", elsewhere, join(home, ".local/bin/cairn")]);
  const r = hook("session-start", plain, { HOME: home });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Resolvable|Done|Escalate|linked /);
  assert.equal(readlinkSync(join(home, ".local/bin/cairn")), elsewhere);
  assert.ok(lstatSync(join(home, ".local/bin/cairn")).isSymbolicLink());
});

// A copy of bin/ at another path, optionally altered so its kernel digest differs.
const copy = (dir, alter = false) => { mkdirSync(join(dir, "bin"), { recursive: true }); cpSync(join(KERNEL, ".."), join(dir, "bin"), { recursive: true }); if (alter) appendFileSync(join(dir, "bin/cairn.mjs"), "\n// another checkout\n"); return join(dir, "bin"); };
const hookFrom = (bin, mode, cwd, env = {}, input = JSON.stringify({ cwd })) => spawnSync(process.execPath, [join(bin, "hook.mjs"), mode], { cwd, encoding: "utf8", input, env: { ...process.env, PATH: BARE, ...env } });

test("a checkout under a path with a space links a command that resolves, and its stop hook still blocks (PKG-019, PKG-021)", () => {
  const bin = copy(mkdtempSync(join(tmpdir(), "cairn with space-"))), root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  const r = hookFrom(bin, "session-start", root, { HOME: home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cairn: linked /); assert.match(r.stdout, /Resolvable: run R-001/);
  assert.ok(existsSync(realpathSync(join(home, ".local/bin/cairn"))), "the link resolves");
  assert.match(JSON.parse(hookFrom(bin, "stop", root, { HOME: home }).stdout).reason, /^Resolvable: run R-001/);
});

test("the hooks run the kernel the command link resolves to, so hook and agent share one referee (PKG-021)", () => {
  const other = copy(mkdtempSync(join(tmpdir(), "cairn-other-")), true), root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  mkdirSync(join(home, ".local/bin"), { recursive: true }); spawnSync("ln", ["-s", join(other, "cairn.mjs"), join(home, ".local/bin/cairn")]);
  const otherCairn = (...a) => spawnSync(process.execPath, [join(other, "cairn.mjs"), ...a], { cwd: root, encoding: "utf8" });
  otherCairn("check"); review(root); commit(root, "green under the other kernel");
  assert.match(otherCairn("wake").stdout, /^Done: /);
  assert.match(cairn(root, "wake").stdout, /the kernel changed/, "this checkout's kernel disagrees");
  let r = hook("stop", root, { HOME: home });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, "", "the hook judged with the linked kernel");
  r = hook("session-start", root, { HOME: home });
  assert.match(r.stdout, /Done: /); assert.match(r.stdout, /judge with/);
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

// A wrapper script named cairn that runs another checkout's kernel, the shape npm link or a hand-written launcher gives.
const wrapper = (other) => { const dir = mkdtempSync(join(tmpdir(), "cairn-path-")); writeFileSync(join(dir, "cairn"), `#!/bin/sh\nexec "${process.execPath}" "${join(other, "cairn.mjs")}" "$@"\n`); chmodSync(join(dir, "cairn"), 0o755); return dir; };

test("the hooks judge with the cairn on PATH, a wrapper included, and session-start names it (PKG-033)", () => {
  const other = copy(mkdtempSync(join(tmpdir(), "cairn-other-")), true), root = repo(), dir = wrapper(other);
  const otherCairn = (...a) => spawnSync(process.execPath, [join(other, "cairn.mjs"), ...a], { cwd: root, encoding: "utf8" });
  otherCairn("check"); review(root); commit(root, "green under the other kernel");
  assert.match(otherCairn("wake").stdout, /^Done: /); assert.match(cairn(root, "wake").stdout, /the kernel changed/);
  let r = hook("stop", root, { PATH: `${dir}:${BARE}` });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, "", "judged with the wrapper's kernel"); assert.equal(r.stderr, "");
  r = hook("session-start", root, { PATH: `${dir}:${BARE}` });
  assert.match(r.stdout, /judge with .*cairn-path-/); assert.match(r.stdout, /Done: /);
  r = hook("session-start", root);
  assert.doesNotMatch(r.stdout, /judge with/, "this checkout's own kernel is not announced");
});

test("a link to a wrapper or file is kept; a dangling link or one to a directory is replaced (PKG-034)", () => {
  const root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-")), other = copy(mkdtempSync(join(tmpdir(), "cairn-other-"))), dir = wrapper(other);
  mkdirSync(join(home, ".local/bin"), { recursive: true }); spawnSync("ln", ["-s", join(dir, "cairn"), join(home, ".local/bin/cairn")]);
  let r = hook("session-start", root, { HOME: home });
  assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.stdout, /linked /); assert.equal(readlinkSync(join(home, ".local/bin/cairn")), join(dir, "cairn"));
  assert.match(r.stdout, /judge with/); assert.match(r.stdout, /Resolvable: run R-001/);
  spawnSync("ln", ["-sfn", "/nowhere/cairn", join(home, ".local/bin/cairn")]);
  r = hook("session-start", root, { HOME: home });
  assert.match(r.stdout, /linked /); assert.equal(readlinkSync(join(home, ".local/bin/cairn")), KERNEL);
  const folder = join(mkdtempSync(join(tmpdir(), "cairn-dir-")), "cairn.mjs"); mkdirSync(folder);   // a link to a directory resolves to no file
  spawnSync("ln", ["-sfn", folder, join(home, ".local/bin/cairn")]);
  r = hook("session-start", root, { HOME: home });
  assert.match(r.stdout, /linked /, r.stdout + r.stderr); assert.equal(readlinkSync(join(home, ".local/bin/cairn")), KERNEL); assert.doesNotMatch(r.stdout, /judge with/); assert.match(r.stdout, /Resolvable: run R-001/);
});

test("a project below the Git toplevel gets the verdict and the stop refusal (PKG-035)", () => {
  const top = repo(), project = join(top, "packages/app");
  for (const d of ["docs/spec", "docs/commitments", "docs/decisions", ".cairn/mechanisms", "src"]) mkdirSync(join(project, d), { recursive: true });
  writeFileSync(join(project, "docs/spec/roadmap.md"), "# Roadmap\n\nCurrent: first\n");
  writeFileSync(join(project, "docs/spec/test.md"), readFileSync(join(top, "docs/spec/test.md"), "utf8"));
  writeFileSync(join(project, "docs/commitments/first.md"), "# First\n\nSlug: first\nRequirements: R-001, R-002\n");
  writeFileSync(join(project, ".cairn/mechanisms/m"), fromFile("R-001", "R-002")); writeFileSync(join(project, "src/exit"), "0\n");
  commit(top, "nested project");
  let r = hook("stop", join(project, "src"));
  assert.equal(r.status, 0, r.stderr); assert.match(JSON.parse(r.stdout).reason, /^Resolvable: run R-001/, "judged the nested project from a subdirectory of it");
  r = hook("session-start", project);
  assert.match(r.stdout, /cairn wake:\nResolvable: run R-001/);
});

test("a kernel that prints no verdict is one stderr line: the stop is allowed and session-start prints no trace (PKG-036)", () => {
  const root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-")), broken = mkdtempSync(join(tmpdir(), "cairn-broken-"));
  writeFileSync(join(broken, "cairn.mjs"), "throw new Error('kernel crashed');\n");
  mkdirSync(join(home, ".local/bin"), { recursive: true }); spawnSync("ln", ["-s", join(broken, "cairn.mjs"), join(home, ".local/bin/cairn")]);
  let r = hook("stop", root, { HOME: home });
  assert.equal(r.status, 0); assert.equal(r.stdout, "", "no block"); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); assert.match(r.stderr, /no verdict/);
  r = hook("session-start", root, { HOME: home });
  assert.equal(r.status, 0); assert.doesNotMatch(r.stdout + r.stderr, /^\s+at /m, r.stdout + r.stderr); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); assert.match(r.stderr, /no verdict/);
});

test("a link that cannot be created is one stderr line, and the verdict still prints (PKG-019, PKG-022)", (t) => {
  if (process.getuid?.() === 0) return t.skip("root writes everywhere");
  const root = repo(), home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  mkdirSync(join(home, ".local/bin"), { recursive: true }); chmodSync(join(home, ".local/bin"), 0o555);
  const r = hook("session-start", root, { HOME: home });
  chmodSync(join(home, ".local/bin"), 0o755);
  assert.equal(r.status, 0); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); assert.match(r.stdout, /cairn wake:\nResolvable: run R-001/, r.stdout);
});

test("with git absent the hooks say so in one line and block nothing (PKG-022)", () => {
  const root = repo();
  let r = hook("stop", root, { PATH: "/nonexistent" });
  assert.equal(r.status, 0); assert.equal(r.stdout, ""); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); assert.match(r.stderr, /git/);
  r = hook("session-start", root, { PATH: "/nonexistent" });
  assert.equal(r.status, 0); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr);
});

test("the stop hook gives way once it has refused: stop_hook_active true prints the verdict and returns no block decision (PKG-018)", () => {
  const root = repo();
  const r = hook("stop", root, {}, { stop_hook_active: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Resolvable: run R-001/, r.stdout); assert.doesNotMatch(r.stdout, /"decision"/, r.stdout);
});
