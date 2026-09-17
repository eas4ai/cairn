// No commitment is Done on the builder's review alone: an independent
// report at the review's commit, with every finding carried (LOOP-020).
import { test } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, review, fromFile } from "./helpers.mjs";

const repo = () => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
const wake = (root) => cairn(root, "wake").stdout;

test("no independent report, one at another commit, or a finding it raises that the review does not carry keeps the wake from Done; carried, Done follows (LOOP-020)", () => {
  const root = repo();
  cairn(root, "check");
  review(root, [], null); commit(root, "the builder's review alone");
  assert.match(wake(root), /^Resolvable: review first\n.*no independent report at \.cairn\/reviews\/first\.independent\.md/);
  writeFileSync(join(root, ".cairn/reviews/first.independent.md"), "commitment: first\ncommit: 0000000\nreviewer: a fresh reviewer\nexamined:\n  - x\nfindings: []\n"); commit(root, "a report at another commit");
  assert.match(wake(root), /^Resolvable: review first\n.*names commit 0000000, and the review examined/);
  review(root, [], ["empty input breaks the thing"]); commit(root, "a report with a finding the review does not carry");
  assert.match(wake(root), /^Resolvable: review first\n.*not in the review as open or resolved: empty input breaks the thing/);
  review(root, ["open: empty input breaks the thing"], ["empty input breaks the thing"]); commit(root, "carried as open");
  assert.match(wake(root), /^Resolvable: resolve first/, "an open finding is resolved first, as before");
  review(root, ["resolved: empty input breaks the thing. Resolved: the guard reads an empty file"], ["empty input breaks the thing"]); commit(root, "carried as resolved");
  assert.match(wake(root), /^Done: /);
});
