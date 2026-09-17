// A defect that an Agreed requirement already forbids is fixed, not
// promoted: named before any promotion, counted only with passing
// evidence at or after its fix and no Agreed text changed (LOOP-087, LOOP-140).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, git, review, fromFile } from "./helpers.mjs";

const SPEC = "# Test\n\nStatus: Agreed 2026-09-04\nPrefix: R\n\n[R-001] The thing MUST work.\nFalsifier: it does not.\n\n[R-002] The other thing MUST work.\nFalsifier: it does not.\n\n[R-003] A thing outside the commitment MUST work.\nFalsifier: it does not.\n";
const repo = () => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), "docs/spec/test.md": SPEC });
const green = (root) => { cairn(root, "check"); review(root); commit(root, "green"); };
const sha = (root) => git(root, "rev-parse", "HEAD").stdout.trim();

test("--defect needs --from naming an Agreed requirement, and writes Defect: yes (LOOP-140)", () => {
  const root = repo();
  assert.equal(cairn(root, "backlog", "--defect", "--title", "T", "--body", "b").status, 3);
  assert.equal(cairn(root, "backlog", "--defect", "--title", "T", "--body", "b", "--from", "R-999").status, 3);
  assert.equal(cairn(root, "backlog", "--defect", "--next-iteration", "--changes", "R-001", "--title", "T", "--body", "b", "--from", "R-001").status, 3);
  const r = cairn(root, "backlog", "--defect", "--title", "The thing breaks on empty input", "--body", "b", "--from", "R-001");
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(root, ".cairn/backlog/the-thing-breaks-on-empty-input.md"), "utf8"), /^Surfaced from: R-001\nDefect: yes$/m);
});

test("an unfixed defect is named fix before a promotable item, and counts as fixed only with passing evidence at or after its commit and no Agreed text changed (LOOP-087, LOOP-140)", () => {
  const root = repo(); green(root);
  cairn(root, "backlog", "--title", "An idea", "--body", "b", "--from", "R-002", "--outside", "found after Done");
  cairn(root, "backlog", "--defect", "--title", "Empty input breaks", "--body", "b", "--from", "R-001", "--outside", "found after Done"); commit(root, "captured");
  const item = join(root, ".cairn/backlog/empty-input-breaks.md");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: fix \.cairn\/backlog\/empty-input-breaks\.md\n.*no Fixed by: line/, "fix comes before promote");
  appendFileSync(item, `Fixed by: ${sha(root)}\n`); commit(root, "a Fixed by with no evidence after it");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: fix [\s\S]*R-001 has no passing evidence at or after/);
  const spec = join(root, "docs/spec/test.md");
  writeFileSync(spec, readFileSync(spec, "utf8").replace("A thing outside the commitment MUST work.", "A thing outside the commitment MUST work quickly.")); commit(root, "a fix that changes Agreed text");
  const contract = sha(root);
  writeFileSync(item, readFileSync(item, "utf8").replace(/^Fixed by: .*$/m, `Fixed by: ${contract}`)); commit(root, "cite it");
  assert.match(cairn(root, "wake").stdout, /changes the Agreed requirement R-003, so it is a promotion/, "a contract change does not count as a fix");
  git(root, "revert", "--no-edit", contract);
  writeFileSync(join(root, "src/exit"), "0\n\n"); commit(root, "the fix");
  const fix = sha(root);
  writeFileSync(item, readFileSync(item, "utf8").replace(/^Fixed by: .*$/m, `Fixed by: ${fix}`)); commit(root, "cite the fix");
  cairn(root, "check"); review(root); commit(root, "checked and reviewed");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: promote\n.*an-idea/, "fixed: the promotion comes next, and the defect is not a candidate");
  assert.doesNotMatch(cairn(root, "wake").stdout, /empty-input-breaks/);
});
