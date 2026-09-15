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

test("cairn lint names a missing directory in one line, takes one argument, and reports a bad root (PKG-028)", () => {
  const root = repo();
  let r = cairn(root, "lint", "nope");
  assert.equal(r.status, 3, r.stdout + r.stderr); assert.match(r.stderr, /not a directory/); assert.doesNotMatch(r.stderr, /^\s+at /m);
  r = cairn(root, "lint", "docs/spec", "extra"); assert.equal(r.status, 3); assert.match(r.stderr, /one directory/);
  r = cairn(root, "--root", "/nonexistent/x", "lint"); assert.equal(r.status, 3, r.stdout); assert.ok(r.stderr.trim().split("\n").length === 1, r.stderr);
  assert.match(r.stderr, /^cairn: \/nonexistent\/x is not a directory/, r.stderr); assert.doesNotMatch(r.stderr, /checker|ENOENT/, "the root is named, not the checker");
});
