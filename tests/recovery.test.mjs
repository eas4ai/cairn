import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, git, commit, head, review, passing } from "./helpers.mjs";

const setup = (o = {}) => repo({ ".cairn/mechanisms/m": passing("R-001", "R-002"), ...o });

test("each unmatched input and each duplicate owner is refused before execution (LOOP-044, LOOP-056)", () => {
  for (const declaration of [passing("R-001", "R-002") + "inputs:\n  - src/other\n  - nowhere/**\n", passing("R-001")]) {
    const duplicate = !declaration.includes("nowhere");
    const root = setup(duplicate ? { ".cairn/mechanisms/n": declaration } : { ".cairn/mechanisms/m": declaration });
    for (const command of ["wake", "check"]) {
      const r = cairn(root, command);
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stdout, /Resolvable: repair .cairn\/mechanisms\//);
      assert.match(r.stdout, duplicate ? /R-001.*both m and n/ : /nowhere\/\*\*/);
      assert.doesNotMatch(r.stdout, /recorded/);
    }
  }
});

test("an indexed input deleted on disk asks for a commit (LOOP-045)", () => {
  const root = setup(); unlinkSync(join(root, "src/other"));
  for (const command of ["wake", "check"]) {
    const r = cairn(root, command);
    assert.equal(r.status, 1); assert.match(r.stdout, /^Resolvable: commit src\/other/); assert.equal(r.stderr, "");
  }
});

test("wake and check require a Git working tree (LOOP-046)", () => {
  const root = setup(); rmSync(join(root, ".git"), { recursive: true });
  for (const command of ["wake", "check"]) {
    const r = cairn(root, command); assert.equal(r.status, 3); assert.match(r.stderr, /Git/);
  }
});

test("recovery removes only dead kernel run records and identifies a live owner (LOOP-054, LOOP-055)", () => {
  const root = setup(), ip = join(root, ".cairn/in-progress");
  // A reaped child has an actual PID that no longer belongs to this test's process.
  const dead = git(root, "--version").pid;
  assert.ok(dead > 0);
  writeFileSync(ip, `owner: kernel\naction: run-mechanism\npid: ${dead}\n`);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/); assert.equal(existsSync(ip), false);
  for (const record of [`owner: kernel\naction: run-mechanism\npid: ${process.pid}\n`, `action: implement\npid: ${dead}\n`, `action: run-mechanism\npid: ${dead}\n`]) {
    writeFileSync(ip, record);
    const r = cairn(root, "wake"); assert.match(r.stdout, /^Resolvable: reconcile/); assert.ok(existsSync(ip));
    if (record.includes(String(process.pid))) assert.match(r.stdout, new RegExp(`live process ${process.pid}`));
  }
});

test("an agent action based behind a clean HEAD appears committed (LOOP-027)", () => {
  const root = setup(), base = head(root);
  writeFileSync(join(root, "src/other"), "changed"); commit(root);
  writeFileSync(join(root, ".cairn/in-progress"), `action: implement\ntarget: R-001\nbase: ${base}\n`);
  assert.match(cairn(root, "wake").stdout, /appears committed/);
  writeFileSync(join(root, "src/other"), "dirty");
  assert.doesNotMatch(cairn(root, "wake").stdout, /appears committed/);
});

test("realization needs a real commit and a subject (DEC-006)", () => {
  const root = setup(), path = join(root, "docs/decisions/d.md");
  for (const line of [head(root), "abcdef1 invented"]) {
    writeFileSync(path, `# D\n\n## Realized by\n\n- ${line}\n`);
    assert.match(cairn(root, "wake").stdout, /build docs\/decisions\/d.md[\s\S]*commit.*subject/);
  }
  writeFileSync(path, `# D\n\n## Realized by\n\n- ${head(root)} init\n`);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
});

test("1500 binary inputs digest identically at the review commit in under a second (LOOP-024, LOOP-032)", () => {
  const root = setup({ ".cairn/mechanisms/m": passing("R-001", "R-002").replace("src/other", "src/many/") });
  mkdirSync(join(root, "src/many"));
  for (let i = 0; i < 1500; i++) writeFileSync(join(root, `src/many/${i}`), Buffer.from([0, i % 256, 10, 255]));
  commit(root); cairn(root, "check"); review(root);
  const start = performance.now(), r = cairn(root, "wake"), elapsed = performance.now() - start;
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(elapsed < 1000, `wake took ${elapsed} ms`);
});

test("merged work is excluded but a later own commit is a breach (LOOP-047)", () => {
  const root = setup();
  git(root, "checkout", "-qb", "other"); writeFileSync(join(root, "unrelated.txt"), "branch"); commit(root);
  git(root, "checkout", "main"); git(root, "merge", "--no-ff", "-m", "merge other", "other");
  assert.doesNotMatch(cairn(root, "wake").stdout, /scope unrelated/);
  writeFileSync(join(root, "unrelated.txt"), "own"); commit(root);
  assert.match(cairn(root, "wake").stdout, /scope unrelated/);
});

test("exact Current tenure ignores prefix matches and earlier visits to the same slug (LOOP-035)", () => {
  const root = setup(), roadmap = join(root, "docs/spec/roadmap.md");
  writeFileSync(join(root, "unrelated.txt"), "earlier"); commit(root);
  writeFileSync(roadmap, "Current: first-extra\n"); commit(root);
  writeFileSync(roadmap, "Current: first\n"); commit(root);
  assert.doesNotMatch(cairn(root, "wake").stdout, /scope unrelated/);
  writeFileSync(join(root, "unrelated.txt"), "current"); commit(root);
  assert.match(cairn(root, "wake").stdout, /scope unrelated/);
});

test("a kernel run records its supervising PID (LOOP-054)", () => {
  const command = 'node -e "const fs=require(\'fs\'); const t=fs.readFileSync(\'.cairn/in-progress\',\'utf8\'); const pid=Number(/^pid: (.*)$/m.exec(t)?.[1]); if (!/^owner: kernel$/m.test(t)||!pid) process.exit(1); process.kill(pid,0)"';
  const root = setup({ ".cairn/mechanisms/m": passing("R-001", "R-002").replace("node -e 0", command) });
  const r = cairn(root, "check"); assert.match(r.stdout, /R-001.*pass/); assert.equal(existsSync(join(root, ".cairn/in-progress")), false);
});

test("a merged declared input still stales evidence (LOOP-047)", () => {
  const root = setup(); cairn(root, "check"); review(root); commit(root);
  git(root, "checkout", "-qb", "other"); writeFileSync(join(root, "src/other"), "branch"); commit(root);
  git(root, "checkout", "main"); git(root, "merge", "--no-ff", "-m", "merge other", "other");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001[\s\S]*declared input changed/);
});
