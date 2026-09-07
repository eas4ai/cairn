import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, commit, fromFile, review } from "./helpers.mjs";

const finding = "REM-002: Historical agent checks remain inside role-input JSON rather than readable sections.";
function ready(findings) {
  const root = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
  assert.match(cairn(root, "check").stdout, /^recorded /m);
  commit(root, "passing evidence");
  review(root, findings);
  return root;
}

test("DemonCoder REM-002 and Status in progress cannot silently satisfy the review gate (LOOP-086)", () => {
  const root = ready([finding]), path = join(root, ".cairn/reviews/first.md");
  writeFileSync(path, readFileSync(path, "utf8") + "Status: in progress\n");
  commit(root, "review with unrecognized finding");
  for (const command of ["wake", "check"]) {
    const r = cairn(root, command);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /^Resolvable: repair .cairn\/reviews\/first.md/m);
    assert.match(r.stdout, /REM-002/);
    assert.match(r.stdout, /open:/); assert.match(r.stdout, /resolved:/);
    assert.doesNotMatch(r.stdout, /^Done:/m);
  }
});

for (const [name, findings, expected] of [
  ["open", ["open: Fix the role-input representation."], /^Resolvable: resolve first/],
  ["resolved", ["resolved: Role-input representation corrected."], /^Done:/],
  ["empty", [], /^Done:/],
  ["mixed valid", ["resolved: Earlier issue corrected.", "open: Remaining issue."], /^Resolvable: resolve first/],
]) test(`valid ${name} findings retain their behavior`, () => {
  const root = ready(findings); commit(root, "record review");
  assert.match(cairn(root, "wake").stdout, expected);
});

for (const entry of ["open:", "resolved:   ", "Open: incorrect case", "unknown: issue", "\u001b[31mBAD: issue"]) {
  test(`malformed finding ${JSON.stringify(entry)} requires repair`, () => {
    const root = ready(["resolved: Earlier issue fixed.", entry]); commit(root);
    const r = cairn(root, "wake");
    assert.equal(r.status, 1); assert.match(r.stdout, /^Resolvable: repair .cairn\/reviews\/first.md/m);
    assert.ok(!r.stdout.includes("\u001b"));
  });
}

test("a scalar findings value requires the supported list format", () => {
  const root = ready([]), path = join(root, ".cairn/reviews/first.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("findings:\n", "findings: REM-002: unresolved\n")); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: repair .cairn\/reviews\/first.md/);
});
