import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, renameSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, commit, git, passing, review, records } from "./helpers.mjs";

const mechanism = passing("R-001", "R-002").replace("src/other", "src/");
function assertComplete(root) {
  const check = cairn(root, "check");
  assert.match(check.stdout, /recorded .*: pass/, check.stdout + check.stderr);
  review(root); commit(root);
  const wake = cairn(root, "wake"); assert.equal(wake.status, 0, wake.stdout + wake.stderr);
}

for (const conversion of ["attributes", "autocrlf"])
  test(`LOOP-073: clean CRLF input completes under ${conversion}`, () => {
    const root = repo({ ".cairn/mechanisms/m": mechanism, ...(conversion === "attributes" ? { ".gitattributes": "src/other text eol=crlf\n" } : {}) });
    if (conversion === "autocrlf") git(root, "config", "core.autocrlf", "true");
    writeFileSync(join(root, "src/other"), "x\r\n"); git(root, "add", "src/other");
    assert.equal(git(root, "status", "--porcelain").stdout, "");
    assert.equal(git(root, "show", "HEAD:src/other").stdout, "x\n");
    assert.equal(readFileSync(join(root, "src/other"), "utf8"), "x\r\n");
    assertComplete(root);
  });

test("LOOP-073: raw line-ending mutation during a run is rejected even when Git still sees the same content", () => {
  const code = "import fs from 'node:fs'; fs.writeFileSync('src/other','x\\r\\n');\n";
  const root = repo({ ".cairn/mechanisms/m": mechanism.replace("node -e 0", "node src/check.mjs"), ".gitattributes": "src/other text\n", "src/check.mjs": code });
  const r = cairn(root, "check");
  assert.equal(records(root, "R-001").length, 0, r.stdout);
  assert.match(r.stdout, /candidate changed/);
});

test("LOOP-073: execution evidence changes when clean conversion preserves committed identity", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism, ".gitattributes": "src/other text\n" });
  assertComplete(root);
  writeFileSync(join(root, "src/other"), "x\r\n"); git(root, "add", "src/other");
  assert.equal(git(root, "status", "--porcelain").stdout, "");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001[\s\S]*declared input changed/);
  assert.equal(cairn(root, "check").status, 0, "the committed code review remains current after checking the changed execution bytes");
});

test("LOOP-073: Git clean filters use Git's conversion while retaining raw evidence identity", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism, ".gitattributes": "src/other filter=probe\n" });
  git(root, "config", "filter.probe.clean", "sed 's/working-x/x/g'");
  writeFileSync(join(root, "src/other"), "working-x\n"); git(root, "add", "src/other");
  assert.equal(git(root, "status", "--porcelain").stdout, "");
  assertComplete(root);
});

test("LOOP-073: failure of a required Git filter cannot record evidence", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism, ".gitattributes": "src/other filter=probe\n" });
  git(root, "config", "filter.probe.clean", "false"); git(root, "config", "filter.probe.required", "true");
  const r = cairn(root, "check");
  assert.notEqual(r.status, 0, r.stdout);
  assert.equal(records(root, "R-001").length, 0);
});

test("LOOP-073: a clean filter moving HEAD during ending validation prevents evidence", () => {
  const filter = "import fs from 'node:fs';import {spawnSync} from 'node:child_process';process.stdout.write(fs.readFileSync(0));if(fs.existsSync('.git/mechanism-ran'))spawnSync('git',['-c','user.name=t','-c','user.email=t@t','commit','--allow-empty','-qm','filter moved HEAD']);\n";
  const root = repo({ ".cairn/mechanisms/m": mechanism.replace("node -e 0", "node src/check.mjs"), ".gitattributes": "src/other filter=probe\n",
    "src/filter.mjs": filter, "src/check.mjs": "import fs from 'node:fs';fs.writeFileSync('.git/mechanism-ran','yes');\n" });
  git(root, "config", "filter.probe.clean", "node src/filter.mjs");
  const before = git(root, "rev-parse", "HEAD").stdout, r = cairn(root, "check");
  assert.notEqual(git(root, "rev-parse", "HEAD").stdout, before, "the filter really moved HEAD");
  assert.equal(records(root, "R-001").length, 0, r.stdout);
  assert.match(r.stdout, /candidate changed/);
});

test("LOOP-073: canonical Git identities handle links without reading their targets", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism, ".gitattributes": "src/other text\n" });
  symlinkSync("missing target", join(root, "src/dangling")); commit(root);
  writeFileSync(join(root, "src/other"), "x\r\n"); git(root, "add", "src/other");
  assertComplete(root);
});

test("LOOP-073: Git conversion keeps raw Unicode and control-character input paths", () => {
  const name = 'src/caf\u00e9\tline\n"quote\\end';
  const root = repo({ ".cairn/mechanisms/m": mechanism, ".gitattributes": "src/* text\n", [name]: "x\n" });
  writeFileSync(join(root, name), "x\r\n"); git(root, "add", "--", name);
  assert.equal(git(root, "status", "--porcelain").stdout, "");
  assertComplete(root);
});

test("LOOP-073: conversion and links work in a SHA-256 Git repository", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism, ".gitattributes": "src/other text\n" });
  rmSync(join(root, ".git"), { recursive: true });
  assert.equal(git(root, "init", "-q", "-b", "main", "--object-format=sha256").status, 0);
  symlinkSync("other", join(root, "src/link")); commit(root);
  writeFileSync(join(root, "src/other"), "x\r\n"); git(root, "add", "src/other");
  assertComplete(root);
});

for (const name of ["caf\u00e9.md", "spec\ttab.md", "spec\nline.md"])
  test(`LOOP-074: historical specification filename ${JSON.stringify(name)} remains reviewable`, () => {
    const root = repo({ ".cairn/mechanisms/m": mechanism });
    git(root, "config", "core.quotePath", "true");
    renameSync(join(root, "docs/spec/test.md"), join(root, "docs/spec", name)); commit(root);
    assertComplete(root);
  });
