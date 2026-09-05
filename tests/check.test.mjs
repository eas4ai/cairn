// cairn check: runs the commitment's mechanisms against a committed tree
// and records evidence with receipts. Fixtures are real git repositories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from "node:fs";
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
  assert.match(r.stdout, /^Resolvable: implement R-001/m);
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
  assert.match(r.stdout, /^Resolvable: run R-001/);
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
  assert.match(r.stdout, /^Resolvable: implement R-001/);
  assert.match(r.stdout, /regression/);
});

test("three attempts with no escalation since: wake says escalate, not a fourth (DEC-016, DEC-017, DEC-018)", () => {
  const root = repo();
  writeFileSync(join(root, "src/exit"), "1\n"); commit(root);
  cairn(root, "check");                                                   // the baseline: not an attempt
  cairn(root, "check"); cairn(root, "check"); cairn(root, "check");        // runs at the baseline's inputs: still the baseline
  writeFileSync(join(root, "src/exit"), "2\n"); commit(root); cairn(root, "check"); cairn(root, "check");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: implement R-001/, "one attempt, twice run");
  writeFileSync(join(root, "src/exit"), "3\n"); commit(root); cairn(root, "check");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: implement R-001/, "two attempts");
  writeFileSync(join(root, "src/exit"), "4\n"); commit(root); cairn(root, "check");
  const r = cairn(root, "wake");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: escalate R-001/);
  assert.match(r.stdout, /three consecutive/);
  writeFileSync(join(root, ".cairn/escalations/r-001.md"), "Question: x\nConcerns: R-001\nStatus: open\nRaised: 2999-01-01T00:00:00Z\n");
  assert.match(cairn(root, "wake").stdout, /^Escalate: present r-001/, "an escalation since the run is honored");
});

test("the review gate: no review, stale review, open finding, then Done", () => {
  const root = repo();
  cairn(root, "check");
  let r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolvable: review first/);
  review(root, ["open: the digest is computed twice"]);
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolvable: resolve first/);
  review(root, ["resolved: the digest is computed twice"]);
  r = cairn(root, "wake");
  assert.equal(r.status, 0); assert.match(r.stdout, /^Done: first/);
  writeFileSync(join(root, "docs/notes.md"), "changed\n"); commit(root);
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Done: first/, "a commit touching no declared input does not stale the review");
  writeFileSync(join(root, "src/exit"), "0\n\n"); commit(root);
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolvable: run R-001/, "evidence goes stale first");
  cairn(root, "check");
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolvable: review first/, "then the review, because a declared input changed since it");
});

test("Done is refused while any requirement lacks current passing evidence", () => {
  const root = repo();
  review(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
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

test("a linked declared input digests the same at a commit and in the tree (LOOP-023, LOOP-024)", () => {
  const root = repo({ ".cairn/mechanisms/m": "command: node -e 0\ninputs:\n  - src/link\nrequirements:\n  - R-001\n  - R-002\n" });
  symlinkSync("exit", join(root, "src/link")); commit(root, "link");
  cairn(root, "check"); review(root);
  const r = cairn(root, "wake");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^Done: first/, "the review examined a commit whose link digests as the tree's does");
  rmSync(join(root, "src/link")); symlinkSync("other", join(root, "src/link")); commit(root, "relink");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/, "re-pointing the link changes the declared input");
});

test("a result line is the mechanism's statement about one requirement; what it did not mention is unverified (LOOP-037, LOOP-052)", () => {
  const root = repo({ ".cairn/mechanisms/m": `command: node -e "console.log('cairn: R-002: pass'); process.exit(1)"\ninputs:\n  - src/other\nrequirements:\n  - R-001\n  - R-002\n` });
  const r = cairn(root, "check");
  const rec = (req) => readFileSync(join(root, ".cairn/evidence", req, records(root, req)[0]), "utf8");
  assert.ok(rec("R-001").includes("result: unverified") && rec("R-001").includes("source: none"), rec("R-001"));
  assert.ok(rec("R-002").includes("result: pass") && rec("R-002").includes("source: line"), rec("R-002"));
  assert.match(r.stdout, /R-002\/.*: pass \(by line\)/);
  assert.match(r.stdout, /R-001\/.*: unverified \(not reported\)/);
  assert.match(r.stdout, /^Resolvable: implement R-001/m);
  assert.match(r.stdout, /latest evidence is unverified \(m, exit 1\)/);
});

test("a mechanism that says nothing is read by its exit code for every requirement (LOOP-039)", () => {
  const root = repo({ ".cairn/mechanisms/m": `command: node -e "console.log('ok 1 - cairn: LOOP-001: pass is a test name, not a line'); process.exit(0)"\ninputs:\n  - src/other\nrequirements:\n  - R-001\n  - R-002\n` });
  cairn(root, "check");
  for (const req of ["R-001", "R-002"]) assert.ok(readFileSync(join(root, ".cairn/evidence", req, records(root, req)[0]), "utf8").includes("result: pass\nsource: exit"));
});

test("unverified is not an attempt, and a return to an earlier failed digest counts once (DEC-017, DEC-018)", () => {
  const root = repo({ ".cairn/mechanisms/m": `command: node -e "const e=require('fs').readFileSync('src/exit','utf8').trim(); console.log('cairn: R-002: pass'); if (e!=='u') console.log('cairn: R-001: fail'); process.exit(1)"\ninputs:\n  - src/exit\nrequirements:\n  - R-001\n  - R-002\n` });
  writeFileSync(join(root, "src/exit"), "1\n"); commit(root); cairn(root, "check");   // baseline at d1
  writeFileSync(join(root, "src/exit"), "2\n"); commit(root); cairn(root, "check");   // attempt 1 at d2
  writeFileSync(join(root, "src/exit"), "u\n"); commit(root); cairn(root, "check");   // R-001 unverified: not an attempt
  writeFileSync(join(root, "src/exit"), "2\n"); commit(root); cairn(root, "check");   // back to d2: counts once
  writeFileSync(join(root, "src/exit"), "1\n"); commit(root); cairn(root, "check");   // back to the baseline's digest: never
  assert.match(cairn(root, "wake").stdout, /^Resolvable: implement R-001/, "one attempt so far");
  writeFileSync(join(root, "src/exit"), "3\n"); commit(root); cairn(root, "check");   // attempt 2
  assert.match(cairn(root, "wake").stdout, /^Resolvable: implement R-001/);
  writeFileSync(join(root, "src/exit"), "4\n"); commit(root); cairn(root, "check");   // attempt 3
  assert.match(cairn(root, "wake").stdout, /^Resolvable: escalate R-001/);
});

test("a result line for a requirement the mechanism does not speak for is named and writes nothing (LOOP-038)", () => {
  const root = repo({ ".cairn/mechanisms/m": `command: node -e "console.log('cairn: R-002: pass')"\ninputs:\n  - src/other\nrequirements:\n  - R-001\n` });
  const r = cairn(root, "check");
  assert.match(r.stdout, /ignored R-002: pass; m does not speak for it/);
  assert.equal(records(root, "R-002").length, 0);
  assert.equal(records(root, "R-001").length, 1);
});

test("a result line inside ordinary output, or without the marker, does not count", () => {
  const root = repo({ ".cairn/mechanisms/m": `command: node -e "console.log('note cairn: R-002: pass here'); console.log('R-002: pass'); console.log('cairn: R-002: passed')"\ninputs:\n  - src/other\nrequirements:\n  - R-001\n  - R-002\n` });
  cairn(root, "check");
  assert.ok(readFileSync(join(root, ".cairn/evidence/R-002", records(root, "R-002")[0]), "utf8").includes("source: exit"));
});

test("a targeted check runs the named requirements' mechanisms and records every requirement they speak for (LOOP-040)", () => {
  const root = repo();
  writeFileSync(join(root, ".cairn/mechanisms/n"), failing("R-002").replace("R-002", "R-003")); // a mechanism for a requirement outside the commitment
  const r = cairn(root, "check", "R-001");
  assert.equal(records(root, "R-001").length, 1);
  assert.equal(records(root, "R-002").length, 1, "the run spoke for R-002 too");
  assert.equal(records(root, "R-003").length, 0, "n was not selected");
  assert.doesNotMatch(r.stdout, /skipped/);
});

test("two result lines for one requirement: a fail on any line wins", () => {
  const root = repo({ ".cairn/mechanisms/m": `command: node -e "console.log('cairn: R-001: fail'); console.log('cairn: R-001: pass')"\ninputs:\n  - src/other\nrequirements:\n  - R-001\n  - R-002\n` });
  cairn(root, "check");
  assert.ok(readFileSync(join(root, ".cairn/evidence/R-001", records(root, "R-001")[0]), "utf8").includes("result: fail"));
});

test("three runs at one digest with no attempt since: the verdict stays implement and names DEC-019; an escalation naming it among others clears the hint (DEC-019, LOOP-053)", () => {
  const root = repo();
  writeFileSync(join(root, "src/exit"), "1\n"); commit(root);
  cairn(root, "check"); cairn(root, "check");
  assert.doesNotMatch(cairn(root, "wake").stdout, /DEC-019/);
  cairn(root, "check");
  let r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolvable: implement R-001/);
  assert.match(r.stdout, /DEC-019/);
  writeFileSync(join(root, ".cairn/escalations/gate.md"), "DECISION\n\nQuestion:   host cache\n\nConcerns: R-009, R-001\nStatus: open\nRaised: 2999-01-01T00:00:00Z\n");
  assert.match(cairn(root, "wake").stdout, /^Escalate: present gate/);
  writeFileSync(join(root, ".cairn/escalations/gate.md"), "DECISION\n\nQuestion:   host cache\n\nConcerns: R-009, R-001\nStatus: open\nRaised: 2999-01-01T00:00:00Z\nAnswer: ok\n");
  r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolvable: implement R-001/);
  assert.doesNotMatch(r.stdout, /DEC-019/, "an answered escalation that names R-001 in a list counts");
});
