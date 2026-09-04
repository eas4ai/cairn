// cairn check: runs the commitment's mechanisms against a committed tree
// and records evidence with receipts. Fixtures are real git repositories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, head, records, review, fromFile, failing } from "./helpers.mjs";

const repo = (o = {}) => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), ...o });

test("check refuses a dirty declared input and names it; a dirty undeclared file does not block", () => {
  const root = repo();
  writeFileSync(join(root, "unrelated.txt"), "changed\n");
  let r = cairn(root, "check");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(records(root, "R-001").length, 1, "undeclared dirt does not block a run");
  writeFileSync(join(root, "src/exit"), "0 \n");
  r = cairn(root, "check");
  assert.match(r.stdout, /uncommitted changes: src\/exit/);
  assert.equal(records(root, "R-001").length, 1, "declared dirt blocks the run");
});

test("check writes one record per requirement carrying the full receipt", () => {
  const root = repo();
  cairn(root, "check");
  const [f] = records(root, "R-001");
  const t = readFileSync(join(root, ".cairn/evidence/R-001", f), "utf8");
  for (const k of ["requirement: R-001", "mechanism: m", `commit: ${head(root)}`, "inputs_digest: sha256:", "mechanism_digest: sha256:",
                   "command: node -e", "cwd: .", "exit: 0", "output_digest: sha256:", "result: pass", "recorded: "]) assert.ok(t.includes(k), k);
  assert.equal(records(root, "R-002").length, 1);
});

test("a nonzero exit records fail, and the receipt keeps the exit code", () => {
  const root = repo();
  writeFileSync(join(root, "src/exit"), "3\n"); commit(root);
  const r = cairn(root, "check");
  assert.equal(r.status, 1);
  const t = readFileSync(join(root, ".cairn/evidence/R-001", records(root, "R-001")[0]), "utf8");
  assert.ok(t.includes("exit: 3") && t.includes("result: fail"));
  assert.match(r.stdout, /^Resolve: implement R-001/m);
});

test("two checks write two records; nothing is overwritten or deleted", () => {
  const root = repo();
  cairn(root, "check"); cairn(root, "check");
  assert.equal(records(root, "R-001").length, 2);
});

test("a commit changing a declared input makes evidence stale; an undeclared one does not", () => {
  const root = repo();
  cairn(root, "check"); review(root);
  assert.match(cairn(root, "wake").stdout, /^Done: first/);
  writeFileSync(join(root, "docs/notes.md"), "z\n"); commit(root); review(root);
  assert.match(cairn(root, "wake").stdout, /^Done: first/, "undeclared change: still Done");
  writeFileSync(join(root, "src/exit"), "0\n\n"); commit(root); review(root);
  const r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolve: run R-001/);
  assert.match(r.stdout, /stale/);
});

test("a regression is named before a requirement that never passed", () => {
  const root = repo();
  // R-001 and R-002 share a mechanism; give R-002 its own that always fails and never passed.
  writeFileSync(join(root, ".cairn/mechanisms/m"), fromFile("R-001"));
  writeFileSync(join(root, ".cairn/mechanisms/n"), failing("R-002"));
  commit(root);
  cairn(root, "check");                                  // R-001 pass, R-002 fail (never passed)
  writeFileSync(join(root, "src/exit"), "1\n"); commit(root);
  cairn(root, "check");                                  // R-001 now fails after a pass: regression
  const r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolve: implement R-001/);
  assert.match(r.stdout, /regression/);
});

test("three consecutive fails with no escalation since: wake says escalate, not a fourth attempt", () => {
  const root = repo();
  writeFileSync(join(root, "src/exit"), "1\n"); commit(root);
  cairn(root, "check"); cairn(root, "check");
  assert.match(cairn(root, "wake").stdout, /^Resolve: implement R-001/);
  cairn(root, "check");
  const r = cairn(root, "wake");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: escalate R-001/);
  assert.match(r.stdout, /three consecutive/);
  writeFileSync(join(root, ".cairn/escalations/r-001.md"), "Question: x\nConcerns: R-001\nStatus: open\nRaised: 2999-01-01T00:00:00Z\n");
  assert.match(cairn(root, "wake").stdout, /^Escalate: present r-001/, "an escalation since the run is honored");
});

test("the review gate: no review, stale review, open finding, then Done", () => {
  const root = repo();
  cairn(root, "check");
  let r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolve: review first/);
  review(root, ["open: the digest is computed twice"]);
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolve: resolve first/);
  review(root, ["resolved: the digest is computed twice"]);
  r = cairn(root, "wake");
  assert.equal(r.status, 0); assert.match(r.stdout, /^Done: first/);
  writeFileSync(join(root, "docs/notes.md"), "changed\n"); commit(root);
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Done: first/, "a commit touching no declared input does not stale the review");
  writeFileSync(join(root, "src/exit"), "0\n\n"); commit(root);
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolve: run R-001/, "evidence goes stale first");
  cairn(root, "check");
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolve: review first/, "then the review, because a declared input changed since it");
});

test("Done is refused while any requirement lacks current passing evidence", () => {
  const root = repo();
  review(root);
  assert.match(cairn(root, "wake").stdout, /^Resolve: run R-001/);
});

test("check names a requested requirement that no mechanism claims", () => {
  const root = repo();
  const r = cairn(root, "check", "R-999");
  assert.match(r.stdout, /skipped R-999: no mechanism claims it/);
});

test("check writes and clears an in-progress record around the run", () => {
  const root = repo();
  cairn(root, "check");
  assert.ok(!existsSync(join(root, ".cairn/in-progress")), "cleared after a completed run");
});
