import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, commit, records, review, git } from "./helpers.mjs";

const mechanism = (command = "node src/check.mjs") => `command: ${command}\ninputs:\n  - src/\nrequirements:\n  - R-001\n  - R-002\n`;

const mutations = {
  input: "fs.writeFileSync('src/exit','1\\n');",
  deletion: "fs.unlinkSync('src/exit');",
  addition: "fs.writeFileSync('src/new','new');",
  mode: "fs.chmodSync('src/exit',0o755);",
  specification: "fs.appendFileSync('docs/spec/test.md','\\nChanged explanation.\\n');",
  declaration: "fs.appendFileSync('.cairn/mechanisms/m','\\n# changed\\n');",
  commit: "spawnSync('git',['-c','user.name=t','-c','user.email=t@t','commit','--allow-empty','-qm','during check']);",
};

for (const [name, mutation] of Object.entries(mutations)) test(`LOOP-063: reject ${name} mutation during a check and retain diagnostics`, () => {
  const source = `import fs from 'node:fs'; import {spawnSync} from 'node:child_process'; console.log('checked starting candidate'); ${mutation}\n`;
  const root = repo({ ".cairn/mechanisms/m": mechanism(), "src/check.mjs": source });
  const r = cairn(root, "check");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(records(root, "R-001").length, 0, "a changed candidate produces no receipt");
  assert.equal(records(root, "R-002").length, 0);
  assert.match(r.stdout, /candidate changed/);
  assert.match(r.stdout, /no evidence recorded/);
  const logs = readdirSync(join(root, ".cairn/evidence/R-001")).filter((n) => n.endsWith(".out"));
  assert.equal(logs.length, 1);
  assert.equal(readFileSync(join(root, ".cairn/evidence/R-001", logs[0]), "utf8"), "checked starting candidate\n");
  assert.equal(existsSync(join(root, ".cairn/in-progress")), false);
  commit(root, "retain rejected run"); review(root);
  assert.doesNotMatch(cairn(root, "wake").stdout, /^Done:/);
});

test("LOOP-063: committed input mutation during execution cannot certify the replacement", () => {
  const source = "import fs from 'node:fs'; import {spawnSync} from 'node:child_process'; const n=Number(fs.readFileSync('src/exit','utf8')); fs.writeFileSync('src/exit','1\\n'); spawnSync('git',['add','src/exit']); spawnSync('git',['-c','user.name=t','-c','user.email=t@t','commit','-qm','replace input']); process.exit(n);\n";
  const root = repo({ ".cairn/mechanisms/m": mechanism(), "src/check.mjs": source });
  const r = cairn(root, "check");
  assert.equal(records(root, "R-001").length, 0, r.stdout);
  assert.match(r.stdout, /candidate changed/);
  commit(root); review(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
});

test("LOOP-064: removing executable permission makes passing evidence stale", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism("./src/check.sh"), "src/check.sh": "#!/bin/sh\nexit 0\n" });
  const path = join(root, "src/check.sh");
  chmodSync(path, 0o755); commit(root); cairn(root, "check"); review(root); commit(root);
  assert.equal(cairn(root, "wake").status, 0);
  chmodSync(path, 0o644); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001[\s\S]*declared input changed/);
});

test("LOOP-064: a mode-only change also invalidates the previous review after new evidence", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism("node -e 0") });
  cairn(root, "check"); review(root); commit(root);
  chmodSync(join(root, "src/exit"), 0o755); commit(root); cairn(root, "check");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review first/);
  review(root);
  assert.equal(cairn(root, "wake").status, 0, "both digest views agree on the new executable mode");
});

test("LOOP-064: changing a regular file into a link with identical identity bytes is stale", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism("node -e 0"), "src/link": "exit" });
  cairn(root, "check"); review(root); commit(root);
  rmSync(join(root, "src/link")); symlinkSync("exit", join(root, "src/link")); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
  cairn(root, "check");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review first/);
  review(root); assert.equal(cairn(root, "wake").status, 0);
});

test("LOOP-063: an unchanged candidate still records a pass despite unrelated working-tree edits", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism("node -e 0") });
  writeFileSync(join(root, "unrelated.txt"), "local note\n");
  assert.match(cairn(root, "check").stdout, /recorded .*: pass/);
  assert.equal(records(root, "R-001").length, 1);
});

test("LOOP-064: current and historical input ordering agrees for Unicode filenames", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism("node -e 0"), "src/\ue000": "one", "src/\ud83d\ude00": "two" });
  cairn(root, "check"); review(root);
  const r = cairn(root, "wake");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

for (const hidden of ["content", "mode"]) test(`LOOP-063: Git status hiding ${hidden} changes cannot certify an uncommitted candidate`, () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism("node -e 0") });
  if (hidden === "content") {
    assert.equal(git(root, "update-index", "--assume-unchanged", "src/exit").status, 0);
    writeFileSync(join(root, "src/exit"), "1\n");
  } else {
    assert.equal(git(root, "config", "core.filemode", "false").status, 0);
    chmodSync(join(root, "src/exit"), 0o755);
  }
  assert.equal(git(root, "status", "--porcelain").stdout, "", "Git status does not show the change");
  const r = cairn(root, "check");
  assert.equal(records(root, "R-001").length, 0, r.stdout);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /committed candidate/);
});
