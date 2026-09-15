#!/usr/bin/env node
// The harness hooks. One contract for every harness that passes JSON on
// standard input and reads standard output:
//   node bin/hook.mjs stop           refuse a stop while wake says Resolvable (PKG-018)
//   node bin/hook.mjs session-start  link the command if missing; print the verdict (PKG-019)
// The hooks judge with the kernel the command link resolves to, so the
// hook and the agent share one referee (PKG-021). Neither mode blocks
// outside a Cairn repository, and an error is one line on stderr and
// exit 0 (PKG-022).
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OWN = fileURLToPath(new URL("./cairn.mjs", import.meta.url));
const home = process.env.HOME, link = home ? join(home, ".local", "bin", "cairn") : null;
const input = () => { try { const v = process.stdin.isTTY ? {} : JSON.parse(readFileSync(0, "utf8")); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const root = (cwd) => {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  const top = r.status === 0 ? r.stdout.trim() : null;
  return top && existsSync(join(top, "docs", "spec", "roadmap.md")) ? top : null;
};
const linked = () => { try { const t = link && realpathSync(link); return t && /cairn\.mjs$/.test(t) ? t : null; } catch { return null; } };
const kernel = () => linked() ?? OWN;
const wake = (top) => spawnSync(process.execPath, [kernel(), "wake", "--root", top], { encoding: "utf8" });

try {
  const mode = process.argv[2], { cwd } = input();
  if (cwd !== undefined && typeof cwd !== "string") throw new Error("stdin cwd is not a string");
  const top = root(cwd ?? process.cwd());
  if (mode === "stop") {
    const w = top ? wake(top) : null;
    if (w && !w.error && /^Resolvable: /.test(w.stdout ?? "")) {
      process.stdout.write(JSON.stringify({ decision: "block", reason: `${w.stdout.trim()}\nAct on the named action, then run cairn wake again. Do not stop while the verdict is Resolvable (AGENTS.md).` }) + "\n");
    }
  } else if (mode === "session-start") {
    if (link) {
      const entry = lstatSync(link, { throwIfNoEntry: false });
      if (!entry || (entry.isSymbolicLink() && !linked())) {   // missing, or a link that resolves to nothing (PKG-019)
        mkdirSync(join(home, ".local", "bin"), { recursive: true });
        if (entry) unlinkSync(link);
        symlinkSync(OWN, link);
        process.stdout.write(`cairn: linked ${link} -> ${OWN}\n`);
      } else if (kernel() !== OWN) process.stdout.write(`cairn: the command on the path is another checkout, ${kernel()}; the hooks judge with that kernel\n`);
    }
    if (top) { const w = wake(top); process.stdout.write(`cairn wake:\n${w.stdout ?? ""}${w.stderr ?? ""}`); }
  } else {
    process.stderr.write("usage: node bin/hook.mjs stop | session-start\n");
  }
} catch (e) { process.stderr.write(`cairn hook: ${String(e.message ?? e).replace(/\s+/g, " ")}\n`); }
process.exit(0);
