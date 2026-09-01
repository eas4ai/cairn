import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The Codex adapter is a shell command in .codex/hooks.json that resolves
// the gate script at a documented path under the target repository. These
// tests run that exact command string, so the adapter and INSTALLATION.md
// cannot drift apart silently.

const REPO = new URL("..", import.meta.url).pathname;
const HOOK = join(REPO, "skills", "new-project", "scripts", "spec-drift-gate.mjs");
const VENDORED = join("skills", "new-project", "scripts", "spec-drift-gate.mjs");
const COMMAND = JSON.parse(readFileSync(join(REPO, ".codex", "hooks.json"), "utf8")).hooks
  .Stop[0].hooks[0].command;

let session = 0;

function runAdapter(cwd) {
  const stateDir = mkdtempSync(join(tmpdir(), "same-page-codex-state-"));
  return spawnSync("sh", ["-c", COMMAND], {
    cwd,
    input: JSON.stringify({ session_id: `codex-${process.pid}-${session++}`, cwd }),
    encoding: "utf8",
    env: { ...process.env, SAME_PAGE_STATE_DIR: stateDir },
  });
}

function targetRepo({ git, withScript, withSpecs }) {
  const root = mkdtempSync(join(tmpdir(), "same-page-codex-"));
  if (git) spawnSync("git", ["init", "-q"], { cwd: root });
  if (withScript) {
    mkdirSync(join(root, "skills", "new-project", "scripts"), { recursive: true });
    cpSync(HOOK, join(root, VENDORED));
  }
  if (withSpecs) {
    const specDir = join(root, "docs", "specs", "demo");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "00-overview.md"), "# Demo -- Overview\n");
  }
  return root;
}

// False-pass guard: with the script at the documented path, the adapter
// fires the gate exactly as the Claude Code registration would.
test("Codex adapter fires the gate when the script is vendored at the documented path", () => {
  const root = targetRepo({ git: true, withScript: true, withSpecs: true });
  const r = runAdapter(root);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain("Same Page drift gate");
});

// False-block guard: a missing script must not surface as a node error
// that wedges the session; fail-open extends to the adapter itself.
test("Codex adapter exits 0 and stays silent when the script is not vendored", () => {
  const root = targetRepo({ git: true, withScript: false, withSpecs: true });
  const r = runAdapter(root);
  expect(r.status).toBe(0);
  expect(r.stderr).toBe("");
});

// False-block guard: no git top level means no resolvable path; stay silent.
test("Codex adapter exits 0 outside a git repository", () => {
  const root = targetRepo({ git: false, withScript: true, withSpecs: true });
  const r = runAdapter(root);
  expect(r.status).toBe(0);
  expect(r.stderr).toBe("");
});
