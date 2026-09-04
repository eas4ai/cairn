// PKG-011: every Agreed PKG requirement is part of every commitment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, review, passing, failing } from "./helpers.mjs";

const PKG = "# P\n\nStatus: Agreed 2026-09-04\nPrefix: PKG\n\n[PKG-001] Cairn MUST hold.\nFalsifier: it does not.\n";

test("a PKG requirement the commitment does not name is declared, run, and gates Done (PKG-011)", () => {
  const root = repo({ "docs/spec/pkg.md": PKG, ".cairn/mechanisms/t": passing("R-001", "R-002") });
  cairn(root, "check"); review(root);
  let r = cairn(root, "wake");
  assert.equal(r.status, 1); assert.match(r.stdout, /^Resolve: declare PKG-001/);
  writeFileSync(join(root, ".cairn/mechanisms/p"), failing("PKG-001"));
  cairn(root, "check"); review(root);
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolve: implement PKG-001/, "failing package evidence blocks Done");
  writeFileSync(join(root, ".cairn/mechanisms/p"), passing("PKG-001"));
  cairn(root, "check"); review(root);
  r = cairn(root, "wake");
  assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /^Done: first/);
});

test("a PKG requirement in a Draft spec is not folded in", () => {
  const root = repo({ "docs/spec/pkg.md": PKG.replace("Agreed 2026-09-04", "Draft"), ".cairn/mechanisms/t": passing("R-001", "R-002") });
  cairn(root, "check"); review(root);
  assert.match(cairn(root, "wake").stdout, /^Done: first/);
});
