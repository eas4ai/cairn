#!/usr/bin/env node
// The harness hooks. One contract for every harness that passes JSON on
// standard input and reads standard output:
//   node bin/hook.mjs stop           refuse a stop while wake says Resolvable, until three refusals meet no progress (PKG-018, PKG-043)
//   node bin/hook.mjs session-start  link the command if missing; print the verdict (PKG-019)
// The hooks judge with the cairn command the agent runs: the one on PATH,
// else the command link's target, else this checkout's kernel (PKG-021,
// PKG-033). The project is the nearest docs/spec/roadmap.md at or above
// cwd inside the Git working tree (PKG-035). An error is one line on
// stderr and exit 0 (PKG-022); a kernel that prints no verdict is
// reported the same way and never blocks (PKG-036).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OWN = fileURLToPath(new URL("./cairn.mjs", import.meta.url));
const home = process.env.HOME, link = home ? join(home, ".local", "bin", "cairn") : null;
const input = () => { try { const v = process.stdin.isTTY ? {} : JSON.parse(readFileSync(0, "utf8")); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();
const complain = (e) => process.stderr.write(`cairn hook: ${oneLine(e.message ?? e)}\n`);
const resolves = (p) => { try { return statSync(p).isFile() ? realpathSync(p) : null; } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
// The project: the nearest roadmap at or above cwd, inside the Git working tree (PKG-035).
const root = (cwd) => {
  if (!isDir(cwd)) throw new Error(`working directory ${cwd} does not exist or is not a directory`);   // named before git is blamed for it (PKG-041)
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (r.error) throw new Error(`cannot run git: ${r.error.message}`);
  if (r.status !== 0) return null;
  const top = realpathSync(r.stdout.trim()), inside = (d) => d === top || d.startsWith(top.endsWith("/") ? top : top + "/");
  for (let d = realpathSync(cwd); inside(d); d = dirname(d)) { if (existsSync(join(d, "docs", "spec", "roadmap.md"))) return d; if (d === dirname(d)) break; }   // ends at the toplevel, or at / when that is the toplevel
  return null;
};
// The command the agent runs: cairn on PATH, else the link's target, else this kernel (PKG-021, PKG-033),
// unless the latest receipt was written by one of those kernels or the project's own, which then judges (PKG-033).
const onPath = () => (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((d) => join(d, "cairn")).find(resolves) ?? null;
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
const digestOf = (p) => { try { const d = dirname(p); return sha(["cairn.mjs", "spec.mjs"].map((f) => readFileSync(join(d, f), "utf8")).join("\n")); } catch { return null; } };
const evidenceKernel = (top) => { try { const dir = join(top, ".cairn", "evidence", "runs"), n = readdirSync(dir).filter((x) => /^\d{8}T\d{9}Z(?:-\d+)?$/.test(x)).sort().at(-1); return n ? /^kernel_digest: (\S+)$/m.exec(readFileSync(join(dir, n), "utf8"))?.[1] ?? null : null; } catch { return null; } };
const kernel = (top) => {
  const want = top ? evidenceKernel(top) : null, usual = onPath() ?? (link && resolves(link)) ?? OWN;
  const p = (want && [onPath(), link && resolves(link), top && resolves(join(top, "bin", "cairn.mjs")), OWN].find((c) => c && /\.mjs$/.test(c) && digestOf(c) === want)) || usual;
  return /\.mjs$/.test(p) ? [process.execPath, [p]] : [p, []];   // a wrapper or copy runs as itself
};
const wake = (top) => { const [cmd, args] = kernel(top); return spawnSync(cmd, [...args, "wake", "--root", top], { encoding: "utf8" }); };
const judged = (w) => !w.error && /^(?:Resolvable|Escalate|Done): /.test(w.stdout ?? "");
const noVerdict = (w, top) => `the kernel ${kernel(top).flat().join(" ")} printed no verdict: ${oneLine(w.error?.message ?? (w.stderr ?? "").split("\n").find(Boolean) ?? `exit ${w.status}`)}`;
// A refusal that meets no progress counts, per session; the fourth such stop goes through where the developer sees it (PKG-043).
const gitIn = (top, ...a) => spawnSync("git", a, { cwd: top, encoding: "utf8", maxBuffer: Infinity });
const fingerprint = (top) => {
  const loose = gitIn(top, "ls-files", "-o", "--exclude-standard", "-z").stdout.split("\0").filter(Boolean).map((f) => { try { const s = statSync(join(top, f)); return `${f}\0${s.size}\0${s.mtimeMs}`; } catch { return f; } });
  return sha([gitIn(top, "rev-parse", "HEAD").stdout, gitIn(top, "diff", "HEAD", "--binary").stdout, ...loose].join("\0"));
};
function refused(top, session, verdict) {
  const path = join(top, gitIn(top, "rev-parse", "--git-path", "cairn-stops.json").stdout.trim());
  let all = {}; try { all = JSON.parse(readFileSync(path, "utf8")); } catch {}
  const now = { verdict, print: fingerprint(top) }, last = all[session];
  const count = last && last.verdict === now.verdict && last.print === now.print ? last.count + 1 : 1;
  if (count > 3) delete all[session]; else all[session] = { ...now, count };
  writeFileSync(path, JSON.stringify(all) + "\n");
  return count;
}

try {
  const mode = process.argv[2], { cwd, session_id } = input();
  if (cwd !== undefined && typeof cwd !== "string") throw new Error("stdin cwd is not a string");
  const top = root(cwd ?? process.cwd());
  if (mode === "stop") {
    const w = top ? wake(top) : null;
    if (w && !judged(w)) complain(noVerdict(w, top));   // never blocks on a kernel it cannot read (PKG-036)
    else if (w && /^Resolvable: /.test(w.stdout)) {
      const verdict = w.stdout.trim(), first = verdict.split("\n")[0];
      if (refused(top, typeof session_id === "string" ? session_id : "", verdict) > 3) {
        const at = new Date().toISOString(), name = `${at.replace(/[-:.]/g, "")}.md`;
        mkdirSync(join(top, ".cairn", "stops"), { recursive: true });
        writeFileSync(join(top, ".cairn", "stops", name), `# A stop allowed without progress\n\nSession: ${session_id ?? "unknown"}\nStopped: ${at}\nCommit: ${gitIn(top, "rev-parse", "HEAD").stdout.trim()}\nRefusals: 3\nVerdict: ${first}\n\nThe stop hook refused this verdict three times with the commit and the working tree unchanged, then let the stop through (PKG-043). Add an Explanation: line above saying why the agent stopped, and commit this record (LOOP-139).\n\n    ${verdict.replace(/\n/g, "\n    ")}\n`);
        process.stdout.write(JSON.stringify({ systemMessage: `Cairn allowed a stop after three refusals with no progress: ${first}. The next session must explain it in .cairn/stops/${name}.` }) + "\n");
      } else process.stdout.write(JSON.stringify({ decision: "block", reason: `${verdict}\nAct on the named action, then run cairn wake again. If you cannot act on it, raise an escalation with cairn escalate and stop (PKG-044). Do not stop while the verdict is Resolvable (AGENTS.md).` }) + "\n");
    }
  } else if (mode === "session-start") {
    try {   // the link is not the verdict: a failure here is one line, and the verdict still prints (PKG-019, PKG-022)
      const entry = link && lstatSync(link, { throwIfNoEntry: false });
      if (link && (!entry || (entry.isSymbolicLink() && !resolves(link)))) {   // missing, or a link whose target is not a regular file (PKG-019, PKG-034)
        mkdirSync(join(home, ".local", "bin"), { recursive: true });
        if (entry) unlinkSync(link);
        symlinkSync(OWN, link);
        process.stdout.write(`cairn: linked ${link} -> ${OWN}\n`);
      }
    } catch (e) { complain(e); }
    const [cmd, args] = kernel(top), which = args[0] ?? cmd;
    if (which !== OWN) process.stdout.write(`cairn: the hooks judge with ${which}, the cairn the agent runs, not this checkout's kernel\n`);
    if (top) { const w = wake(top); if (judged(w)) process.stdout.write(`cairn wake:\n${w.stdout}`); else complain(noVerdict(w, top)); }
  } else process.stderr.write("usage: node bin/hook.mjs stop | session-start\n");
} catch (e) { complain(e); }
process.exit(0);
