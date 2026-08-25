import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HOOK = new URL("../skills/new-project/scripts/spec-drift-gate.mjs", import.meta.url).pathname;

function runHook({ cwd, stateDir, input, specsDir, home }) {
  return spawnSync("node", [HOOK], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: {
      ...process.env,
      SAME_PAGE_STATE_DIR: stateDir,
      ...(specsDir ? { SAME_PAGE_SPECS_DIR: specsDir } : {}),
      ...(home ? { HOME: home } : {}),
    },
  });
}

function tempProject({ withSpecs, withIteration } = {}) {
  const root = mkdtempSync(join(tmpdir(), "same-page-proj-"));
  if (withSpecs) {
    const specDir = join(root, "docs", "specs", "demo");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "00-overview.md"), "# Demo -- Overview\n");
    if (withIteration) {
      const iterDir = join(specDir, "iterations");
      mkdirSync(iterDir, { recursive: true });
      writeFileSync(join(iterDir, "001.md"), "# Iteration 001\n");
    }
  }
  return root;
}

function tempStateDir() {
  return mkdtempSync(join(tmpdir(), "same-page-state-"));
}

// False-block guard: no spec set -> the gate must stay silent.
test("exits 0 when project has no spec set", () => {
  const r = runHook({
    cwd: tempProject(),
    stateDir: tempStateDir(),
    input: { session_id: "s1" },
  });
  expect(r.status).toBe(0);
});

// False-pass guard: spec set present, first completion -> must block.
test("exits 2 with audit prompt when spec set exists and no marker", () => {
  const r = runHook({
    cwd: tempProject({ withSpecs: true, withIteration: true }),
    stateDir: tempStateDir(),
    input: { session_id: "s2" },
  });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain("iteration contract");
  expect(r.stderr).toContain("out-of-contract");
  expect(r.stderr).toContain("glossary");
  expect(r.stderr).toContain("docs/specs/demo/iterations/001.md");
});

// Observed specs (from /existing-project) are not contract: the audit
// must ask whether unconfirmed text was relied on.
test("audit asks about Observed spec sections", () => {
  const r = runHook({
    cwd: tempProject({ withSpecs: true, withIteration: true }),
    stateDir: tempStateDir(),
    input: { session_id: "s_observed" },
  });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain("Observed (as-built; unconfirmed)");
  expect(r.stderr).toContain("mark it Agreed");
});

// False-block guard: the gate fires once per session, never loops.
test("exits 0 on second run in same session (marker present)", () => {
  const cwd = tempProject({ withSpecs: true });
  const stateDir = tempStateDir();
  const first = runHook({ cwd, stateDir, input: { session_id: "s3" } });
  expect(first.status).toBe(2);
  expect(existsSync(join(stateDir, "same-page-gate-s3"))).toBe(true);
  const second = runHook({ cwd, stateDir, input: { session_id: "s3" } });
  expect(second.status).toBe(0);
});

// Fail-open: garbage input must never wedge a session.
test("exits 0 on malformed stdin", () => {
  const r = spawnSync("node", [HOOK], {
    cwd: tempProject({ withSpecs: true }),
    input: "not json",
    encoding: "utf8",
    env: { ...process.env, SAME_PAGE_STATE_DIR: tempStateDir() },
  });
  expect(r.status).toBe(0);
});

// cwd from hook input wins over process cwd.
test("uses cwd field from hook input when provided", () => {
  const specProject = tempProject({ withSpecs: true });
  const r = runHook({
    cwd: tempProject(),
    stateDir: tempStateDir(),
    input: { session_id: "s4", cwd: specProject },
  });
  expect(r.status).toBe(2);
});

// Robustness: iterations as plain file (ENOTDIR) must not crash; gate functions with degraded prompt.
test("exits 2 (not 1) when iterations is a plain file, not a directory", () => {
  const root = mkdtempSync(join(tmpdir(), "same-page-proj-"));
  const specDir = join(root, "docs", "specs", "demo");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, "00-overview.md"), "# Demo -- Overview\n");
  // Create iterations as a PLAIN FILE instead of directory -> would cause ENOTDIR on readdirSync
  writeFileSync(join(specDir, "iterations"), "not a directory");

  const stateDir = tempStateDir();
  const r = runHook({
    cwd: root,
    stateDir,
    input: { session_id: "s_file" },
  });
  // Should exit 2 (block), not 1 (crash)
  expect(r.status).toBe(2);
  // Should handle gracefully, showing "none found" since iterations path is corrupt
  expect(r.stderr).toContain("none found");
});

// SAME_PAGE_SPECS_DIR override: spec set at a non-default location must still be found.
test("exits 2 when spec set lives under SAME_PAGE_SPECS_DIR override", () => {
  const root = mkdtempSync(join(tmpdir(), "same-page-proj-"));
  const specDir = join(root, "custom", "specs", "demo");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, "00-overview.md"), "# Demo -- Overview\n");

  const r = runHook({
    cwd: root,
    stateDir: tempStateDir(),
    input: { session_id: "s_specs_override" },
    specsDir: "custom/specs",
  });
  expect(r.status).toBe(2);
});

// Rule 13: the audit carries the production self-evaluation, referencing
// the nearest BEST_PRACTICES.md (repo copy wins) when one exists.
test("audit includes rule 13 referencing project BEST_PRACTICES.md when present", () => {
  const cwd = tempProject({ withSpecs: true });
  writeFileSync(join(cwd, "BEST_PRACTICES.md"), "# BEST_PRACTICES\n");
  const emptyHome = mkdtempSync(join(tmpdir(), "same-page-home-"));
  const r = runHook({
    cwd,
    stateDir: tempStateDir(),
    input: { session_id: "s6" },
    home: emptyHome,
  });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain("Rule 13");
  expect(r.stderr).toContain(join(cwd, "BEST_PRACTICES.md"));
});

// Rule 13 fallback: no ruleset found anywhere -> the rule's own text is
// embedded so the self-evaluation still happens.
test("audit includes embedded rule 13 self-evaluation when no ruleset found", () => {
  const emptyHome = mkdtempSync(join(tmpdir(), "same-page-home-"));
  const r = runHook({
    cwd: tempProject({ withSpecs: true }),
    stateDir: tempStateDir(),
    input: { session_id: "s7" },
    home: emptyHome,
  });
  expect(r.status).toBe(2);
  expect(r.stderr).toContain("Rule 13 self-evaluation");
  expect(r.stderr).toContain("deficient");
});
