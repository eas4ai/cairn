#!/usr/bin/env node
// The harness hooks. One contract for every harness that passes JSON on
// standard input and reads standard output:
//   node bin/hook.mjs stop           refuse a stop while wake says Resolvable (PKG-018)
//   node bin/hook.mjs session-start  link the command if missing; print the verdict (PKG-019)
// Neither mode blocks outside a Cairn repository or on an error.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const KERNEL = new URL("./cairn.mjs", import.meta.url).pathname;
const input = () => { try { return process.stdin.isTTY ? {} : JSON.parse(readFileSync(0, "utf8")); } catch { return {}; } };
const root = (cwd) => {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  const top = r.status === 0 ? r.stdout.trim() : null;
  return top && existsSync(join(top, "docs", "spec", "roadmap.md")) ? top : null;
};
const wake = (top) => spawnSync(process.execPath, [KERNEL, "wake", "--root", top], { encoding: "utf8" });

const mode = process.argv[2], cwd = input().cwd ?? process.cwd(), top = root(cwd);
if (mode === "stop") {
  const w = top ? wake(top) : null;
  if (w && !w.error && /^Resolvable: /.test(w.stdout ?? "")) {
    process.stdout.write(JSON.stringify({ decision: "block", reason: `${w.stdout.trim()}\nAct on the named action, then run cairn wake again. Do not stop while the verdict is Resolvable (AGENTS.md).` }) + "\n");
  }
} else if (mode === "session-start") {
  const home = process.env.HOME;
  const link = home ? join(home, ".local", "bin", "cairn") : null;
  if (link && !lstatSync(link, { throwIfNoEntry: false })) {
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync(KERNEL, link);
    process.stdout.write(`cairn: linked ${link} -> ${KERNEL}\n`);
  }
  if (top) { const w = wake(top); process.stdout.write(`cairn wake:\n${w.stdout ?? ""}${w.stderr ?? ""}`); }
} else {
  process.stderr.write("usage: node bin/hook.mjs stop | session-start\n");
  process.exit(2);
}
process.exit(0);
