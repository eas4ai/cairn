// A requirement revised outside the current commitment does not stop
// check; its mechanism review waits for the commitment that includes it (LOOP-059).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, passing, records } from "./helpers.mjs";

const SPEC = "# Test\n\nStatus: Agreed 2026-09-04\nPrefix: R\n\n[R-001] The thing MUST work.\nFalsifier: it does not.\n\n[R-002] The other thing MUST work.\nFalsifier: it does not.\n\n[R-003] The third thing MUST work.\nFalsifier: it does not.\n";

test("check runs a mechanism when a requirement outside the commitment was revised, and asks for the review once a commitment includes it (LOOP-059)", () => {
  const root = base({ "docs/spec/test.md": SPEC, ".cairn/mechanisms/m": passing("R-001", "R-002", "R-003") });
  cairn(root, "check");
  const before = records(root, "R-001").length;
  const spec = join(root, "docs/spec/test.md");
  writeFileSync(spec, readFileSync(spec, "utf8").replace("The third thing MUST work.", "The third thing MUST work quickly.")); commit(root, "revise R-003, outside the commitment");
  let r = cairn(root, "check");
  assert.doesNotMatch(r.stdout, /review mechanism R-003/, r.stdout);
  assert.equal(records(root, "R-001").length, before + 1, "the mechanism ran and recorded evidence");
  const c = join(root, "docs/commitments/first.md");
  writeFileSync(c, readFileSync(c, "utf8").replace("Requirements: R-001, R-002", "Requirements: R-001, R-002, R-003")); commit(root, "the commitment includes R-003");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review mechanism R-003/, "the wake names the review before the evidence counts");
  r = cairn(root, "check");
  assert.match(r.stdout, /^Resolvable: review mechanism R-003/, "inside the commitment, check asks for it too");
});
