// No commitment is Done on the builder's review alone: an independent
// report at the review's commit, with every finding carried (LOOP-020).
import { test } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, review, fromFile, head, git } from "./helpers.mjs";

const repo = () => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
const wake = (root) => cairn(root, "wake").stdout;

test("no independent report, one at another commit, or a finding it raises that the review does not carry keeps the wake from Done; carried, Done follows (LOOP-020)", () => {
  const root = repo();
  cairn(root, "check");
  review(root, [], null); commit(root, "the builder's review alone");
  assert.match(wake(root), /^Resolvable: review first\n.*the review is current, and no independent report is committed at \.cairn\/reviews\/first\.independent\.md/);
  writeFileSync(join(root, ".cairn/reviews/first.independent.md"), "commitment: first\ncommit: 0000000\nreviewer: a fresh reviewer\nexamined:\n  - x\nfindings: []\n"); commit(root, "a report at another commit");
  assert.match(wake(root), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*names commit 0000000, which is not a commit/);
  review(root, [], ["empty input breaks the thing"]); commit(root, "a report with a finding the review does not carry");
  assert.match(wake(root), /^Resolvable: review first\n.*the review is current, but the independent report's finding is not in it as open or resolved: empty input breaks the thing/);
  review(root, ["open: empty input breaks the thing"], ["empty input breaks the thing"]); commit(root, "carried as open");
  assert.match(wake(root), /^Resolvable: resolve first/, "an open finding is resolved first, as before");
  review(root, ["resolved: empty input breaks the thing. Resolved: the guard reads an empty file"], ["empty input breaks the thing"]); commit(root, "carried as resolved");
  assert.match(wake(root), /^Done: [\s\S]*its independent report are clean/, "Done names the report");
});

test("a malformed, uncommitted, misdirected or loosely matched independent report never lets Done through (LOOP-020)", () => {
  const root = repo();
  cairn(root, "check");
  const report = (body) => writeFileSync(join(root, ".cairn/reviews/first.independent.md"), `commitment: first\ncommit: ${head(root)}\nreviewer: r\n${body}`);
  const at = (body, findings = []) => { review(root, findings, null); report(body); commit(root, "report"); return wake(root); };
  const repairs = /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n/;
  assert.match(at("examined:\n  - x\n"), repairs, "no findings: field");
  assert.match(at("examined:\n  - x\n\n## Findings\n\nfindings:\n  - a defect\n"), repairs, "findings under a heading");
  assert.match(at("examined:\n  - x\nfindings:\n\n  - a defect\n"), repairs, "findings after a blank line");
  assert.match(at("examined:\n  - x\nfindings: none\n"), repairs, "a scalar findings value");
  assert.match(at("examined:\n  - x\nfindings:\n  - the\n    kernel lets an empty report reach Done\n", ["resolved: the walkthrough typo, fixed"]), /wraps onto a second line/, "a wrapped finding");
  assert.match(at("examined:\n  - x\nfindings:\n  - the\n", ["resolved: the walkthrough typo, fixed"]), /^Resolvable: review first\n.*not in it as open or resolved: the \(LOOP-020\)/, "a prefix is not a carried finding");
  review(root, [], null); writeFileSync(join(root, ".cairn/reviews/first.independent.md"), `commitment: someone-else\ncommit: ${head(root)}\nexamined:\n  - x\nfindings: []\n`); commit(root, "another commitment");
  assert.match(wake(root), /names commitment someone-else, not first/);
  review(root, [], null); writeFileSync(join(root, ".cairn/reviews/first.independent.md"), `commitment: first\ncommit: ${head(root)}zzzz-not-a-sha\nexamined:\n  - x\nfindings: []\n`); commit(root, "a commit value that is not a commit");
  assert.match(wake(root), /which is not a commit/);
  review(root, [], null); writeFileSync(join(root, ".cairn/reviews/first.independent.md"), `commitment: first\ncommit: ${head(root).toUpperCase()}\nexamined:\n  - x\nfindings: []\n`); commit(root, "uppercase");
  assert.match(wake(root), /^Done: /, "the commit in uppercase is the same commit");
  assert.match(at("examined:\n  - x\nfindings:\n  - open: a defect\n", ["resolved: a defect. Resolved: fixed"]), /^Done: /, "a report copying the review's prefix is read as the same finding");
  const file = join(root, ".cairn/reviews/first.independent.md"), kept = `commitment: first\ncommit: ${head(root)}\nreviewer: r\nexamined:\n  - x\nfindings: []\n`;
  review(root, [], null); rmSync(file); commit(root, "the report leaves the commit"); writeFileSync(file, kept);   // on disk, never committed
  assert.match(wake(root), /no independent report is committed/, "a report on disk but not committed does not count");
});
