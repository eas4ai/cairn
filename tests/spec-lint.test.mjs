// The spec lint against fixtures that realize each rule's falsifier, and
// against this repository's own specification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LINT = new URL("../scripts/spec-lint.mjs", import.meta.url).pathname;
const ROOT = new URL("..", import.meta.url).pathname;
const lint = (dir) => spawnSync("node", [LINT, dir], { encoding: "utf8" });
function fixture(text) { const d = mkdtempSync(join(tmpdir(), "lint-")); writeFileSync(join(d, "x.md"), text); return d; }
const AGREED = "# X\n\nStatus: Agreed 2026-09-04\nPrefix: X\n\n";

test("a two-obligation sentence is named (PKG-007)", () => {
  const r = lint(fixture(AGREED + "[X-001] The agent MUST do this and MUST NOT do that.\nFalsifier: it does.\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /X-001 states 2 obligations.*PKG-007/);
});

test("an obligation with no actor is named (PKG-010)", () => {
  const r = lint(fixture(AGREED + "[X-001] MUST be fast.\nFalsifier: it is slow.\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /X-001 states an obligation with no actor.*PKG-010/);
});

test("a leading condition clause is not the actor, and the actor after it counts", () => {
  const r = lint(fixture(AGREED + "[X-001] When it rains, the agent MUST stay in.\nFalsifier: it goes out.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("an Agreed requirement with no falsifier is named (SPEC-002); a Draft one is not", () => {
  let r = lint(fixture(AGREED + "[X-001] The agent MUST act.\n\n[X-002] The agent MUST wait.\nFalsifier: it acts.\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /X-001 is Agreed and carries no Falsifier.*SPEC-002/); assert.doesNotMatch(r.stdout, /X-002/);
  r = lint(fixture("# X\n\nStatus: Draft\nPrefix: X\n\n[X-001] The agent MUST act.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("prose after a Draft requirement with no falsifier is not scanned as requirement text", () => {
  const r = lint(fixture("# X\n\nStatus: Draft\nPrefix: X\n\n[X-001] The agent MUST act.\n\nThis prose says MUST and MUST NOT freely, because it is prose.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("a spec declaring a prefix with no requirement is named (SPEC-001)", () => {
  const r = lint(fixture(AGREED + "## Nothing here\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /declares Prefix: X and holds no requirement.*SPEC-001/);
});

test("a keyword in backticks or quotes is a mention, not an obligation", () => {
  const r = lint(fixture(AGREED + "[X-001] The agent MUST write `MUST` or \"MUST NOT\" exactly once.\nFalsifier: it writes two.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("this repository's own specification passes the lint", () => {
  const r = lint(join(ROOT, "docs", "spec"));
  assert.equal(r.status, 0, r.stdout);
});
