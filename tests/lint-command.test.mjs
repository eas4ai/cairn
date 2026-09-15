// cairn lint runs the shipped specification checker from this checkout (PKG-028).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn } from "./helpers.mjs";

test("cairn lint runs the checker over docs/spec by default and over a named directory (PKG-028)", () => {
  const root = repo();
  let r = cairn(root, "lint");
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /spec lint: docs\/spec clean/);
  writeFileSync(join(root, "docs/spec/test.md"), "# Test\n\nStatus: Agreed 2026-09-04\nPrefix: R\n\n[R-001] The thing MUST work.\n\n[R-002] The other thing MUST work.\nFalsifier: it does not.\n");
  r = cairn(root, "lint", "docs/spec");
  assert.equal(r.status, 1); assert.match(r.stdout, /R-001 is Agreed and carries no Falsifier/);
});
