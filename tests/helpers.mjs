// Shared fixtures: a real git repository with one commitment of two
// requirements. Evidence is produced by cairn check, never hand-written,
// so its digests are honest.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const CLI = new URL("../bin/cairn.mjs", import.meta.url).pathname;
const GIT = ["-c", "user.name=t", "-c", "user.email=t@t"];
export const git = (root, ...a) => spawnSync("git", [...GIT, ...a], { cwd: root, encoding: "utf8" });
export const cairn = (root, ...a) => spawnSync("node", [CLI, ...a], { cwd: root, encoding: "utf8" });
export const commit = (root, msg = "c") => { git(root, "add", "-A"); git(root, "commit", "-q", "-m", msg); };
export const head = (root) => git(root, "rev-parse", "--short", "HEAD").stdout.trim();
export const records = (root, req) => { const d = join(root, ".cairn", "evidence", req); return existsSync(d) ? readdirSync(d).filter((n) => !/\.(out|err)$/.test(n)).sort() : []; };

// Mechanism declarations. exitFile lets a test flip pass/fail by editing one declared input.
export const passing = (...reqs) => `command: node -e 0\ninputs:\n  - src/other\nrequirements:\n${reqs.map((r) => `  - ${r}\n`).join("")}`;
export const failing = (...reqs) => `command: node -e "process.exit(1)"\ninputs:\n  - src/other\nrequirements:\n${reqs.map((r) => `  - ${r}\n`).join("")}`;
export const fromFile = (...reqs) => `command: node -e "process.exit(Number(require('fs').readFileSync('src/exit','utf8')))"\ninputs:\n  - src/exit\nrequirements:\n${reqs.map((r) => `  - ${r}\n`).join("")}`;

export function repo(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "cairn-"));
  const w = (rel, text) => { mkdirSync(join(root, rel, ".."), { recursive: true }); writeFileSync(join(root, rel), text); };
  w("docs/spec/roadmap.md", "# Roadmap\n\nCurrent: first\n");
  w("docs/spec/test.md", "# Test\n\nStatus: Agreed 2026-09-04\nPrefix: R\n\n[R-001] The thing MUST work.\nFalsifier: it does not.\n\n[R-002] The other thing MUST work.\nFalsifier: it does not.\n");
  w("docs/commitments/first.md", "# First\n\nSlug: first\nRequirements: R-001, R-002\n");
  w("src/exit", "0\n");
  w("src/other", "x\n");
  w("unrelated.txt", "y\n");
  w(".gitignore", ".cairn/in-progress\n");
  for (const d of ["docs/decisions", ".cairn/escalations", ".cairn/mechanisms", ".cairn/queue", ".cairn/reviews", ".cairn/backlog"]) mkdirSync(join(root, d), { recursive: true });
  for (const [rel, text] of Object.entries(overrides)) text === null ? rmSync(join(root, rel), { force: true }) : w(rel, text);
  git(root, "init", "-q", "-b", "main"); commit(root, "init");
  return root;
}
// A clean review at HEAD, optionally with findings ("open: ..." / "resolved: ...").
export const review = (root, findings = []) => writeFileSync(join(root, ".cairn/reviews/first.md"),
  `commitment: first\ncommit: ${head(root)}\nexamined:\n  - everything\nfindings:\n${findings.map((f) => `  - ${f}\n`).join("")}`);
