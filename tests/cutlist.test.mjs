// tests/cutlist.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutlist, render, FAMILY } from "../scripts/cutlist.mjs";

test("cutlist reads every family and disposes each identifier by family", () => {
  const dir = mkdtempSync(join(tmpdir(), "sudus-cut-")); mkdirSync(join(dir, "docs/spec"), { recursive: true });
  writeFileSync(join(dir, "docs/spec/loop.md"), "Prefix: LOOP\n\n## Verdicts\n\n[LOOP-001] The wake prints a verdict.\nFalsifier: none printed.\nStatus: Agreed 2026-01-01\n\n[LOOP-002] x\nFalsifier: y\nStatus: Agreed 2026-01-01\n");
  writeFileSync(join(dir, "docs/spec/autonomy.md"), "Prefix: AUTO\n\n## Mode\n\n[AUTO-001] x\nFalsifier: y\nStatus: Agreed 2026-01-01\n");
  writeFileSync(join(dir, "docs/spec/overview.md"), "# x\n");
  const c = cutlist(join(dir, "docs/spec"));
  assert.deepEqual(c.families.map((f) => [f.prefix, f.count]), [["AUTO", 1], ["LOOP", 2]]);
  assert.deepEqual(c.rows.find((r) => r.id === "LOOP-001"), { id: "LOOP-001", section: "Verdicts", disposition: "replaced-by-predicate", file: "loop.md" });
  assert.equal(c.rows.find((r) => r.id === "AUTO-001").disposition, "removed");
  const md = render(c);
  assert.match(md, /^\| LOOP-001 \| loop\.md \| Verdicts \| replaced-by-predicate \|$/m);
  assert.deepEqual(Object.keys(FAMILY).sort(), ["AUTO", "DEC", "LOOP", "PKG", "SPEC"]);
});

test("an unknown family is refused, never silently kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "sudus-cut-")); mkdirSync(join(dir, "docs/spec"), { recursive: true });
  writeFileSync(join(dir, "docs/spec/x.md"), "Prefix: NEW\n\n[NEW-001] x\nFalsifier: y\nStatus: Draft\n");
  assert.throws(() => cutlist(join(dir, "docs/spec")), /unknown 1\.x family NEW/);
});
