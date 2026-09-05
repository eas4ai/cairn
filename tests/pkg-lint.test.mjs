// The package lint against fixtures realizing each falsifier, and against
// this repository. Fixtures are git repositories, because the lint reads
// the tracked set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LINT = new URL("../scripts/pkg-lint.mjs", import.meta.url).pathname;
const ROOT = new URL("..", import.meta.url).pathname;
const git = (root, ...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: root, encoding: "utf8" });
const lint = (root) => spawnSync("node", [LINT, root], { encoding: "utf8" });

// A clean minimal package: one kernel file whose one command a decision names.
function repo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "pkg-"));
  const all = { "package.json": '{"name":"x"}\n', ".gitignore": ".cairn/in-progress\n", "bin/x.mjs": "// cairn wake\nconsole.log(1);\n",
                "docs/decisions/a.md": "# A\n\nLevel: Judged\n\n## Decision\n\n`cairn wake` and .cairn/queue exist.\n", ".cairn/queue/.keep": "", ...files };
  for (const [p, t] of Object.entries(all)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), t); }
  git(root, "init", "-q"); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "x");
  return root;
}
const finds = (files, req) => { const r = lint(repo(files)); assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, new RegExp(`^${req}:`, "m")); };

test("a clean package passes", () => { const r = lint(repo()); assert.equal(r.status, 0, r.stdout); });
test("PKG-001: a dependency, or a service manifest", () => { finds({ "package.json": '{"dependencies":{"left-pad":"1"}}' }, "PKG-001"); finds({ "Dockerfile": "FROM x\n" }, "PKG-001"); });
test("PKG-002: ignoring evidence or other durable state", () => finds({ ".gitignore": ".cairn/evidence/\n.cairn/queue/\n" }, "PKG-002"));
test("PKG-003: a command, a directory, or a record kind no decision names", () => {
  finds({ "bin/x.mjs": "// cairn wake\n// cairn frobnicate\n" }, "PKG-003");
  finds({ ".cairn/mystery/.keep": "" }, "PKG-003");
  finds({ "docs/commitments/c.md": "# C\n\nSlug: c\n\n## Formats\n\nA widget record, one per run:\n\n    x: y\n" }, "PKG-003");
});
test("PKG-004: a kernel over 1500 lines", () => finds({ "bin/x.mjs": "// cairn wake\n" + "1;\n".repeat(1501) }, "PKG-004"));
test("PKG-006: a skill step naming a vendor's product", () => finds({ "skills/s/SKILL.md": "Then run Claude Code to finish.\n" }, "PKG-006"));
test("PKG-008: a non-ASCII character in a tracked text file", () => finds({ "docs/n.md": "caf\u00e9\n" }, "PKG-008"));
test("PKG-009: the kernel importing from tests", () => finds({ "bin/x.mjs": '// cairn wake\nimport { h } from "../tests/helpers.mjs";\n' }, "PKG-009"));
test("PKG-012: a network call or a model vendor in the kernel", () => { finds({ "bin/x.mjs": "// cairn wake\nawait fetch(u);\n" }, "PKG-012"); finds({ "bin/x.mjs": "// cairn wake\n// anthropic\n" }, "PKG-012"); });
test("PKG-013: deferral language, but not in code, quotes, or a rule", () => {
  finds({ "docs/spec/s.md": "# S\n\nStatus: Agreed\n\nThis ships in v1; the rest comes in a later release.\n" }, "PKG-013");
  const ok = lint(repo({ "docs/spec/s.md": '# S\n\nStatus: Agreed\n\n    v1 is a code sample\n\nNothing is "postponed".\n\n[S-001] The agent MUST NOT name a later version.\nFalsifier: it does.\n' }));
  assert.equal(ok.status, 0, ok.stdout);
});
test("this repository passes the package lint", () => { const r = lint(ROOT); assert.equal(r.status, 0, r.stdout); });

test("a tracked path deleted from the working tree is skipped, not a crash", () => {
  const root = repo({ "docs/gone.md": "# gone\n" });
  spawnSync("rm", [join(root, "docs/gone.md")]);
  const r = lint(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /ENOENT/);
});

test("a sentence in a Formats section is not a record kind", () => {
  const r = lint(repo({ "docs/commitments/c.md": "# C\n\nSlug: c\n\n## Formats\n\nThe suite adds, each spawning the CLI:\n\n    x\n" }));
  assert.equal(r.status, 0, r.stdout);
});

test("a record kind named by its path alone is checked", () => {
  finds({ "docs/commitments/c.md": "# C\n\nSlug: c\n\n## Formats\n\nAn escalation, .cairn/escalations/<slug>.md:\n\n    x\n" }, "PKG-003");
});

test("PKG-002: a tracked in-progress record", () => finds({ ".gitignore": "", ".cairn/in-progress": "action: implement\n" }, "PKG-002"));

test("PKG-002: ignoring evidence alone is a finding", () => finds({ ".gitignore": ".cairn/evidence/\n" }, "PKG-002"));
