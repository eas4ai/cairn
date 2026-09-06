import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { repo, cairn, git, commit, passing, records, CLI } from "./helpers.mjs";

const base = passing("R-001", "R-002");
const invalid = {
  "missing inputs": base.replace(/inputs:\n  - src\/other\n/, ""),
  "empty inputs": base.replace("  - src/other\n", ""),
  "missing command": base.replace("command: node -e 0\n", ""),
  "list command": base.replace("command: node -e 0", "command:\n  - node -e 0"),
  "empty command": base.replace("command: node -e 0", "command:"),
  "missing requirements": base.replace(/requirements:[\s\S]+/, ""),
  "bad identifier": base.replace("R-001", "../../elsewhere"),
};
for (const [name, declaration] of Object.entries(invalid)) test(`LOOP-067: ${name} names a declaration repair before execution`, () => {
  const root = repo({ ".cairn/mechanisms/m": declaration });
  for (const command of ["wake", "check"]) {
    const r = cairn(root, command);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^Resolvable: repair .cairn\/mechanisms\/m/);
    assert.equal(records(root, "R-001").length, 0);
  }
});

test("LOOP-067: scalar one-item lists retain their existing meaning", () => {
  const root = repo({ ".cairn/mechanisms/m": "command: node -e 0\ninputs: src/other\nrequirements: R-001\n" });
  assert.match(cairn(root, "check", "R-001").stdout, /recorded .*: pass/);
});

for (const populated of [false, true]) test(`LOOP-068: a ${populated ? "populated" : "unpopulated"} gitlink is refused by name`, () => {
  const root = repo({ ".cairn/mechanisms/m": base.replace("src/other", "src/") });
  const path = join(root, "src/sub");
  if (populated) {
    mkdirSync(path); assert.equal(git(path, "init", "-q").status, 0);
    writeFileSync(join(path, "a"), "x"); commit(path);
  }
  const oid = git(populated ? path : root, "rev-parse", "HEAD").stdout.trim();
  assert.equal(git(root, "update-index", "--add", "--cacheinfo", `160000,${oid},src/sub`).status, 0);
  assert.equal(git(root, "commit", "-qm", "gitlink").status, 0);
  for (const command of ["wake", "check"]) {
    const r = cairn(root, command);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^Resolvable: repair .cairn\/mechanisms\/m/);
    assert.match(r.stdout, /submodule.*src\/sub|src\/sub.*submodule/);
    assert.equal(r.stderr, "");
  }
});

test("LOOP-069: identical selections across 100 mechanisms use at most 20 Git processes", () => {
  const ids = Array.from({ length: 100 }, (_, i) => `R-${String(i + 1).padStart(3, "0")}`);
  const overrides = {
    "docs/spec/test.md": "# Test\nStatus: Agreed 2026-09-04\nPrefix: R\n\n" + ids.map((id) => `[${id}] The thing MUST work.\nFalsifier: it does not.\n\n`).join(""),
    "docs/commitments/first.md": `# First\nSlug: first\nRequirements: ${ids.join(", ")}\n`,
  };
  for (const id of ids) overrides[`.cairn/mechanisms/${id}`] = passing(id);
  const root = repo(overrides), trace = join(root, ".cairn/git-trace");
  const r = spawnSync(process.execPath, [CLI, "wake"], { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TRACE: trace } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^Resolvable: run R-001/);
  const calls = readFileSync(trace, "utf8").split("\n").filter((l) => l.includes("built-in: git"));
  assert.ok(calls.length <= 20, `wake spawned ${calls.length} Git processes`);
});
