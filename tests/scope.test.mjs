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

test("a commit inside the footprint: check runs; outside it: check names the path and does not run (LOOP-015, LOOP-035)", () => {
  const root = repo();
  writeFileSync(join(root, "src/exit"), "0\n\n"); commit(root);
  let r = cairn(root, "check");
  assert.match(r.stdout, /recorded .cairn\/evidence\/runs\/\S+ R-001/, "declared input: runs");
  writeFileSync(join(root, "unrelated.txt"), "z\n"); commit(root);
  r = cairn(root, "check");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: scope unrelated\.txt/);
  assert.doesNotMatch(r.stdout, /^recorded \.cairn\/evidence\//m);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: scope unrelated\.txt/, "wake reports the same, ahead of mechanisms");
});

test("Cairn's records are never a breach; another file under docs/ is (LOOP-117)", () => {
  const root = repo(); green(root);
  writeFileSync(join(root, "docs/spec/notes.md"), "# Notes\n"); writeFileSync(join(root, "docs/recon.md"), "# Recon\n"); writeFileSync(join(root, ".cairn/backlog/x.md"), "# x\n\nPromoted to: later\n"); commit(root); review(root);
  assert.match(cairn(root, "wake").stdout, /^Done: first/);
  writeFileSync(join(root, "docs/notes.md"), "n\n"); commit(root); review(root);
  const out = cairn(root, "wake").stdout;
  assert.match(out, /^Resolvable: scope docs\/notes\.md/); assert.match(out, /LOOP-035/);
});

test("declaring the path as an input clears the breach", () => {
  const root = repo();
  writeFileSync(join(root, "unrelated.txt"), "z\n"); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: scope unrelated\.txt/);
  writeFileSync(join(root, ".cairn/mechanisms/m"), fromFile("R-001", "R-002").replace("inputs:\n", "inputs:\n  - unrelated.txt\n")); commit(root);
  assert.doesNotMatch(cairn(root, "wake").stdout, /scope unrelated/);
});

test("a revert preserves the record of an out-of-scope commit (LOOP-047)", () => {
  const root = repo();
  writeFileSync(join(root, "unrelated.txt"), "z\n"); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: scope unrelated\.txt/);
  writeFileSync(join(root, "unrelated.txt"), "y\n");
  cairn(root, "backlog", "--title", "Change unrelated", "--body", "Later commitment."); commit(root);
  assert.match(cairn(root, "wake").stdout, /scope unrelated/);
  assert.ok(existsSync(join(root, ".cairn/backlog/change-unrelated.md")));
});

test("a commitment naming a requirement the spec set does not hold as Agreed is repaired (LOOP-029)", () => {
  const root = repo({ "docs/commitments/first.md": "# First\n\nSlug: first\nRequirements: R-001, R-003\n" });
  const r = cairn(root, "wake");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: repair docs\/commitments\/first\.md/);
  assert.match(r.stdout, /R-003 is not an Agreed requirement/);
});

test("a requirement in a Draft spec file is not Agreed", () => {
  const root = repo({ "docs/spec/draft.md": "# D\n\nStatus: Draft\nPrefix: R\n\n[R-003] Maybe MUST.\nFalsifier: no.\n",
                      "docs/commitments/first.md": "# First\n\nSlug: first\nRequirements: R-001, R-003\n" });
  assert.match(cairn(root, "wake").stdout, /R-003 is not an Agreed requirement/);
});

 test("working agreements and the ignore file are Cairn records (LOOP-035, LOOP-036)", () => {
  const root = repo(); green(root);
  writeFileSync(join(root, "AGENTS.md"), "# agreement\n"); writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");   // an include file is one whose whole content is @AGENTS.md (LOOP-122)
  writeFileSync(join(root, ".gitignore"), ".cairn/in-progress\ntarget/\n"); commit(root); review(root);
  assert.match(cairn(root, "wake").stdout, /^Done: first/);
});
