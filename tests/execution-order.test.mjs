import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { repo, cairn, commit, git, records, passing, fromFile, review, CLI } from "./helpers.mjs";

const setup = () => repo({ ".cairn/mechanisms/m": passing("R-001", "R-002").replace("node -e 0", "node -e \"process.exit(Number(process.env.CAIRN_PROBE_EXIT || 0))\"") });
function at(root, time, exit = 0, args = ["check"]) {
  const preload = join(root, ".git/clock.cjs");
  writeFileSync(preload, "const OriginalDate=Date;global.Date=class extends OriginalDate { constructor(...args){ super(...(args.length?args:[process.env.CAIRN_PROBE_TIME])); } static now(){return new OriginalDate(process.env.CAIRN_PROBE_TIME).getTime();} };\n");
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8", env: { ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preload}`, CAIRN_PROBE_TIME: time, CAIRN_PROBE_EXIT: String(exit) } });
}
const recordPath = (root, name) => join(root, ".cairn/evidence/R-001", name);

test("LOOP-070: a later failure is latest even when the clock moves backward", () => {
  const root = setup(); at(root, "2026-09-06T12:00:00.000Z"); review(root); commit(root);
  assert.equal(cairn(root, "wake").status, 0);
  const r = at(root, "2026-09-06T11:59:59.000Z", 1);
  assert.match(r.stdout, /recorded .*: fail/);
  assert.match(r.stdout, /^Resolvable: implement R-001/m);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: implement R-001/);
});

test("LOOP-070: receipt collisions at one clock instant retain execution order beyond nine suffixes", () => {
  const root = setup(), time = "2026-09-06T12:00:00.000Z";
  at(root, time); review(root); commit(root);
  for (let i = 0; i < 9; i++) at(root, time);
  const r = at(root, time, 1);
  assert.equal(records(root, "R-001").length, 11);
  assert.match(r.stdout, /^Resolvable: implement R-001/m);
});

test("LOOP-070: imported branch receipts stale a later sequence until a new check incorporates them", () => {
  const root = setup();
  git(root, "checkout", "-qb", "other"); at(root, "2026-09-06T11:00:00.000Z", 1); commit(root, "branch failure");
  git(root, "checkout", "main"); at(root, "2026-09-06T12:00:00.000Z"); commit(root, "first main pass");
  at(root, "2026-09-06T12:01:00.000Z"); review(root); commit(root, "later main pass");
  assert.equal(cairn(root, "wake").status, 0);
  assert.equal(git(root, "merge", "--no-ff", "-m", "merge evidence", "other").status, 0);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001[\s\S]*history/);
  assert.equal(at(root, "2026-09-06T10:00:00.000Z").status, 0, "the new run incorporates both histories despite an older timestamp");
});

test("LOOP-070: legacy receipts need one ordered check and remain byte-for-byte unchanged", () => {
  const root = setup(); cairn(root, "check"); review(root); commit(root);
  const names = records(root, "R-001");
  for (const req of ["R-001", "R-002"]) for (const name of records(root, req)) {
    const p = join(root, ".cairn/evidence", req, name);
    writeFileSync(p, readFileSync(p, "utf8").replace(/^(sequence|history_digest):.*\n/gm, ""));
  }
  const before = readFileSync(recordPath(root, names[0]), "utf8");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001[\s\S]*(order|sequence)/);
  assert.equal(cairn(root, "check").status, 0);
  assert.equal(readFileSync(recordPath(root, names[0]), "utf8"), before);
});

for (const change of ["edit", "remove"])
  test(`LOOP-070: ${change} of a prior receipt requires fresh evidence`, () => {
    const root = setup(); cairn(root, "check"); commit(root); const first = records(root, "R-001")[0];
    cairn(root, "check"); review(root); commit(root);
    const path = recordPath(root, first);
    if (change === "edit") writeFileSync(path, readFileSync(path, "utf8") + "\n# provenance note\n"); else unlinkSync(path);
    assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001[\s\S]*history/);
  });

for (const name of ["README.md", "notes.txt", "support", ".DS_Store"])
  test(`LOOP-075: supporting evidence file ${name} does not become a receipt`, () => {
    const root = setup(); cairn(root, "check"); review(root); commit(root);
    writeFileSync(recordPath(root, name), "# Explanation\nsequence: 999999\nresult: fail\n");
    assert.equal(cairn(root, "wake").status, 0);
    assert.equal(cairn(root, "check").status, 0, "a rerun does not loop on the supporting file");
  });

for (const [field, value] of [["requirement", "R-999"], ["result", "success"], ["sequence", "NaN"], ["sequence", "9007199254740992"], ["sequence", "\n  - 1"], ["history_digest", "wrong"]])
  test(`LOOP-075: malformed receipt ${field}=${value} names a repair before execution`, () => {
    const root = setup(); cairn(root, "check"); const name = records(root, "R-001")[0], p = recordPath(root, name);
    const before = readFileSync(p, "utf8"), line = `${field}: ${value}\n`;
    writeFileSync(p, new RegExp(`^${field}:.*$`, "m").test(before) ? before.replace(new RegExp(`^${field}:.*\\n`, "m"), line) : before + line);
    const count = records(root, "R-001").length;
    for (const cmd of ["wake", "check"]) {
      const r = cairn(root, cmd);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /^Resolvable: repair .cairn\/evidence\/R-001\//);
      assert.ok(r.stdout.includes(field), r.stdout);
    }
    assert.equal(records(root, "R-001").length, count);
  });

test("LOOP-075: a receipt-shaped directory is a named repair instead of an EISDIR crash", () => {
  const root = setup(); cairn(root, "check"); review(root); commit(root);
  mkdirSync(recordPath(root, "29990101T000000000Z"));
  assert.match(cairn(root, "wake").stdout, /^Resolvable: repair .cairn\/evidence\/R-001\/29990101T000000000Z/);
});

const escalationArgs = ["escalate", "--concerns", "R-001, R-002", "--question", "Retry?", "--recommend", "Retry",
  "--because", "New facts", "--if-wrong", "Stop", "--instead", "Wait"];

test("LOOP-070: an earlier escalation cannot cover three new attempts after clock rollback", () => {
  const root = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), "src/exit": "1\n" });
  at(root, "2026-09-06T12:00:00Z"); commit(root);
  at(root, "2026-09-06T12:01:00Z", 0, escalationArgs);
  at(root, "2026-09-06T12:02:00Z", 0, ["answer", "r-001-r-002", "ok"]); commit(root);
  for (let i = 2; i <= 4; i++) {
    writeFileSync(join(root, "src/exit"), `${i}\n`); commit(root);
    at(root, `2026-09-06T11:5${i - 2}:00Z`); commit(root);
  }
  assert.match(cairn(root, "wake").stdout, /^Resolvable: escalate R-001/);
});

test("LOOP-070: an answer becomes old after a later check even if that check's timestamp is earlier", () => {
  const root = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), "src/exit": "1\n" });
  at(root, "2026-09-06T12:00:00Z"); commit(root);
  at(root, "2026-09-06T12:01:00Z", 0, escalationArgs);
  at(root, "2026-09-06T12:02:00Z", 0, ["answer", "r-001-r-002", "instead investigate the cache"]); commit(root);
  assert.match(cairn(root, "wake").stdout, /answered r-001-r-002/);
  at(root, "2026-09-06T11:00:00Z");
  assert.doesNotMatch(cairn(root, "wake").stdout, /answered r-001-r-002/);
});

test("LOOP-070: the newest answer wins between checks even when its clock timestamp is older", () => {
  const root = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), "src/exit": "1\n" });
  at(root, "2026-09-06T12:00:00Z"); commit(root);
  at(root, "2026-09-06T12:01:00Z", 0, escalationArgs);
  at(root, "2026-09-06T12:02:00Z", 0, ["answer", "r-001-r-002", "instead use the old approach"]);
  at(root, "2026-09-06T11:01:00Z", 0, escalationArgs);
  at(root, "2026-09-06T11:02:00Z", 0, ["answer", "r-001-r-002-2", "instead use the new approach"]);
  const wake = cairn(root, "wake");
  assert.match(wake.stdout, /answered r-001-r-002-2: instead use the new approach/);
  assert.doesNotMatch(wake.stdout, /old approach/);
});

test("LOOP-070: legacy escalation dates cover old receipts but not three newer sequenced runs", () => {
  const root = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), "src/exit": "1\n" });
  for (let i = 0; i < 3; i++) at(root, `2026-09-06T12:0${i}:00Z`);
  for (const req of ["R-001", "R-002"]) for (const name of records(root, req)) {
    const p = join(root, ".cairn/evidence", req, name);
    writeFileSync(p, readFileSync(p, "utf8").replace(/^(sequence|history_digest):.*\n/gm, ""));
  }
  at(root, "2026-09-06T12:03:00Z", 0, escalationArgs);
  at(root, "2026-09-06T12:04:00Z", 0, ["answer", "r-001-r-002", "ok"]);
  const path = join(root, ".cairn/escalations/r-001-r-002.md");
  writeFileSync(path, readFileSync(path, "utf8").replace(/^(Raised|Answered) after:.*\n/gm, "")); commit(root);
  at(root, "2026-09-06T11:00:00Z");
  assert.doesNotMatch(cairn(root, "wake").stdout, /DEC-019/, "the tail still starts in legacy history");
  at(root, "2026-09-06T11:01:00Z"); at(root, "2026-09-06T11:02:00Z");
  assert.match(cairn(root, "wake").stdout, /DEC-019/, "three new sequenced failures require a new escalation");
});
