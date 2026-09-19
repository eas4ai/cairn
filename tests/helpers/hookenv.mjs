import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(new URL("../..", import.meta.url).pathname);

export function throwawayRepo() {
  const dir = mkdtempSync(join(tmpdir(), "cairn-hook-"));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout;
  };
  git("init", "-q", "-b", "main"); git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "throwaway\n"); git("add", "README.md"); git("commit", "-q", "-m", "first");
  return { dir, git };
}

export function fakeCairn(binDir, { stdout, exit = 0 }) {
  mkdirSync(binDir, { recursive: true });
  const p = join(binDir, "cairn");
  writeFileSync(p, `#!/bin/sh\nprintf '%s' '${stdout.replace(/'/g, "'\\''")}'\nexit ${exit}\n`);
  chmodSync(p, 0o755);
  return p;
}

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.name === "index.lock") continue;
    if (e.isDirectory()) walk(p, out); else out.push([p, readFileSync(p)]);
  }
  return out;
}

export function fingerprint(dir) {
  const h = createHash("sha256");
  for (const [p, bytes] of walk(dir, []).sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(p).update("\0").update(bytes).update("\0");
  return h.digest("hex");
}

export function runHook(name, { cwd, env = {}, stdin = "{}" }) {
  const r = spawnSync("sh", [join(ROOT, "hooks", name)], { cwd, input: stdin, encoding: "utf8", env: { HOME: cwd, PATH: "/usr/bin:/bin", ...env } });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

export const RESOLVABLE = "Resolvable: implement REQ-001\nreason: the current receipt for REQ-001 says fail\npredicate: a current receipt says pass and review metadata binds the requirement to the current definition and text digests with a fail receipt\n";
