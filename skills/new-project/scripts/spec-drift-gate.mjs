#!/usr/bin/env node
// Same Page spec-drift gate. One-shot completion gate: when a session
// finishes in a project that has a Same Page spec set, block once (exit 2)
// and demand a self-audit against the iteration contract and the
// production ruleset (rule 13). No spec set, or already fired this
// session, or anything unexpected -> exit 0 (fail open; a gate that
// wedges sessions is worse than a gate that misses one).
import { existsSync, readdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { tmpdir } from "node:os";

function specsDir(root) {
  return process.env.SAME_PAGE_SPECS_DIR
    ? isAbsolute(process.env.SAME_PAGE_SPECS_DIR)
      ? process.env.SAME_PAGE_SPECS_DIR
      : join(root, process.env.SAME_PAGE_SPECS_DIR)
    : join(root, "docs", "specs");
}

function specProjects(root) {
  const dir = specsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => existsSync(join(dir, name, "00-overview.md")));
}

function currentIteration(root, project) {
  const base = specsDir(root);
  const dir = join(base, project, "iterations");
  if (!existsSync(dir)) return null;
  try {
    const nums = readdirSync(dir)
      .filter((f) => /^\d+\.md$/.test(f))
      .sort();
    if (nums.length === 0) return null;
    return join(relative(root, base), project, "iterations", nums[nums.length - 1]);
  } catch {
    // If iterations exists but is not readable or not a directory, treat as no iterations
    return null;
  }
}

function bestPracticesPath(root) {
  // Mirrors the sibling best-practices package's precedence: a repository
  // copy wins over the user-level copy.
  try {
    const repoCopy = join(root, "BEST_PRACTICES.md");
    if (existsSync(repoCopy)) return repoCopy;
    const home = process.env.HOME || "";
    if (home) {
      const userCopy = join(home, ".claude", "BEST_PRACTICES.md");
      if (existsSync(userCopy)) return userCopy;
    }
  } catch {
    // Fall through to the embedded rule text.
  }
  return null;
}

function auditPrompt(root, projects) {
  const contracts = projects
    .map((p) => currentIteration(root, p))
    .filter(Boolean);
  const contractLine = contracts.length
    ? contracts.join(", ")
    : "none found -- note that absence in your report";
  const rulesetPath = bestPracticesPath(root);
  const ruleThirteen = rulesetPath
    ? [
        `5. Rule 13 self-evaluation (${rulesetPath}): you are delivering`,
        "   production software -- do not deliver work you know to be",
        "   deficient. Review the session's work against every rule in that",
        "   ruleset and answer honestly: would you make revisions? If yes,",
        "   make them before finishing.",
      ]
    : [
        "5. Rule 13 self-evaluation: you are delivering production software",
        "   -- do not deliver work you know to be deficient (incomplete,",
        "   unverified, internally inconsistent). Answer honestly: would you",
        "   make revisions? If yes, make them before finishing.",
      ];
  return [
    "Same Page drift gate: before finishing, audit this session against the spec set.",
    `Current iteration contract(s): ${contractLine}`,
    "1. Does the session's work stay within the current iteration contract?",
    "2. Was any out-of-contract work performed? If so, surface it to the user",
    "   and capture it (spec decisions log or iterations/next/) -- never",
    "   silently ship it, never silently discard it.",
    "3. Did the work make any touched spec untrue (update it), and did new",
    "   terms enter the conversation that belong in the glossary (add them)?",
    "4. Was any spec section still marked Observed (as-built; unconfirmed)",
    "   relied on as contract? If so, say so: confirm it with the developer",
    "   and mark it Agreed, or keep that work out of the contract.",
    ...ruleThirteen,
    "Make any needed corrections, then finish. This gate fires once per session.",
  ].join("\n");
}

function main() {
  try {
    let input = {};
    try {
      input = JSON.parse(readFileSync(0, "utf8"));
    } catch {
      process.exit(0);
    }
    const root = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
    let projects = [];
    try {
      projects = specProjects(root);
    } catch {
      process.exit(0);
    }
    if (projects.length === 0) process.exit(0);
    const sessionId = String(input.session_id || "unknown").replace(/[^\w-]/g, "_");
    const stateDir = process.env.SAME_PAGE_STATE_DIR || tmpdir();
    const marker = join(stateDir, `same-page-gate-${sessionId}`);
    if (existsSync(marker)) process.exit(0);
    // Build audit prompt BEFORE writing marker, so any error does not strand a marker
    const prompt = auditPrompt(root, projects);
    try {
      writeFileSync(marker, new Date().toISOString());
    } catch {
      process.exit(0);
    }
    writeSync(2, prompt + "\n");
    process.exit(2);
  } catch {
    // Fail open: any unexpected error exits 0
    process.exit(0);
  }
}

main();
