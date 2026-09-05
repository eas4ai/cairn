import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, commit, records, review } from "./helpers.mjs";

const declaration = (command, mode = "per-requirement") => `command: ${command}\n${mode === null ? "" : `results: ${mode}\n`}inputs:\n  - src/\nrequirements:\n  - R-001\n  - R-002\n`;
const record = (root, req) => readFileSync(join(root, ".cairn/evidence", req, records(root, req).at(-1)), "utf8");

for (const exit of [0, 1]) test(`explicit reporting with no lines and exit ${exit} establishes no requirement verdicts`, () => {
  const root = repo({ ".cairn/mechanisms/m": declaration(`node -e "process.exit(${exit})"`) });
  cairn(root, "check"); review(root);
  for (const req of ["R-001", "R-002"]) {
    assert.match(record(root, req), /result: unverified\nsource: none/);
    assert.ok(record(root, req).includes(`exit: ${exit}\n`));
  }
  assert.notEqual(cairn(root, "wake").status, 0);
});

test("a reporter that cannot start keeps execution diagnostics without blaming requirements", () => {
  const root = repo({ ".cairn/mechanisms/m": declaration("./missing-reporter") });
  cairn(root, "check");
  assert.match(record(root, "R-001"), /result: unverified/);
  assert.match(record(root, "R-001"), /exit: 127/);
  const path = /^stderr_output: (.*)$/m.exec(record(root, "R-001"))[1];
  assert.match(readFileSync(join(root, path), "utf8"), /missing-reporter/);
});

test("large output cannot kill a reporter or invent a requirement verdict", () => {
  const root = repo({ ".cairn/mechanisms/m": declaration('node -e "process.stdout.write(\'x\'.repeat(3000000))"') });
  cairn(root, "check");
  assert.match(record(root, "R-001"), /result: unverified/);
  assert.match(record(root, "R-001"), /execution_error: null/);
  assert.match(record(root, "R-001"), /exit: 0/);
});

for (const output of ["cairn: R-999: pass", "cairn: R-001: unverified", "cairn: R-001: passed"]) test(`explicit mode ignores ${output}`, () => {
  const root = repo({ ".cairn/mechanisms/m": declaration(`node -e "console.log('${output}')"`) });
  cairn(root, "check");
  assert.match(record(root, "R-001"), /result: unverified/);
  assert.match(record(root, "R-002"), /result: unverified/);
  assert.equal(records(root, "R-999").length, 0);
});

test("explicit results survive nonzero exit and contradictory duplicates still fail", () => {
  const root = repo({ ".cairn/mechanisms/m": declaration('node -e "console.log(\'cairn: R-002: pass\'); process.exit(1)"') });
  cairn(root, "check");
  assert.match(record(root, "R-001"), /result: unverified/);
  assert.match(record(root, "R-002"), /result: pass\nsource: line/);
  writeFileSync(join(root, ".cairn/mechanisms/m"), declaration('node -e "console.log(\'cairn: R-002: fail\'); console.log(\'cairn: R-002: pass\')"')); commit(root);
  cairn(root, "check");
  assert.match(record(root, "R-002"), /result: fail\nsource: line/);
});

test("unverified results across changed inputs never become failed attempts", () => {
  const root = repo({ ".cairn/mechanisms/m": declaration('node -e "process.exit(1)"') });
  for (let i = 0; i < 5; i++) {
    writeFileSync(join(root, "src/other"), String(i)); commit(root); cairn(root, "check");
  }
  const r = cairn(root, "wake");
  assert.match(r.stdout, /^Resolvable: implement R-001/);
  assert.doesNotMatch(r.stdout, /escalate|three runs|regression/);
  assert.equal(records(root, "R-001").length, 5);
});

for (const exit of [0, 1]) test(`legacy exit ${exit} retains its interpretation`, () => {
  const root = repo({ ".cairn/mechanisms/m": declaration(`node -e "process.exit(${exit})"`, null) });
  cairn(root, "check");
  for (const req of ["R-001", "R-002"]) assert.ok(record(root, req).includes(`result: ${exit ? "fail" : "pass"}\nsource: exit`));
});

test("a misspelled reporting mode is refused before execution", () => {
  const root = repo({ ".cairn/mechanisms/m": declaration("node -e 0", "per-requirment") });
  assert.match(cairn(root, "wake").stdout, /results.*per-requirment/);
  assert.match(cairn(root, "check").stdout, /results.*per-requirment/);
  assert.equal(records(root, "R-001").length, 0);
});
