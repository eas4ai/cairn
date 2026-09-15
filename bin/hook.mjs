#!/usr/bin/env node
// The harness hooks. One contract for every harness that passes JSON on
// standard input and reads standard output:
//   node bin/hook.mjs stop           refuse a stop while wake says Resolvable (PKG-018)
//   node bin/hook.mjs session-start  link the command if missing; print the verdict (PKG-019)
// The hooks judge with the cairn command the agent runs: the one on PATH,
// else the command link's target, else this checkout's kernel (PKG-021,
// PKG-033). The project is the nearest docs/spec/roadmap.md at or above
// cwd inside the Git working tree (PKG-035). An error is one line on
// stderr and exit 0 (PKG-022); a kernel that prints no verdict is
// reported the same way and never blocks (PKG-036).
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OWN = fileURLToPath(new URL("./cairn.mjs", import.meta.url));
const home = process.env.HOME, link = home ? join(home, ".local", "bin", "cairn") : null;
const input = () => { try { const v = process.stdin.isTTY ? {} : JSON.parse(readFileSync(0, "utf8")); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();
const complain = (e) => process.stderr.write(`cairn hook: ${oneLine(e.message ?? e)}\n`);
const resolves = (p) => { try { return statSync(p).isFile() ? realpathSync(p) : null; } catch { return null; } };
// The project: the nearest roadmap at or above cwd, inside the Git working tree (PKG-035).
const root = (cwd) => {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (r.error) throw new Error(`cannot run git: ${r.error.message}`);
  if (r.status !== 0) return null;
  const top = realpathSync(r.stdout.trim());
  for (let d = realpathSync(cwd); d === top || d.startsWith(top + "/"); d = dirname(d)) if (existsSync(join(d, "docs", "spec", "roadmap.md"))) return d;
  return null;
};
// The command the agent runs: cairn on PATH, else the link's target, else this kernel (PKG-021, PKG-033).
const onPath = () => (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((d) => join(d, "cairn")).find(resolves) ?? null;
const kernel = () => { const p = onPath() ?? (link && resolves(link)) ?? OWN; return /\.mjs$/.test(p) ? [process.execPath, [p]] : [p, []]; };   // a wrapper or copy runs as itself
const wake = (top) => { const [cmd, args] = kernel(); return spawnSync(cmd, [...args, "wake", "--root", top], { encoding: "utf8" }); };
const judged = (w) => !w.error && /^(?:Resolvable|Escalate|Done): /.test(w.stdout ?? "");
const noVerdict = (w) => `the kernel ${kernel().flat().join(" ")} printed no verdict: ${oneLine(w.error?.message ?? (w.stderr ?? "").split("\n").find(Boolean) ?? `exit ${w.status}`)}`;

try {
  const mode = process.argv[2], { cwd } = input();
  if (cwd !== undefined && typeof cwd !== "string") throw new Error("stdin cwd is not a string");
  const top = root(cwd ?? process.cwd());
  if (mode === "stop") {
    const w = top ? wake(top) : null;
    if (w && !judged(w)) complain(noVerdict(w));   // never blocks on a kernel it cannot read (PKG-036)
    else if (w && /^Resolvable: /.test(w.stdout)) process.stdout.write(JSON.stringify({ decision: "block", reason: `${w.stdout.trim()}\nAct on the named action, then run cairn wake again. Do not stop while the verdict is Resolvable (AGENTS.md).` }) + "\n");
  } else if (mode === "session-start") {
    try {   // the link is not the verdict: a failure here is one line, and the verdict still prints (PKG-019, PKG-022)
      const entry = link && lstatSync(link, { throwIfNoEntry: false });
      if (link && (!entry || (entry.isSymbolicLink() && !existsSync(link)))) {   // missing, or a link whose target does not exist (PKG-019, PKG-034)
        mkdirSync(join(home, ".local", "bin"), { recursive: true });
        if (entry) unlinkSync(link);
        symlinkSync(OWN, link);
        process.stdout.write(`cairn: linked ${link} -> ${OWN}\n`);
      }
    } catch (e) { complain(e); }
    const [cmd, args] = kernel(), which = args[0] ?? cmd;
    if (which !== OWN) process.stdout.write(`cairn: the hooks judge with ${which}, the cairn the agent runs, not this checkout's kernel\n`);
    if (top) { const w = wake(top); if (judged(w)) process.stdout.write(`cairn wake:\n${w.stdout}`); else complain(noVerdict(w)); }
  } else process.stderr.write("usage: node bin/hook.mjs stop | session-start\n");
} catch (e) { complain(e); }
process.exit(0);
