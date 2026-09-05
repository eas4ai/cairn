import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { repo, cairn, passing, review } from "./helpers.mjs";

const LINT = new URL("../scripts/spec-lint.mjs", import.meta.url).pathname;
const commitment = "# First\n\nRequirements: R-003\n";
const extra = (header, status, falsifier = true) => `# Extra\n\n${header}\nPrefix: R\n\n[R-003] The service MUST reject an empty request.\n${falsifier ? "Falsifier: An empty request succeeds.\n" : ""}${status ? `Status: ${status}\n` : ""}`;
const setup = (text) => repo({ "docs/spec/extra.md": text, "docs/commitments/first.md": commitment, ".cairn/mechanisms/m": passing("R-003") });
const lint = (root) => spawnSync("node", [LINT, join(root, "docs/spec")], { encoding: "utf8" });

test("a Draft block overrides an Agreed file for both wake and check (SPEC-018)", () => {
  const root = setup(extra("Status: Agreed", "Draft", false));
  for (const cmd of ["wake", "check"]) {
    const r = cairn(root, cmd); assert.equal(r.status, 1); assert.match(r.stdout, /R-003 is not an Agreed requirement/); assert.doesNotMatch(r.stdout, /recorded/);
  }
  assert.equal(lint(root).status, 0, "Draft blocks do not need confirmed falsifiers");
});

test("an Agreed block overrides a Draft file in the kernel and lint (SPEC-018, SPEC-002)", () => {
  const root = setup(extra("Status: Draft", "Agreed 2026-09-05"));
  assert.match(cairn(root, "check").stdout, /R-003.*pass/); review(root);
  assert.equal(cairn(root, "wake").status, 0); assert.equal(lint(root).status, 0);
  const missing = setup(extra("Status: Draft", "Agreed 2026-09-05", false));
  const r = lint(missing); assert.equal(r.status, 1); assert.match(r.stdout, /R-003.*no Falsifier.*SPEC-002/);
});

test("a block Status does not become the file default, including inside examples (SPEC-018)", () => {
  for (const header of ["", "```md\nStatus: Agreed\n```", "~~~~md\n~~~\nStatus: Agreed\n~~~~"]) {
    const text = extra(header, "Agreed") + "\n[R-004] The service MUST keep a log.\n";
    const root = repo({ "docs/spec/extra.md": text, "docs/commitments/first.md": "Requirements: R-004\n" });
    assert.match(cairn(root, "wake").stdout, /R-004 is not an Agreed requirement/);
    assert.equal(lint(root).status, 0);
  }
});

test("block status without a value does not inherit Agreed by accident (SPEC-018)", () => {
  const root = setup(extra("Status: Agreed", " "));
  assert.match(cairn(root, "wake").stdout, /R-003 is not an Agreed requirement/);
});

test("inheritance needs a file Scope and includes only Agreed blocks, regardless of prefix (PKG-015)", () => {
  for (const prefix of ["PKG", "OPS"]) {
    const rule = `[${prefix}-001] The service MUST keep logs.\nFalsifier: Logs are missing.\n`;
    for (const scope of ["", "Scope: every commitment\n"]) {
      const text = `Status: Draft\nPrefix: ${prefix}\n${scope}\n${rule}Status: Agreed\n\n[${prefix}-002] The service MUST maybe act.\nStatus: Draft\n`;
      const root = repo({ "docs/spec/global.md": text, ".cairn/mechanisms/m": passing("R-001", "R-002") });
      cairn(root, "check"); review(root);
      const r = cairn(root, "wake");
      if (scope) assert.match(r.stdout, new RegExp(`^Resolvable: declare ${prefix}-001`));
      else assert.equal(r.status, 0, r.stdout);
      assert.doesNotMatch(r.stdout, new RegExp(`${prefix}-002`));
    }
  }
});

test("Scope inside a requirement or fenced example does not declare inheritance (PKG-015)", () => {
  for (const text of [extra("Status: Agreed", "Agreed") + "Scope: every commitment\n", extra("Status: Agreed\n```\nScope: every commitment\n```", "Agreed")]) {
    const root = repo({ "docs/spec/extra.md": text, ".cairn/mechanisms/m": passing("R-001", "R-002") });
    cairn(root, "check"); review(root); assert.equal(cairn(root, "wake").status, 0);
  }
});
