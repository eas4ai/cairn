// cairn check --stale: runs once each mechanism whose requirement has
// missing or stale evidence, nothing else, and says why the rest waited.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, fromFile, passing, records } from "./helpers.mjs";

const two = () => base({ ".cairn/mechanisms/m1": fromFile("R-001"), ".cairn/mechanisms/m2": passing("R-002") });
const latest = (root, req) => readFileSync(join(root, ".cairn/evidence", req, records(root, req).at(-1)), "utf8");

test("after a green check --stale runs nothing; after one input changes it runs only that mechanism (LOOP-094)", () => {
  const root = two();
  cairn(root, "check");
  assert.equal(records(root, "R-001").length, 1); assert.equal(records(root, "R-002").length, 1);
  let r = cairn(root, "check", "--stale");
  assert.match(r.stdout, /nothing stale/);
  assert.equal(records(root, "R-001").length, 1); assert.equal(records(root, "R-002").length, 1);
  writeFileSync(join(root, "src/other"), "changed\n"); commit(root, "touch m2's input");
  r = cairn(root, "check", "--stale");
  assert.match(r.stdout, /recorded .cairn\/evidence\/R-002/);
  assert.equal(records(root, "R-002").length, 2, "the stale mechanism ran");
  assert.equal(records(root, "R-001").length, 1, "the current mechanism did not");
});

test("a mechanism speaking for two stale requirements runs once and refreshes both (LOOP-094, LOOP-040)", () => {
  const root = base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
  cairn(root, "check");
  writeFileSync(join(root, "src/exit"), "0 \n"); commit(root, "touch the input");
  const r = cairn(root, "check", "--stale");
  assert.equal(records(root, "R-001").length, 2); assert.equal(records(root, "R-002").length, 2);
  const out = (req) => /^output: (.*)$/m.exec(latest(root, req))[1];
  assert.equal(out("R-001"), out("R-002"), "one run, one output file, two records");
  assert.equal((r.stdout.match(/recorded /g) ?? []).length, 2);
});

test("a fresh failure and an unverified result are skipped with implement named (LOOP-094)", () => {
  const root = base({
    "docs/spec/test.md": "# Test\n\nStatus: Agreed 2026-09-04\nPrefix: R\n\n[R-001] The thing MUST work.\nFalsifier: it does not.\n\n[R-002] The other thing MUST work.\nFalsifier: it does not.\n\n[R-003] The third thing MUST work.\nFalsifier: it does not.\n",
    "docs/commitments/first.md": "# First\n\nSlug: first\nRequirements: R-001, R-002, R-003\n",
    ".cairn/mechanisms/m1": fromFile("R-001"),
    ".cairn/mechanisms/m2": `command: node -e "console.log('cairn: R-002: pass')"\ninputs:\n  - src/other\nrequirements:\n  - R-002\n  - R-003\n`,
    "src/exit": "1\n" });
  cairn(root, "check");
  assert.match(latest(root, "R-001"), /result: fail/); assert.match(latest(root, "R-003"), /result: unverified/);
  const r = cairn(root, "check", "--stale");
  assert.match(r.stdout, /skipped R-001: latest evidence is fail and not stale; implement/);
  assert.match(r.stdout, /skipped R-003: latest evidence is unverified and not stale; implement/);
  assert.match(r.stdout, /nothing stale/);
  assert.equal(records(root, "R-001").length, 1); assert.equal(records(root, "R-003").length, 1);
});

test("--stale with a requirement identifier is refused (LOOP-094)", () => {
  const root = two();
  const r = cairn(root, "check", "--stale", "R-001");
  assert.equal(r.status, 3); assert.match(r.stderr, /--stale/);
  assert.equal(records(root, "R-001").length, 0);
});
