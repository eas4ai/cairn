// Two mechanisms speak for one requirement: each must pass, a named check
// runs both, --stale runs the stale one, and attempts count per mechanism.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, review, fromFile, passing, records } from "./helpers.mjs";

const two = (o = {}) => base({ ".cairn/mechanisms/a": fromFile("R-001"), ".cairn/mechanisms/b": passing("R-001", "R-002"), ...o });
const mechanismOf = (root, p) => /^mechanism: (.*)$/m.exec(readFileSync(join(root, p), "utf8"))[1];
const wake = (root) => cairn(root, "wake").stdout;
const setExit = (root, code) => { writeFileSync(join(root, "src/exit"), `${code}\n`); commit(root, `exit ${code}`); };

test("a second declaration for one requirement is accepted, a named check runs every mechanism, and Done needs each to pass (LOOP-056, LOOP-099)", () => {
  const root = two();
  assert.match(wake(root), /^Resolvable: run R-001/);
  const r = cairn(root, "check", "R-001");
  assert.equal((r.stdout.match(/recorded .* R-001: pass/g) ?? []).length, 2, r.stdout);
  assert.deepEqual(records(root, "R-001").map((p) => mechanismOf(root, p)).sort(), ["a", "b"]);
  review(root); commit(root, "green");
  assert.match(wake(root), /^Done: first/);
  setExit(root, 1);
  cairn(root, "check", "R-001");
  const out = wake(root);
  assert.match(out, /^Resolvable: implement R-001/); assert.match(out, /regression/); assert.match(out, /\(a\)/);
  setExit(root, 0);
  cairn(root, "check", "R-001"); review(root); commit(root, "green again");
  assert.match(wake(root), /^Done: first/);
});

test("one mechanism's stale evidence names that mechanism, and --stale runs only it (LOOP-056, LOOP-094)", () => {
  const root = two();
  cairn(root, "check"); review(root); commit(root, "green");
  writeFileSync(join(root, "src/other"), "changed\n"); commit(root, "touch b's input");
  const out = wake(root);
  assert.match(out, /^Resolvable: run R-001/); assert.match(out, /a declared input changed \(b\)/);
  const r = cairn(root, "check", "--stale");
  assert.equal((r.stdout.match(/recorded /g) ?? []).length, 2, "b runs once, for R-001 and R-002: " + r.stdout);
  assert.equal(records(root, "R-001").length, 3, "a did not run");
  assert.equal(mechanismOf(root, records(root, "R-001").at(-1)), "b");
});

test("attempts are counted within one mechanism's records, so the other's passes do not reset them (LOOP-100, DEC-016)", () => {
  const root = two();
  cairn(root, "check");
  for (const code of [1, 2, 3]) { setExit(root, code); cairn(root, "check"); }
  assert.equal(records(root, "R-001").length, 8);
  const out = wake(root);
  assert.match(out, /^Resolvable: escalate R-001/); assert.match(out, /DEC-016/);
});
