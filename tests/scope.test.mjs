// cairn backlog, and the footprint: a commit outside the commitment's
// declared inputs is visible; out-of-scope work is captured, never lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, review, fromFile } from "./helpers.mjs";

const repo = (o = {}) => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), ...o });
const green = (root) => { cairn(root, "check"); review(root); };

test("backlog writes the item; a second with the same title is refused, never overwritten (LOOP-016)", () => {
  const root = repo();
  let r = cairn(root, "backlog", "--title", "Sessions in SQLite", "--body", "Because.", "--from", "R-001");
  assert.equal(r.status, 0, r.stderr);
  const t = readFileSync(join(root, ".cairn/backlog/sessions-in-sqlite.md"), "utf8");
  assert.ok(t.includes("# Sessions in SQLite") && t.includes("Surfaced from: R-001") && t.includes("Because."));
  r = cairn(root, "backlog", "--title", "Sessions in SQLite", "--body", "Again.");
  assert.equal(r.status, 3); assert.match(r.stderr, /never overwrites/);
  assert.ok(readFileSync(join(root, ".cairn/backlog/sessions-in-sqlite.md"), "utf8").includes("Because."));
});

test("a commit inside the footprint: check runs; outside it: check names the path and does not run (LOOP-035)", () => {
  const root = repo();
  writeFileSync(join(root, "src/exit"), "0\n\n"); commit(root);
  let r = cairn(root, "check");
  assert.match(r.stdout, /recorded .cairn\/evidence\/R-001/, "declared input: runs");
  writeFileSync(join(root, "unrelated.txt"), "z\n"); commit(root);
  r = cairn(root, "check");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: declare unrelated\.txt/);
  assert.doesNotMatch(r.stdout, /recorded/);
  assert.match(cairn(root, "wake").stdout, /^Resolve: declare unrelated\.txt/, "wake reports the same, ahead of mechanisms");
});

test("a file under .cairn/ or docs/ is never a breach", () => {
  const root = repo(); green(root);
  writeFileSync(join(root, "docs/notes.md"), "n\n"); writeFileSync(join(root, ".cairn/backlog/x.md"), "# x\n"); commit(root); review(root);
  assert.match(cairn(root, "wake").stdout, /^Done: first/);
});

test("declaring the path as an input clears the breach", () => {
  const root = repo();
  writeFileSync(join(root, "unrelated.txt"), "z\n"); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolve: declare unrelated\.txt/);
  writeFileSync(join(root, ".cairn/mechanisms/m"), fromFile("R-001", "R-002").replace("inputs:\n", "inputs:\n  - unrelated.txt\n")); commit(root);
  assert.doesNotMatch(cairn(root, "wake").stdout, /declare unrelated/);
});

test("reverting the change and writing a backlog item clears the breach", () => {
  const root = repo();
  writeFileSync(join(root, "unrelated.txt"), "z\n"); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolve: declare unrelated\.txt/);
  writeFileSync(join(root, "unrelated.txt"), "y\n");
  cairn(root, "backlog", "--title", "Change unrelated", "--body", "Later commitment."); commit(root);
  assert.doesNotMatch(cairn(root, "wake").stdout, /declare unrelated/);
  assert.ok(existsSync(join(root, ".cairn/backlog/change-unrelated.md")));
});

test("a commitment naming a requirement the spec set does not hold as Agreed is repaired (LOOP-029)", () => {
  const root = repo({ "docs/commitments/first.md": "# First\n\nSlug: first\nRequirements: R-001, R-003\n" });
  const r = cairn(root, "wake");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: repair docs\/commitments\/first\.md/);
  assert.match(r.stdout, /R-003 is not an Agreed requirement/);
});

test("a requirement in a Draft spec file is not Agreed", () => {
  const root = repo({ "docs/spec/draft.md": "# D\n\nStatus: Draft\nPrefix: R\n\n[R-003] Maybe MUST.\nFalsifier: no.\n",
                      "docs/commitments/first.md": "# First\n\nSlug: first\nRequirements: R-001, R-003\n" });
  assert.match(cairn(root, "wake").stdout, /R-003 is not an Agreed requirement/);
});
